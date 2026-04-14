import { BaseManager } from "@/lib/BaseManager";
import { getServerData, getServersWithNoBackdoor } from "@/lib/db";
import { hasSingularity } from "@/lib/defaults";
import { Colors } from "@/lib/logger";
import { connectChainToServer } from "@/lib/system";
import { ScriptArg } from "NetscriptDefinitions";

class BackdoorManager extends BaseManager {
   servers: string[];

   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      super(ns, scriptArgs);

      this.servers = getServersWithNoBackdoor(this.ns);
   }

   async start() {
      if (!hasSingularity(this.ns)) { this.finish(); }
      if (this.servers.length == 0) { this.finish(); }

      await this.backdoor();

      this.finish();
   }

   async backdoor() {
      this.logger.info(`Backdooring ${this.servers.length} servers..`, 0, Colors.Magenta, true);
      for (const s of this.servers) {
         const serverData = getServerData(this.ns, s);

         // Backdoor the server
         const backdoorInstalled: boolean = serverData?.backdoorInstalled ?? true;
         if (!backdoorInstalled) {
            this.logger.debug(`Executing backdoor on ${s}..`, 1, true);
            connectChainToServer(this.ns, s);
            await this.ns.singularity.installBackdoor();

            // Return home
            this.logger.info(`Installed backdoor on ${s}!`,1,Colors.Magenta, true);
            this.ns.singularity.connect("home");
         }
      }
   }

}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const bm = new BackdoorManager(ns, ns.args);
   await bm.start();
}