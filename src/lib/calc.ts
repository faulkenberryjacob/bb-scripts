import { getHackableServers } from "./db";
import { loadConfig } from "./defaults";
import { Logger } from "./logger";

/**
 * Retrieves the top server based on the money generated per second.
 *
 * @param ns - The Netscript environment object.
 * @returns An array of servers sorted by money generated per second in descending order.
 */
export function getTopServerByMoneyPerSecond(ns: NS) {
  return getHackableServers(ns).sort((a, b) => calculateMoneyPerSecond(ns, b) - calculateMoneyPerSecond(ns, a));
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
  
  // Calculate how many threads we can run
  const HOME_RAM_BUFFER: number = Number(loadConfig(ns).homeRamBuffer);

  // add a buffer if we're working on "home"
  const ramBuffer: number = server == "home" ? HOME_RAM_BUFFER : 0;

  const requiredRam: number = ns.getScriptRam(script, scriptSource);
  const availableRam: number = (ns.getServerMaxRam(server) - ns.getServerUsedRam(server)) - ramBuffer;
  const idealThreads: number = Math.floor(availableRam / requiredRam);
  logger.log("AvailableRam (" + availableRam + ") / requiredRam (" + requiredRam + ") = " + idealThreads + " ideal threads");
  return idealThreads;
}