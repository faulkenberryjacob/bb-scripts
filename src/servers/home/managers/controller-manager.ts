import { BaseManager } from "@/lib/BaseManager";
import * as consts from "@/lib/constants";
import { getMostProfitableServer, getServerSpace, getTotalFreeSpace } from "@/lib/db";
import { HackAlgorithm } from "@/lib/hack-algorithm-2";
import { Worker, Plan, Time, ScriptConfig } from "@/lib/types";
import { orchestrateScript, killOrchestratedScripts, verifyScript, getScriptName } from "@/lib/system";
import { NetscriptPort, ScriptArg } from "NetscriptDefinitions";
import { getRandomInt } from "@/lib/calc";
import { formatDollar } from "@/lib/formatter";
import { Colors } from "@/lib/logger";

/*
   When ORCHESTRATOR and all its children script finish,
   they should be reporting their success to PORT B.

   When CONTROLLER detects all scripts are done via PORT B,
   CONTROLLER will flag that it is finished to PORT A.

   When ENGINE detects that CONTROLLER is finished via PORT A,
   it will mark it complete and queue up the next iteration.

    ________
   | ENGINE |
    `|````|``
     |    | Communicates success
     |    └►--► { PORT A }
     |              ▲
     |  Kickoff ____|_______
     └--►-----►| CONTROLLER |
 ______________ ``|```````|``
| ORCHESTRATOR |◄-┘       | Communicates success
 `|```|```|``|`           |
  |   |   |  └►------►----┴►---► { PORT B }
  |   |   |                        ▲▲▲
  |   |   └►[script]►--------------┘||
  |   └►[script]►-------------------┘|
  └►[script]►------------------------┘
*/


const RAM_LIMIT = 10240;
const MONITOR_INTERVAL = 30 * Time.SECOND; // 30 seconds

class ControllerManager extends BaseManager {
   target: string;
   runningScripts: Map<string, { pid: number, script: string, host: string }>;
   minRam: number;
   port: number;
   handler: NetscriptPort;
   orc?: ScriptConfig;
   isPrepping: boolean;

   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      super(ns, scriptArgs);
      //this.ns.ui.openTail();

      this.target = getMostProfitableServer(this.ns);
      this.runningScripts = new Map();
      this.minRam = this.getMinimumRamForHack();

