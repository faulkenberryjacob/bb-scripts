import { Server } from "NetscriptDefinitions";
import { getPortsCanCrack } from "./defaults";
import { Logger } from "./logger";
import { formatDollar } from "./formatter";
import * as consts from "./constants";
import { calculateMoneyPerSecond } from "./calc";
import { ServerData } from "./types";


/**
 * Builds a server database by scanning all connected servers recursively and sorting them by maximum money.
 * @param {NS} ns - The NS object.
 * @returns {void} - A promise that resolves when the server database is built.
 */
export function buildServerDB(ns: NS) {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  // Ongoing set of already-scanned servers
  const scannedHostNames: Set<string> = new Set();
  const scannedServers: Set<ServerData> = new Set();

  // Load and create new server file
  if (ns.fileExists(consts.DB_FILE)) { ns.rm(consts.DB_FILE); }

  scanServer(ns.getServer());

  // sort the servers by max money
  const sortedServerArray = Array.from(scannedServers).sort((a, b) => (ns.getServerMaxMoney(b.hostname)) - (ns.getServerMaxMoney(a.hostname)));
  const sortedServerMap: { [key: string]: Server } = sortedServerArray.reduce((acc, server) => {
    acc[server.hostname] = server;
    return acc;
  }, {} as { [key: string]: Server });

  const jsonString = JSON.stringify(sortedServerMap, null, 2);
  ns.write(consts.DB_FILE, jsonString, "w");

  // If we're not at home, scp the DB to home
  if (ns.getHostname() != `home`) {
    if (!ns.scp(consts.DB_FILE, `home`)) {
      logger.warn(`Unable to scp ${consts.DB_FILE} to home!`);
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

  for (const s of servers) {
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

export function getTotalFreeSpace(ns: NS): number {
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
export function readDB(ns: NS): ServerData[] {
  ns.disableLog("ALL");
  const logger = new Logger(ns);

  // Parse the JSON in the same format it was written to
  if (!ns.fileExists(consts.DB_FILE)) {
    logger.warn(`Couldn't find ${consts.DB_FILE}, attempting to copy from home..`);
    if (!ns.scp(consts.DB_FILE, ns.getHostname(), `home`)) {
      logger.error(`Cannot copy over DB! Doesn't exist on ${ns.getHostname()}`);
      return [];
    } else {
      logger.debug(`${consts.DB_FILE} has been copied to ${ns.getHostname()}`);
    }
  }
  const dbData: { [key: string]: ServerData } = JSON.parse(ns.read(consts.DB_FILE));

  // Create a server Array so we can keep the sorted integrity
  const serverArray: ServerData[] = [];

  for (const key in dbData) {
    if (dbData.hasOwnProperty(key)) {
      const server: ServerData = dbData[key];
      serverArray.push(server);
    }
  }

  return serverArray;
}

export function getOwnedServers(ns: NS): string[] {
  const purchased = readDB(ns)
    .filter(s => s.purchasedByPlayer == true)
    .map(server => server.hostname);
  purchased.push('home');
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
  const result = db.find(server => server.hostname === target);

  if (!result) {
    logger.error(`${target} was not found in the serverDB!`);
    throw new Error(`${target} was not found in the serverDB!`);
  }

  return result;
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

  for (const server of db) {
    if (hackingLevel >= (server.requiredHackingSkill ?? 0)
      && server.hasAdminRights
      && server.hostname != "home"
      && !ownedServers.includes(server.hostname)) {
      hackableServers.push(server.hostname);
    }
  }

  return hackableServers;
}

/**
 * Retrieves the hostname of the server with the maximum money available that the player can hack.
 * @param {NS} ns - The Netscript context.
 * @returns {string} - A promise that resolves to the hostname of the top server with the maximum money.
 */
export function getTopServerWithMaxMoney(ns: NS) {
  const db = readDB(ns);
  const logger = new Logger(ns);

  logger.info("DB has " + db.length.toString() + " entries.");

  let topServer: Server = db[db.length - 1];
  const hackingLevel: number = ns.getHackingLevel();

  for (let i = 0; i < db.length; i++) {
    const serverMoney = ns.getServerMaxMoney(db[i].hostname);
    const requiredLevel = ns.getServerRequiredHackingLevel(db[i].hostname);
    logger.info(`Checking ${db[i].hostname} with ${formatDollar(ns, serverMoney)} and required hacking ${requiredLevel}...`);

    if (serverMoney > (ns.getServerMaxMoney(topServer.hostname))
      && hackingLevel >= (ns.getServerRequiredHackingLevel(db[i].hostname))
      && getPortsCanCrack(ns) >= ns.getServerNumPortsRequired(db[i].hostname)) {
      topServer = db[i];
      logger.info(`\t${db[i].hostname} matches!`)
    }
  }

  return topServer.hostname;
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
  const db: Server[] = readDB(ns);
  const logger = new Logger(ns);

  logger.debug(`Retrieving servers from DB that don't have a backdoor installed..`);

  const filteredServers: string[] = db
    .filter(
      s => s.backdoorInstalled === false
        && s.hasAdminRights === true
        && !s.purchasedByPlayer
        && s.hostname != "home")
    .map(s => s.hostname);
  return filteredServers;
}

export function getServersWithoutRoot(ns: NS): string[] {
  const db: Server[] = readDB(ns);
  const logger = new Logger(ns);

  logger.debug(`Retrieving servers from DB that don't have admin rights..`);

  const filteredServers: string[] = db
    .filter(s => s.hasAdminRights === false
      && !s.purchasedByPlayer
      && s.hostname != "home")
    .map(s => s.hostname);
  return filteredServers;
}

export function getServersWithRoot(ns: NS): string[] {
  const db: Server[] = readDB(ns);
  const logger = new Logger(ns);

  logger.debug(`Retrieving servers from DB that have admin rights..`);

  const filteredServers: string[] = db
    .filter(s => s.hasAdminRights === true
      && !s.purchasedByPlayer
      && s.hostname != "home")
    .map(s => s.hostname);
  return filteredServers;
}