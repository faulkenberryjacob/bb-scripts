import { Server } from "NetscriptDefinitions";
import { getPortsCanCrack } from "./defaults";
import { Colors, Logger } from "./logger";
import { formatDollar } from "./formatter";
import * as consts from "./constants";
import { calculateMoneyPerSecond, getTopServerByMoneyPerSecond } from "./calc";
import { LogLevel, Plan, ServerData } from "./types";
import { HackAlgorithm } from "@/lib/hack-algorithm"
import { canWeDeployPlan, getFreeSpace } from "./system";

const RAM_LIMIT = 10240;

/**
 * Builds a server database by scanning all connected servers recursively and sorting them by maximum money.
 * @param {NS} ns - The NS object.
 * @returns {void} - A promise that resolves when the server database is built.
 */
export async function buildServerDB(ns: NS) {
  ns.disableLog("ALL");
  const logger = new Logger(ns, LogLevel.DEBUG);

  // Ongoing set of already-scanned servers
  const scannedHostNames: Set<string> = new Set();
  const scannedServers: Set<ServerData> = new Set();

  // Load and create new server file
  // logger.debug(`Deleting ${consts.DB_FILE} on home if it exists..`);
  // if (ns.fileExists(consts.DB_FILE, `home`)) { ns.rm(consts.DB_FILE, `home`); }

  scanServer(ns.getServer());

  // sort the servers by max money
  const serverMap: Map<string, ServerData> = new Map(
    Array.from(scannedServers).map(s => [s.hostname, s])
  );

  // If the DB file doesn't exist, create and paste everything in it
  if (!ns.fileExists(consts.DB_FILE)) {
    const jsonString = JSON.stringify(Array.from(serverMap.entries()), null, 2);
    logger.debug(`DB doesn't exist yet! Writing the following to the DB file:\r\n${jsonString}`);
    ns.write(consts.DB_FILE, jsonString, "w");

    // If we're not at home, scp the DB to home
    if (ns.getHostname() != `home`) {
      logger.debug(`Not on home, so scp'ing DB to it`);
      if (!ns.scp(consts.DB_FILE, `home`)) {
        logger.warn(`Unable to scp ${consts.DB_FILE} to home!`);
      }
    }
  } else {
    logger.debug(`DB already exists. Updating servers in-place..`);
    // If the file already exists, let's just update each server in-place
    // so we don't overwrite changes from other scripts modifying it
    for (const sd of serverMap.values()) {
      await updateServerInDB(ns, sd.hostname, sd);
    }

  }

  /**
   * Recursively scans servers and performs operations on them
   * @param {string} server - The current server to scan
   */
  function scanServer(server: Server) {
    // If the server has already been scanned, skip it
    if (scannedHostNames.has(server.hostname)) {
      return;
    }

    const sd: ServerData = {
      ...server,
      freeRam: server.maxRam - server.ramUsed,
      ramBuffer: server.hostname == `home` ? consts.HOME_RAM_BUFFER : 0
    };

    // Mark the server as scanned
    scannedHostNames.add(server.hostname);
    scannedServers.add(sd);

    // Get connected servers
    const connectedServers = ns.scan(server.hostname);

    // Loop through each connected server
    for (let i = 0; i < connectedServers.length; i++) {
      const connectedServer: Server = ns.getServer(connectedServers[i]);

      // Recursively scan the connected server
      scanServer(connectedServer);
    }
  }
}


export async function updateServerInDB(ns: NS, target: string, update: Partial<ServerData>) {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  try {
    logger.debug(`Updating DB entry for ${target} with ${JSON.stringify(update)}`);
    const db = readDB(ns);
    const targetServer = db.get(target);
    if (!targetServer) {
      db.set(target, update as ServerData)
    } else {
      db.set(target, { ...targetServer, ...update })
    }

    ns.write(consts.DB_FILE, JSON.stringify(Array.from(db.entries()), null, 2), 'w');

    await ns.sleep(50);
  } catch (error) {
    logger.error(`Error updating DB: ${error}`);
  }
}


/**
 * Gets a list of servers with available RAM that meets the minimum threshold.
 * @param {NS} ns - The Netscript instance
 * @param {number} [minRam=1] - Minimum available RAM required (in GB). Defaults to 1
 * @returns {{ server: String, availableRam: number }[]} An array of servers with their available RAM, sorted by servers that meet the minimum RAM requirement
 * @example
 * const spacious = getServerSpace(ns, 10);
 * // Returns: [{ server: "server1", availableRam: 50 }, { server: "server2", availableRam: 25 }]
 */
