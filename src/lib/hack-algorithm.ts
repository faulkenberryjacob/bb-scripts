import {formatDollar, formatTime} from '@/lib/formatter';
import {Logger} from '@/lib/logger';
import {loadConfig} from '@/lib/defaults';

export async function main(ns: NS) {
  const arg = ns.args[0] ? ns.args[0].toString(): "";
  ns.disableLog("ALL");
  switch (arg) {
    case "dryrun":
      if (ns.args[1] && ns.args[2]) {
        //logger.tlog("Prep Algorithm:");
        await printPrepAlgorithm(ns, ns.args[1].toString(), ns.args[2].toString());

        //logger.tlog("");
        //logger.tlog("Hack Algorithm:");
        await printHackAlgorithm(ns, ns.args[1].toString(), ns.args[2].toString());
      } else {
        ns.tprint("Missing args! Require targetServer and sourceServer");
        ns.tprint("\tex: run ts dryRun n00dles home");
      }
      break;
    default:
      ns.tprint(`
      hack-algorithm [function]
      -------------------------------------------------------------------------------
      dryrun [target] [source]    Print the expected Prep and Hack plan that would
                                  be run on [source] targeting [target]
      `);
  }
}

export interface HackAlgorithm {
  script: string,
  threads: number,
  args: string[],
  runTime: number
}

/**
 * Prints the preparation algorithm for a target server, including the money available and security level.
 * @param {NS} ns - The Netscript context.
 * @param {string} targetServer - The hostname of the target server.
 * @param {string} sourceServer - The hostname of the source server.
 * @returns {Promise<void>}
 */
export async function printPrepAlgorithm(ns: NS, targetServer: string, sourceServer: string) {
  const logger = new Logger(ns);

  const algorithm = await maxPrepAlgorithm(ns, targetServer, sourceServer);
  const moneyAvailable = formatDollar(ns.getServerMoneyAvailable(targetServer));
  const currentSecurity = ns.getServerSecurityLevel(targetServer);

  logger.tlog(`${targetServer} has ${moneyAvailable} with security level ${currentSecurity}`);
  for (const step of algorithm) {
    const finishTime = formatTime(step.runTime + Number(step.args[1]));
    logger.tlog(`\tWould run ${step.script} with ${step.threads} threads, finshing in ${finishTime}`);
  }
  return;
}

/**
 * Prints the hacking algorithm for a target server, including the money available and security level.
 * @param {NS} ns - The Netscript context.
 * @param {string} targetServer - The hostname of the target server.
 * @param {string} sourceServer - The hostname of the source server.
 * @returns {Promise<void>}
 */
export async function printHackAlgorithm(ns: NS, targetServer: string, sourceServer: string) {
  const logger = new Logger(ns);

  const algorithm = await maxHackAlgorithm(ns, targetServer, sourceServer);
  const moneyAvailable = formatDollar(ns.getServerMoneyAvailable(targetServer));
  const currentSecurity = ns.getServerSecurityLevel(targetServer);

  logger.tlog(`${targetServer} has ${moneyAvailable} with security level ${currentSecurity}`);
  for (const step of algorithm) {
    const finishTime = formatTime(step.runTime + Number(step.args[1]));
    logger.tlog(`\tWould run ${step.script} with ${step.threads} threads, finshing in ${finishTime}`);
  }
  return;
}

export async function isHackPossible(ns: NS, targetServer: string, ram: number): Promise<boolean> {
  const dummyServer: string = "home";
  const plan = await maxHackAlgorithm(ns, targetServer, dummyServer, ram);
  return plan.length > 0;
}

export async function isPrepPossible(ns: NS, targetServer: string, ram: number): Promise<boolean> {
  const dummyServer: string = "home";
  const plan = await maxPrepAlgorithm(ns, targetServer, dummyServer, ram);
  return plan.length > 0;
}

/**
 * Calculates the maximum hack algorithm for a target server by determining the optimal number of threads for hack, grow, and weaken scripts.
 * @param {NS} ns - The Netscript context.
 * @param {string} targetServer - The hostname of the target server.
 * @param {string} sourceServer - The hostname of the source server.
 * @returns {Promise<HackAlgorithm[]>} - Returns an array of HackAlgorithm objects representing the ideal hack plan.
 */
