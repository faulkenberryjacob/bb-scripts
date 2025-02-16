import { formatDollar, formatTime } from '@/lib/formatter';
import { Logger } from '@/lib/logger';
import { canCrackFTP, canCrackHTTP, canCrackSMTP, canCrackSQL, canCrackSSH, loadConfig } from '@/lib/defaults';
import { buildServerDB, readDB } from '@/lib/db';
import { Server } from 'NetscriptDefinitions';
import { calculateMaxThreadsForScript, getTopServerByMoneyPerSecond } from '@/lib/calc';

const CONFIG_FILE: string = 'config.json';
const SCRIPT_NAME: string = 'utils.ts';

export async function main(ns: NS) {
  const rawArg = ns.args[0];
  //const logger = new Logger(ns);

  let funcName: string;
  if (rawArg) {
    funcName = rawArg.toString().toLowerCase();
  } else {
    funcName = "";
  }
  

  switch (funcName) {
    case "buildserverdb":
      await buildServerDB(ns);
      break;
    case "printserverdata":
      await printServerData(ns, ns.args[1].toString());
      break;
    case "maxram":
      ns.tprint(`Max ram you can purchase per server:  ${determinePurchaseServerMaxRam(ns)}`);
      break;
    case "getserverpaths":
      ns.tprint(`Getting server paths from home`);
      await getServerPaths(ns);
      break;
    case "top":
      ns.tprint(`Showing top 25 servers:`);
      await showTopServers(ns);
      break;
    case "killall":
      ns.tprint("Killing all scripts on servers");
      killAll(ns);
      break;
    default:
      ns.tprint(`
        utils.js [function] [...args]
        ------------------------------------------------------------------------------
        buildServerDB              Scans and fills out the server DB file

        printServerData [server]   Returns the [server]'s attributes in JSON format

        maxram                     Prints the maximum amount of ram you could distribute
                                    amongst the max amount of purchased servers.

        getServerPaths              Saves all servers and their connected 'paths' to others
                                    in 'server-paths.txt'

        top                         Print the top servers (in terms of money per second) in desc order

        killAll                     Kills all scripts on known servers
        `);
      break;
  }
}

