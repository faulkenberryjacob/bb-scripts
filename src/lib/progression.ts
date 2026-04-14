import { Logger } from "@/lib/logger";
import { hasSingularity } from "@/lib/defaults";
import * as cache from "@/lib/cacheManager";
import * as C from "@/lib/constants";
import { CrimeType, Task } from "NetscriptDefinitions";
import { formatDollar } from "./formatter";
import { DarkWebProgram, LogLevel } from "./types";

/**
 * Entrypoint script that coordinates a set of player progression actions using the Singularity API.
 *
 * This  function performs several high-level actions in sequence:
 * 1. Verifies Singularity API availability and early-returns if it's not present.
 * 2. Disables NS logging and instantiates a Logger instance for structured output.
 * 3. Determines and commits the highest-value crime (based on money * successChance / time).
 * 4. Accepts and joins any pending faction invitations that have no declared enemies.
 * 5. Attempts to upgrade the player's home machine (cores first, then RAM) while preserving a configured money buffer.
 *
 * Each of the above steps is implemented as an inner  helper:
 * - commitBestCrime(): evaluates available crimes and returns the best CrimeType or null.
 * - joinFactions(): inspects faction invitations and joins safe factions.
 * - upgradeHome(): queries upgrade costs and triggers upgrades only if the player retains more than C.MONEY_BUFFER.
 *
 * @param ns - The Netscript environment object provided by the runtime (NS).
 * @returns A Promise that resolves once all progression actions have been attempted.
 */
