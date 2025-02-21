import { Server } from "NetscriptDefinitions";
import { getPortsCanCrack } from "./defaults";
import { Logger } from "./logger";
import { formatDollar } from "./formatter";
import * as consts from "./constants";


/**
 * Builds a server database by scanning all connected servers recursively and sorting them by maximum money.
 * @param {NS} ns - The NS object.
 * @returns {Promise<void>} - A promise that resolves when the server database is built.
 */
export async function buildServerDB(ns: NS) {
    ns.disableLog("disableLog");
    ns.disableLog("write");
    // Ongoing set of already-scanned servers
    const scannedHostNames: Set<string> = new Set();
    const scannedServers: Set<Server> = new Set();
  
    // Load and create new server file
    if (ns.fileExists(consts.DB_FILE)) { ns.rm(consts.DB_FILE); }
  
    await scanServer(ns.getServer());
  
    // sort the servers by max money
    const sortedServerArray = Array.from(scannedServers).sort((a, b) => (ns.getServerMaxMoney(b.hostname)) - (ns.getServerMaxMoney(a.hostname)));
    const sortedServerMap: { [key: string]: Server } = sortedServerArray.reduce((acc, server) => {
      acc[server.hostname] = server;
      return acc;
    }, {} as { [key: string]: Server });
  
    const jsonString = JSON.stringify(sortedServerMap, null, 2);
    ns.write(consts.DB_FILE, jsonString, "w");
  
    /**
     * Recursively scans servers and performs operations on them
     * @param {string} server - The current server to scan
     */
    async function scanServer(server: Server) {
      // If the server has already been scanned, skip it
      if (scannedHostNames.has(server.hostname)) {
        return;
      }
  
      // Mark the server as scanned
      scannedHostNames.add(server.hostname);
      scannedServers.add(server);
  
      // Get connected servers
      const connectedServers = ns.scan(server.hostname);
  
      // Loop through each connected server
      for (let i = 0; i < connectedServers.length; i++) {
        const connectedServer: Server = ns.getServer(connectedServers[i]);
  
        // Recursively scan the connected server
        await scanServer(connectedServer);
      }
    }
  }


/**
 * Reads and parses the server database file into an array of sorted Server objects.
 * @param {NS} ns - The NS object.
 * @returns {Promise<Server[]>} - An array of Server objects.
 */
export async function readDB(ns: NS) {

  // Parse the JSON in the same format it was written to
  const dbData: { [key: string]: Server } = JSON.parse(ns.read(consts.DB_FILE));

  // Create a server Array so we can keep the sorted integrity
  const serverArray: Server[] = [];

  for (const key in dbData) {
    if (dbData.hasOwnProperty(key)) {
      const server: Server = dbData[key];
      serverArray.push(server);
    }
  }

  return serverArray;
}

/**
 * Retrieves data for a specified server from the database.
 * @param {NS} ns - The Netscript context.
 * @param {string} target - The hostname of the server to retrieve data for.
 * @returns {Promise<Server | undefined>} - A promise that resolves to the server data if found, otherwise undefined.
 */
export async function getServerData(ns: NS, target: string) {
  const db = await readDB(ns);
  return db.find(server => server.hostname === target);
}

/**
 * Retrieves a list of hackable servers based on the player's current hacking level,
 * admin rights, and excluding the home server and owned servers.
 *
 * @param ns - The Netscript object providing access to game functions and data.
 * @returns An array of server hostnames that are hackable.
 */
export async function getHackableServers(ns: NS) {
  const db = await readDB(ns);

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
 * @returns {Promise<string>} - A promise that resolves to the hostname of the top server with the maximum money.
 */
export async function getTopServerWithMaxMoney(ns: NS) {
  const db = await readDB(ns);
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