import { Logger } from "@/lib/logger";
import * as C from "@/lib/constants";
import { GangMemberAscension, GangMemberInfo } from "NetscriptDefinitions";
import { formatDollar } from "@/lib/formatter";
import { GangTask } from "@/lib/types";
import { roundTo } from "@/lib/calc";

export class GangEngine {
    logger: Logger;
    prioritizeRespect: boolean;
    ns: NS;
    inGang: boolean;
    
    hackTasks: string[];
    combatTasks: string[];
    gangTasks: string[];
    gangEquipmentByType: Map<string, string[]>;
    gangMembers: string[];
    
    constructor(ns: NS, prioritizeRespect: boolean = true) {
        this.ns = ns;
        this.ns.disableLog("ALL");
        this.logger = new Logger(ns);
        this.prioritizeRespect = prioritizeRespect;

        this.inGang = ns.gang.inGang();

        this.hackTasks = !this.inGang ? [] : ns.gang.getTaskNames()
        .filter(t => ns.gang.getTaskStats(t).isHacking)
        .sort((a, b) => ns.gang.getTaskStats(a).difficulty - ns.gang.getTaskStats(b).difficulty);
        this.combatTasks = !this.inGang ? [] : ns.gang.getTaskNames()
        .filter(t => ns.gang.getTaskStats(t).isCombat)
        .sort((a, b) => ns.gang.getTaskStats(a).difficulty - ns.gang.getTaskStats(b).difficulty);
        this.gangEquipmentByType = !this.inGang ? new Map<string, string[]> : this.getEquipmentByType();
        this.gangMembers = !this.inGang ? [] : this.ns.gang.getMemberNames() ?? [];
        this.gangTasks = [];
    }
    
     start() {
        if (!this.inGang) {
            const karma = this.ns.getPlayer().karma;
            if (karma <= C.GANG_KARMA_REQ) {
                this.logger.info(`You have ${this.ns.formatNumber(karma,1)} and can join a gang! Otherwise, exiting gang script.`,0,true);
            } else {
                this.logger.info(`You have ${this.ns.formatNumber(karma,1)} and need ${C.GANG_KARMA_REQ} karma before you can join a gang. Exiting gang script..`,0,true);
            }
            return;
        }
        
        this.logger.debug(`GangEngine started with focus on ${this.prioritizeRespect ? 'respect' : 'money'}`,0,true);

        this.setGangType();

        while (true) {
            this.hireGangMember();
            
            this.checkMemberAscension();
            
            this.assignGangMembers();
            
            this.purchaseEquipmentForMembers();
            
            this.purchaseAugmentsForMembers();
            
             this.ns.gang.nextUpdate()
        }
        
    }


