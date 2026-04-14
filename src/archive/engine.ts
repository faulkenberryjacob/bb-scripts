import { Logger } from '@/lib/logger';
import { LogLevel } from '@/lib/types';
import { isRunningIgnoreArgs } from '@/lib/system';
import { Server } from 'NetscriptDefinitions';
import { buildServerDB, getServerData, readDB, getServersWithNoBackdoor } from '@/lib/db';
import { getOwnedServers } from '../servers/home/utils';
import { canCrackFTP, canCrackHTTP, canCrackSMTP, canCrackSQL, canCrackSSH, getPurchasedServerNames, hasSingularity } from '@/lib/defaults';
import * as consts from '@/lib/constants';
import { formatDollar } from '@/lib/formatter';
import { isPrepPossible } from '@/lib/hack-algorithm';
import { getTopServerByMoneyPerSecond } from '@/lib/calc';
import * as progression from '@/lib/progression';

export async function main(ns: NS) {
  ns.disableLog("ALL");

  const logger = new Logger(ns);
  const scriptName: string = ns.getScriptName();

  let servers: string[] = [];
  let serverCheck: string[] = [];

  buildServerDB(ns);

  // grab all the hostnames of our DB servers that we have admin rights on to populate our ongoing 'tracker' of servers
  servers = (readDB(ns)).filter(server => server.hasAdminRights == true).map(server => server.hostname);
  const pollingRate: number = 5000 // in milliseconds
  const parasiteInterval = 1000 * 60 * 30; // 30 minutes
  const progInterval = 1000 * 60 * 1; // 1 minutes
  let parasiteCounter = -1;
  let progCounter = -1;


  try {
    while (true) {

      // Recurse through and root all servers that we can, ignoring owned servers
      logger.info("Rooting servers..");
      rootServers(ns);

      // Build the DB for cheap server data
      logger.info("Building DB..");
      buildServerDB(ns);

      // Check available funds for purchasing servers. Try to fill out the limit before upgrading servers
      logger.info(`Upgrading servers..`)
      spinUpServers(ns);

      // Run parasite on all servers we own every 30 minutes
      if (parasiteCounter >= parasiteInterval || parasiteCounter == -1) {
        parasiteCounter = 0;
        runParasite(ns);
        runGo(ns);
        //runGang(ns);
      }

      // Check on possible progressions every 1 minute
      if (progCounter >= progInterval || progCounter == -1) {
        progCounter = 0;
        logger.info(`Checking progressions..`);
        progression.main(ns);
      }

      await ns.sleep(pollingRate);
      parasiteCounter += pollingRate;
      progCounter += pollingRate;

      // check for any new rooted servers
      serverCheck = (readDB(ns)).filter(server => server.hasAdminRights == true).map(server => server.hostname);
      const differences: string[] = serverCheck.filter(server => !servers.includes(server));
      for (const newServer of differences) {
        logger.info(`New server rooted: ${newServer}!`, 0, undefined, true);
      }

      // Startup backdoor script to run through new servers
      logger.info("Backdooring servers..");
      runBackdoor(ns);

      servers = serverCheck;
    }
  } catch (error) {
    logger.error(`ERROR -- ${scriptName} DIED -- `);
    logger.error(`Error: ${error}`);
  }
  logger.error(`ERROR -- ${scriptName} DIED --`)

  //logger.info(`Attempting to respawn engine..`, 0, true);
  //ns.spawn("engine.js", 500);
}


/* ------------------------------------------------------------------------------------------------------------------- */
/* --------------------- FUNCTION DEFINITIONS ------------------------------------------------------------------------ */
/* ------------------------------------------------------------------------------------------------------------------- */

function runGo(ns: NS): void {
  const logger = new Logger(ns);
  logger.info(`Starting GO script..`, 0, undefined, true);
  const goArgs = ["Netburners", "7"];
  ns.exec(`go.js`, `home`, 1, ...goArgs);
}

