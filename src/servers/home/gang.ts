import { Logger } from "@/lib/logger";
import * as C from "@/lib/constants";
import { GangGenInfo, GangMemberAscension, GangMemberInfo, GangTaskStats } from "NetscriptDefinitions";
import { formatDollar } from "@/lib/formatter";
import { killOtherInstances } from "@/lib/system";

export async function main(ns: NS) {
  const logger = new Logger(ns);
  ns.disableLog("ALL");

  killOtherInstances(ns);

  let focusRespect = true;
  if (ns.args[0]) {
    const mode = ns.args[0].toString().toLowerCase();
    switch (mode) {
      case "money":
        focusRespect = false;
        logger.info(`-- Starting Gang loop ---------------------`, 0, true);
        logger.info(`---- Focusing MONEY -----------------------`, 0, true);
        break;
      case "respect":
        focusRespect = true;
        logger.info(`-- Starting Gang loop ---------------------`, 0, true);
        logger.info(`--- Focusing RESPECT ----------------------`, 0, true);
        break;
      default:
        logger.info(`-- Starting Gang loop ---------------------`, 0, true);
        logger.info(`-- No arguments giving, focusing respect --`, 0, true);
        break;
    }
  } else {
    logger.info(`-- Starting Gang loop ---------------------`, 0, true);
    logger.info(`-- No arguments giving, focusing respect --`, 0, true);
  }

  if (!ns.gang.inGang()) {
    logger.warn(`You aren't in a gang! Exiting..`, 0, true);
    return;
  }

  let gangMembers: string[] = ns.gang.getMemberNames();
  const hackTasks = ns.gang.getTaskNames()
                    .filter(t => ns.gang.getTaskStats(t).isHacking)
                    .sort((a, b) => ns.gang.getTaskStats(a).difficulty - ns.gang.getTaskStats(b).difficulty);
  const combatTasks = ns.gang.getTaskNames()
                    .filter(t => ns.gang.getTaskStats(t).isCombat)
                    .sort((a, b) => ns.gang.getTaskStats(a).difficulty - ns.gang.getTaskStats(b).difficulty);

  // Begin main loop
  while(true) {
    gangMembers = ns.gang.getMemberNames();

    await hireGangMember();

    await checkMemberAscension();

    await assignGangMembers();

    await purchaseEquipmentForMembers();

    await purchaseAugmentsForMembers();

    await ns.gang.nextUpdate()
  }
  // end main loop


  



  /* -------------------------------------------------------------------------------------------------------------- */
  /* ----------------- FUNCTION DEFINITIONS ----------------------------------------------------------------------- */
  /* -------------------------------------------------------------------------------------------------------------- */

  /**
   * Asynchronously attempts to hire a new gang member.
   * 
   * This function checks if a new gang member can be recruited. If possible, it recruits a new member
   * with a name in the format `johnny-XXX`, where `XXX` is a zero-padded number representing the 
   * current number of members. If recruitment is not possible, it logs a warning message.
   * 
   * @returns {Promise<boolean>} A promise that resolves to `true` if a new member was successfully recruited,
   *                             or `false` if recruitment was not possible.
   */
  async function hireGangMember() {
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
      logger.warn(`Cannot recruit member. Currently have ${gangMembers.length} members`);
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
   * @async
   * @function checkMemberAscension
   * @returns {Promise<void>} A promise that resolves when the function completes.
   */
  async function checkMemberAscension() {
    logger.debug(`Checking member ascensions..`);

    for (const member of gangMembers) {
      const asc: GangMemberAscension = ns.gang.getAscensionResult(member);
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
   * This asynchronous function fetches all equipment names and their types from the gang.
   * It then categorizes the equipment by type and sorts each category by the equipment cost in ascending order.
   *
   * @returns {Promise<Map<string, string[]>>} A promise that resolves to a Map where the keys are equipment types
   * and the values are arrays of equipment names sorted by cost.
   */
  async function getEquipmentByType() {
    const temp:  Map<string, string[]> = new Map();
    const results: Map<string, string[]> = new Map();

    for (const eq of ns.gang.getEquipmentNames()) {
      const type = ns.gang.getEquipmentType(eq);
      if (temp.has(type)) {
        temp.get(type).push(eq);
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
   * This asynchronous function retrieves the available equipment categorized by type,
   * excluding augmentations. It then iterates through each gang member and compares
   * their current equipment with the available equipment. If a member does not have
   * a piece of equipment and the player can afford it, the equipment is purchased for
   * the member.
   *
   * @async
   * @function purchaseEquipmentForMembers
   * @returns {Promise<void>} A promise that resolves when the function completes.
   */
  async function purchaseEquipmentForMembers() {
    const equipment: Map<string, string[]> = await getEquipmentByType();
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
              logger.info(`Purchasing ${e} for ${formatDollar(ns, cost)} for ${member}`, 0, true);
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
  async function purchaseAugmentsForMembers() {
    // get all equipment then only keep the augments
    const augments: string[] = [];
    (await getEquipmentByType()).forEach((v, k) => {
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
          logger.info(`Purchasing AUGMENT ${aug} for ${formatDollar(ns, cost)} for ${member}`, 0, true);
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
   * @async
   * @function assignGangMembers
   * @returns {Promise<void>} A promise that resolves when all gang members have been assigned tasks.
   */
  async function assignGangMembers() {
    const tasks = ns.gang.getGangInformation().isHacking ? hackTasks : combatTasks;
    const penalty = ns.gang.getGangInformation().wantedPenalty;

    logger.debug(`Assigning gang members..`);

    for (const member of gangMembers) {
      const memberStats: GangMemberInfo = ns.gang.getMemberInformation(member);
      logger.debug(`Checking ${member}..`, 1);
      
      if (penalty > C.GANG_WANTED_THRESHOLD) {
        // penalty isn't too bad, lets get to work
        if (focusRespect) { ns.gang.setMemberTask(member, await getBestRespectTask(member)); }
        else              { ns.gang.setMemberTask(member, await getBestMoneyTask(member)); }
        
      } else {
        // penalty is bad, let's do 'ethical' crime
        ns.gang.setMemberTask(member, await getBestEthicalTask(member));
      }
    }
  }

  /**
   * Finds the best ethical task for a gang member.
   *
   * This asynchronous function evaluates all available tasks for a gang member and determines
   * which task results in the lowest wanted level gain. It temporarily assigns the member to each
   * task to evaluate its impact, then resets the member to their original task before returning
   * the best task.
   *
   * @async
   * @function getBestEthicalTask
   * @param {string} member - The name of the gang member.
   * @returns {Promise<string>} A promise that resolves to the name of the best ethical task for the member.
   */
  async function getBestEthicalTask(member: string): Promise<string> {
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
   * This asynchronous function evaluates all available tasks for a gang member and determines
   * which task results in the highest money gain. It temporarily assigns the member to each
   * task to evaluate its impact, then resets the member to their original task before returning
   * the best task.
   *
   * @async
   * @function getBestMoneyTask
   * @param {string} member - The name of the gang member.
   * @returns {Promise<string>} A promise that resolves to the name of the best money-making task for the member.
   */
  async function getBestMoneyTask(member: string): Promise<string> {
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
   * This asynchronous function evaluates all available tasks for a gang member and determines
   * which task results in the highest respect gain. It temporarily assigns the member to each
   * task to evaluate its impact, then resets the member to their original task before returning
   * the best task.
   *
   * @async
   * @function getBestRespectTask
   * @param {string} member - The name of the gang member.
   * @returns {Promise<string>} A promise that resolves to the name of the best respect-gaining task for the member.
   */
  async function getBestRespectTask(member: string): Promise<string> {
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