export function getServerSpace(ns: NS, minRam: number = 1): { server: String, availableRam: number }[] {
  const servers = readDB(ns);
  const results = [];

  for (const s of servers.values()) {
    const ram = (s.maxRam - s.ramUsed);
    if (ram > minRam) {
      results.push({
        server: s.hostname,
        availableRam: ram
      })
    }
  }
  return results;
}

export function getTotalFreeSpaceFromDB(ns: NS): number {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  logger.debug(`Getting total free space..`);
  let totalRam = 0;
  for (const s of getServerSpace(ns)) {
    totalRam += s.availableRam;
  }
  logger.debug(`We have ${totalRam} available RAM!`, 1);
  return totalRam;
}


/**
 * Reads and parses the server database file into an array of sorted Server objects.
 * @param {NS} ns - The NS object.
 * @returns {Server[]} - An array of Server objects.
 */
export function readDB(ns: NS): Map<string, ServerData> {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  try {
    const content = ns.read(consts.DB_FILE);

    if (!content || content.length === 0) {
      logger.warn(`Nothing was found in DB! Returning empty map..`);
      return new Map();
    }

    const entries = JSON.parse(content) as [string, ServerData][];
    logger.debug(`Parsed ${entries.length} servers from DB`);
    return new Map(entries);
  } catch (error) {
    logger.error(`Could not read ${consts.DB_FILE}! Error: ${error}`);
    return new Map();
  }
}

export function getMinimumRamForHack(ns: NS, target: string): number {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  const sd = getServerData(ns, target);
  if (!sd.moneyMax || sd.moneyMax == 0) { return -1; }

  logger.debug(`Finding minimum RAM necessary to hack ${target}`);
  let low = 0;
  let high = RAM_LIMIT; // Adjust upper bound as needed
  let result = high;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const ha = new HackAlgorithm(ns, target, mid, 1);

    if (ha.isHackPossible()) {
      result = mid; // This RAM amount works, try lower
      high = mid - 1;
    } else {
      low = mid + 1; // This RAM amount doesn't work, try higher
    }
  }

  logger.info(`Found minimum RAM for hwgw: ${result}`, 1);
  return result;
}

export function getMinimumRamForPrep(ns: NS, target: string): number {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  const sd = getServerData(ns, target);
  if (!sd.moneyMax || sd.moneyMax == 0) { return -1; }

  logger.debug(`Finding minimum RAM necessary to hack ${target}`);
  let low = 0;
  let high = RAM_LIMIT; // Adjust upper bound as needed
  let result = high;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const ha = new HackAlgorithm(ns, target, mid, 1);

    if (ha.isPrepPossible()) {
      result = mid; // This RAM amount works, try lower
      high = mid - 1;
    } else {
      low = mid + 1; // This RAM amount doesn't work, try higher
    }
  }

  logger.info(`Found minimum RAM for prep: ${result}`, 1);
  return result;
}

export function getOwnedServers(ns: NS): string[] {
  const purchased = Array.from(readDB(ns).values())
    .filter(s => s.purchasedByPlayer == true)
    .map(server => server.hostname);
  purchased.push('home');
  const deduplicate = [...new Set(purchased)];
  return deduplicate;
}

export function getOwnedServersData(ns: NS): ServerData[] {
  const purchased = Array.from(readDB(ns).values())
    .filter(s => s.purchasedByPlayer == true);
  purchased.push(getServerData(ns, `home`));
  const deduplicate = [...new Set(purchased)];
  return deduplicate;
}


/**
 * Retrieves data for a specified server from the database.
 * @param {NS} ns - The Netscript context.
 * @param {string} target - The hostname of the server to retrieve data for.
 * @returns {Server | undefined} - A promise that resolves to the server data if found, otherwise undefined.
 */
export function getServerData(ns: NS, target: string): ServerData {
  const logger = new Logger(ns);
  const db = readDB(ns);
  const result = db.get(target);

  if (!result) {
    logger.error(`${target} was not found in the serverDB!`);
  }

  return result as ServerData;
}

