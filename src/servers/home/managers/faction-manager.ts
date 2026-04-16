import { BaseManager } from "@/lib/BaseManager";
import { hasSingularity } from "@/lib/defaults";
import { Colors } from "@/lib/logger";

class FactionManager extends BaseManager {
   async start() {
      if (!hasSingularity(this.ns)) { this.skipMe(); }
      this.joinFactions();
      this.success();
   }

   joinFactions() {
      this.ns.singularity.checkFactionInvitations().forEach(faction => {
         if (this.ns.singularity.getFactionEnemies(faction).length == 0) {
            this.logger.info(`Joining faction ${faction}..`, 1, Colors.Magenta, true);
            this.ns.singularity.joinFaction(faction);
         }
      });
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const fm = new FactionManager(ns, ns.args);
   await fm.start();
}