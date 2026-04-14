import * as consts from '@/lib/constants';
import { BaseManager } from "@/lib/BaseManager";
import { CrimeType, Task } from "NetscriptDefinitions";
import { Colors } from '@/lib/logger';
import { hasSingularity } from '@/lib/defaults';

class CrimeManager extends BaseManager {
   start() {
      if (!hasSingularity(this.ns)) { this.finish(); }

      const bestCrime = this.commitBestCrime();
      if (bestCrime) {
         this.logger.info(`Committing crime: ${bestCrime}..`,0, Colors.Magenta, true);
         this.ns.singularity.commitCrime(bestCrime);
      }

      this.finish();
   }

   commitBestCrime(): CrimeType | null {
      const currentWork: Task | null = this.ns.singularity.getCurrentWork();
      if (currentWork && currentWork.type != "CRIME") {
         this.logger.warn(`Currently busy with work type ${currentWork.type}. Cannot commit crime right now.`);
         return null;
      }

      // Get all possible crimes, then determine their subjective "value" based on the formula:
      //   value = (money * chance) / time
      const crimes = this.ns.enums.CrimeType;
      const crimeValues = Object.values(crimes).map(crime => {
         const stats = this.ns.singularity.getCrimeStats(crime);
         const chance = this.ns.singularity.getCrimeChance(crime);
         return {
            crime: crime as CrimeType,
            karma: (stats.karma * chance) / stats.time,
            value: (stats.money * chance) / stats.time
         }
      });

      if (crimeValues.length <= 0) {
         this.logger.warn("No crimes found to commit?");
         return null;
      }

      const bestValue = crimeValues.reduce((best, current) =>
         current.value > best.value ? current : best).crime;
      const bestKarma = crimeValues.reduce((best, current) =>
         current.karma > best.karma ? current : best).crime;

      // if we don't have enough karma to join a gang, focus that
      const isFocusingKarma = this.ns.getPlayer().karma > consts.GANG_KARMA_REQ;
      const bestCrime = isFocusingKarma ? bestKarma : bestValue;

      // If the current work is the same as the best crime, then just return null
      if (currentWork && currentWork.type == "CRIME" && currentWork.crimeType == bestCrime) {
         this.logger.info(`Already committing the best crime (${currentWork.crimeType}), no need to switch.`, 1);
         return null;
      }

      return bestCrime;
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const cm = new CrimeManager(ns, ns.args);
   cm.start();
}