import { BaseManager } from "@/lib/BaseManager";
import * as consts from "@/lib/constants";
import { findBestHackPlan, findBestPrepPlan, getMostProfitableServerWithAlgo, getServerData } from "@/lib/db";
import { HackAlgorithm } from "@/lib/hack-algorithm";
import { Plan, Time, ScriptConfig, LogLevel, ManagerExitCode, Priority } from "@/lib/types";
import { orchestrateScript, getFreeSpace, getServersBySpace } from "@/lib/system";
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
   runningScripts: Map<string, { pid: number, script: string, host: string }>;
   prepPlan: Plan[];
   hackPlan: Plan[];
   orcPort: number;
   orcHandler: NetscriptPort;
   orc?: ScriptConfig;
   isPrepping: boolean;

   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      super(ns, scriptArgs);
      //this.ns.ui.openTail();

      this.prepPlan = findBestPrepPlan(this.ns);
      this.hackPlan = findBestHackPlan(this.ns);

      this.runningScripts = new Map();

      this.orcPort = getRandomInt();
      this.orcHandler = this.ns.getPortHandle(this.orcPort);
      this.orcHandler.clear();
      this.isPrepping = this.hackPlan.length == 0;

      if (this.prepPlan.length == 0 && this.hackPlan.length == 0) {
         this.logger.error(`No achievable plans found. Exiting..`);
         this.fail();
      }

   }


   async start() {
      const plans = this.isPrepping ? this.prepPlan : this.hackPlan;

      // Orchestrate plan
      this.orc = this.createScriptConfig(
         consts.ORCHESTRATOR_SCRIPT,
         Priority.PRIORITY,
         {
            args: {
               plan: JSON.stringify(plans),
               isPrep: this.isPrepping
            },
            port: this.orcPort,
            homeLocked: true
         }
      );

      //await this.orchestrateHack(plans.plan);
      this.startOrchestrator();

      // Monitor the port and wait for all tasks to complete
      await this.monitorPort();
      //await this.monitorPort_new();


      this.success();
   }

   async orchestrateHack(plan: Plan[]) {
      this.logger.debug(`Orchestrating ${plan.length} hack plans`);
      for (const p of plan) {
         p.args.push(this.orcPort.toString());
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
         this.logger.debug(`Starting ${this.orc.script} (${this.orc.script})..`);
         const dependencies: string[] = [
            consts.HACK_SCRIPT,
            consts.WEAK_SCRIPT,
            consts.GROW_SCRIPT
         ]
         const result = orchestrateScript(this.ns, this.orc.script, 1, this.orc.args, false, dependencies);

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
         await this.orcHandler.nextWrite();

         while (this.orcHandler.peek() != "NULL PORT DATA") {
            // Remove that combination host + pid from our runningScripts array.
            const result = JSON.parse(this.orcHandler.read()) as { pid: number, host: string, script: string, value: number };
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
         while (this.orcHandler.peek() != "NULL PORT DATA") {
            // Remove that combination host + pid from our runningScripts array.
            const result = JSON.parse(this.orcHandler.read()) as { pid: number, host: string, script: string, value: number };
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
               this.logger.info(`Monitoring ${newLength} scripts..`, 0, undefined, true);
               this.logger.info(`${this.ns.getScriptName()} has stolen ${formatDollar(this.ns, moneyTally)} so far, ` +
                  `or ${formatDollar(this.ns, moneyTally / ((Date.now() - this.startTime) / Time.SECOND))} per second.`, 0, Colors.Green, true);
               timeSinceLastUpdate = Date.now();
            }

         }

         await this.ns.sleep(10);
         if (Date.now() - timeSinceLastUpdate >= MONITOR_INTERVAL) {
            this.logger.info(`Monitoring ${this.runningScripts.size} scripts..`, 1);
            this.logger.info(`${this.ns.getScriptName()} has stolen ${formatDollar(this.ns, moneyTally)} so far, ` +
                  `or ${formatDollar(this.ns, moneyTally / ((Date.now() - this.startTime) / Time.SECOND))} per second.`, 0, Colors.Green, true);
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