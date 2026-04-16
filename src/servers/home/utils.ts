import { formatDollar, formatTime } from '@/lib/formatter';
import { Logger } from '@/lib/logger';
import { buildServerDB, getServerData, readDB } from '@/lib/db';
import { Server } from 'NetscriptDefinitions';
import { determineFactionFavorGained, determinePurchaseServerMaxRam, getTopServerByMoneyPerSecond } from '@/lib/calc';
import { ServerData } from '@/lib/types';
import { HackAlgorithm } from '@/lib/hack-algorithm';

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
      printServerData(ns, ns.args[1].toString());
      break;
    case "maxram":
      ns.tprint(`Max ram you can purchase per server:  ${determinePurchaseServerMaxRam(ns)}`);
      break;
    case "getserverpaths":
      ns.tprint(`Getting server paths from home`);
      getServerPaths(ns);
      break;
    case "top":
      ns.tprint(`Showing top ${ns.getPurchasedServerLimit()} servers:`);
      showTopServers(ns);
      break;
    case "killall":
      ns.tprint("Kill all scripts on servers");
      killAll(ns);
      break;
    case "dryrun":
      if (ns.args[1] && ns.args[2]) {
        const target: string = ns.args[1].toString();
        const host: string = ns.args[2].toString();

        ns.tprint(`Prep algorithm for ${target} on ${host}`);
        new HackAlgorithm(ns, target, ns.getServerMaxRam(target)-ns.getServerUsedRam(target), 1).printPrepAlgorithm(ns);

        ns.tprint(`Hack algorithm for ${target} on ${host}`);
        new HackAlgorithm(ns, target, ns.getServerMaxRam(target)-ns.getServerUsedRam(target), 1).printHackAlgorithm(ns);
      } else {
        ns.tprint(`Usage: utils.js dryrun [target] [host]`);
      }
      break;
    case "reptodonate":
      if (ns.args[1]) {
        determineFactionFavorGained(ns, ns.args[1].toString());
      } else {
        ns.tprint(`Usage: utils.js repToDonate [faction]`);
      }
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

        dryRun [target] [host]      Prints out the prep and hack algorithms for [target] on [host]

        repToDonate [faction]       Determines the reputation required to donate to
                                    [faction] and logs the required reputation
        `);
      break;
  }
}

/**
 * Prints the data of a specified server from the database.
 * @param {NS} ns - The Netscript context.
 * @param {string} target - The hostname of the server to print data for.
 * @returns {void}
 */
export function printServerData(ns: NS, target: string) {
  const logger = new Logger(ns);
  const db: Map<string, ServerData> = readDB(ns);
  const foundServer = db.get(target);

  if (foundServer) {
    let topBanner: string = `┌ ${foundServer.hostname} `;
    topBanner += `─`.repeat(50 - topBanner.length);
    let bottomBanner = `─`.repeat(49);
    
    const msg =    `
    ${topBanner}
    | Admin Rights: ${foundServer.hasAdminRights}
    | Owner:        ${foundServer.purchasedByPlayer ? `You` : foundServer.organizationName}
    | RAM:          ${foundServer.ramUsed} / ${foundServer.maxRam} GB
    | Money:        ${formatDollar(ns, foundServer.moneyAvailable ?? 0)} / ${formatDollar(ns, foundServer.moneyMax ?? 0)}
    | Security:     ${foundServer.hackDifficulty} / ${foundServer.minDifficulty} (min)
    | Ports open:   ${foundServer.openPortCount} / ${foundServer.numOpenPortsRequired}
    | Backdoor:     ${foundServer.backdoorInstalled}
    | RAM for Hack: ${foundServer.minRamForHack ?? `?`}
    | RAM for Prep: ${foundServer.minRamForPrep ?? `?`}
    └${bottomBanner}
    `
    logger.info(msg, 0, undefined, true); 
  }
  else { logger.warn("Server not found.", 0, true); }
}

/**
 * Terminates all running scripts on all servers except the home server.
 *
 * @param ns - The Netscript object provided by Bitburner.
 */
export function killAll(ns: NS) {
  const db = readDB(ns);

  for (const server of db.values()) {
    //if (server.hostname != "home") { ns.killall(server.hostname); }
    ns.killall(server.hostname);
  }
}

/**
 * Displays the top servers based on money earned per second.
 *
 * This function retrieves the top servers by money per second and prints
 * detailed information about each server, including maximum money, hack time,
 * grow time, weaken time, cycle time, hack chance, and calculated money per second.
 *
 * @param ns - The Netscript object providing access to game functions.
 * @returns A promise that resolves when the function completes.
 */
export function showTopServers(ns: NS) {
  const topServers = getTopServerByMoneyPerSecond(ns);
  const purchasedServerLimit = ns.getPurchasedServerLimit();
  const ceiling = Math.min(topServers.length, purchasedServerLimit);
  for (let i = 0; i < ceiling; i++) {
    const maxMoney = ns.getServerMaxMoney(topServers[i]);
    const hackTime = ns.getHackTime(topServers[i]);
    const growTime = ns.getGrowTime(topServers[i]);
    const weakTime = ns.getWeakenTime(topServers[i]);
    const cycleTime = Math.max(hackTime, growTime, weakTime);
    const moneyPerSecond = parseFloat((maxMoney / (cycleTime / 1000)).toFixed(2));
    const hackChance = parseFloat((ns.hackAnalyzeChance(topServers[i]) * 100).toFixed(2));
    const calcMoneyPerSecond = ns.hackAnalyzeChance(topServers[i]) * moneyPerSecond;
    ns.tprint(`${i + 1}: ${topServers[i]} has ${formatDollar(ns, maxMoney)} max money with ${hackChance}% hack chance. Cycle time is ${formatTime(cycleTime)}. Will earn ${formatDollar(ns, calcMoneyPerSecond)} per second.`);
  }
}


/**
 * Removes specified files from a given server.
 *
 * @param ns - The Netscript environment.
 * @param files - An array of filenames to be removed from the server.
 * @param server - The name of the server from which to remove the files.
 * @returns A promise that resolves to a boolean indicating whether all specified files were successfully deleted.
 *
 * @remarks
 * If the server is "home", the function will log a message and abort without deleting any files.
 * The function logs the deletion process and any failures encountered.
 */
export function removeFilesFromServer(ns: NS, files: string[], server: string) {
  const logger = new Logger(ns);
  if (server == "home") {
    logger.warn("We're not deleting files off home. Aborting");
    return 2;
  }

  let allFiles = ns.ls(server);
  let allFilesDeleted: boolean = true;

  for (const file of allFiles) {
    if (files.includes(file)) {
      logger.debug(`Deleting ${file}...`);
      if (!ns.rm(file, server)) {
        logger.warn(`Could not delete ${file}`);
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
 * @returns {number} - Returns 2 if aborting deletion on "home", otherwise returns 0.
 */
export function deleteAllFilesOnServer(ns: NS, server: string, fileExtension?: string) {
  const logger = new Logger(ns);
  if (server == "home") {
    logger.warn("We're not deleting files off home. Aborting");
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
 * @returns {boolean} - True if any of the specified scripts are running, false otherwise.
 */
export function checkIfScriptsAlreadyRunning(ns: NS, scripts: string[], targetServer: string) {
  // Get all the running scripts on the server
  const runningScripts = ns.ps(targetServer);
  let scriptsStillRunning: boolean = false;

  const logger = new Logger(ns);

  logger.info("Checking if " + scripts.join(', ') + " are still running..");
  for (const script of runningScripts) {
    if (scripts.includes(script.filename)) {
      scriptsStillRunning = true;
    }
  }
  logger.info("Done! stillRunning: " + scriptsStillRunning);

  return scriptsStillRunning;
}

/**
 * Kills specified scripts running on the target server and confirms that they have been terminated.
 * @param {NS} ns - The NS object.
 * @param {string[]} scripts - An array of script names to kill.
 * @param {string} targetServer - The target server where the scripts are running.
 * @returns {boolean} - True if all specified scripts are killed, false otherwise.
 */
export function killScripts(ns: NS, scripts: string[], targetServer: string) {
  // Get all the running scripts on the server
  const runningScripts = ns.ps(targetServer);

  const logger = new Logger(ns);

  // Iterate through and kill them
  logger.info("Killing scripts..");
  for (const script of runningScripts) {
    if (scripts.includes(script.filename)) {
      ns.kill(script.filename, targetServer, ...script.args);
      logger.debug("  Killed " + script.filename + " on " + targetServer);
    }
  }
  logger.info("Done killing scripts!", 1);

  // confirm scripts are all dead
  return !checkIfScriptsAlreadyRunning(ns, scripts, targetServer);
}


/**
 * hronously retrieves the paths of all servers in the network and writes them to a file.
 * 
 * This function scans all servers starting from the home server, records their paths in a file,
 * and returns a list of rooted servers. It avoids scanning the same server multiple times by 
 * keeping track of already-scanned servers.
 * 
 * @param {NS} ns - The Netscript object providing access to game functions.
 * @returns {string[]} - A promise that resolves to an array of rooted server hostnames.
 */
export function getServerPaths(ns: NS) {
  // Ongoing set of already-scanned servers
  const scannedServers = new Set();
  const rootedServers: string[] = [];

  ns.tprint(`Getting server paths...`);

  if (ns.fileExists('server-paths.txt', 'home')) { ns.rm('server-paths.txt', 'home'); }
  ns.write('server-paths.txt', ns.getServer().hostname + "\r\n", "w");
  scanServer(ns.getServer(), 1);

  return rootedServers;

  /**
   * Recursively scans servers and performs operations on them
   * @param {string} server - The current server to scan
   */
  function scanServer(server: Server, indent: number) {
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
      scanServer(connectedServer, indent + 1);
    }
  }

}