      this.port = getRandomInt();
      this.handler = this.ns.getPortHandle(this.port);
      this.handler.clear();
      this.isPrepping = false;
   }


   async start() {
      while (true) {
         // Check how much RAM is necessary for a 100% hack
         if (this.minRam <= 0) {
            this.finish();
         }

         // Get free RAM available, with a small buffer
         const availableRam = getTotalFreeSpace(this.ns);

         // Get a plan using that available RAM
         this.logger.debug(`Finding hack plans..`);
         let plans = new HackAlgorithm(this.ns, this.target, availableRam, 1).maxHackAlgorithm().plan;

         if (!plans || plans.length <= 0) {
            this.logger.warn(`No HACK plans were found for ${this.target}! We will prep instead`);
            this.isPrepping = true;
            plans = new HackAlgorithm(this.ns, this.target, availableRam, 1).maxPrepAlgorithm().plan;

            if (!plans || plans.length <= 0) {
               this.logger.warn(`No PREP plans were found for ${this.target}! Exiting..`);
               this.finish();
            }
         }

         this.logger.debug(`We found ${plans.length} plans!`);
         const badPlans = plans.filter(p => p.threads == 0);
         if (badPlans && badPlans.length > 0) {
            this.logger.error(`${badPlans.length} plans were found with no defined threads!`);
            this.logger.error(`Ex: ${badPlans[0].script} with args [${badPlans[0].args} and threads ${badPlans[0].threads}`);
            this.finish();
         }

         const minWaitTime = plans.reduce((min, current) =>
            current.runTime < min.runTime ? current : min
         ).runTime;

         // Orchestrate plan
         this.orc = this.createScriptConfig(
            "Orchestrator",
            consts.ORCHESTRATOR_SCRIPT,
            {
               plan: JSON.stringify(plans),
               isPrep: this.isPrepping
            },
            true // run this on `home`
         );

         //await this.orchestrateHack(plans.plan);
         this.startOrchestrator();

         // Monitor the port and wait for all tasks to complete
         //await this.monitorPort();
         await this.monitorPort_new();
      }


      this.finish();
   }

   getMinimumRamForHack(): number {
      this.logger.debug(`Finding minimum RAM necessary to hack ${this.target}`);
      let low = 0;
      let high = RAM_LIMIT; // Adjust upper bound as needed
      let result = high;

      while (low <= high) {
         const mid = Math.floor((low + high) / 2);
         const ha = new HackAlgorithm(this.ns, this.target, mid, 1);

         if (ha.isHackPossible()) {
            result = mid; // This RAM amount works, try lower
            high = mid - 1;
         } else {
            low = mid + 1; // This RAM amount doesn't work, try higher
         }
      }

      this.logger.info(`Found minimum RAM for hwgw: ${result}`, 1);
      return result;
   }

   async orchestrateHack(plan: Plan[]) {
      this.logger.debug(`Orchestrating ${plan.length} hack plans`);
      for (const p of plan) {
         p.args.push(this.port.toString());
         const result = orchestrateScript(this.ns, p.script, p.threads, p.args);
         if (result.code == 0) {
            this.logger.debug(`${p.script} with args ${p.args} has kicked off successfully`, 1);
            this.runningScripts.set(
               `${result.host}.${result.pid}`, {
               pid: result.pid,
               script: p.script,
               host: result.host
            })
         }

         await this.ns.sleep(1);
      }
   }

   startOrchestrator(): { code: number, pid: number, host: string } {
      if (this.orc) {
         this.logger.debug(`Starting ${this.orc.name} (${this.orc.script})..`);
         const result = orchestrateScript(this.ns, this.orc.script, 1, this.orc.args);

         if (result.code == 0) {
            this.logger.debug(`${this.orc.script} with args ${this.orc.args} has kicked off successfully on ${result.host}`, 1);
            this.runningScripts.set(
               `${result.host}.${result.pid}`, {
               pid: result.pid,
               script: this.orc.script,
               host: result.host
            });
         }
      }
      return { code: 1, pid: -1, host: "" };
   }

   async monitorPort_new() {
      this.logger.info(`Monitoring port ${this.port} with ${this.runningScripts.size} scripts..`);
      let moneyTally: number = 0;
      let timeSinceLastUpdate: number = Date.now();

      while (true) {
         await this.handler.nextWrite();

         while (this.handler.peek() != "NULL PORT DATA") {
            // Remove that combination host + pid from our runningScripts array.
            const result = JSON.parse(this.handler.read()) as { pid: number, host: string, script: string, value: number };
            this.logger.debug(`Port read: [${result.pid}] ${result.script} from host ${result.host}, value [${this.ns.formatNumber(result.value)}]`);
            const originalLength = this.runningScripts.size;

            if (result.value == -1) {
               this.logger.debug(`Adding [${result.pid}] on [${result.host}] to our orchestrated scripts!`);
               this.runningScripts.set(
                  `${result.host}.${result.pid}`, {
                  pid: result.pid,
                  script: result.script,
                  host: result.host
               });
            } else {
               this.runningScripts.delete(`${result.host}.${result.pid}`);

               if (result.script == consts.HACK_SCRIPT) {
                  moneyTally += result.value;
                  this.logger.info(`Stole ${formatDollar(this.ns, result.value)}. We have stolen ${formatDollar(this.ns, moneyTally)} so far!`, 0, Colors.Green);
               }
            }

            await this.ns.sleep(10);

            const newLength = this.runningScripts.size;
            this.logger.debug(`runningScripts has changed by ${newLength - originalLength}, still ${newLength} plans left.`, 1);
            if (newLength < 3) {
               this.logger.debug(`Waiting on:`, 2);
               for (const [key, rs] of this.runningScripts) {
                  this.logger.debug(`[${rs.pid}] ${rs.host} -- ${rs.script}`, 3);
               }
            }
            if (Date.now() - timeSinceLastUpdate >= MONITOR_INTERVAL) {
               this.logger.info(`Monitoring ${newLength} scripts..`, 1);
               this.logger.info(`${this.ns.getScriptName()} has stolen ${formatDollar(this.ns, moneyTally)} so far, ` +
                  `or ${formatDollar(this.ns, moneyTally / ((Date.now() - this.startTime) / Time.SECOND))} per second.`, 0, Colors.Green, true);
               timeSinceLastUpdate = Date.now();
            }
         }
      }
   }

   async monitorPort() {
      // this.logger.debug(`Monitoring port ${this.port} with ${this.runningScripts.length} scripts after ${delay / Time.SECOND} seconds delay..`);
      // await this.ns.sleep(delay);
      this.logger.info(`Monitoring port ${this.port} with ${this.runningScripts.size} scripts..`);
      let moneyTally: number = 0;
      let timeSinceLastUpdate: number = Date.now();

      // While we keep finding things written to the port..
      while (this.runningScripts.size > 0) {
         while (this.handler.peek() != "NULL PORT DATA") {
            // Remove that combination host + pid from our runningScripts array.
            const result = JSON.parse(this.handler.read()) as { pid: number, host: string, script: string, value: number };
            this.logger.debug(`Port read: [${result.pid}] ${result.script} from host ${result.host}, value [${this.ns.formatNumber(result.value)}]`);
            const originalLength = this.runningScripts.size;

            if (result.value == -1) {
               this.logger.debug(`Adding [${result.pid}] on [${result.host}] to our orchestrated scripts!`);
               this.runningScripts.set(
                  `${result.host}.${result.pid}`, {
                  pid: result.pid,
                  script: result.script,
                  host: result.host
               });
            } else {
               this.runningScripts.delete(`${result.host}.${result.pid}`);
               if (result.script == consts.HACK_SCRIPT) {
                  moneyTally += result.value;
                  this.logger.info(`Stole ${formatDollar(this.ns, result.value)}. We have stolen ${formatDollar(this.ns, moneyTally)} so far!`, 0, Colors.Green);
               }
            }

            await this.ns.sleep(10);

            const newLength = this.runningScripts.size;
            this.logger.debug(`runningScripts has changed by ${newLength - originalLength}, still ${newLength} plans left.`, 1);
            if (newLength < 3) {
               this.logger.debug(`Waiting on:`, 2);
               for (const [ley, rs] of this.runningScripts) {
                  this.logger.debug(`[${rs.pid}] ${rs.host} -- ${rs.script}`, 3);
               }
            }
            if (Date.now() - timeSinceLastUpdate >= MONITOR_INTERVAL) {
               this.logger.info(`Monitoring ${newLength} scripts..`, 1);
               this.logger.info(`${this.ns.getScriptName()} has stolen ${formatDollar(this.ns, moneyTally)} so far, ` +
                  `or ${formatDollar(this.ns, moneyTally / ((Date.now() - this.startTime) / Time.SECOND))} per second.`, 0, Colors.Green, true);
               timeSinceLastUpdate = Date.now();
            }

         }

         await this.ns.sleep(10);
         if (Date.now() - timeSinceLastUpdate >= MONITOR_INTERVAL) {
            this.logger.info(`Monitoring ${this.runningScripts.size} scripts..`, 1);
            timeSinceLastUpdate = Date.now();
         }
      }
      this.logger.debug(`Stopping port monitor. All tasks complete!`);
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const cm = new ControllerManager(ns, ns.args);
   await cm.start();
}