function runBackdoor(ns: NS) {
  const logger = new Logger(ns, LogLevel.DEBUG);

  if (isRunningIgnoreArgs(ns, consts.BACKDOOR_SCRIPT, `home`)) {
    logger.debug(`${consts.BACKDOOR_SCRIPT} is already running. Skipping`);
    return;
  }

  const backdoorServers = getServersWithNoBackdoor(ns);
  const backdoorArgs = backdoorServers.join(',');

  if (backdoorArgs && backdoorArgs.length > 0) {
    logger.debug(`Found ${backdoorServers.length} servers to backdoor. Starting script..`, 1);
    const bdPid = ns.exec(consts.BACKDOOR_SCRIPT, `home`, 1, backdoorArgs);
    //ns.ui.openTail(bdPid);
  } else {
    logger.debug(`No servers require a backdoor. Skipping`, 1);
  }
}

function runGang(ns: NS) {
  const logger = new Logger(ns);
  logger.info(`Starting Gang script..`, 0,undefined,  true);
  if (!ns.isRunning(consts.GANG_SCRIPT, `home`)) {
    ns.exec(consts.GANG_SCRIPT, `home`, 1);
  }
}

function runParasite(ns: NS): number {
  const logger = new Logger(ns);

  // check if we own any purchased servers
  const ownedServers: string[] = ns.getPurchasedServers();
  const reqMem: number = ns.getScriptRam(`controller.js`) * 2;
  const topServer: string = (getTopServerByMoneyPerSecond(ns))[0];
  //const freeHomeRam: number = ns.getServerMaxRam("home")[0] - ns.getServerUsedRam("home")[1];
  const freeHomeRam: number = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  logger.debug(`Required ram: ${reqMem}`);

  let returnCode = 0;

  if (ownedServers.length > 0 && ns.getServerMaxRam(ownedServers[0]) >= reqMem) {
    // since we own servers with enough RAM, let's run parasite on them
    logger.info(`We own ${ownedServers.length} servers. Running parasite auto..`);
    returnCode = ns.exec(`parasite.js`, `home`, 1, `auto`);
  } else if (isPrepPossible(ns, topServer, freeHomeRam)) {
    // if we don't own any servers or have enough RAM, run parasite on the home server
    logger.info(`We don't own any servers or they don't have enough ram. Running parasite on home..`);
    ns.killall("home", true);
    returnCode = ns.exec(`parasite.js`, `home`, 1, `home`);
  } else {
    logger.info(`Not enough home RAM. Running parasite starter..`);
    returnCode = ns.exec(`parasite.js`, `home`, 1, `starter`);
  }

  logger.info('Running [parasite.js share]..', 0, undefined, true);
  ns.exec(`parasite.js`, `home`, 1, `share`);
  return returnCode;
}

/**
 * Recursively scans and roots servers starting from a given server or the "home" server by default.
 * @param {NS} ns - The Netscript context.
 * @param {string} [startServer="home"] - The hostname to start the scan from. Defaults to "home".
 * @returns {string[]} - A promise that resolves to a list of rooted server hostnames.
 */
