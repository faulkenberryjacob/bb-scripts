import { getHackableServers } from "./db";
import * as consts from "./constants";
import { Logger } from "./logger";
import { maxHackAlgorithm, maxPrepAlgorithm } from "./hack-algorithm";
import { formatDollar } from "./formatter";
import { hasFormulas } from "./defaults";

/**
 * Retrieves the top server based on the money generated per second.
 *
 * @param ns - The Netscript environment object.
 * @returns An array of servers sorted by money generated per second in descending order.
 */
export async function getTopServerByMoneyPerSecond(ns: NS) {
  const hackableServers = await getHackableServers(ns);
  const sortedServers: string[] = hackableServers
                                  .sort((a, b) => calculateMoneyPerSecond(ns, b) - calculateMoneyPerSecond(ns, a))
                                  .filter(server => calculateMoneyPerSecond(ns, server) > 0);
  return sortedServers;
}

/**
 * Calculates the potential money per second that can be earned by hacking a specified target server.
 * 
 * @param {NS} ns - The Netscript context.
 * @param {string} target - The hostname of the target server to analyze.
 * @returns {Promise<number>} - The potential money per second that can be earned.
 */
export function calculateMoneyPerSecond(ns: NS, target: string) {
  const maxMoney = ns.getServerMaxMoney(target);
  const hackTime = ns.getHackTime(target);
  const growTime = ns.getGrowTime(target);
  const weakTime = ns.getWeakenTime(target);
  const cycleTime   = Math.max(hackTime, growTime, weakTime);
  const moneyPerSecond = parseFloat((maxMoney / (cycleTime/1000)).toFixed(2));
  const calcMoneyPerSecond = ns.hackAnalyzeChance(target) * moneyPerSecond;
  return calcMoneyPerSecond;
}

/**
 * Calculates the maximum number of threads that can be run for a specific script on a given server.
 * @param {NS} ns - The Netscript context.
 * @param {string} script - The name of the script to run.
 * @param {string} server - The hostname of the server to run the script on.
 * @param {string} [scriptSource="home"] - The hostname of the server where the script is located. Defaults to "home".
 * @returns {Promise<number>} - The maximum number of threads that can be run.
 */
export async function calculateMaxThreadsForScript(ns: NS, script: string, server: string, scriptSource: string = "home") {
  const logger = new Logger(ns);

  // add a buffer if we're working on "home"
  const ramBuffer: number = server == "home" ? consts.HOME_RAM_BUFFER : 0;

  const requiredRam: number = ns.getScriptRam(script, scriptSource);
  const availableRam: number = (ns.getServerMaxRam(server) - ns.getServerUsedRam(server)) - ramBuffer;
  const idealThreads: number = Math.floor(availableRam / requiredRam);
  logger.log("AvailableRam (" + availableRam + ") / requiredRam (" + requiredRam + ") = " + idealThreads + " ideal threads");
  return idealThreads;
}

/**
 * Determines the faction favor gained and logs the required reputation to reach the favor needed to donate.
 * 
 * @param ns - The Netscript environment object.
 * @param faction - The name of the faction for which to determine favor gained.
 */
export async function determineFactionFavorGained(ns: NS, faction: string): Promise<void> {
  const logger = new Logger(ns);
  const factions = ns.getPlayer().factions;
  if (!factions.includes(faction)) {
    ns.tprint(`Player is not a member of [${faction}]`);
    ns.tprint(`Possible factions: ${factions.join(", ")}`);
    return;
  }

  if (hasFormulas(ns)) {
    const reqFavorToDonate = ns.getFavorToDonate();
    const reqRepToDonate = ns.formulas.reputation.calculateFavorToRep(reqFavorToDonate);
    ns.tprint(`Require [${ns.formatNumber(reqRepToDonate)}] reputation to reach [${reqFavorToDonate}] favor with [${faction}]`);
    return;
  } else {
    ns.tprint(`[formulas] namespace not unlocked`);
    return;
  }
}

/**
 * Determines the maximum RAM that can be afforded for purchasing servers.
 * @param {NS} ns - The Netscript context.
 * @returns {number} - The maximum RAM that can be afforded for the servers.
 */
