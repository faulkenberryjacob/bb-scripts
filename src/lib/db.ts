import { Server } from "NetscriptDefinitions";
import { getPortsCanCrack, loadConfig } from "./defaults";
import { Logger } from "./logger";
import { formatDollar } from "./formatter";


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
    const serverDB: string = loadConfig(ns).serverDBFileName;
    if (ns.fileExists(serverDB)) { ns.rm(serverDB); }
  
    await scanServer(ns.getServer());
  
    // remove all our owned servers from the list
    // const ownedServers = ns.getPurchasedServers();
    // ownedServers.push("home");
    // const nonOwnedServerArray = Array.from(scannedServers).filter(server => !ownedServers.includes(server.hostname));
  
    // sort
    const sortedServerArray = Array.from(scannedServers).sort((a, b) => (ns.getServerMaxMoney(b.hostname)) - (ns.getServerMaxMoney(a.hostname)));
    const sortedServerMap: { [key: string]: Server } = sortedServerArray.reduce((acc, server) => {
      acc[server.hostname] = server;
      return acc;
    }, {} as { [key: string]: Server });
  
    const jsonString = JSON.stringify(sortedServerMap, null, 2);
    ns.write(serverDB, jsonString, "w");
  
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
export function readDB(ns: NS) {

  // Parse the JSON in the same format it was written to
  const dbData: { [key: string]: Server } = JSON.parse(ns.read(loadConfig(ns).serverDBFileName));

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
 * Retrieves a list of hackable servers based on the player's hacking level and admin rights.
 * @param {NS} ns - The Netscript context.
 * @returns {Promise<string[]>} - A promise that resolves to a list of hackable server hostnames.
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
 * @returns {Promise<string>} - A promise that resolves to the hostname of the top server with the maximum money.
 */
export async function getTopServerWithMaxMoney(ns: NS) {
  const db = await readDB(ns);
  const logger = new Logger(ns);

  logger.log("DB has " + db.length.toString() + " entries.");

  let topServer: Server = db[db.length - 1];
  const hackingLevel: number = ns.getHackingLevel();

  for (let i = 0; i < db.length; i++) {
    const serverMoney = ns.getServerMaxMoney(db[i].hostname);
    const requiredLevel = ns.getServerRequiredHackingLevel(db[i].hostname);
    logger.log(`Checking ${db[i].hostname} with ${formatDollar(serverMoney)} and required hacking ${requiredLevel}...`);

    if (serverMoney > (ns.getServerMaxMoney(topServer.hostname))
      && hackingLevel >= (ns.getServerRequiredHackingLevel(db[i].hostname))
      && getPortsCanCrack(ns) >= ns.getServerNumPortsRequired(db[i].hostname)) {
      topServer = db[i];
      logger.log(`\t${db[i].hostname} matches!`)
    }
  }

  return topServer.hostname;
}