/**
 * Retrieves a list of hackable servers based on the player's current hacking level,
 * admin rights, and excluding the home server and owned servers.
 *
 * @param ns - The Netscript object providing access to game functions and data.
 * @returns An array of server hostnames that are hackable.
 */
export function getHackableServers(ns: NS) {
  const db = readDB(ns);

  let hackableServers: string[] = [];
  const hackingLevel: number = ns.getHackingLevel();
  const ownedServers: string[] = ns.getPurchasedServers();

  for (const server of db.values()) {
    if (hackingLevel >= (server.requiredHackingSkill ?? 0)
      && server.hasAdminRights
      && server.hostname != "home"
      && !ownedServers.includes(server.hostname)) {
      hackableServers.push(server.hostname);
    }
  }

  return hackableServers;
}

export function findBestPrepPlan(ns: NS): Plan[] {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  logger.debug(`Finding best prep plan across all servers`);
  const topServers = getTopServerByMoneyPerSecond(ns);
  let choices: { server: string, pct: number, plan: Plan[] }[] = [];
  const ramLimit = getFreeSpace(ns);

  for (const ts of topServers) {
    let serverChoices: { server: string, pct: number, plan: Plan[] }[] = [];
    logger.debug(`Checking ${ts}..`, 1)
    const sd = getServerData(ns, ts);
    if (!sd.moneyMax || sd.moneyMax == 0) { return []; }

    let low = 0;
    let high = ramLimit;
    let result = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const ha = new HackAlgorithm(ns, ts, mid, 1);
      const { plan: testPlan, growPct: pct } = ha.maxPrepAlgorithm();

      // If the prep worked..
      if (testPlan.length > 0) {

        // And the grow % is defined..
        if (pct) {
          logger.debug(`Found achievable prep plan for ${ts}! Checking for lower RAM usage..`);
          serverChoices.push({ server: ts, pct: pct, plan: testPlan });
        }

        result = mid; // This RAM amount works, try lower
        high = mid - 1;
      } else {
        low = mid + 1; // This RAM amount doesn't work, try higher
      }
    }

    // if we found some achievable hack plans, take the last one and save it.
    // we do this because the last one will be the one that did a 100% hack
    // while using the least amount of RAM
    if (serverChoices.length > 0) {
      logger.info(`Found ${serverChoices.length} achievable preps for ${ts}!`,0,Colors.Magenta);
      choices.push(...serverChoices);
    }
  }

  // let's now iterate through all our best choices per server backwards
  // and see what we can actually deploy with our current resources.
  // we do this backwards because we pushed our top servers first,
  // so this is basically an ascending array of profitable servers
  for (let c = choices.length - 1; c >= 0; c--) {
    if (canWeDeployPlan(ns, choices[c].plan)) {
      logger.info(`Found best choice! Targeting ${choices[c].server} with a grow percent of ${choices[c].pct}%`,0,Colors.Green);
      return choices[c].plan;
    }
  }

  // if we've made it this far, we didn't find anything
  return [];

}

/**
 * Return the most profitable server that we can realistically
 * hack with our given resources. That is, one where our current
 * server load can handle an entire H/W/G/W cycle
 * 
 * @param ns 
 * @param target 
 */
export function findBestHackPlan(ns: NS): Plan[] {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  logger.debug(`Finding best hack plan across all servers`);
  const topServers = getTopServerByMoneyPerSecond(ns);
  let choices: { server: string, pct: number, plan: Plan[] }[] = [];
  const ramLimit = getFreeSpace(ns);

  for (const ts of topServers) {
    let serverChoices: { server: string, pct: number, plan: Plan[] }[] = [];
    logger.debug(`Checking ${ts}..`, 1)
    const sd = getServerData(ns, ts);
    if (!sd.moneyMax || sd.moneyMax == 0) { return []; }

    let low = 0;
    let high = ramLimit;
    let result = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const ha = new HackAlgorithm(ns, ts, mid, 1);
      const { plan: testPlan, hackPct: pct } = ha.maxHackAlgorithm();

      // If the hack worked..
      if (testPlan.length > 0) {

        // And the hack % is defined..
        if (pct) {
          logger.debug(`Found achievable hack plan for ${ts}! Checking for lower RAM usage..`);
          serverChoices.push({ server: ts, pct: pct, plan: testPlan });
        }

        result = mid; // This RAM amount works, try lower
        high = mid - 1;
      } else {
        low = mid + 1; // This RAM amount doesn't work, try higher
      }
    }

    // if we found some achievable hack plans, take the last one and save it.
    // we do this because the last one will be the one that did a 100% hack
    // while using the least amount of RAM
    if (serverChoices.length > 0) {
      logger.info(`Found ${serverChoices.length} achievable hacks for ${ts}!`,0,Colors.Magenta);
      choices.push(...serverChoices);
    }
  }

  // let's now iterate through all our best choices per server backwards
  // and see what we can actually deploy with our current resources.
  // we do this backwards because we pushed our top servers first,
  // so this is basically an ascending array of profitable servers
  for (let c = 0; c < choices.length; c++) {
    if (canWeDeployPlan(ns, choices[c].plan)) {
      logger.info(`Found best choice! Targeting ${choices[c].server} with a hack percent of ${choices[c].pct}%`,0,Colors.Magenta);
      return choices[c].plan;
    }
  }

  // if we've made it this far, we didn't find anything
  return [];

}

