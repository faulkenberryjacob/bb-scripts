import { BaseManager } from "@/lib/BaseManager";
import { getServerSpace } from "@/lib/db";
import { orchestrateScript, verifyScript } from "@/lib/system";
import { Plan, Time } from "@/lib/types";
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

class Orchestrator extends BaseManager {
   scripts: Plan[];
   isPrep: boolean;
   runningScripts: { pid: number, script: string, host: string }[];

   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      super(ns, scriptArgs);
      //this.ns.ui.openTail();
      this.scripts = JSON.parse(this.args[`plan`]) as Plan[];
      this.isPrep  = this.args[`isPrep`] as boolean;
      this.runningScripts = [];
   }

   async start() {
      debugger;
      const result = await this.orchestrate();
      debugger;

      if (result) {
         this.logger.info(`Orchestrator (PID: ${this.ns.pid}) deployed plans successfully!`)
      } else {
         this.logger.warn(`Orchestrator (PID: ${this.ns.pid}) failed to deploy some plans!`);
      }

      this.finish();
   }

   async orchestrate(): Promise<boolean> {
      this.logger.info(`Orchestrating given plans..`);
      for (const p of this.scripts) {
         p.args.push(this.port.toString());
         this.logger.info(`${p.script} [${p.threads}] will run for ${p.runTime} with args [${p.args}]`, 1);
      }

      //const reqRam = this.scripts.reduce((sum, plan) => sum + this.ns.getScriptRam(plan.script), 0);

      await this.ns.sleep(2000);

      while (true) {

         for (const p of this.scripts) {
            const result = orchestrateScript(this.ns, p.script, p.threads, p.args);
            if (result.code == 0) {

               // If we're unable to write to the port, wait for 30 seconds and try again
               if (!this.informController(result.pid, result.host, p.script)) {
                  this.logger.warn(`Cannot write to port, stalling..`);
                  await this.ns.sleep(1 * Time.SECOND);
               }
            } else {
               this.logger.warn(`${p.script} failed to deploy on ${result.host} with exitcode ${result.code}`);
               if (result.code == 2) {
                  // if this is a "not enough space" error, chill out for awhile
                  await this.ns.sleep(30 * Time.SECOND);
               }
            }

            await this.ns.sleep(ORC_INTERVAL);
         }

         // If we're just prepping the server, exit
         if (this.isPrep) {
            this.finish();
         }

         await this.ns.sleep(ORC_INTERVAL);
      }

      // let success = true;
      // for (const p of this.scripts) {
      //    const planResult = this.startPlan(p);
      //    if (planResult.code == 0) {
      //       this.informController(planResult.pid, planResult.host, p.script);
      //    } else {
      //       success = false;
      //    }
      //    this.logger.debug(`${p.script} attempted to deploy to ${planResult.host} and returned ${planResult.code}`, 2);

      //    await this.ns.sleep(ORC_INTERVAL);
      // }
      // return success;
   }

   startPlan(p: Plan): { code: number, pid: number, host: string } {
      p.args.push(this.port.toString());
      this.logger.debug(`Attempting to start ${p.script} with ${p.threads} and args ${p.args}..`, 1);
      return orchestrateScript(this.ns, p.script, p.threads, p.args);
   }

   informController(pid: number, host: string, script: string) {
      const envelope = {
         pid: pid,
         host: host,
         script: script,
         value: -1
      };
      
      return this.handler.tryWrite(JSON.stringify(envelope));
   }

}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const o = new Orchestrator(ns, ns.args);
   await o.start();
}