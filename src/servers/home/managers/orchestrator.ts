import { BaseManager } from "@/lib/BaseManager";
import { getServerSpace, getTotalFreeSpaceFromDB } from "@/lib/db";
import { canWeDeployPlan, getFreeSpace, orchestrateScript, verifyScript } from "@/lib/system";
import { LogLevel, Plan, Time } from "@/lib/types";
import { ScriptArg } from "NetscriptDefinitions";
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

const ORC_INTERVAL: number = 10; // milliseconds between each execution
const RETRY_PERIOD: number = 30;
const ORC_DURATION: number = 30 * Time.MINUTE; // duration of entire script before it terminates

class Orchestrator extends BaseManager {
   scripts: Plan[];
   planRam: number;
   isPrep: boolean;
   runningScripts: { pid: number, script: string, host: string }[];

   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      super(ns, scriptArgs);
      //this.ns.ui.openTail();
      this.scripts = JSON.parse(this.args[`plan`] as string) as Plan[];
      this.planRam = this.getTotalRamForPlan();
      this.isPrep  = this.args[`isPrep`] as boolean;
      this.runningScripts = [];
   }

   async start() {
      const result = await this.orchestrate();

      if (result) {
         this.logger.info(`Orchestrator (PID: ${this.ns.pid}) deployed plans successfully!`)
      } else {
         this.logger.warn(`Orchestrator (PID: ${this.ns.pid}) failed to deploy some plans!`);
      }

      this.success();
   }
   
   getTotalRamForPlan() {
      let totalRam = 0;
      for (const p of this.scripts) {
         totalRam += this.ns.getScriptRam(p.script) * p.threads;
      }
      return totalRam;

   }

   async orchestrate(): Promise<boolean> {
      this.logger.info(`Orchestrating given plans..`);
      while (!canWeDeployPlan(this.ns, this.scripts)) {
         this.logger.warn(`Not enough free space for entire plan. Waiting..`,1);
         await this.ns.sleep(100);
      }
      for (const p of this.scripts) {
         if (this.port) { p.args.push(this.port.toString()); }
         this.logger.info(`${p.script} [${p.threads}] will run for ${p.runTime} with args [${p.args}]`, 1);
      }

      //const reqRam = this.scripts.reduce((sum, plan) => sum + this.ns.getScriptRam(plan.script), 0);

      await this.ns.sleep(2000);

      while (true) {
         if (!canWeDeployPlan(this.ns, this.scripts)) {
            this.logger.warn(`Cannot deploy plan right now. Stalling..`);
            await this.ns.sleep(1000);
            continue;
         }

         for (const p of this.scripts) {
            let timeTaken: number = 0;
            let result = orchestrateScript(this.ns, p.script, p.threads, p.args);

            // Try to force the orchestration
            while (result.code != 0) {
               this.logger.debug(`${p.script} didn't deploy, trying again..`) ;
               await this.ns.sleep(1);
               result = orchestrateScript(this.ns, p.script, p.threads, p.args);
               timeTaken+=1;
               if (timeTaken >= RETRY_PERIOD) {
                  this.logger.warn(`${p.script} failed to deploy on ${result.host} with exitcode ${result.code}`);
                  break;
               }
            }
            //const result = orchestrateScript(this.ns, p.script, p.threads, p.args);
            if (result.code == 0) {

               // inform the controller it has a new script to monitor
               await this.informController(result.pid, result.host, p.script);

            }

            await this.ns.sleep(ORC_INTERVAL);
         }

         // If we're just prepping the server or hit our time limit, exit
         if (this.isPrep || (Date.now() - this.startTime) > ORC_DURATION ) {
            this.success();
         }

         await this.ns.sleep(ORC_INTERVAL);
      }
   }

   startPlan(p: Plan): { code: number, pid: number, host: string } {
      if (this.port) { p.args.push(this.port.toString()); }
      this.logger.debug(`Attempting to start ${p.script} with ${p.threads} and args ${p.args}..`, 1);
      return orchestrateScript(this.ns, p.script, p.threads, p.args);
   }

   async informController(pid: number, host: string, script: string) {
      if (!this.port || !this.handler) { return false; }
      const envelope = {
         pid: pid,
         host: host,
         script: script,
         value: -1
      };

      while (! this.handler.tryWrite(JSON.stringify(envelope)) ) { await this.ns.sleep(1); }

      return true;
      
   }

}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const o = new Orchestrator(ns, ns.args);
   await o.start();
}