    setGangType() {
        this.logger.debug('Setting gang tasks to..');
        const isHackingGang: boolean = this.ns.gang.getGangInformation().isHacking;
        this.gangTasks = isHackingGang ? this.hackTasks : this.combatTasks;
        this.logger.debug(`..${isHackingGang ? 'hack tasks' : 'combat tasks'}.`,1);
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
    getEquipmentByType() : Map<string, string[]> {
        const temp:  Map<string, string[]> = new Map();
        const results: Map<string, string[]> = new Map();
        
        for (const eq of this.ns.gang.getEquipmentNames()) {
            const type = this.ns.gang.getEquipmentType(eq);
            if (temp.has(type)) {
                temp.get(type)!.push(eq);
            } else {
                temp.set(type, [eq]);
            }
        }
        
        for (const [k, v] of temp) {
            results.set(k, v.sort((a, b) => this.ns.gang.getEquipmentCost(a) - this.ns.gang.getEquipmentCost(b)))
        }
        
        return results;
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
    hireGangMember() {
        this.logger.debug(`Checking if we can hire a gang member..`);
        if (this.ns.gang.canRecruitMember()) {
            const member = `johnny-${String(this.gangMembers.length).padStart(3, '0')}`;
            this.logger.info(`Recruiting gang member: ${member}`, 0, true);
            const success = this.ns.gang.recruitMember(member);
            if (success) {
                this.gangMembers.push(member);
                return true;
            } else {
                this.logger.error(`Failed to recruit gang member: ${member}`);
                return false;
            } 
        } else {
            this.logger.debug(`Cannot recruit member. Currently have ${this.gangMembers.length} members`);
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
    checkMemberAscension() {
    this.logger.debug(`Checking member ascensions..`);
    
    for (const member of this.gangMembers) {
        const asc: GangMemberAscension | undefined = this.ns.gang.getAscensionResult(member);
        if (!asc) {
            this.logger.debug(`Member cannot ascend, skipping`);
            continue;
        }
        
        //const info = ns.gang.getMemberInformation(member);
        
        // only look at hacking skills for a hacking gang
        if (this.ns.gang.getGangInformation().isHacking) {
            //const hackMultGain = (info.hack_asc_mult * asc.hack) - info.hack_asc_mult;
            
            this.logger.debug(`${member} ascension hack multiplier would be ${asc.hack}`);
            if (asc.hack > C.GANG_ASCENSION_MULT_THRESHOLD) {
                this.logger.info(`Ascending ${member} w/ hack multipler ${asc.hack}, losing ${asc.respect} respect`, 0, true);
                this.ns.gang.ascendMember(member);
            }
            
            // only look at combat skills for a combat gang
        } else {
            if (asc.agi > C.GANG_ASCENSION_MULT_THRESHOLD
                || asc.cha > C.GANG_ASCENSION_MULT_THRESHOLD
                || asc.def > C.GANG_ASCENSION_MULT_THRESHOLD
                || asc.dex > C.GANG_ASCENSION_MULT_THRESHOLD
                || asc.str > C.GANG_ASCENSION_MULT_THRESHOLD) 
                {
                    this.logger.info(`Ascending ${member} with multipliers: [strength: ${asc.str}], [charisma: ${asc.cha}], [defense: ${asc.def}], [dexterity: ${asc.dex}], [strength: ${asc.str}] losing ${asc.respect} respect.`, 0, true);
                    this.ns.gang.ascendMember(member);
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
    assignGangMembers() {
        const tasks = this.gangTasks;
        const penalty = roundTo(this.ns.gang.getGangInformation().wantedPenalty, 2);
        const wantedLevel = roundTo(this.ns.gang.getGangInformation().wantedLevel, 2);
        
        this.logger.debug(`Assigning gang members..`);
        this.logger.debug(`Wanted penalty: [${penalty}/${C.GANG_WANTED_PENALTY_THRESHOLD}], level: [${wantedLevel}/${C.GANG_WANTED_LEVEL_THRESHOLD}]`);
        
        for (const member of this.gangMembers) {
            const memberStats: GangMemberInfo = this.ns.gang.getMemberInformation(member);
            this.logger.debug(`Checking ${member}..`, 1);
            
            if (penalty > C.GANG_WANTED_PENALTY_THRESHOLD || wantedLevel < C.GANG_WANTED_LEVEL_THRESHOLD) {
                // penalty isn't too bad, lets get to work
                if (this.prioritizeRespect) { this.ns.gang.setMemberTask(member, this.getBestRespectTask(member)); }
                else                        { this.ns.gang.setMemberTask(member, this.getBestMoneyTask(member)); }
            } else {
                // penalty is bad, let's do 'ethical' crime
                this.ns.gang.setMemberTask(member, this.getBestEthicalTask(member));
            }
        }
    }

    getMemberTaskStats(member: string) : GangTask[] {
        this.logger.debug(`Refreshing task stats for ${member}..`);
        const currentTask = this.ns.gang.getMemberInformation(member).task;
        let gangTasks: GangTask[] = [];

        // iterate through all relative tasks
        for (const task of this.gangTasks) {
            this.ns.gang.setMemberTask(member, task);
            const money = this.ns.gang.getMemberInformation(member).moneyGain;
            const respect = this.ns.gang.getMemberInformation(member).respectGain;
            const wanted = this.ns.gang.getMemberInformation(member).wantedLevelGain;

            const tempTask: GangTask = {
                name: task,
                moneyGain: money,
                respectGain: respect,
                wantedLevelGain: wanted
            };
            gangTasks.push(tempTask);
        }

        return gangTasks;
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
    getBestMoneyTask(member: string): string {
        this.logger.debug(`Finding best money task for ${member}..`);
        const taskStats = this.getMemberTaskStats(member);
        const bestTask: GangTask = taskStats.reduce((max, task) => 
                            task.moneyGain > max.moneyGain ? task : max
                            );
        this.logger.debug(`Best money task for ${member} is ${bestTask.name} earning ${formatDollar(this.ns, bestTask.moneyGain)}`);
        return bestTask.name;
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
    getBestRespectTask(member: string): string {
        this.logger.debug(`Finding best respect task for ${member}..`);
        const taskStats = this.getMemberTaskStats(member);
        const bestTask: GangTask = taskStats.reduce((max, task) => 
                            task.respectGain > max.respectGain ? task : max
                            );
        this.logger.debug(`Best respect task for ${member} is ${bestTask.name} earning ${roundTo(bestTask.respectGain, 2)}`);
        return bestTask.name;
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
    getBestEthicalTask(member: string): string {
        this.logger.debug(`Finding best ethical task for ${member}..`);
        const taskStats = this.getMemberTaskStats(member);
        const bestTask: GangTask = taskStats.reduce((min, task) => 
                            task.wantedLevelGain < min.wantedLevelGain ? task : min
                            );
        this.logger.debug(`Best ethical task for ${member} is ${bestTask.name} earning ${roundTo(bestTask.wantedLevelGain, 2)}`);
        return bestTask.name;
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
    purchaseEquipmentForMembers() {
        let equipment: Map<string, string[]> = this.gangEquipmentByType;
        equipment.delete(`Augmentations`);
        
        for (const member of this.gangMembers) {
            const currentEq = this.ns.gang.getMemberInformation(member).upgrades;
            
            // iterate through all known equipment and compare against member
            for (const [type, eq] of equipment) {
                if (type == 'Augmentation') { continue; }
                for (const e of eq) {
                    
                    // if the member doesn't have this, look at buying it
                    if (!currentEq.includes(e)) {
                        const playerMoney = this.ns.getServerMoneyAvailable("home");
                        const cost = this.ns.gang.getEquipmentCost(e);
                        
                        // check if we can afford it
                        if (playerMoney > cost && (playerMoney - cost) > C.MONEY_BUFFER) {
                            this.logger.debug(`Purchasing ${e} for ${formatDollar(this.ns, cost)} for ${member}`);
                            this.ns.gang.purchaseEquipment(member, e);
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
    purchaseAugmentsForMembers() {
        // get all equipment then only keep the augments
        const augments: string[] = [];
        this.gangEquipmentByType.forEach((v, k) => {
            if (k === 'Augmentation') {
                augments.push(...v);
            }
        });
        
        for (const aug of augments) {
            for (const member of this.gangMembers) {
                const info = this.ns.gang.getMemberInformation(member);
                
                // ignore anyone who hasn't ascended at least once, or who already has this
                // current augment
                if (info.hack_asc_mult <= C.GANG_ASCENSION_MULT_THRESHOLD) { continue; }
                if (info.augmentations.includes(aug)) { continue; }
                
                // check if we can afford it, and ensure we don't go below our money buffer
                const playerMoney = this.ns.getServerMoneyAvailable("home");
                const cost = this.ns.gang.getEquipmentCost(aug);
                
                if (playerMoney > cost && (playerMoney - cost) > C.MONEY_BUFFER) {
                    this.logger.debug(`Purchasing AUGMENT ${aug} for ${formatDollar(this.ns, cost)} for ${member}`);
                    this.ns.gang.purchaseEquipment(member, aug);
                }
            }
        }
    }  
}
    
    