export function determinePurchaseServerMaxRam(ns: NS, numServers?: number) {
  const logger              = new Logger(ns);
  const numToBuy: number    = numServers ? numServers : ns.getPurchasedServerLimit();
  const playerMoney: number = ns.getServerMoneyAvailable("home");

  // we can only buy server RAM in powers of 2, or 2^n
  const starterRamExponent: number = 1;

  return recurseRamCost(starterRamExponent);

  function recurseRamCost(ramExponent: number) {
    const ram = Math.pow(2, ramExponent);
    logger.log(`Checking cost for ${numToBuy} servers with ${ram} RAM..`)

    const cost = ns.getPurchasedServerCost(ram);
    const totalCost = cost * numToBuy;

    logger.log(`Costs ${formatDollar(ns, totalCost)}`),1

    if (totalCost <= playerMoney) {
      logger.log(`Can afford ${ram}!`,1);
      return recurseRamCost(ramExponent + 1);
    } else {
      const maxRam = Math.pow(2, ramExponent-1);
      logger.log(`Found max: ${maxRam}`);
      return maxRam;
    }
  }
}

/**
 * Determines the lowest "n" for 2^n that will fit a particular number.
 * @param number - The number to fit.
 * @returns The lowest "n" such that 2^n is greater than or equal to the given number.
 */
export async function findLowestPowerOfTwo(num: number): Promise<number> {
  if (num <= 0) {
      throw new Error("Number must be greater than zero");
  }
  return Math.ceil(Math.log2(num));
}

/**
 * Determines the minimum RAM needed to hack a target server.
 *
 * @param {NS} ns - The Netscript environment.
 * @param {string} target - The name of the target server.
 * @returns {Promise<number>} - A promise that resolves to the minimum RAM needed for hacking the target server.
 */
export async function determineMinimumRamNeededForHack(ns: NS, target: string) {
  const logger = new Logger(ns);
  logger.info(`Determining minimum ram needed for ${target}`);

  return findRamUntilHack(1);

  async function findRamUntilHack(ramExponent: number) {
    const ram = Math.pow(2, ramExponent);
    const { plan, hackPct } = await maxHackAlgorithm(ns, target, ram);
    if (plan.length > 0) {
      logger.info(`Minimum ram needed for ${target} is ${ram}`, 1);
      return ram;
    } else {
      await findRamUntilHack(ramExponent + 1);
    }
  }
}

/**
 * Determines the optimum RAM needed to hack a target server.
 *
 * @param {NS} ns - The Netscript environment.
 * @param {string} target - The name of the target server.
 * @returns {Promise<number>} - A promise that resolves to the optimum RAM needed for hacking the target server.
 */
export async function determineOptimumRamNeededForHack(ns: NS, target: string) {
  const logger = new Logger(ns);
  logger.info(`Determining optimum ram needed for ${target}`);

  return findRamUntilHack(1);

  async function findRamUntilHack(ramExponent: number) {
    const ram = Math.pow(2, ramExponent);
    const { plan, hackPct } = await maxHackAlgorithm(ns, target, ram);
    if (hackPct == 1) {
      logger.info(`Optimum ram needed for ${target} is ${ram}`, 1);
      return ram;
    } else {
      return await findRamUntilHack(ramExponent + 1);
    }
  }
}

/**
 * Determines the minimum RAM needed to Prep a target server.
 *
 * @param {NS} ns - The Netscript environment.
 * @param {string} target - The name of the target server.
 * @returns {Promise<number>} - A promise that resolves to the minimum RAM needed for prepping the target server.
 */
export async function determineMinimumRamNeededForPrep(ns: NS, target: string) {
  const logger = new Logger(ns);
  logger.info(`Determining minimum ram needed for ${target}`);

  return findRamUntilPrep(1);

  async function findRamUntilPrep(ramExponent: number) {
    const ram = Math.pow(2, ramExponent);
    const { plan, growPct } = await maxPrepAlgorithm(ns, target, ram);
    if (plan.length > 0) {
      logger.info(`Minimum ram needed for ${target} is ${ram}`, 1);
      return ram;
    } else {
      await findRamUntilPrep(ramExponent + 1);
    }
  }
}

/**
 * Determines the optimum RAM needed to Prep a target server.
 *
 * @param {NS} ns - The Netscript environment.
 * @param {string} target - The name of the target server.
 * @returns {Promise<number>} - A promise that resolves to the optimum RAM needed for prepping the target server.
 */
export async function determineOptimumRamNeededForPrep(ns: NS, target: string) {
  const logger = new Logger(ns);
  logger.info(`Determining optimum ram needed for ${target}`);

  return findRamUntilPrep(1);

  async function findRamUntilPrep(ramExponent: number) {
    const ram = Math.pow(2, ramExponent);
    const { plan, growPct } = await maxPrepAlgorithm(ns, target, ram);
    if (growPct == 1) {
      logger.info(`Optimum ram needed for ${target} is ${ram}`, 1);
      return ram;
    } else {
      return await findRamUntilPrep(ramExponent + 1);
    }
  }
}