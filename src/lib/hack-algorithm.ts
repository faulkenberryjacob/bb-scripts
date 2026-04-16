import { formatDollar, formatTime } from '@/lib/formatter';
import { Logger } from '@/lib/logger';
import { Plan } from '@/lib/types';
import { getServerData } from '@/lib/db';
import * as consts from '@/lib/constants';
import { Server } from 'NetscriptDefinitions';



export class HackAlgorithm {
  logger: Logger;
  ns: NS;

  ram: number;
  cores: number;
  target: Server;

  ramBuffer?: number;
  host?: string;

  availableRam: number;
  maxMoney: number;
  money: number;
  minSecurity: number;
  security: number;
  growRam: number;
  weakenRam: number;
  hackRam: number;

  constructor(ns: NS, target: string, ram: number, cores: number) {
    this.ns = ns;
    this.logger = new Logger(this.ns)

    this.target = getServerData(this.ns, target);
    this.ram = ram;
    this.cores = cores;

    // get some resource info
    this.maxMoney = this.target.moneyMax ?? -1;
    this.money = this.target.moneyAvailable ?? -1;
    this.availableRam = this.ram - (this.ramBuffer ?? -1);
    this.minSecurity = this.target.minDifficulty ?? -1;
    this.security = this.target.hackDifficulty ?? -1;

    this.hackRam = this.ns.getScriptRam(consts.HACK_SCRIPT);
    this.growRam = this.ns.getScriptRam(consts.GROW_SCRIPT);
    this.weakenRam = this.ns.getScriptRam(consts.WEAK_SCRIPT);

    if (
      this.maxMoney <= 0
      || this.money <= 0
      || this.availableRam <= 0
      || this.minSecurity < 0
      || this.security < 0
    ) {
      this.logger.error(`${target} doesn't have money to hack!`);
      this.ns.exit();
    }
  }


  isHackPossible(): boolean {
    const { plan, hackPct } = this.maxHackAlgorithm();
    return plan.length > 0;
  }

  isPrepPossible(): boolean {
    const { plan, growPct } = this.maxPrepAlgorithm();
    return plan.length > 0;
  }

  /**
   * Calculates the optimal hacking plan for a given target server, considering available RAM and other constraints.
   * The plan includes hacking, growing, and weakening scripts to maximize the money obtained from the target server.
   *
   * @returns {{plan: Plan[], hackPct?: number}} - A promise that resolves to an object containing the plan and the hack percentage.
   */
  maxHackAlgorithm(): { plan: Plan[], hackPct?: number } {
    /*
                          |= hack ====================|
        |=weaken 1=====================================|
                      |= grow ==========================|
          |=weaken 2=====================================|
    
                    We want to accomplish the above
    */

    const logger = new Logger(this.ns);

    this.logger.debug(`Starting max hack algorithm`);

    if (!this.ns.serverExists(this.target.hostname)) {
      logger.error(`${this.target.hostname} isn't a valid server!`, 1);
      return { plan: [], hackPct: 0 };
    }

    // Start at 100%
    const startHackPercent = 1.0;


    return this.findMaxHackPercentageForAlgorithm(startHackPercent);
  }