export async function maxHackAlgorithm(ns: NS, targetServer: string, sourceServer: string, freeRam?: number) {
  /*
                        |= hack ====================|
      |=weaken 1======================================|
                    |= grow ==========================|
        |=weaken 2======================================|
  
                  We want to accomplish the above
  */

  const config = loadConfig(ns);
  const logger = new Logger(ns);
  const db = 

  logger.log(`Starting max hack algorithm`);

  if (!ns.serverExists(targetServer) || !ns.serverExists(sourceServer)) {
    logger.log(`One of these servers don't exist! ${targetServer}, ${sourceServer}`, 1);
    return [];
  }

  const HACK_SCRIPT: string     = config.hackScriptName;
  const GROW_SCRIPT: string     = config.growScriptName;
  const WEAKEN_SCRIPT: string   = config.weakenScriptName;

  const resultArray: HackAlgorithm[] = [];

  // get some resource info
  const maxMoney = ns.getServerMaxMoney(targetServer);
  const currentMoney = ns.getServerMoneyAvailable(targetServer);
  const ramBuffer: number = sourceServer == "home" ? Number(config.homeRamBuffer) : 0;
  const serverRam = freeRam ? freeRam : ns.getServerMaxRam(sourceServer) - ns.getServerUsedRam(sourceServer) - ramBuffer;
  const cores: number = ns.getServer().cpuCores;


  const hackRam = ns.getScriptRam(HACK_SCRIPT);
  const growRam = ns.getScriptRam(GROW_SCRIPT);
  const weakenRam = ns.getScriptRam(WEAKEN_SCRIPT);
  
  // Start at 100%
  const startHackPercent = 1.0;

  const weakenGrowMultiplier = 1.5;
  const decayRate = 0.0100;

  return await findMaxHackPercentageForAlgorithm(startHackPercent);

  async function findMaxHackPercentageForAlgorithm(hackPercent: number) {
    hackPercent = parseFloat(hackPercent.toFixed(2));

    if (hackPercent <= 0) {
      logger.log(`hackPercent hit ${hackPercent}, no solutions found`)
      const error: HackAlgorithm[] = []
      return error;
    }

    // Calculate hack threads
    const hackAmount = (currentMoney * hackPercent);
    const hackThreads = Math.floor(ns.hackAnalyzeThreads(targetServer, hackAmount));
    if (hackThreads <= -1) {
      logger.log(`hackAnalyzeThreads returned ${hackThreads} for hackAmount ${hackAmount} with hackPercent ${hackPercent}.`);
      const error: HackAlgorithm[] = []
      return error;
    }

    // Calculate security increase from hacking
    const hackSecurityIncrease = ns.hackAnalyzeSecurity(hackThreads, targetServer);

    // Calculate weaken threads needed to counter hack security increase
    const weakenThreadsForHack = Math.ceil(hackSecurityIncrease / ns.weakenAnalyze(1, cores));

    // Calculate grow threads needed to restore money
    const moneyAfterHack = (maxMoney * (1.0 - hackPercent)) == 0 ? 1 : (maxMoney * (1.0 - hackPercent));
    const growThreads = Math.ceil(ns.growthAnalyze(targetServer, maxMoney / moneyAfterHack, cores));

    // Calculate security increase from growing
    const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, undefined, cores);

    // Calculate weaken threads needed to counter grow security increase
    const weakenThreadsForGrow = Math.ceil((growSecurityIncrease / ns.weakenAnalyze(1, cores)) * weakenGrowMultiplier);

    // Total weaken threads required
    const totalWeakenThreads = weakenThreadsForHack + weakenThreadsForGrow;

    // if this uses too much RAM, let's try again but reduce 5% hack
    const totalRamUsed = (hackThreads * hackRam) + (growThreads * growRam) + (totalWeakenThreads * weakenRam);

    logger.log(`hackSecurityIncrease (${hackSecurityIncrease}), moneyAfterHack (${moneyAfterHack}), growSecurityIncrease (${growSecurityIncrease})`)
    logger.log(`Hack algorithm [${hackPercent}]: hack (${hackThreads}), weakenHack (${weakenThreadsForHack}), grow (${growThreads}) , weakenGrow (${weakenThreadsForGrow}), cores ${cores}`,1)

    if (totalRamUsed > serverRam ) { return await findMaxHackPercentageForAlgorithm(hackPercent-decayRate); }
    else if (totalRamUsed < 0) { 
      logger.tlog(`ERROR -- totalRamUsed hit (${totalRamUsed}), aborting..`);
      return [];
    }
    
    // if this succeeds let's store the results and sort them by
    // longest running script first
    else {

      const hackTime        = ns.getHackTime(targetServer);
      const weakenTime      = ns.getWeakenTime(targetServer);
      const growTime        = ns.getGrowTime(targetServer);

      const longestRunTime  = Math.max(hackTime, weakenTime, growTime, weakenTime);

      const hackDelay       = longestRunTime - hackTime;
      const weakenHackDelay = longestRunTime - weakenTime + 10;
      const growDelay       = longestRunTime - growTime + 20;
      const weakenGrowDelay = longestRunTime - weakenTime + 30;

      // how many times can this loop fit into our available server RAM?
      // for example, if we have 1,000 GB available but this loop only takes 250 GB,
      // we can run it four times back to back.
      const parallelLoops = Math.floor(serverRam/totalRamUsed);
      const parallelDelay: number = 25 // in milliseconds
      for (let a = 0; a < parallelLoops; a++) {
        const iterationDelay = a * parallelDelay;

        const hackInterface: HackAlgorithm = {
          script: HACK_SCRIPT,
          threads: hackThreads,
          args: [targetServer, (hackDelay + iterationDelay).toString()],
          runTime: hackTime
        };

        const weakenHackInterface: HackAlgorithm = {
          script: WEAKEN_SCRIPT,
          threads: weakenThreadsForHack,
          args: [targetServer, (weakenHackDelay + iterationDelay).toString()],
          runTime: weakenTime
        };

        const growInterface: HackAlgorithm = {
          script: GROW_SCRIPT,
          threads: growThreads,
          args: [targetServer, (growDelay + iterationDelay).toString()],
          runTime: growTime
        };

        const weakenGrowInterface: HackAlgorithm = {
          script: WEAKEN_SCRIPT,
          threads: weakenThreadsForGrow,
          args: [targetServer, (weakenGrowDelay + iterationDelay).toString()],
          runTime: weakenTime
        };

        resultArray.push(hackInterface);
        resultArray.push(weakenHackInterface);
        resultArray.push(growInterface);
        resultArray.push(weakenGrowInterface);  
      }   

      logger.log(`Ideal plan determine with hackPercent [${hackPercent.toString()}] using ${totalRamUsed} RAM`);

      // for (let p = 0; p < resultArray.length; p++) {
      //   logger.log(`${resultArray[p].script} (${resultArray[p].threads}) with runTime: ${formatTime(resultArray[p].runTime)} and args ${resultArray[p].args.join(', ')}`);
      // }

      return resultArray;
    }

  }
}