function rootServers(ns: NS, startServer: string = "home") {
  // Ongoing set of already-scanned servers
  const logger = new Logger(ns);
  const scannedServers = new Set();
  const rootedServers: string[] = [];
  const ownedServers: string[] = getOwnedServers(ns);

  logger.info(`Rooting servers..`);

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

    logger.debug(`Scanning ${server}..`);

    // Mark the server as scanned
    scannedServers.add(server);

    if (!ownedServers.includes(server)) {
      const rootServerReturn = rootServer(ns, server);
      if (rootServerReturn) {
        rootedServers.push(rootServerReturn);
      }
    } else {
      logger.debug(`Skipping ${server} because we own it`, 2);
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
 * @returns {string | undefined} - Returns the server hostname if successfully rooted, otherwise undefined.
 */
function rootServer(ns: NS, server: string) {
  const logger = new Logger(ns);
  const serverData: Server = getServerData(ns, server) as Server;

  logger.debug("Checking server: " + server + "...", 1);

  let isScriptable: boolean = false;


  logger.debug(`Checking hack level..`, 2);
  if (ns.getHackingLevel() < ns.getServerRequiredHackingLevel(server)) {
    logger.debug("Hacking skill is too low, skipping", 3);
    return;
  }
  logger.debug(`It's hackable!`, 2);

  // Root server if we don't have admin rights
  logger.debug(`Checking for admin rights..`, 2)

  if (!ns.hasRootAccess(server)) {
    logger.debug("No admin rights. Cracking..", 3)
    if (openPorts(server)) {
      ns.nuke(server);
      logger.debug(`Ports opened and nuked!`, 3);
      isScriptable = true;
    }
  } else {
    logger.debug(`We have admin rights!`, 3);
    isScriptable = true;
  }

  if (!isScriptable) { return; }

  return server;

  /**
   * Attempts to open the required number of ports on a server.
   * @param {NS} ns - The NS object.
   * @param {Server} server - The server object to open ports on.
   */
  function openPorts(server: string) {
    logger.info("Cracking open ports..", 2);


    // Check how many ports are required vs. opened

    let numRequiredPorts: number = ns.getServerNumPortsRequired(server);
    let numOpenPorts: number = serverData?.openPortCount ?? 0;

    // if (numOpenPorts == -1) {
    //   logger.warn(`Could not retrieve number of open ports for ${server} from DB, defaulting to 0..`, 3, true);
    //   return false;
    // }

    logger.debug(numOpenPorts.toString() + " / " + numRequiredPorts.toString() + " ports opened", 3);

    if (numRequiredPorts <= numOpenPorts) { return true; }

    // Open them puppies up
    let portsOpened = 0;
    if (!serverData.sshPortOpen && canCrackSSH(ns)) {
      ns.brutessh(server);
      portsOpened++;
    }
    if (!serverData.ftpPortOpen && canCrackFTP(ns)) {
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
    if (!serverData.sqlPortOpen && canCrackSQL(ns)) {
      ns.sqlinject(server);
      portsOpened++;
    }
    return (numRequiredPorts <= portsOpened);
  }
}

/**
 * Spins up servers by purchasing or upgrading them based on the player's available money.
 * The function continues to purchase or upgrade servers until the player's money falls below a specified buffer.
 *
 * @param ns - The Netscript object providing access to game functions.
 */
function spinUpServers(ns: NS) {
  const logger = new Logger(ns);
  let playerMoney: number = ns.getServerMoneyAvailable("home");
  let canAfford: boolean = playerMoney > consts.MONEY_BUFFER;
  let lowMoney: boolean = playerMoney < consts.MONEY_THRESHOLD;

  const pServers = getPurchasedServerNames(ns);
  let ramExponent: number = 1;

  while (canAfford) {
    const desiredRam = Math.pow(2, ramExponent);
    const cost = ns.getPurchasedServerCost(desiredRam);
    if (playerMoney < cost) { return; }

    for (let i = 0; i < pServers.length; i++) {

      // if this server doesn't exist, purchase it
      if (!ns.serverExists(pServers[i])) {
        logger.info(`Purchasing server ${pServers[i]} with ${desiredRam}GB of RAM for ${formatDollar(ns, cost)}`, 0, undefined, true);
        ns.purchaseServer(pServers[i], desiredRam);
      } else {
        // if it already exists but with less ram, upgrade it
        if (ns.getServerMaxRam(pServers[i]) < desiredRam) {
          try {
            logger.info(`Upgrading server ${pServers[i]} to ${desiredRam}GB of RAM for ${formatDollar(ns, cost)}`, 0, undefined, true);
            ns.upgradePurchasedServer(pServers[i], desiredRam);
          } catch (error) {
            logger.error(`Error upgrading server ${pServers[i]}: ${error}`);
          }
        }
      }

      // check if we've gone below our money threshold or cannot afford any more costs
      playerMoney = ns.getServerMoneyAvailable("home");
      canAfford = playerMoney > cost;
      lowMoney = playerMoney < consts.MONEY_THRESHOLD;

      if (!canAfford || lowMoney) { return; }
    }

    if (desiredRam >= ns.getPurchasedServerMaxRam()) { return; }
    ramExponent++;
  }
}