  /**
   * Finds the maximum hack percentage for an algorithm by calculating the required threads for hacking, growing, and weakening,
   * and ensuring the total RAM usage does not exceed the available server RAM.
   *
   * @param {number} hackPercent - The initial hack percentage to start the calculation.
   * @returns {{plan: Plan[], hackPct?: number}} - A promise that resolves to an object containing the plan and the hack percentage.
   *
   */
  findMaxHackPercentageForAlgorithm(hackPercent: number, decayRate: number = 0.0100, weakenGrowMultiplier: number = 1.5): { plan: Plan[], hackPct?: number } {
    hackPercent = parseFloat(hackPercent.toFixed(2));

    if (hackPercent <= 0) {
      this.logger.debug(`hackPercent hit ${hackPercent}, no solutions found`)
      return { plan: [], hackPct: 0 };
    }

    // Calculate hack threads
    const hackAmount = (this.money * hackPercent);
    const hackThreads = Math.floor(this.ns.hackAnalyzeThreads(this.target.hostname, hackAmount));
    if (hackThreads <= -1) {
      this.logger.debug(`hackAnalyzeThreads returned ${hackThreads} for hackAmount ${hackAmount} with hackPercent ${hackPercent}.`);
      const error: Plan[] = [];
      return { plan: [], hackPct: 0 };
    }

    // Calculate security increase from hacking
    const hackSecurityIncrease = this.ns.hackAnalyzeSecurity(hackThreads, this.target.hostname);

    // Calculate weaken threads needed to counter hack security increase
    const weakenThreadsForHack = Math.ceil(hackSecurityIncrease / this.ns.weakenAnalyze(1, this.cores));

    // Calculate grow threads needed to restore money
    const moneyAfterHack = (this.maxMoney * (1.0 - hackPercent)) == 0 ? 1 : (this.maxMoney * (1.0 - hackPercent));
    const growThreads = Math.ceil(this.ns.growthAnalyze(this.target.hostname, this.maxMoney / moneyAfterHack, this.cores));

    // Calculate security increase from growing
    const growSecurityIncrease = this.ns.growthAnalyzeSecurity(growThreads, undefined, this.cores);

    // Calculate weaken threads needed to counter grow security increase
    const weakenThreadsForGrow = Math.ceil((growSecurityIncrease / this.ns.weakenAnalyze(1, this.cores)) * weakenGrowMultiplier);

    // Total weaken threads required
    const totalWeakenThreads = weakenThreadsForHack + weakenThreadsForGrow;

    // if this uses too much RAM, let's try again but reduce 5% hack
    const totalRamUsed = (hackThreads * this.hackRam)
      + (growThreads * this.growRam)
      + (weakenThreadsForHack * this.weakenRam)
      + (weakenThreadsForGrow + this.weakenRam);
    if (hackThreads <= 0 || weakenThreadsForHack <= 0 || weakenThreadsForGrow <= 0 || growThreads <= 0) {
      this.logger.error(`Some threads were zero! hackThreads: [${hackThreads}], growThreads: [${growThreads}], weakenThreadsForHack: [${weakenThreadsForHack}], weakenThreadsForGrow: [${weakenThreadsForGrow}]`);
      return { plan: [], hackPct: 0 };
    }

    if (totalRamUsed > this.availableRam) { return this.findMaxHackPercentageForAlgorithm(hackPercent - decayRate); }
    else if (totalRamUsed <= 0) {
      this.logger.error(`totalRamUsed hit (${totalRamUsed}), aborting..\r\n`);
      return { plan: [], hackPct: 0 };
    }

    // if this succeeds let's store the results and sort them by
    // longest running script first
    else {
      const resultArray: Plan[] = [];

      const hackTime = this.ns.getHackTime(this.target.hostname);
      const weakenTime = this.ns.getWeakenTime(this.target.hostname);
      const growTime = this.ns.getGrowTime(this.target.hostname);

      const longestRunTime = Math.max(hackTime, weakenTime, growTime, weakenTime);

      const hackDelay = longestRunTime - hackTime;
      const weakenHackDelay = longestRunTime - weakenTime + 5;
      const growDelay = longestRunTime - growTime + 10;
      const weakenGrowDelay = longestRunTime - weakenTime + 15;

      const hackInterface: Plan = {
        script: consts.HACK_SCRIPT,
        threads: hackThreads,
        args: [this.target.hostname, (hackDelay).toString()],
        runTime: hackTime
      };

      const weakenHackInterface: Plan = {
        script: consts.WEAK_SCRIPT,
        threads: weakenThreadsForHack,
        args: [this.target.hostname, (weakenHackDelay).toString()],
        runTime: weakenTime
      };

      const growInterface: Plan = {
        script: consts.GROW_SCRIPT,
        threads: growThreads,
        args: [this.target.hostname, (growDelay).toString()],
        runTime: growTime
      };

      const weakenGrowInterface: Plan = {
        script: consts.WEAK_SCRIPT,
        threads: weakenThreadsForGrow,
        args: [this.target.hostname, (weakenGrowDelay).toString()],
        runTime: weakenTime
      };

      resultArray.push(hackInterface);
      resultArray.push(weakenHackInterface);
      resultArray.push(growInterface);
      resultArray.push(weakenGrowInterface);

      this.logger.debug(`Ideal plan determine with hackPercent [${hackPercent.toString()}] using ${totalRamUsed} RAM`);

      return { plan: resultArray, hackPct: hackPercent };
    }

  }

  /**
   * Calculates the optimal preparation plan for a given target server, considering available RAM and other constraints.
   * The plan includes growing and weakening scripts to maximize the money obtained from the target server and minimize its security level.
   *
   * @returns {{plan: Plan[], growPct?: number}} - A promise that resolves to an object containing the plan and the grow percentage.
   */
  maxPrepAlgorithm(): { plan: Plan[], growPct?: number } {
    this.logger.debug(`Starting prep algorithm`);

    // assume we can prep the server in one script run
    const growPercentage: number = 1.00;


    return this.findQuickestPrepAlgorithm(growPercentage);
  }

