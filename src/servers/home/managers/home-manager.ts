import { BaseManager } from "@/lib/BaseManager";
import { hasSingularity } from "@/lib/defaults";
import { formatDollar } from "@/lib/formatter";
import { Colors } from "@/lib/logger";
import * as consts from "@/lib/constants";

class HomeManager extends BaseManager {
   start() {
      if (!hasSingularity(this.ns)) { this.finish(); }
      this.upgradeHome();
      this.finish();
   }

   upgradeHome() {
      const coreCost: number = this.ns.singularity.getUpgradeHomeCoresCost();
      const coreCostString: string = formatDollar(this.ns, coreCost);
      const memCost: number = this.ns.singularity.getUpgradeHomeRamCost();
      const memCostString: string = formatDollar(this.ns, memCost);
      let money: number = this.ns.getPlayer().money;
      let upgradeResult: boolean = false;

      if (money - coreCost > consts.MONEY_BUFFER) {
         this.logger.info(`Upgrading home cores for ${coreCostString}..`, 1, Colors.Magenta, true);
         upgradeResult = this.ns.singularity.upgradeHomeCores();
      }

      if (!upgradeResult && (money - memCost > consts.MONEY_BUFFER)) {
         this.logger.info(`Upgrading home RAM for ${memCostString}..`, 1, Colors.Magenta, true);
         upgradeResult = this.ns.singularity.upgradeHomeRam();
      }
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const hm = new HomeManager(ns, ns.args);
   hm.start();
}