export function getMostProfitableServerWithAlgo(ns: NS) {
  const logger = new Logger(ns);
  const rootedServers = getServersWithRoot(ns);
  if (!rootedServers || rootedServers.length == 0) {
    logger.warn(`No profitable servers possible when no servers are rooted!`);
    return "";
  }
  let bestServer: string = rootedServers[0];
  for (const s of rootedServers) {
    const sd = getServerData(ns, s);
    if (calculateMoneyPerSecond(ns, s) > calculateMoneyPerSecond(ns, bestServer)
      && ((sd.minRamForHack ?? 0) > 0 || (sd.minRamForPrep ?? 0) > 0)) {
      bestServer = s;
    }
  }
  return bestServer;
}

export function getMostProfitableServer(ns: NS) {
  const logger = new Logger(ns);
  const rootedServers = getServersWithRoot(ns);
  if (!rootedServers || rootedServers.length == 0) {
    logger.warn(`No profitable servers possible when no servers are rooted!`);
    return "";
  }
  let bestServer: string = rootedServers[0];
  for (const s of rootedServers) {
    if (calculateMoneyPerSecond(ns, s) > calculateMoneyPerSecond(ns, bestServer)) {
      bestServer = s;
    }
  }
  return bestServer;
}

export function getServersWithNoBackdoor(ns: NS): string[] {
  const db: Map<string, ServerData> = readDB(ns);
  const logger = new Logger(ns);

  logger.debug(`Retrieving servers from DB that don't have a backdoor installed..`);

  const filteredServers: string[] = Array.from(db.values())
    .filter(
      s => s.backdoorInstalled === false
        && s.hasAdminRights === true
        && !s.purchasedByPlayer
        && s.hostname != "home")
    .map(s => s.hostname);
  return filteredServers;
}

export function getServersWithoutRoot(ns: NS): string[] {
  const db: Map<string, ServerData> = readDB(ns);
  const logger = new Logger(ns);

  logger.debug(`Retrieving servers from DB that don't have admin rights..`);

  const filteredServers: string[] = Array.from(db.values())
    .filter(s => s.hasAdminRights === false
      && !s.purchasedByPlayer
      && s.hostname != "home")
    .map(s => s.hostname);
  return filteredServers;
}

export function getProfitableServersWithRoot(ns: NS): string[] {
  return getServerDatasWithRoot(ns)
    .filter(s => !s.purchasedByPlayer
      && s.hostname != "home")
    .map(s => s.hostname);
}

export function getServersWithRoot(ns: NS): string[] {
  const db: Map<string, ServerData> = readDB(ns);
  const logger = new Logger(ns);

  logger.debug(`Retrieving servers from DB that have admin rights..`);

  const filteredServers: string[] = Array.from(db.values())
    .filter(s => s.hasAdminRights === true)
    .map(s => s.hostname);
  return filteredServers;
}

export function getServerDatasWithRoot(ns: NS): ServerData[] {
  const db: Map<string, ServerData> = readDB(ns);
  const logger = new Logger(ns);

  logger.debug(`Retrieving servers from DB that have admin rights..`);

  const filteredServers: ServerData[] = Array.from(db.values())
    .filter(s => s.hasAdminRights === true);
  return filteredServers;
}