/**
 * Calculates the maximum preparation algorithm for a target server by determining the optimal number of threads for grow and weaken scripts.
 * @param {NS} ns - The Netscript context.
 * @param {string} targetServer - The hostname of the target server.
 * @param {string} sourceServer - The hostname of the source server.
 * @returns {Promise<HackAlgorithm[]>} - Returns an array of HackAlgorithm objects representing the ideal preparation plan.
 */
export async function maxPrepAlgorithm(ns: NS, targetServer: string, sourceServer: string, freeRam?: number) {
  const logger = new Logger(ns);
  const config = loadConfig(ns);

  logger.log(`Starting prep algorithm`);

  const GROW_SCRIPT: string     = config.growScriptName;
  const WEAKEN_SCRIPT: string   = config.weakenScriptName;

  const resultArray: HackAlgorithm[] = [];

  // get some resource info
  const maxMoney  = ns.getServerMaxMoney(targetServer);
  const ramBuffer: number = sourceServer == "home" ? Number(config.homeRamBuffer) : 0;
  const serverRam = freeRam ? freeRam : ns.getServerMaxRam(sourceServer) - ns.getServerUsedRam(sourceServer) - ramBuffer;
  const minSecurityLevel     = ns.getServerMinSecurityLevel(targetServer);
  const currentSecurityLevel = ns.getServerSecurityLevel(targetServer);
  const cores: number = ns.getServer(sourceServer).cpuCores;

  const growRam   = ns.getScriptRam(GROW_SCRIPT);
  const weakenRam = ns.getScriptRam(WEAKEN_SCRIPT);

  // assume we can prep the server in one script run
  const growPercentage: number = 1.00;
  const decayRate: number = 0.0100;
  

  return await findQuickestPrepAlgorithm(growPercentage);

  async function findQuickestPrepAlgorithm(growDecay: number, weakenDecay: number = 1.00) {
    growDecay   = parseFloat(growDecay.toFixed(2));
    weakenDecay = parseFloat(weakenDecay.toFixed(2));

    // if (growDecay <= 0.0500 && weakenDecay <= 0.0500) {
    //   logger.log(`ERROR -- growDecay (${growDecay}), weakenDecay (${weakenDecay}) too low. No prep solution found.`);
    //   return [];
    // }
    
    // Calculate the number of threads needed to grow the server to max money
    const growThreads = Math.ceil(growDecay * ns.growthAnalyze(targetServer, maxMoney / Math.max(ns.getServerMoneyAvailable(targetServer), 1), cores));

    // Calculate the security increase from growing
    const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, undefined, cores);

    // Calculate the number of threads needed to weaken the server to min security
    const totalSecurityIncrease = growSecurityIncrease + (currentSecurityLevel - minSecurityLevel);
    const weakenThreads = Math.ceil(weakenDecay * (totalSecurityIncrease / ns.weakenAnalyze(1, cores)));

    // Ensure there is enough RAM to run the scripts
    const totalRamUsed = (growThreads * growRam) + (weakenThreads * weakenRam);
    logger.log(`Prep algorithm: growDecay ${growDecay} gives ${growThreads} threads, weakenDecay ${weakenDecay} gives ${weakenThreads} threads = ${totalRamUsed} RAM`, 1);

    // if there's a failure somewhere, exit
    if (totalRamUsed <= 0) {
      logger.tlog(`ERROR -- totalRamUsed returned ${totalRamUsed}`);
      return [];

    // if we're using too much RAM and our decays haven't hit rock bottom, recurse
    } else if (totalRamUsed > serverRam && (growDecay > decayRate || weakenDecay > decayRate)) { 
      // these decay numbers are our failsafes. If it's impossible to grow & weaken with full potential,
      // we slowly wittle down how many grow threads are possible. Once we hit 5% (0.05) of potential
      // grow threads, we start decaying weaken until our worst possible outcomes: 5% of both's potential
      const newGrowDecay    = Math.max(growDecay-decayRate, decayRate);
      const newWeakenDecay  = Math.max(weakenDecay-decayRate, decayRate);

      return await findQuickestPrepAlgorithm(newGrowDecay, newWeakenDecay);

    // if we hit rock bottom, exit
    } else if (growDecay <= decayRate && weakenDecay <= decayRate) {
      logger.log(`ERROR - Could not find any prep plans`);
      return [];
    }
    
    // if this succeeds let's store the results
    else {

      const weakenTime  = ns.getWeakenTime(targetServer);
      const growTime    = ns.getGrowTime(targetServer);

      const longestRunTime  = Math.max(weakenTime, growTime);

      const weakenDelay = longestRunTime - weakenTime + 200;
      const growDelay   = longestRunTime - growTime;

      // We can either
      // (1) Fit as much of these loops into our server as possible.
      //     ex: if each loops takes  20 GB, and we have 100 GB
      //     available, let's do 5 loops
      // (2) Only do as much as necessary to grow to max money.
      //     ex: If our growDecay is 0.25, or in otherwards we can
      //     grow 25% of our money back per loop, let's only do
      //     4 loops assuming we have the RAM for it. Otherwise do (1).
      const mostGrow = Math.ceil(1 / growDecay);
      const mostGrowRam = mostGrow * totalRamUsed;
      const parallelLoops = mostGrowRam < serverRam ? mostGrow : Math.floor(serverRam/totalRamUsed);
      for (let a = 0; a < parallelLoops; a++) {
        const parallelDelay: number = 500 // in milliseconds

        const growInterface: HackAlgorithm = {
          script: GROW_SCRIPT,
          threads: growThreads,
          args: [targetServer, (growDelay + (a * parallelDelay)).toString()],
          runTime: ns.getGrowTime(targetServer),
        };

        const weakenInterface: HackAlgorithm = {
          script: WEAKEN_SCRIPT,
          threads: weakenThreads,
          args: [targetServer, (weakenDelay + (a * parallelDelay)).toString()],
          runTime: ns.getWeakenTime(targetServer),
        };

        resultArray.push(growInterface);
        resultArray.push(weakenInterface);
      }


      logger.log(`Ideal plan determined with ${growDecay.toString()}, ${weakenDecay.toString()} decays using ${totalRamUsed} RAM`);
      // for (let p = 0; p < resultArray.length; p++) {
      //   logger.log(resultArray[p].script + "(" + resultArray[p].threads + ")" + " with runTime: " + formatTime(resultArray[p].runTime) 
      //   + " ms and args: " + resultArray[p].args + " ms");
      // }

      return resultArray;
    }

  }
}