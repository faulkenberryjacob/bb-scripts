import {formatDollar, formatTime} from '@/lib/formatter';
import {Logger} from '@/lib/logger';
import {Plan} from '@/lib/types';
import * as consts from '@/lib/constants';

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



/**
 * Prints the preparation algorithm for a target server, including the money available and security level.
 * @param {NS} ns - The Netscript context.
 * @param {string} targetServer - The hostname of the target server.
 * @param {string} sourceServer - The hostname of the source server.
 * @returns {Promise<void>}
 */
export async function printPrepAlgorithm(ns: NS, targetServer: string, sourceServer: string) {
  const logger = new Logger(ns);

  const { plan, growPct } = await maxPrepAlgorithm(ns, targetServer, ns.getServerMaxRam(sourceServer));
  const moneyAvailable = formatDollar(ns, ns.getServerMoneyAvailable(targetServer));
  const currentSecurity = ns.getServerSecurityLevel(targetServer);

  logger.tlog(`${targetServer} has ${moneyAvailable} with security level ${currentSecurity}`);
  for (const step of plan) {
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

  const { plan, hackPct } = await maxHackAlgorithm(ns, targetServer, ns.getServerMaxRam(sourceServer));
  const moneyAvailable = formatDollar(ns, ns.getServerMoneyAvailable(targetServer));
  const currentSecurity = ns.getServerSecurityLevel(targetServer);

  logger.tlog(`${targetServer} has ${moneyAvailable} with security level ${currentSecurity}`);
  for (const step of plan) {
    const finishTime = formatTime(step.runTime + Number(step.args[1]));
    logger.tlog(`\tWould run ${step.script} with ${step.threads} threads, finshing in ${finishTime}`);
  }
  return;
}

export async function isHackPossible(ns: NS, targetServer: string, ram: number): Promise<boolean> {
  const { plan, hackPct } = await maxHackAlgorithm(ns, targetServer, ram);
  return plan.length > 0;
}

export async function isPrepPossible(ns: NS, targetServer: string, ram: number): Promise<boolean> {
  const { plan, growPct } = await maxPrepAlgorithm(ns, targetServer, ram);
  return plan.length > 0;
}

/**
 * Calculates the optimal hacking plan for a given target server, considering available RAM and other constraints.
 * The plan includes hacking, growing, and weakening scripts to maximize the money obtained from the target server.
 *
 * @param {NS} ns - The Netscript environment.
 * @param {string} targetServer - The name of the target server to hack.
 * @param {number} availableRam - The amount of RAM available for running scripts.
 * @param {number} [cores=1] - The number of CPU cores available for running scripts.
 * @param {number} [ramBuffer=0] - The amount of RAM to reserve and not use for scripts.
 * @returns {Promise<{plan: Plan[], hackPct?: number}>} - A promise that resolves to an object containing the plan and the hack percentage.
 */
export async function maxHackAlgorithm(ns: NS, targetServer: string, availableRam: number, cores: number = 1, ramBuffer: number = 0): Promise<{plan: Plan[], hackPct?: number}> {
  /*
                        |= hack ====================|
      |=weaken 1=====================================|
                    |= grow ==========================|
        |=weaken 2=====================================|
  
                  We want to accomplish the above
  */

  const logger = new Logger(ns);
  const db = 

  logger.log(`Starting max hack algorithm`);

  if (!ns.serverExists(targetServer)) {
    logger.log(`${targetServer} isn't a valid server!`, 1);
    return { plan: [], hackPct: 0 };
  }

  const resultArray: Plan[] = [];

  // get some resource info
  const maxMoney = ns.getServerMaxMoney(targetServer);
  const currentMoney = ns.getServerMoneyAvailable(targetServer);
  const serverRam = availableRam - ramBuffer;

  const hackRam = ns.getScriptRam(consts.HACK_SCRIPT);
  const growRam = ns.getScriptRam(consts.GROW_SCRIPT);
  const weakenRam = ns.getScriptRam(consts.WEAK_SCRIPT);
  
  // Start at 100%
  const startHackPercent = 1.0;

  const weakenGrowMultiplier = 1.5;
  const decayRate = 0.0100;

  return await findMaxHackPercentageForAlgorithm(startHackPercent);

  /**
   * Finds the maximum hack percentage for an algorithm by calculating the required threads for hacking, growing, and weakening,
   * and ensuring the total RAM usage does not exceed the available server RAM.
   *
   * @param {number} hackPercent - The initial hack percentage to start the calculation.
   * @returns {Promise<{plan: Plan[], hackPct?: number}>} - A promise that resolves to an object containing the plan and the hack percentage.
   *
   */
  async function findMaxHackPercentageForAlgorithm(hackPercent: number): Promise<{plan: Plan[], hackPct?: number}> {
    hackPercent = parseFloat(hackPercent.toFixed(2));

    if (hackPercent <= 0) {
      logger.log(`hackPercent hit ${hackPercent}, no solutions found`)
      return { plan: [], hackPct: 0 };
    }

    // Calculate hack threads
    const hackAmount = (currentMoney * hackPercent);
    const hackThreads = Math.floor(ns.hackAnalyzeThreads(targetServer, hackAmount));
    if (hackThreads <= -1) {
      logger.log(`hackAnalyzeThreads returned ${hackThreads} for hackAmount ${hackAmount} with hackPercent ${hackPercent}.`);
      const error: Plan[] = [];
      return { plan: [], hackPct: 0 };
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
      return { plan: [], hackPct: 0 };
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
      const parallelDelay: number = 40 // in milliseconds
      for (let a = 0; a < parallelLoops; a++) {
        const iterationDelay = a * parallelDelay;

        const hackInterface: Plan = {
          script: consts.HACK_SCRIPT,
          threads: hackThreads,
          args: [targetServer, (hackDelay + iterationDelay).toString()],
          runTime: hackTime
        };

        const weakenHackInterface: Plan = {
          script: consts.WEAK_SCRIPT,
          threads: weakenThreadsForHack,
          args: [targetServer, (weakenHackDelay + iterationDelay).toString()],
          runTime: weakenTime
        };

        const growInterface: Plan = {
          script: consts.GROW_SCRIPT,
          threads: growThreads,
          args: [targetServer, (growDelay + iterationDelay).toString()],
          runTime: growTime
        };

        const weakenGrowInterface: Plan = {
          script: consts.WEAK_SCRIPT,
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

      return { plan: resultArray, hackPct: hackPercent};
    }

  }
}

/**
 * Calculates the optimal preparation plan for a given target server, considering available RAM and other constraints.
 * The plan includes growing and weakening scripts to maximize the money obtained from the target server and minimize its security level.
 *
 * @param {NS} ns - The Netscript environment.
 * @param {string} targetServer - The name of the target server to prepare.
 * @param {number} availableRam - The amount of RAM available for running scripts.
 * @param {number} [cores=1] - The number of CPU cores available for running scripts.
 * @param {number} [ramBuffer=0] - The amount of RAM to reserve and not use for scripts.
 * @returns {Promise<{plan: Plan[], growPct?: number}>} - A promise that resolves to an object containing the plan and the grow percentage.
 */
export async function maxPrepAlgorithm(ns: NS, targetServer: string, availableRam: number, cores: number = 1, ramBuffer: number = 0): Promise<{plan: Plan[], growPct?: number}> {
  const logger = new Logger(ns);

  logger.log(`Starting prep algorithm`);

  const resultArray: Plan[] = [];

  // get some resource info
  const maxMoney  = ns.getServerMaxMoney(targetServer);
  const serverRam = availableRam - ramBuffer;
  const minSecurityLevel     = ns.getServerMinSecurityLevel(targetServer);
  const currentSecurityLevel = ns.getServerSecurityLevel(targetServer);

  const growRam   = ns.getScriptRam(consts.GROW_SCRIPT);
  const weakenRam = ns.getScriptRam(consts.WEAK_SCRIPT);

  // assume we can prep the server in one script run
  const growPercentage: number = 1.00;
  const decayRate: number = 0.0100;
  

  return await findQuickestPrepAlgorithm(growPercentage);

  /**
   * Finds the quickest preparation algorithm to grow and weaken a server.
   * 
   * @param {number} growPercent - The percentage of growth to achieve.
   * @param {number} [weakenPercent=1.00] - The percentage of weakening to achieve.
   * @returns {Promise<{plan: Plan[], growPct?: number}>} - A promise that resolves to an object containing the plan and the grow percentage.
   * 
   * @throws Will throw an error if the total RAM used is less than or equal to 0.
   */
  async function findQuickestPrepAlgorithm(growPercent: number, weakenPercent: number = 1.00): Promise<{plan: Plan[], growPct?: number}> {
    growPercent   = parseFloat(growPercent.toFixed(2));
    weakenPercent = parseFloat(weakenPercent.toFixed(2));

    // if (growPercent <= 0.0500 && weakenPercent <= 0.0500) {
    //   logger.log(`ERROR -- growPercent (${growPercent}), weakenPercent (${weakenPercent}) too low. No prep solution found.`);
    //   return [];
    // }
    
    // Calculate the number of threads needed to grow the server to max money
    const growThreads = Math.ceil(growPercent * ns.growthAnalyze(targetServer, maxMoney / Math.max(ns.getServerMoneyAvailable(targetServer), 1), cores));

    // Calculate the security increase from growing
    const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, undefined, cores);

    // Calculate the number of threads needed to weaken the server to min security
    const totalSecurityIncrease = growSecurityIncrease + (currentSecurityLevel - minSecurityLevel);
    const weakenThreads = Math.ceil(weakenPercent * (totalSecurityIncrease / ns.weakenAnalyze(1, cores)));

    // Ensure there is enough RAM to run the scripts
    const totalRamUsed = (growThreads * growRam) + (weakenThreads * weakenRam);
    logger.log(`Prep algorithm: growPercent ${growPercent} gives ${growThreads} threads, weakenPercent ${weakenPercent} gives ${weakenThreads} threads = ${totalRamUsed} RAM`, 1);

    // if there's a failure somewhere, exit
    if (totalRamUsed <= 0) {
      logger.tlog(`ERROR -- totalRamUsed returned ${totalRamUsed}`);
      return {plan: [], growPct: 0};

    // if we're using too much RAM and our decays haven't hit rock bottom, recurse
    } else if (totalRamUsed > serverRam && (growPercent > decayRate || weakenPercent > decayRate)) { 
      // these decay numbers are our failsafes. If it's impossible to grow & weaken with full potential,
      // we slowly wittle down how many grow threads are possible. Once we hit 5% (0.05) of potential
      // grow threads, we start decaying weaken until our worst possible outcomes: 5% of both's potential
      const newgrowPercent    = Math.max(growPercent-decayRate, decayRate);
      const newweakenPercent  = Math.max(weakenPercent-decayRate, decayRate);

      return await findQuickestPrepAlgorithm(newgrowPercent, newweakenPercent);

    // if we hit rock bottom, exit
    } else if (growPercent <= decayRate && weakenPercent <= decayRate) {
      logger.log(`ERROR - Could not find any prep plans`);
      return { plan: [], growPct: 0 };
    }
    
    // if this succeeds let's store the results
    else {

      const weakenTime  = ns.getWeakenTime(targetServer);
      const growTime    = ns.getGrowTime(targetServer);

      const longestRunTime  = Math.max(weakenTime, growTime);

      const weakenDelay = longestRunTime - weakenTime + 25;
      const growDelay   = longestRunTime - growTime;

      // We can either
      // (1) Fit as much of these loops into our server as possible.
      //     ex: if each loops takes  20 GB, and we have 100 GB
      //     available, let's do 5 loops
      // (2) Only do as much as necessary to grow to max money.
      //     ex: If our growPercent is 0.25, or in otherwards we can
      //     grow 25% of our money back per loop, let's only do
      //     4 loops assuming we have the RAM for it. Otherwise do (1).
      const mostGrow = Math.ceil(1 / growPercent);
      const mostGrowRam = mostGrow * totalRamUsed;
      const parallelLoops = mostGrowRam < serverRam ? mostGrow : Math.floor(serverRam/totalRamUsed);
      for (let a = 0; a < parallelLoops; a++) {
        const parallelDelay: number = 50 // in milliseconds

        const growInterface: Plan = {
          script: consts.GROW_SCRIPT,
          threads: growThreads,
          args: [targetServer, (growDelay + (a * parallelDelay)).toString()],
          runTime: ns.getGrowTime(targetServer),
        };

        const weakenInterface: Plan = {
          script: consts.WEAK_SCRIPT,
          threads: weakenThreads,
          args: [targetServer, (weakenDelay + (a * parallelDelay)).toString()],
          runTime: ns.getWeakenTime(targetServer),
        };

        resultArray.push(growInterface);
        resultArray.push(weakenInterface);
      }


      logger.log(`Ideal plan determined with ${growPercent.toString()}, ${weakenPercent.toString()} decays using ${totalRamUsed} RAM`);
      // for (let p = 0; p < resultArray.length; p++) {
      //   logger.log(resultArray[p].script + "(" + resultArray[p].threads + ")" + " with runTime: " + formatTime(resultArray[p].runTime) 
      //   + " ms and args: " + resultArray[p].args + " ms");
      // }

      return {plan: resultArray, growPct: growPercent};
    }

  }
}