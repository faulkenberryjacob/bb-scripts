import { Logger } from "@/lib/logger";
import * as C from "@/lib/constants";
import * as cache from "@/lib/cacheManager";
import { GangMemberAscension, GangMemberInfo } from "NetscriptDefinitions";
import { formatDollar } from "@/lib/formatter";

export  function main(ns: NS) {
  const logger = new Logger(ns);
  ns.disableLog("ALL");

  if (!ns.gang.inGang()) {
    logger.debug(`You aren't in a gang! Exiting..`, 0, true);
    return;
  }

   initializeGangCache();

  let focusRespect = true;
  if (ns.args[0]) {
    const mode = ns.args[0].toString().toLowerCase();
    switch (mode) {
      case "money":
        focusRespect = false;
        break;
      case "respect":
        focusRespect = true;
        break;
      default:
        break;
    }
  }
  const gangFocusString = focusRespect ? "respect" : "money";
  logger.debug(`Gang loop started with focus on ${gangFocusString}.`);

  let gangMembers: string[] = ns.gang.getMemberNames();

  logger.debug("Loading tasks from cache..");
  const hackTasks           =  cache.read(ns, "gangHackTasks") as string[];
  logger.debug(`hackTasks: ${hackTasks}`);
  const combatTasks         =  cache.read(ns, "gangCombatTasks") as string[];
  logger.debug(`combatTasks: ${combatTasks}`);
  const gangEquipmentByType =  cache.read(ns, "gangEquipmentByType") as Map<string, string[]>;
  logger.debug(`gangEquipmentByType: ${gangEquipmentByType}`);

  gangMembers = ns.gang.getMemberNames();
  while (true) {
     hireGangMember();

     checkMemberAscension();

     assignGangMembers();

     purchaseEquipmentForMembers();

     purchaseAugmentsForMembers();

     ns.gang.nextUpdate()
  }



  /* -------------------------------------------------------------------------------------------------------------- */
  /* ----------------- FUNCTION DEFINITIONS ----------------------------------------------------------------------- */
  /* -------------------------------------------------------------------------------------------------------------- */

   function initializeGangCache() {
    const hackTasks = ns.gang.getTaskNames()
                    .filter(t => ns.gang.getTaskStats(t).isHacking)
                    .sort((a, b) => ns.gang.getTaskStats(a).difficulty - ns.gang.getTaskStats(b).difficulty);
    const combatTasks = ns.gang.getTaskNames()
                    .filter(t => ns.gang.getTaskStats(t).isCombat)
                    .sort((a, b) => ns.gang.getTaskStats(a).difficulty - ns.gang.getTaskStats(b).difficulty);
    const gangEquipmentByType =  getEquipmentByType();
    
     cache.write(ns, "gangHackTasks", hackTasks);
     cache.write(ns, "gangCombatTasks", combatTasks);
     cache.write(ns, "gangEquipmentByType", gangEquipmentByType);
  }

  /**
   * hronously attempts to hire a new gang member.
   * 
   * This function checks if a new gang member can be recruited. If possible, it recruits a new member
   * with a name in the format `johnny-XXX`, where `XXX` is a zero-padded number representing the 
   * current number of members. If recruitment is not possible, it logs a warning message.
   * 
   * @returns {boolean} A promise that resolves to `true` if a new member was successfully recruited,
   *                             or `false` if recruitment was not possible.
   */
   function hireGangMember() {
    logger.debug(`Checking if we can hire a gang member..`);
    if (ns.gang.canRecruitMember()) {
      const member = `johnny-${String(gangMembers.length).padStart(3, '0')}`;
      logger.info(`Recruiting gang member: ${member}`, 0, true);
      const success = ns.gang.recruitMember(member);
      if (success) {
        gangMembers.push(member);
        return true;
      } else {
        logger.error(`Failed to recruit gang member: ${member}`);
        return false;
      } 
    } else {
      logger.debug(`Cannot recruit member. Currently have ${gangMembers.length} members`);
      return false;
    }
  }

  /**
   * Checks and ascends gang members based on their ascension results.
   * 
   * This function iterates through all gang members and evaluates their ascension results.
   * For hacking gangs, it considers only the hacking skill multiplier.
   * For combat gangs, it considers the agility, charisma, defense, dexterity, and strength multipliers.
   * If a member's relevant skill multiplier exceeds the defined threshold, the member is ascended.
   * 
   * @
   * @function checkMemberAscension
   * @returns {void} A promise that resolves when the function completes.
   */
   function checkMemberAscension() {
    logger.debug(`Checking member ascensions..`);

    for (const member of gangMembers) {
      const asc: GangMemberAscension | undefined = ns.gang.getAscensionResult(member);
      if (!asc) {
        logger.debug(`Member cannot ascend, skipping`);
        continue;
      }
      
      //const info = ns.gang.getMemberInformation(member);
      
      // only look at hacking skills for a hacking gang
      if (ns.gang.getGangInformation().isHacking) {
        //const hackMultGain = (info.hack_asc_mult * asc.hack) - info.hack_asc_mult;

        if (asc.hack > C.GANG_ASCENSION_MULT_THRESHOLD) {
          logger.info(`Ascending ${member} w/ hack multipler ${asc.hack}, losing ${asc.respect} respect`, 0, true);
          ns.gang.ascendMember(member);
        }

      // only look at combat skills for a combat gang
      } else {
        if (asc.agi > C.GANG_ASCENSION_MULT_THRESHOLD
            || asc.cha > C.GANG_ASCENSION_MULT_THRESHOLD
            || asc.def > C.GANG_ASCENSION_MULT_THRESHOLD
            || asc.dex > C.GANG_ASCENSION_MULT_THRESHOLD
            || asc.str > C.GANG_ASCENSION_MULT_THRESHOLD) 
        {
          logger.info(`Ascending ${member} with multipliers: [strength: ${asc.str}], [charisma: ${asc.cha}], [defense: ${asc.def}], [dexterity: ${asc.dex}], [strength: ${asc.str}] losing ${asc.respect} respect.`, 0, true);
          ns.gang.ascendMember(member);
        }
      }
    }
  }

  /**
   * Retrieves gang equipment categorized by type and sorted by cost.
   *
   * This hronous function fetches all equipment names and their types from the gang.
   * It then categorizes the equipment by type and sorts each category by the equipment cost in ascending order.
   *
   * @returns {Map<string, string[]>} A promise that resolves to a Map where the keys are equipment types
   * and the values are arrays of equipment names sorted by cost.
   */
   function getEquipmentByType() {
    const temp:  Map<string, string[]> = new Map();
    const results: Map<string, string[]> = new Map();

    for (const eq of ns.gang.getEquipmentNames()) {
      const type = ns.gang.getEquipmentType(eq);
      if (temp.has(type)) {
        temp.get(type)!.push(eq);
      } else {
        temp.set(type, [eq]);
      }
    }

    for (const [k, v] of temp) {
      results.set(k, v.sort((a, b) => ns.gang.getEquipmentCost(a) - ns.gang.getEquipmentCost(b)))
    }

    return results;
  }

  /**
   * Purchases equipment for gang members.
   *
   * This hronous function retrieves the available equipment categorized by type,
   * excluding augmentations. It then iterates through each gang member and compares
   * their current equipment with the available equipment. If a member does not have
   * a piece of equipment and the player can afford it, the equipment is purchased for
   * the member.
   *
   * @
   * @function purchaseEquipmentForMembers
   * @returns {void} A promise that resolves when the function completes.
   */
   function purchaseEquipmentForMembers() {
    const equipment: Map<string, string[]> =  getEquipmentByType();
    equipment.delete(`Augmentations`);

    for (const member of gangMembers) {
      const currentEq = ns.gang.getMemberInformation(member).upgrades;

      // iterate through all known equipment and compare against member
      for (const [type, eq] of equipment) {
        if (type == 'Augmentation') { continue; }
        for (const e of eq) {

          // if the member doesn't have this, look at buying it
          if (!currentEq.includes(e)) {
            const playerMoney = ns.getServerMoneyAvailable("home");
            const cost = ns.gang.getEquipmentCost(e);

            // check if we can afford it
            if (playerMoney > cost && (playerMoney - cost) > C.MONEY_BUFFER) {
              logger.debug(`Purchasing ${e} for ${formatDollar(ns, cost)} for ${member}`);
              ns.gang.purchaseEquipment(member, e);
            }
          }
        }
      }
    }
  }

  /**
   * Purchases augmentations for gang members.
   * 
   * This function retrieves all equipment, filters out augmentations, and then attempts to purchase 
   * augmentations for gang members based on certain conditions such as ascension multipliers and 
   * available money.
   */
   function purchaseAugmentsForMembers() {
    // get all equipment then only keep the augments
    const augments: string[] = [];
    ( getEquipmentByType()).forEach((v, k) => {
      if (k === 'Augmentation') {
        augments.push(...v);
      }
    });

    for (const aug of augments) {
      for (const member of gangMembers) {
        const info = ns.gang.getMemberInformation(member);

        // ignore anyone who hasn't ascended at least once, or who already has this
        // current augment
        if (info.hack_asc_mult <= C.GANG_ASCENSION_MULT_THRESHOLD) { continue; }
        if (info.augmentations.includes(aug)) { continue; }

        // check if we can afford it, and ensure we don't go below our money buffer
        const playerMoney = ns.getServerMoneyAvailable("home");
        const cost = ns.gang.getEquipmentCost(aug);

        if (playerMoney > cost && (playerMoney - cost) > C.MONEY_BUFFER) {
          logger.debug(`Purchasing AUGMENT ${aug} for ${formatDollar(ns, cost)} for ${member}`);
          ns.gang.purchaseEquipment(member, aug);
        }
      }
    }
  }

  /**
   * Assigns tasks to gang members based on the current gang's focus (hacking or combat)
   * and the wanted penalty. If the wanted penalty is above a certain threshold, members
   * are assigned to tasks that reduce the penalty; otherwise, they are assigned to tasks
   * that increase respect.
   *
   * @
   * @function assignGangMembers
   * @returns {void} A promise that resolves when all gang members have been assigned tasks.
   */
   function assignGangMembers() {
    const tasks = ns.gang.getGangInformation().isHacking ? hackTasks : combatTasks;
    const penalty = ns.gang.getGangInformation().wantedPenalty;

    logger.debug(`Assigning gang members..`);

    for (const member of gangMembers) {
      const memberStats: GangMemberInfo = ns.gang.getMemberInformation(member);
      logger.debug(`Checking ${member}..`, 1);
      
      if (penalty > C.GANG_WANTED_PENALTY_THRESHOLD) {
        // penalty isn't too bad, lets get to work
        if (focusRespect) { ns.gang.setMemberTask(member,  getBestRespectTask(member)); }
        else              { ns.gang.setMemberTask(member,  getBestMoneyTask(member)); }
        
      } else {
        // penalty is bad, let's do 'ethical' crime
        ns.gang.setMemberTask(member,  getBestEthicalTask(member));
      }
    }
  }

  /**
   * Finds the best ethical task for a gang member.
   *
   * This hronous function evaluates all available tasks for a gang member and determines
   * which task results in the lowest wanted level gain. It temporarily assigns the member to each
   * task to evaluate its impact, then resets the member to their original task before returning
   * the best task.
   *
   * @
   * @function getBestEthicalTask
   * @param {string} member - The name of the gang member.
   * @returns {string} A promise that resolves to the name of the best ethical task for the member.
   */
   function getBestEthicalTask(member: string): string {
    logger.debug(`Finding best ethical task for ${member}..`);
    const tasks = ns.gang.getGangInformation().isHacking ? hackTasks : combatTasks;
    const currentTask = ns.gang.getMemberInformation(member).task;

    let bestTask: string = tasks[1];
    let bestWantedGain: number = 0;

    for (const task of tasks) {
      // assign the gang member to that task, just for a moment
      ns.gang.setMemberTask(member, task);

      // check how much money it would make
      const wantedGain = ns.gang.getMemberInformation(member).wantedLevelGain;

      logger.debug(`Setting ${member} to ${task} would earn ${formatDollar(ns, wantedGain)}`, 1)

      // if that's more than our ongoing tracker, set it
      if (wantedGain < bestWantedGain) {
        logger.debug(`${bestTask} is new best task!`, 2)
        bestTask = task;
        bestWantedGain = wantedGain;
      }
    }

    // reset member before returning
    ns.gang.setMemberTask(member, currentTask);

    logger.debug(`Returning with best task ${bestTask}`)

    return bestTask;
  }

  /**
   * Finds the best money-making task for a gang member.
   *
   * This hronous function evaluates all available tasks for a gang member and determines
   * which task results in the highest money gain. It temporarily assigns the member to each
   * task to evaluate its impact, then resets the member to their original task before returning
   * the best task.
   *
   * @
   * @function getBestMoneyTask
   * @param {string} member - The name of the gang member.
   * @returns {string} A promise that resolves to the name of the best money-making task for the member.
   */
   function getBestMoneyTask(member: string): string {
    logger.debug(`Finding best money task for ${member}..`);
    const tasks = ns.gang.getGangInformation().isHacking ? hackTasks : combatTasks;
    const currentTask = ns.gang.getMemberInformation(member).task;

    let bestTask: string = tasks[1];
    let bestMoney: number = 0;

    for (const task of tasks) {
      // assign the gang member to that task, just for a moment
      ns.gang.setMemberTask(member, task);

      // check how much money it would make
      const money = ns.gang.getMemberInformation(member).moneyGain;

      logger.debug(`Setting ${member} to ${task} would earn ${formatDollar(ns, money)}`, 1)

      // if that's more than our ongoing tracker, set it
      if (money > bestMoney) {
        logger.debug(`${bestTask} is new best task!`, 2)
        bestTask = task;
        bestMoney = money;
      }
    }

    // reset member before returning
    ns.gang.setMemberTask(member, currentTask);

    logger.debug(`Returning with best task ${bestTask}`)

    return bestTask;
  }

  /**
   * Finds the best respect-gaining task for a gang member.
   *
   * This hronous function evaluates all available tasks for a gang member and determines
   * which task results in the highest respect gain. It temporarily assigns the member to each
   * task to evaluate its impact, then resets the member to their original task before returning
   * the best task.
   *
   * @
   * @function getBestRespectTask
   * @param {string} member - The name of the gang member.
   * @returns {string} A promise that resolves to the name of the best respect-gaining task for the member.
   */
   function getBestRespectTask(member: string): string {
    logger.debug(`Finding best respect task for ${member}..`);
    const tasks = ns.gang.getGangInformation().isHacking ? hackTasks : combatTasks;
    const currentTask = ns.gang.getMemberInformation(member).task;

    let bestTask: string = tasks[1];
    let bestRespect: number = 0;

    for (const task of tasks) {
      // assign the gang member to that task, just for a moment
      ns.gang.setMemberTask(member, task);

      // check how much money it would make
      const respect = ns.gang.getMemberInformation(member).respectGain;

      logger.debug(`Setting ${member} to ${task} would earn ${respect} respect`, 1)

      // if that's more than our ongoing tracker, set it
      if (respect > bestRespect) {
        logger.debug(`${bestTask} is new best task!`, 2)
        bestTask = task;
        bestRespect = respect;
      }
    }

    // reset member before returning
    ns.gang.setMemberTask(member, currentTask);

    logger.debug(`Returning with best task ${bestTask}`)

    return bestTask;
  }

}