  /**
   * Finds the quickest preparation algorithm to grow and weaken a server.
   * 
   * @param {number} growPercent - The percentage of growth to achieve.
   * @param {number} [weakenPercent=1.00] - The percentage of weakening to achieve.
   * @returns {{plan: Plan[], growPct?: number}} - A promise that resolves to an object containing the plan and the grow percentage.
   * 
   * @throws Will throw an error if the total RAM used is less than or equal to 0.
   */
  findQuickestPrepAlgorithm(growPercent: number, weakenPercent: number = 1.00, decayRate: number = 0.0100): { plan: Plan[], growPct?: number } {
    growPercent = parseFloat(growPercent.toFixed(2));
    weakenPercent = parseFloat(weakenPercent.toFixed(2));

    // Calculate the number of threads needed to grow the server to max money
    const growThreads = Math.ceil(growPercent * this.ns.growthAnalyze(this.target.hostname, this.maxMoney / Math.max(this.money, 1), this.cores));

    // Calculate the security increase from growing
    const growSecurityIncrease = this.ns.growthAnalyzeSecurity(growThreads, undefined, this.cores);

    // Calculate the number of threads needed to weaken the server to min security
    const totalSecurityIncrease = growSecurityIncrease + (this.security - this.minSecurity);
    const weakenThreads = Math.ceil(weakenPercent * (totalSecurityIncrease / this.ns.weakenAnalyze(1, this.cores)));

    // Ensure there is enough RAM to run the scripts
    const totalRamUsed = (growThreads * this.growRam) + (weakenThreads * this.weakenRam);

    // if there's a failure somewhere, exit
    if (totalRamUsed <= 0) {
      this.logger.error(`totalRamUsed returned ${totalRamUsed}`);
      return { plan: [], growPct: 0 };

      // if we're using too much RAM and our decays haven't hit rock bottom, recurse
    } else if (totalRamUsed > this.availableRam && (growPercent > decayRate || weakenPercent > decayRate)) {
      // these decay numbers are our failsafes. If it's impossible to grow & weaken with full potential,
      // we slowly wittle down how many grow threads are possible. Once we hit 5% (0.05) of potential
      // grow threads, we start decaying weaken until our worst possible outcomes: 5% of both's potential
      const newgrowPercent = Math.max(growPercent - decayRate, decayRate);
      const newweakenPercent = Math.max(weakenPercent - decayRate, decayRate);

      return this.findQuickestPrepAlgorithm(newgrowPercent, newweakenPercent);

      // if we hit rock bottom, exit
    } else if (growPercent <= decayRate && weakenPercent <= decayRate) {
      this.logger.warn(`Could not find any prep plans`);
      return { plan: [], growPct: 0 };
    }

    // if this succeeds let's store the results
    else {
      const resultArray: Plan[] = [];

      const weakenTime = this.ns.getWeakenTime(this.target.hostname);
      const growTime = this.ns.getGrowTime(this.target.hostname);

      const longestRunTime = Math.max(weakenTime, growTime);

      const weakenDelay = longestRunTime - weakenTime + 25;
      const growDelay = longestRunTime - growTime;

      const growInterface: Plan = {
        script: consts.GROW_SCRIPT,
        threads: growThreads,
        args: [this.target.hostname, (growDelay).toString()],
        runTime: this.ns.getGrowTime(this.target.hostname),
      };

      const weakenInterface: Plan = {
        script: consts.WEAK_SCRIPT,
        threads: weakenThreads,
        args: [this.target.hostname, (weakenDelay).toString()],
        runTime: this.ns.getWeakenTime(this.target.hostname),
      };

      resultArray.push(growInterface);
      resultArray.push(weakenInterface);


      this.logger.debug(`Ideal plan determined with ${growPercent.toString()}, ${weakenPercent.toString()} decays using ${totalRamUsed} RAM`);

      return { plan: resultArray, growPct: growPercent };
    }

  }

  printPrepAlgorithm(ns: NS) {
    const logger = new Logger(ns);

    const { plan, growPct } = this.maxPrepAlgorithm();
    const moneyAvailable = formatDollar(ns, ns.getServerMoneyAvailable(this.target.hostname));
    const currentSecurity = ns.getServerSecurityLevel(this.target.hostname);

    logger.info(`${this.target.hostname} has ${moneyAvailable} with security level ${currentSecurity}`, 0, undefined, true);
    for (const step of plan) {
      const finishTime = formatTime(step.runTime + Number(step.args[1]));
      logger.info(`\tWould run ${step.script} with ${step.threads} threads, finshing in ${finishTime}`, 0, undefined, true);
    }
    return;
  }

  printHackAlgorithm(ns: NS) {
    const logger = new Logger(ns);

    const { plan, hackPct } = this.maxHackAlgorithm();
    const moneyAvailable = formatDollar(ns, ns.getServerMoneyAvailable(this.target.hostname));
    const currentSecurity = ns.getServerSecurityLevel(this.target.hostname);

    logger.info(`${this.target.hostname} has ${moneyAvailable} with security level ${currentSecurity}`, 0, undefined, true);
    for (const step of plan) {
      const finishTime = formatTime(step.runTime + Number(step.args[1]));
      logger.info(`\tWould run ${step.script} with ${step.threads} threads, finshing in ${finishTime}`, 0, undefined, true);
    }
    return;
  }
}

export function main(ns: NS) {
  ns.disableLog("ALL");
}