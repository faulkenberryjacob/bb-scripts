import { BaseManager } from "@/lib/BaseManager";
import { hasSingularity } from "@/lib/defaults";
import { formatDollar } from "@/lib/formatter";
import { Colors } from "@/lib/logger";
import * as consts from "@/lib/constants";

class HomeManager extends BaseManager {
   async start() {
      if (!hasSingularity(this.ns)) { this.skipMe(); }
      this.upgradeHome();
      this.success();
   }

   upgradeHome() {
      if (this.ns.singularity.upgradeHomeCores()) {
         this.logger.info(`Upgraded Home's cores!`, 0, Colors.Magenta, true);
      }

      if (this.ns.singularity.upgradeHomeRam()) {
         this.logger.info(`Upgraded Home's RAM!`, 0, Colors.Magenta, true);
      }
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const hm = new HomeManager(ns, ns.args);
   await hm.start();
}