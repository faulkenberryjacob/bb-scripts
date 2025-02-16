import { Logger } from '@/lib/logger';
import { loadConfig } from '@/lib/defaults';
import { Server } from 'NetscriptDefinitions';

export async function main(ns: NS) {
  ns.disableLog("ALL");

  const config = loadConfig(ns);
  const dbFile: string = config.serverDBFileName;

  const logger = new Logger(ns);
  const scriptName: string = ns.getScriptName();

  let servers: string[] = [];
  let serverCheck: string[] = [];

  // if the DB doesn't exist, build it first
  if (!ns.fileExists(dbFile)) {
    buildServerDB(ns);
  } 

  // grab all the hostnames of our DB servers that we have admin rights on to populate our ongoing 'tracker' of servers
  servers = (readDB(ns)).filter(server => server.hasAdminRights == true).map(server => server.hostname);

  try{
    while(true) {
      ns.print("Rooting servers..");
      rootServers(ns);

      ns.print("Building DB..");
      buildServerDB(ns);

      await ns.sleep(100);

      // check for any new rooted servers
      serverCheck = (readDB(ns)).filter(server => server.hasAdminRights == true).map(server => server.hostname);
      const differences: string[] = serverCheck.filter(server => !servers.includes(server));
      for (const newServer of differences) {
        logger.tlog(`New server rooted: ${newServer}!`);
      }
      servers = serverCheck;
    }
  } catch (error) {
    logger.tlog(`ERROR -- ${scriptName} DIED -- `);
  }
  logger.tlog(`ERROR -- ${scriptName} DIED --`)
}


/* ------------------------------------------------------------------------------------------------------------------- */
/* --------------------- FUNCTION DEFINITIONS ------------------------------------------------------------------------ */
/* ------------------------------------------------------------------------------------------------------------------- */

/**
 * Builds a server database by scanning all connected servers recursively and sorting them by maximum money.
 * @param {NS} ns - The NS object.
 * @returns {Promise<void>} - A promise that resolves when the server database is built.
 */
function buildServerDB(ns: NS) {
  ns.disableLog("disableLog");
  ns.disableLog("write");
  // Ongoing set of already-scanned servers
  const scannedHostNames: Set<string> = new Set();
  const scannedServers: Set<Server> = new Set();

  // Load and create new server file
  const serverDB: string = loadConfig(ns).serverDBFileName;
  if (ns.fileExists(serverDB)) { ns.rm(serverDB); }

  scanServer(ns.getServer());

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
  function scanServer(server: Server) {
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
      scanServer(connectedServer);
    }
  }
}

/**
 * Reads and parses the server database file into an array of sorted Server objects.
 * @param {NS} ns - The NS object.
 * @returns {Promise<Server[]>} - An array of Server objects.
 */
