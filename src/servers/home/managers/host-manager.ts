import { BaseManager } from "@/lib/BaseManager";
import * as consts from "@/lib/constants";
import { getPurchasedServerNames } from "@/lib/defaults";
import { formatDollar } from "@/lib/formatter";
import { Colors } from "@/lib/logger";

class HostManager extends BaseManager {
   async start() {
      this.buyServers();
      this.success();
   }

   buyServers() {
      let playerMoney: number = this.ns.getServerMoneyAvailable("home");
      let canAfford: boolean = playerMoney > consts.MONEY_BUFFER;
      let lowMoney: boolean = playerMoney < consts.MONEY_THRESHOLD;

      const pServers = getPurchasedServerNames(this.ns);
      let ramExponent: number = 1;

      while (canAfford) {
         const desiredRam = Math.pow(2, ramExponent);
         const cost = this.ns.getPurchasedServerCost(desiredRam);
         this.logger.info(`Cost for ${desiredRam} GB is ${formatDollar(this.ns, cost)}`);
         if (playerMoney < cost) { return; }

         for (let i = 0; i < pServers.length; i++) {

            // if this server doesn't exist, purchase it
            if (!this.ns.serverExists(pServers[i])) {
               this.logger.info(`Purchasing server ${pServers[i]} with ${desiredRam} GB of RAM for ${formatDollar(this.ns, cost)}`, 0, Colors.Magenta, true);
               this.ns.purchaseServer(pServers[i], desiredRam);
            } else {
               // if it already exists but with less ram, upgrade it
               if (this.ns.getServerMaxRam(pServers[i]) < desiredRam) {
                  try {
                     this.logger.info(`Upgrading server ${pServers[i]} to ${desiredRam} GB of RAM for ${formatDollar(this.ns, cost)}`, 0, Colors.Magenta, true);
                     this.ns.upgradePurchasedServer(pServers[i], desiredRam);
                  } catch (error) {
                     this.logger.error(`Error upgrading server ${pServers[i]}: ${error}`);
                  }
               }
            }

            // check if we've gone below our money threshold or cannot afford any more costs
            playerMoney = this.ns.getServerMoneyAvailable("home");
            canAfford = playerMoney > cost;
            lowMoney = playerMoney < consts.MONEY_THRESHOLD;

            if (!canAfford || lowMoney) { return; }
         }

         if (desiredRam >= this.ns.getPurchasedServerMaxRam()) { return; }
         ramExponent++;
      }
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const hm = new HostManager(ns, ns.args);
   await hm.start();
}