export function getUtilsName() {
  return SCRIPT_NAME;
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
 * Prints the data of a specified server from the database.
 * @param {NS} ns - The Netscript context.
 * @param {string} target - The hostname of the server to print data for.
 * @returns {Promise<void>}
 */
export async function printServerData(ns: NS, target: string) {
  const logger = new Logger(ns);
  const db: Server[] = await readDB(ns);
  const foundServer = db.find(server => server.hostname === target);

  if (foundServer) { logger.tlog(JSON.stringify(foundServer, null, 2)); }
  else { logger.tlog("Server not found."); }
}







export function killAll(ns: NS) {
  const db = readDB(ns);

  for (const ownedServer of ns.getPurchasedServers()) {
    db.push(ns.getServer(ownedServer));
  }

  for (const server of db) {
    if (server.hostname != "home") { ns.killall(server.hostname); }
  }
}





export async function showTopServers(ns: NS) {
  const topServers = getTopServerByMoneyPerSecond(ns);
  for (let i = 0; i < topServers.length; i++) {
    const maxMoney = ns.getServerMaxMoney(topServers[i]);
    const hackTime = ns.getHackTime(topServers[i]);
    const growTime = ns.getGrowTime(topServers[i]);
    const weakTime = ns.getWeakenTime(topServers[i]);
    const cycleTime   = Math.max(hackTime, growTime, weakTime);
    const moneyPerSecond = parseFloat((maxMoney / (cycleTime/1000)).toFixed(2));
    const hackChance = parseFloat((ns.hackAnalyzeChance(topServers[i])*100).toFixed(2));
    const calcMoneyPerSecond = ns.hackAnalyzeChance(topServers[i]) * moneyPerSecond;
    ns.tprint(`${topServers[i]} has ${formatDollar(maxMoney)} max money with ${hackChance}% hack chance. Cycle time is ${formatTime(cycleTime)}. Will earn ${formatDollar(calcMoneyPerSecond)} per second.`);
  }
}


export async function removeFilesFromServer(ns: NS, files: string[], server: string) {
  const logger = new Logger(ns);
  if (server == "home") {
    logger.log("We're not deleting files off home. Aborting");
    return 2;
  }

  let allFiles = ns.ls(server);
  let allFilesDeleted: boolean = true;

  for (const file of allFiles) {
    if (files.includes(file)) {
      logger.log(`Deleting ${file}...`);
      if (!ns.rm(file, server)) {
        logger.log(`Could not delete ${file}`);
        allFilesDeleted = false;
      }
    }
  }

  return allFilesDeleted;
}

/**
 * Deletes all files on a specified server, optionally filtering by file extension.
 * @param {NS} ns - The Netscript context.
 * @param {string} server - The hostname of the server to delete files from.
 * @param {string} [fileExtension] - The file extension to filter by (optional).
 * @returns {Promise<number>} - Returns 2 if aborting deletion on "home", otherwise returns 0.
 */
export async function deleteAllFilesOnServer(ns: NS, server: string, fileExtension?: string) {
  const logger = new Logger(ns);
  if (server = "home") {
    logger.log("We're not deleting files off home. Aborting");
    return 2;
  }
  const allFiles = ns.ls(server);
  let filesToDelete: string[] = [];

  if (fileExtension) {
    filesToDelete = allFiles.filter(file => file.endsWith(fileExtension));
  } else {
    filesToDelete = allFiles;
  }

  for (const file of filesToDelete) {
    ns.rm(file, server);
  }

  return 0;
}

/**
 * Checks if any of the specified scripts are already running on the target server.
 * @param {NS} ns - The NS object.
 * @param {string[]} scripts - An array of script names to check.
 * @param {string} targetServer - The target server to check for running scripts.
 * @returns {Promise<boolean>} - True if any of the specified scripts are running, false otherwise.
 */
export async function checkIfScriptsAlreadyRunning(ns: NS, scripts: string[], targetServer: string) {
  // Get all the running scripts on the server
  const runningScripts = ns.ps(targetServer);
  let scriptsStillRunning: boolean = false;

  const logger = new Logger(ns);

  logger.log("Checking if " + scripts.join(', ') + " are still running..");
  for (const script of runningScripts) {
    if (scripts.includes(script.filename)) {
      scriptsStillRunning = true;
    }
  }
  logger.log("Done! stillRunning: " + scriptsStillRunning);

  return scriptsStillRunning;
}

/**
 * Kills specified scripts running on the target server and confirms that they have been terminated.
 * @param {NS} ns - The NS object.
 * @param {string[]} scripts - An array of script names to kill.
 * @param {string} targetServer - The target server where the scripts are running.
 * @returns {Promise<boolean>} - True if all specified scripts are killed, false otherwise.
 */
export async function killScripts(ns: NS, scripts: string[], targetServer: string) {
  // Get all the running scripts on the server
  const runningScripts = ns.ps(targetServer);

  const logger = new Logger(ns);

  // Iterate through and kill them
  logger.log("Killing scripts..");
  for (const script of runningScripts) {
    if (scripts.includes(script.filename)) {
      ns.kill(script.filename, targetServer, ...script.args);
      logger.log("  Killed " + script.filename + " on " + targetServer);
    }
  }
  logger.log("Done killing scripts!");

  // confirm scripts are all dead
  return !await checkIfScriptsAlreadyRunning(ns, scripts, targetServer);
}

interface ScriptInstance {
  name: string,
  threads: number,
  args: string[]
}

/**
 * Deploys and executes specified scripts on the target server after killing any currently running instances.
 * @param {NS} ns - The NS object.
 * @param {ScriptInstance[]} scripts - An array of script instances, each containing a script name, number of threads, and arguments.
 * @param {string} targetServer - The target server on which to deploy the scripts.
 * @param {string} sourceServer - The source server from which to copy the scripts.
 * @returns {Promise<boolean>} - True if all specified scripts are executed successfully, false otherwise.
 */
export async function deployScripts(ns: NS, scripts: ScriptInstance[], targetServer: string, sourceServer: string) {
  const logger = new Logger(ns);
  
  // kill anything already running
  const scriptArray: string[] = scripts.map(instance => instance.name);
  if (!await killScripts(ns, scriptArray, targetServer)) {
    logger.log("Unable to kill still-running scripts. Aborting.");
    return false;
  }

  // copy over scripts
  ns.scp(scriptArray, targetServer, sourceServer);

  let anyScriptsFailed = false;

  scripts.forEach(instance => {
    const pid = ns.exec(instance.name, targetServer, instance.threads, ...instance.args);
    if (pid === 0) {
      anyScriptsFailed = true;
      logger.log(`Failed to execute script ${instance.name} on server: ${targetServer}`);
    }
  })

  return !anyScriptsFailed;
}

/**
 * Deploys and executes a specified script on the target server after killing any currently running instance.
 * @param {NS} ns - The NS object.
 * @param {string} script - The name of the script to deploy.
 * @param {string} targetServer - The target server on which to deploy the script.
 * @param {string} sourceServer - The source server from which to copy the script.
 * @param {string[]} [args] - Optional array of arguments for the script.
 * @returns {Promise<boolean>} - True if the script is executed successfully, false otherwise.
 */
export async function deployScript(ns: NS, script: string, targetServer: string, sourceServer: string, args?: string[]) {
  const logger = new Logger(ns);
  
  // kill anything already running
  const scriptArray: string[] = [script];

  if (!await killScripts(ns, scriptArray, targetServer)) {
    logger.log("Unable to kill still-running script. Aborting.");
    return false;
  }

  // copy over scripts
  if (targetServer != sourceServer) {
    ns.scp(scriptArray, targetServer, sourceServer);
  }

  const idealThreads = await calculateMaxThreadsForScript(ns, script, targetServer, sourceServer);

  if (idealThreads <= 0) {
    logger.log("Not enough RAM to run script");
    return false;
  }

  let pid: number = 0;

  if (args) { 
    pid = ns.exec(script, targetServer, idealThreads, ...args);
  } else {
    pid = ns.exec(script, targetServer, idealThreads);
  }

  if (pid === 0) {
    logger.log(`Failed to execute script ${script} on server: ${targetServer}`);
  }

  return pid != 0;
}

/**
 * Deploys and executes a specified script on the target server after killing any currently running instance.
 * @param {NS} ns - The NS object.
 * @param {string} script - The name of the script to deploy.
 * @param {string} targetServer - The target server on which to deploy the script.
 * @param {string} sourceServer - The source server from which to copy the script.
 * @param {string[]} [args] - Optional array of arguments for the script.
 * @returns {Promise<boolean>} - True if the script is executed successfully, false otherwise.
 */
export async function deployScriptNoOptimization(ns: NS, script: string, targetServer: string, sourceServer: string, threads: number, args?: string[]) {
  const logger = new Logger(ns);
  
  // kill anything already running
  const scriptArray: string[] = [script];

  if (!await killScripts(ns, scriptArray, targetServer)) {
    logger.log("Unable to kill still-running script. Aborting.");
    return false;
  }

  // copy over scripts
  if (targetServer != sourceServer) {
    ns.scp(scriptArray, targetServer, sourceServer);
  }

  let pid: number = 0;

  if (args) { 
    pid = ns.exec(script, targetServer, threads, ...args);
  } else {
    pid = ns.exec(script, targetServer, threads);
  }

  if (pid === 0) {
    logger.log(`Failed to execute script ${script} on server: ${targetServer}`);
  }

  return pid != 0;
}

export function getOwnedServers(ns: NS): string[] {
  const purchasedServers = ns.getPurchasedServers();
  purchasedServers.push("home");
  return purchasedServers;
}


/**
 * Recursively scans and roots servers starting from a given server or the "home" server by default.
 * @param {NS} ns - The Netscript context.
 * @param {string} [startServer="home"] - The hostname to start the scan from. Defaults to "home".
 * @returns {Promise<string[]>} - A promise that resolves to a list of rooted server hostnames.
 */
export async function rootServers(ns: NS, startServer: string = "home") {
  // Ongoing set of already-scanned servers
  const scannedServers = new Set();
  const logger = new Logger(ns);
  const rootedServers: string[] = [];

  logger.log(`Rooting servers..`);

  await scanServer(startServer);

  return rootedServers;

  /**
   * Recursively scans servers and performs operations on them
   * @param {string} server - The current server to scan
   */
  async function scanServer(server: string) {
    // If the server has already been scanned, skip it
    if (scannedServers.has(server)) {
      return;
    }

    logger.log(`Scanning ${server}..`);

    // Mark the server as scanned
    scannedServers.add(server);
    const rootServerReturn = await rootServer(ns, server);
    if (rootServerReturn) {
      rootedServers.push(rootServerReturn);
    }

    // Get connected servers
    const connectedServers = ns.scan(server);

    // Loop through each connected server
    for (let i = 0; i < connectedServers.length; i++) {
      // Recursively scan the connected server
      await scanServer(connectedServers[i]);
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
export async function rootServer(ns: NS, server: string) {
  const logger = new Logger(ns);
  const config = await loadConfig(ns);
  const serverData: Server = await getServerData(ns, server) as Server;

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
    if (await openPorts(server)) {
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
  async function openPorts(server: string) {
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
 * Determines the maximum RAM that can be afforded for purchasing servers.
 * @param {NS} ns - The Netscript context.
 * @returns {number} - The maximum RAM that can be afforded for the servers.
 */
export function determinePurchaseServerMaxRam(ns: NS, numServers?: number) {
  const logger              = new Logger(ns);
  const numToBuy: number    = numServers ? numServers : ns.getPurchasedServerLimit();
  const playerMoney: number = ns.getServerMoneyAvailable("home");

  // we can only buy server RAM in powers of 2, or 2^n
  const starterRamExponent: number = 1;

  return recurseRamCost(starterRamExponent);

  function recurseRamCost(ramExponent: number) {
    const ram = Math.pow(2, ramExponent);
    logger.log(`Checking cost for ${numToBuy} servers with ${ram} RAM..`)

    const cost = ns.getPurchasedServerCost(ram);
    const totalCost = cost * numToBuy;

    logger.log(`Costs ${formatDollar(totalCost)}`),1

    if (totalCost <= playerMoney) {
      logger.log(`Can afford ${ram}!`,1);
      return recurseRamCost(ramExponent + 1);
    } else {
      const maxRam = Math.pow(2, ramExponent-1);
      logger.log(`Found max: ${maxRam}`);
      return maxRam;
    }
  }
}

export async function getServerPaths(ns: NS) {
  // Ongoing set of already-scanned servers
  const scannedServers = new Set();
  const rootedServers: string[] = [];

  ns.tprint(`Getting server paths...`);

  if (ns.fileExists('server-paths.txt', 'home')) { ns.rm('server-paths.txt', 'home'); }
  ns.write('server-paths.txt', ns.getServer().hostname + "\r\n", "w");
  await scanServer(ns.getServer(), 1);

  return rootedServers;

  /**
   * Recursively scans servers and performs operations on them
   * @param {string} server - The current server to scan
   */
  async function scanServer(server: Server, indent: number) {
    // If the server has already been scanned, skip it
    if (scannedServers.has(server.hostname)) {
      return;
    }

    let tab: string = "";
    for (let i = 0; i < indent; i++) {
      tab = tab + "  ";
    }
    ns.write('server-paths.txt', tab + server.hostname + "\r\n", "a");

    // Mark the server as scanned
    scannedServers.add(server.hostname);

    // Get connected servers
    const connectedServers = ns.scan(server.hostname);

    // Loop through each connected server
    for (let i = 0; i < connectedServers.length; i++) {
      const connectedServer: Server = ns.getServer(connectedServers[i]);

      // Recursively scan the connected server
      await scanServer(connectedServer, indent+1);
    }
  }

}

/**
 * Retrieves the process IDs (PIDs) of specified scripts running on the target server.
 * @param {NS} ns - The NS object.
 * @param {string} targetServer - The target server to check for running scripts.
 * @param {string[]} scripts - An array of script names to look for.
 * @returns {Promise<number[]>} - An array of PIDs of the specified scripts running on the target server.
 */
export async function getScriptPIDS(ns: NS, targetServer: string, scripts: string[]) {
  const processes = ns.ps(targetServer);
  const scriptPIDs: number[] = [];

  for (const scriptName of scripts) {
      const pids = processes
          .filter(process => process.filename === scriptName)
          .map(process => process.pid);

      scriptPIDs.push(...pids);
  }

  return scriptPIDs;
}

/**
 * Waits for the specified scripts (by PIDs) to finish execution, with a customizable delay between checks.
 * @param {NS} ns - The NS object.
 * @param {number[]} pids - An array of process IDs (PIDs) to wait for.
 * @param {number} [delay=500] - Optional delay in milliseconds between each check (default is 500 ms).
 */
export async function waitForScriptsToFinish(ns: NS, pids: number[], delay: number = 500) {
  const logger = new Logger(ns);
  while (pids.some(pid => ns.isRunning(pid))) {
    await ns.sleep(delay); // Check every half second
  }
  //logger.log(`Done waiting for pids: ${pids.join(', ')}`);
}




export interface Process {
  pid: number,
  name: string,
  args: string[],
  threads: number
}