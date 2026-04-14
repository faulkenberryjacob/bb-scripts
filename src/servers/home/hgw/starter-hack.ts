import * as consts from '@/lib/constants';
import { Logger } from '@/lib/logger';
import { roundTo } from '@/lib/calc';

export async function main(ns: NS) {
  // Defines the "target server"
  const TARGET_HOSTNAME = ns.args[0].toString();
  const logger = new Logger(ns);
  ns.disableLog("ALL");

  // Define static thresholds
  const moneyThresh = ns.getServerMaxMoney(TARGET_HOSTNAME);
  if (moneyThresh <= 0) {
    logger.warn(`There's no money to be made! Money max: ${moneyThresh}`);
    ns.exit();
  }
  const acceptableMoney = moneyThresh * consts.MONEY_THRESHOLD;

  const securityThresh = ns.getServerMinSecurityLevel(TARGET_HOSTNAME);
  const acceptableSecurity = securityThresh * consts.SECURITY_THRESHOLD;

  // Infinite loop that continously hacks/grows/weakens the target server
  // If we don't have the required hacking, sleep
  while (true) {
    const securityLevel: number = ns.getServerSecurityLevel(TARGET_HOSTNAME);
    const moneyAvailable: number = ns.getServerMoneyAvailable(TARGET_HOSTNAME);
    logger.info(`Security: ${roundTo(securityLevel, 1)}/${securityThresh}. Acceptable is ${acceptableSecurity}`);
    logger.info(`Money: ${ns.formatNumber(moneyAvailable)}/${ns.formatNumber(moneyThresh)}. Acceptable is ${ns.formatNumber(acceptableMoney)}`);
    // ns.print("Security: " + securityLevel.toString() + "/" + securityThresh + ". Acceptable is " + acceptableSecurity);
    // ns.print("Money: " + moneyAvailable.toString() + "/" + moneyThresh + ". Acceptable is " + acceptableMoney);

    if (securityLevel > acceptableSecurity) {
      logger.info(`Weakening for ${ns.formatNumber(ns.getWeakenTime(TARGET_HOSTNAME), 1)}..`);
      await ns.weaken(TARGET_HOSTNAME);
    }
    else if (moneyAvailable < acceptableMoney) {
      logger.info(`Growing for ${ns.formatNumber(ns.getGrowTime(TARGET_HOSTNAME), 1)}..`);
      await ns.grow(TARGET_HOSTNAME);
    }
    else {
      logger.info(`Hacking for ${ns.formatNumber(ns.getHackTime(TARGET_HOSTNAME), 1)}..`);
      await ns.hack(TARGET_HOSTNAME);
    }
  }
}

