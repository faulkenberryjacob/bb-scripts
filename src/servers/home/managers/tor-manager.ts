import { BaseManager } from "@/lib/BaseManager";
import { hasSingularity } from "@/lib/defaults";
import { formatDollar } from "@/lib/formatter";
import { Colors } from "@/lib/logger";
import * as consts from "@/lib/constants";
import { DarkWebProgram } from "@/lib/types";

class TorManager extends BaseManager {
   start() {
      if (!hasSingularity(this.ns)) { this.finish(); }
      this.buyPrograms();
      this.finish();
   }

   /**
    * Dynamically retrieves all Dark Web programs with their costs and ownership status
    */
   getDarkWebPrograms(): DarkWebProgram[] {
      const programs = this.ns.singularity.getDarkwebPrograms();

      const darkwebPrograms: DarkWebProgram[] = Object.values(programs).map(program => {
         const cost = this.ns.singularity.getDarkwebProgramCost(program);
         const owned = this.ns.singularity.getDarkwebProgramCost(program) == 0;

         return {
            name: program,
            cost: cost,
            owned: owned
         };
      });

      return darkwebPrograms;
   }

   getUnownedDarkWebPrograms(): DarkWebProgram[] {
      const programs = this.getDarkWebPrograms();
      return programs.filter(p => !p.owned);
   }

   buyPrograms() {
      // Determine if we have the TOR router.
      // If we don't, try to buy it. If we can't, exit.
      if (this.ns.hasTorRouter() == false) {
         if (this.ns.getPlayer().money - consts.TOR_COST > consts.MONEY_BUFFER) {
            this.logger.info(`Purchasing TOR router for ${formatDollar(this.ns, consts.TOR_COST)}..`, 0, Colors.Magenta, true);
            this.ns.singularity.purchaseTor();
         } else {
            this.logger.warn(`Cannot afford TOR router. Need ${formatDollar(this.ns, consts.TOR_COST - this.ns.getPlayer().money + consts.MONEY_BUFFER)} more to purchase while maintaining money buffer.`);
            return;
         }
      }

      // Get all the unowned programs and their costs, then attempt to buy them
      const getUnownedPrograms = this.getUnownedDarkWebPrograms();
      if (getUnownedPrograms.length == 0) {
         this.logger.info("All Dark Web programs already owned.");
         return;
      } else {
         for (const program of getUnownedPrograms) {
            if (this.ns.getPlayer().money - program.cost > consts.MONEY_BUFFER) {
               this.logger.info(`Purchasing ${program.name} for ${formatDollar(this.ns, program.cost)}..`, 0, Colors.Magenta, true);
               this.ns.singularity.purchaseProgram(program.name);
            } else {
               this.logger.warn(`Cannot afford ${program.name}. Need ${formatDollar(this.ns, program.cost - this.ns.getPlayer().money + consts.MONEY_BUFFER)} more to purchase while maintaining money buffer.`);
            }
         }
      }
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const tm = new TorManager(ns, ns.args);
   tm.start();
}