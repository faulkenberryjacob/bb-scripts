import { BaseManager } from "@/lib/BaseManager";
import { getProfitableServersWithRoot} from "@/lib/db";
import { hasSingularity } from "@/lib/defaults";
import { Colors } from "@/lib/logger";
import { connectChainToServer } from "@/lib/system";
import * as consts from "@/lib/constants";
import { ScriptArg } from "NetscriptDefinitions";

class ParasiteManager extends BaseManager {
   script: string;
   reqRam: number;


   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      super(ns, scriptArgs);
      //this.ns.ui.openTail();
      this.script = consts.STARTER_HACK_SCRIPT;
      this.reqRam = this.ns.getScriptRam(this.script);
   }

   async start() {
      this.parasite();
      this.success();
   }

   parasite() {
      // Get available, rooted servers with enough ram for our hacking script
      const rootedServers = getProfitableServersWithRoot(this.ns);
      const viableServers = rootedServers
         .filter(s => this.ns.getServerMaxRam(s) - this.ns.getServerUsedRam(s) > this.reqRam)

      for (const s of viableServers) {
         if (s == `home`) { continue; } // skip home if it's in here
         const freeRam = this.ns.getServerMaxRam(s) - this.ns.getServerUsedRam(s);
         const threads = Math.floor(freeRam / this.reqRam);

         this.logger.info(`Deploying ${this.script} with ${threads} threads of size [${this.reqRam*threads}] to ${s} [${freeRam} GB free]`);
         if (!this.ns.scp(this.script, s, `home`)) {
            this.logger.warn(`Unable to scp ${this.script} to ${s}!`);
         }
         const pid = this.ns.exec(this.script, s, threads);
         if (pid == 0) {
            this.logger.warn(`Failed to deploy ${this.script} to ${s} [${freeRam} GB free]`);
         } else {
            this.logger.info(`Deployed ${this.script} to ${s}`);
         }
      }

      this.logger.info(`Finished parasiting viable servers!`, 1, Colors.Green);
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const pm = new ParasiteManager(ns, ns.args);
   await pm.start();
}