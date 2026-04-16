import { BaseManager } from "@/lib/BaseManager";
import { getMinimumRamForHack, getMinimumRamForPrep, getServerData, getServersWithNoBackdoor, readDB, updateServerInDB } from "@/lib/db";
import { Colors } from "@/lib/logger";
import { LogLevel, ManagerExitCode } from "@/lib/types";
import { ScriptArg } from "NetscriptDefinitions";

class AlgoManager extends BaseManager {
   constructor(ns: NS, args: ScriptArg[]) {
      super(ns, args);
      //this.logger.setLogLevel(LogLevel.DEBUG);
   }

   async start() {
      //this.ns.ui.openTail();
      await this.updateWithAlgorithm();
      

      this.success();
   }

   async updateWithAlgorithm() {
      const servers = readDB(this.ns);
      this.logger.debug(`Found ${servers.size} servers`);
      for (const s of servers.values()) {
         const minRamForHack = getMinimumRamForHack(this.ns, s.hostname);
         const minRamForPrep = getMinimumRamForPrep(this.ns, s.hostname);
         this.logger.info(`${s.hostname}:
            minRamForHack: ${minRamForHack} GB
            minRamForPrep: ${minRamForPrep}`,
         0, Colors.Green);

         await updateServerInDB(this.ns, s.hostname, {
            minRamForHack,
            minRamForPrep
         });
      }
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const am = new AlgoManager(ns, ns.args);
   await am.start();
}