export function main(ns: NS) {
    // If we don't have the singularity API, which is required to do most of these actions,
    // then just quit now
    if (!hasSingularity(ns)) { return;}

    ns.disableLog("ALL");
    const logger = new Logger(ns, LogLevel.DEBUG);

    // Commit the best crime to obtain money
    logger.info("Determining best crime to commit..");
    const bestCrime = commitBestCrime();
    if (bestCrime) {
        logger.info(`Committing crime: ${bestCrime}..`, 1);
        ns.singularity.commitCrime(bestCrime);
    }

    // Join factions that don't lock me out of other ones
    logger.info("Checking faction invitations..");
     joinFactions();

    // Upgrade home computer as long as it keeps me above money buffer
    logger.info("Checking upgrades for home computer..");
     upgradeHome(ns);

    logger.info("Checking Dark Web programs to purchase..");
     buyPrograms(ns);


    // ________________________________________________________________________________ 
    //    FUNCTION DEFINITIONS
    // ````````````````````````````````````````````````````````````````````````````````

     function commitBestCrime() : CrimeType | null {
        const currentWork: Task | null = ns.singularity.getCurrentWork();
        if (currentWork && currentWork.type != "CRIME") {
            logger.warn(`Currently busy with work type ${currentWork.type}. Cannot commit crime right now.`);
            return null;
        }

        // Get all possible crimes, then determine their subjective "value" based on the formula:
        //   value = (money * chance) / time
        const crimes = ns.enums.CrimeType;
        const crimeValues = Object.values(crimes).map(crime => {
            const stats = ns.singularity.getCrimeStats(crime);
            const chance = ns.singularity.getCrimeChance(crime);
            return {
                crime: crime as CrimeType,
                karma: (stats.karma * chance) / stats.time,
                value: (stats.money * chance) / stats.time
            }
        });

        if (crimeValues.length <= 0) {
            logger.warn("No crimes found to commit?");
            return null;
        }

        const bestValue = crimeValues.reduce((best, current) => 
                current.value > best.value ? current : best).crime;
        const bestKarma = crimeValues.reduce((best, current) => 
                current.karma > best.karma ? current : best).crime;

        // if we don't have enough karma to join a gang, focus that
        const isFocusingKarma = ns.getPlayer().karma > C.GANG_KARMA_REQ;
        const bestCrime = isFocusingKarma ? bestKarma : bestValue;

        // If the current work is the same as the best crime, then just return null
        if (currentWork && currentWork.type == "CRIME" && currentWork.crimeType == bestCrime) {
            logger.info(`Already committing the best crime (${currentWork.crimeType}), no need to switch.`, 1);
            return null;
        }

        return bestCrime;
    }

    /**
     * Attempts to accept and join any pending faction invitations that have no declared enemies.
     *
     * Queries the Singularity API for outstanding faction invitations and iterates over each invited faction.
     * For each faction, if the faction reports zero enemies, an informational log entry is written and the
     * Singularity API is invoked to join that faction.
     *
     * @
     * @returns {void} Resolves once all invitations have been examined and join attempts (if any) have been issued.
     */
     function joinFactions() {
        ns.singularity.checkFactionInvitations().forEach(faction => {
            if (ns.singularity.getFactionEnemies(faction).length == 0) {
                logger.info(`Joining faction ${faction}..`, 1, undefined, true);
                ns.singularity.joinFaction(faction);
            }
        });
    }

    /**
     * Attempts to upgrade the player’s home machine (first CPU cores, then RAM) when sufficient funds are available.
     *
     * The function:
     * - Queries the upgrade costs for home cores and RAM via the game's Singularity API.
     * - Compares each cost against the player's current money, ensuring that performing the upgrade leaves more than C.MONEY_BUFFER.
     * - Logs an informational message before initiating an upgrade and then calls the corresponding Singularity upgrade function.
     * - Re-checks the player's money after attempting the cores upgrade before deciding on the RAM upgrade.
     *
     * @
     * @returns void A promise that resolves once the upgrade checks (and any initiated upgrades) have completed.
     */
     function upgradeHome(ns: NS) {
        const coreCost: number = ns.singularity.getUpgradeHomeCoresCost();
        const coreCostString: string = formatDollar(ns, coreCost);
        const memCost: number = ns.singularity.getUpgradeHomeRamCost();
        const memCostString: string = formatDollar(ns, memCost);
        let money: number = ns.getPlayer().money;
        let upgradeResult: boolean = false;

        if (money - coreCost > C.MONEY_BUFFER) {
            logger.info(`Upgrading home cores for ${coreCostString}..`, 1, undefined, true);
            upgradeResult = ns.singularity.upgradeHomeCores();
        }
        
        if (!upgradeResult && (money - memCost > C.MONEY_BUFFER)) {
            logger.info(`Upgrading home RAM for ${memCostString}..`, 1, undefined, true);
            upgradeResult = ns.singularity.upgradeHomeRam();
        }
    }

     function buyPrograms(ns: NS) {
        // Determine if we have the TOR router.
        // If we don't, try to buy it. If we can't, exit.
        if (ns.hasTorRouter() == false) {
            if (ns.getPlayer().money - C.TOR_COST > C.MONEY_BUFFER) {
                logger.info(`Purchasing TOR router for ${formatDollar(ns, C.TOR_COST)}..`, 0, undefined, true);
                ns.singularity.purchaseTor();
            } else {
                logger.warn(`Cannot afford TOR router. Need ${formatDollar(ns, C.TOR_COST - ns.getPlayer().money + C.MONEY_BUFFER)} more to purchase while maintaining money buffer.`);
                return;
            }
        }

        // Get all the unowned programs and their costs, then attempt to buy them
        const getUnownedPrograms =  getUnownedDarkWebPrograms(ns);
        if (getUnownedPrograms.length == 0) {
            logger.info("All Dark Web programs already owned.");
            return;
        } else {
            for (const program of getUnownedPrograms) {
                if (ns.getPlayer().money - program.cost > C.MONEY_BUFFER) {
                    logger.info(`Purchasing ${program.name} for ${formatDollar(ns, program.cost)}..`, 0, undefined, true);
                    ns.singularity.purchaseProgram(program.name);
                } else {
                    logger.warn(`Cannot afford ${program.name}. Need ${formatDollar(ns, program.cost - ns.getPlayer().money + C.MONEY_BUFFER)} more to purchase while maintaining money buffer.`);
                }
            }
        }
    }

    /**
     * Dynamically retrieves all Dark Web programs with their costs and ownership status
     */
     function getDarkWebPrograms(ns: NS): DarkWebProgram[] {
        const programs = ns.singularity.getDarkwebPrograms();
        
        const darkwebPrograms: DarkWebProgram[] = Object.values(programs).map(program => {
            const cost = ns.singularity.getDarkwebProgramCost(program);
            const owned = ns.singularity.getDarkwebProgramCost(program) == 0;
            
            return {
                name: program,
                cost: cost,
                owned: owned
            };
        });

        return darkwebPrograms;
    }

    /**
     * Alternative: Get only unowned programs
     */
     function getUnownedDarkWebPrograms(ns: NS): DarkWebProgram[] {
        const programs =  getDarkWebPrograms(ns);
        return programs.filter(p => !p.owned);
    }

}