function readDB(ns: NS) {

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
 * Recursively scans and roots servers starting from a given server or the "home" server by default.
 * @param {NS} ns - The Netscript context.
 * @param {string} [startServer="home"] - The hostname to start the scan from. Defaults to "home".
 * @returns {Promise<string[]>} - A promise that resolves to a list of rooted server hostnames.
 */
function rootServers(ns: NS, startServer: string = "home") {
  // Ongoing set of already-scanned servers
  const scannedServers = new Set();
  const logger = new Logger(ns);
  const rootedServers: string[] = [];

  logger.log(`Rooting servers..`);

  scanServer(startServer);

  return rootedServers;

  /**
   * Recursively scans servers and performs operations on them
   * @param {string} server - The current server to scan
   */
  function scanServer(server: string) {
    // If the server has already been scanned, skip it
    if (scannedServers.has(server)) {
      return;
    }

    logger.log(`Scanning ${server}..`);

    // Mark the server as scanned
    scannedServers.add(server);
    const rootServerReturn = rootServer(ns, server);
    if (rootServerReturn) {
      rootedServers.push(rootServerReturn);
    }

    // Get connected servers
    const connectedServers = ns.scan(server);

    // Loop through each connected server
    for (let i = 0; i < connectedServers.length; i++) {
      // Recursively scan the connected server
      scanServer(connectedServers[i]);
    }
  }

}

/**
 * Attempts to root a specified server by gaining admin access and optionally installing a backdoor.
 * This function checks the player's hacking level, opens required ports, and uses nuke to gain admin rights.
 * 
 * @param {NS} ns - The Netscript context.
 * @param {Server} server - The server to root.
 * @returns {Promise<string | undefined>} - Returns the server hostname if successfully rooted, otherwise undefined.
 */
function rootServer(ns: NS, server: string) {
  const logger = new Logger(ns);
  const config = loadConfig(ns);
  const serverData: Server = getServerData(ns, server) as Server;

  const CAN_BACKDOOR: boolean = Boolean(config.canBackdoor);

  logger.log("Checking server: " + server + "...", 1);

  let isScriptable: boolean = false;


  logger.log(`Checking hack level..`, 2);
  if (ns.getHackingLevel() < ns.getServerRequiredHackingLevel(server)) {
    logger.log("Hacking skill is too low, skipping", 3);
    return;
  }
  logger.log(`It's hackable!`, 2);

  // Root server if we don't have admin rights
  logger.log(`Checking for admin rights..`, 2)
  
  if (!ns.hasRootAccess(server)) {
    logger.log("No admin rights. Cracking..", 3)
    if (openPorts(server)) {
      ns.nuke(server);
      logger.log(`Ports opened and nuked!`, 3);
      isScriptable = true;
    }
  } else { 
    logger.log(`We have admin rights!`, 3);
    isScriptable = true; 
  }

  if (!serverData.backdoorInstalled && CAN_BACKDOOR) {
    //ns.print("Installing backdoor..");
    //await ns.singularity.installBackdoor();
  }

  if (!isScriptable) { return; }

  return server;

/**
 * Attempts to open the required number of ports on a server.
 * @param {NS} ns - The NS object.
 * @param {Server} server - The server object to open ports on.
 */
  function openPorts(server: string) {
    logger.log("Cracking open ports..", 2);
    

    // Check how many ports are required vs. opened
    
    let numRequiredPorts: number = ns.getServerNumPortsRequired(server);
    let numOpenPorts: number = serverData.openPortCount ?? 0;

    logger.log(numOpenPorts.toString() + " / " + numRequiredPorts.toString() + " ports opened", 3);

    if (numRequiredPorts <= numOpenPorts) { return true; }

    // Open them puppies up
    let portsOpened = 0;
    if (!serverData.sshPortOpen && canCrackSSH(ns))   { 
      ns.brutessh(server); 
      portsOpened++;
    }
    if (!serverData.ftpPortOpen && canCrackFTP(ns))   { 
      ns.ftpcrack(server); 
      portsOpened++;
    }
    if (!serverData.smtpPortOpen && canCrackSMTP(ns)) { 
      ns.relaysmtp(server);
      portsOpened++;
    }
    if (!serverData.httpPortOpen && canCrackHTTP(ns)) { 
      ns.httpworm(server); 
      portsOpened++;
    }
    if (!serverData.sqlPortOpen && canCrackSQL(ns))   { 
      ns.sqlinject(server); 
      portsOpened++;
    }
    return (numRequiredPorts <= portsOpened);
  }
}

/**
 * Retrieves data for a specified server from the database.
 * @param {NS} ns - The Netscript context.
 * @param {string} target - The hostname of the server to retrieve data for.
 * @returns {Promise<Server | undefined>} - A promise that resolves to the server data if found, otherwise undefined.
 */
function getServerData(ns: NS, target: string) {
  const db = readDB(ns);
  return db.find(server => server.hostname === target);
}

function canCrackSSH(ns: NS) {
  return ns.fileExists("BruteSSH.exe", "home");
}

function canCrackFTP(ns: NS) {
  return ns.fileExists("FTPCrack.exe", "home");
}

function canCrackSMTP(ns: NS) {
  return ns.fileExists("relaySMTP.exe", "home");
}

function canCrackHTTP(ns: NS) {
  return ns.fileExists("HTTPWorm.exe", "home");
}

function canCrackSQL(ns: NS) {
  return ns.fileExists("SQLInject.exe", "home");
}