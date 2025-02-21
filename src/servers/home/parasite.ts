import { formatDollar } from '@/lib/formatter'
import { Logger } from '@/lib/logger';
import { deleteAllFilesOnServer, getUtilsName, rootServer, rootServers } from './utils';
import { buildServerDB, getHackableServers, getTopServerWithMaxMoney, getServerData } from '@/lib/db';
import { calculateMaxThreadsForScript, determinePurchaseServerMaxRam, getTopServerByMoneyPerSecond } from '@/lib/calc';
import * as consts from '@/lib/constants';

/** @param {NS} ns */
export async function main(ns: NS) {
  const CURRENT_SERVER = ns.getServer();

  const logger = new Logger(ns);
  ns.disableLog("ALL");

  // parsing arguments
  switch (ns.args[0]) {
    case "top":
      // automatically find max money server
      await parasiteMoney();
      break;
    case "target":
      // target a particular server
      const targetServer: string = ns.args[1].toString() ?? "";
      if (targetServer == "") {
        ns.tprint("No target was given for -t");
        break;
      }
      await parasiteTarget(targetServer);

      break;
    case "share":
      // share all other server space
      await parasiteStarter(consts.SHARE_LOOP_SCRIPT);
      break;
    case "starter":
      // do basic hacking command
      await parasiteStarter(consts.STARTER_HACK_SCRIPT);
      break;
    case "auto":
      // automatically target top N servers
      await parasiteAuto();
      break;
    case "home":
      // run top function on our home server
      await parasiteMoney(true);
      break;
    default:
      const help: string = "parasite [OPTIONS]"
        + "\r\n  auto \t\t\t Automatically find top servers to target"
        + "\r\n  target {server} \t Target a particular server"
        + "\r\n  starter \t\t Use basic hack scripts on hosts, assume no purchase power"
        + "\r\n  home \t\t\t Same as Top, but hosted entirely on the home server"
        + "\r\n  top \t\t\t Same as Target, but the most lucrative server"
        + "\r\n  share \t\t Put a looping share script on all unowned servers\r\n";
      ns.tprint(help);
      break;
  }
  return; 

// ----------------------------------------------------------------------------------------------------------------------
// --- FUNCTION DEFINITIONS ---------------------------------------------------------------------------------------------
// ----------------------------------------------------------------------------------------------------------------------

  /**
   * Automates the process of preparing and hacking servers by rooting all servers, building a server database, 
   * targeting the top servers, purchasing servers if needed, and deploying controller scripts.
   * @returns {Promise<number>} - Returns 0 upon successful execution.
   */
  async function parasiteAuto() {
    // Recurse through and try to root all possible servers
    await rootServers(ns);

    // Now let's build the JSON DB of all server information
    // (this is just in case it hasn't been done yet)
    await buildServerDB(ns);

    // get top servers by top money hacked per second * hackChance
    const topServers = await getTopServerByMoneyPerSecond(ns);

    logger.info(`Targeting top servers (${topServers.length}): ${topServers.join(', ')}`, 0, true);

    const successfulSpinUp: boolean = await spinUpServers(topServers.length);
    if (!successfulSpinUp) {
      logger.warn("Unable to get desired server amount. Have " + ns.getPurchasedServers().length.toString() + "/" + topServers.length.toString(), 1, true);
    } else {
      logger.info("We have enough servers! (" + ns.getPurchasedServers().length.toString() + ")", 1, true);
    }

    const filesToCopy: string[]    = [consts.CONTROLLER_SCRIPT, consts.WEAK_SCRIPT, consts.GROW_SCRIPT, 
                                      consts.HACK_SCRIPT, consts.HACK_ALGO_SCRIPT, consts.CONFIG, getUtilsName()];
    const argsForController: string[] = [];

    // assume this is trying to fill up ALL purchased servers
    const kickoffFailures: Set<string> = await kickoffControllers(topServers, filesToCopy, argsForController);
    if (kickoffFailures.size > 0) {
      logger.warn("WARNING: " + kickoffFailures.size.toString() + " controllers failed to kickoff.", 1, true);
      logger.warn(Array.from(kickoffFailures).join(", "), 2, true);
    } else {
      logger.info("All controllers kicked off successfully!", 1, true);
    }

    return 0;
  }

  /**
   * Initializes the parasite scripts by rooting all possible servers, building the server database, and deploying the starter hack script to all hackable servers.
   * @returns {Promise<number>} - Returns 0 upon successful execution.
   */
  async function parasiteStarter(script: string) {
    // Recurse through and try to root all possible servers
    await rootServers(ns);

    // Now let's build the JSON DB of all server information
    // (this is just in case it hasn't been done yet)
    await buildServerDB(ns);

    // What are all the servers we can hack?
    const hackableServers: string[] = await getHackableServers(ns);

    // scp and kickoff starter script
    for (const server of hackableServers) {
      if (server != "home") {
        const idealThreads: number = await calculateMaxThreadsForScript(ns, script, server);
        if (idealThreads <= 0 ) {
          logger.info(`No available threads on ${server}, skipping..`);
          continue;
        }
        ns.killall(server);
        await deleteAllFilesOnServer(ns, server);
        ns.scp(script, server);
        ns.exec(script, server, idealThreads, server);
      }
    }

    return 0;
  }

  /**
   * Attempts to gain access to the target server and deploys a script if successful.
   * @param {string} host - The hostname of the target server.
   * @returns {Promise<number>} - Returns 0 if successful, otherwise returns 2.
   */
  async function parasiteHome(host: string) {
    const target = await getServerData(ns, host);
    if (!target) {
      logger.error(host + " is not found in serverDB!", 1);
      return 2;
    }
    logger.info(host + " found!", 1, true);

    if (!(await rootServer(ns, target.hostname))) {
      logger.warn("Server is not scriptable, aborting.", 1, true);
      return 2;
    }
    logger.info(host + " is scriptable!", 1, true);

    if (ns.exec(consts.CONTROLLER_SCRIPT, "home", 1, host) == 0) {
        logger.error("Could not start " + consts.CONTROLLER_SCRIPT + " on home", 3);
        return 2;
    }

    return 0;
  }

  /**
   * Targets the server with the maximum money and either runs parasiteHome or parasiteTarget based on the onHome flag.
   * @param {boolean} [onHome=false] - Flag to determine whether to run the parasiteHome function or parasiteTarget function.
   * @returns {Promise<number>} - Returns the result of parasiteHome or parasiteTarget function.
   */
  async function parasiteMoney(onHome: boolean = false) {
    const topServers: string[] = await getTopServerByMoneyPerSecond(ns);
    const bigMoneyTarget: string = topServers.length > 0 ? topServers[0] : "";
    if (!bigMoneyTarget || bigMoneyTarget == "") {
      logger.warn("No servers found!", 1, true);
      return 2;
    }
    if (onHome) {
      return await parasiteHome(bigMoneyTarget);
    } else {
      return await parasiteTarget(bigMoneyTarget);
    }
  }


  /**
   * Targets a specific server by rooting it, ensuring enough servers are available, and deploying controller scripts.
   * @param {string} host - The hostname of the target server.
   * @returns {Promise<number>} - Returns 0 if successful, otherwise returns 2.
   */
  async function parasiteTarget(host: string) {
    const target = await getServerData(ns, host);
    if (!target) {
      logger.warn(host + " is not found in serverDB!", 1, true);
      return 2;
    }
    logger.info(host + " found!", 1, true);

    if (!(await rootServer(ns, target.hostname))) {
      logger.warn("Server is not scriptable, aborting.", 1, true);
      return 2;
    }
    logger.info(host + " is scriptable!", 1, true);

    const desiredServerAmount: number = 1;

    if (!await spinUpServers(desiredServerAmount)) {
      logger.warn("Unable to get desired server amount. Have " + ns.getPurchasedServers().length.toString() + "/" + desiredServerAmount.toString(), 1);
    } else {
      logger.info("We have enough servers! (" + ns.getPurchasedServers().length.toString() + ")", 1, true);
    }

    const targetArray: string[]    = [target.hostname];
    const filesToCopy: string[]    = [consts.CONTROLLER_SCRIPT, consts.WEAK_SCRIPT, consts.GROW_SCRIPT, 
                                      consts.HACK_SCRIPT, consts.HACK_ALGO_SCRIPT, consts.CONFIG, await getUtilsName()];
    const argsForController: string[] = [];

    // assume this is trying to fill up ALL purchased servers
    const kickoffFailures: Set<string> = await kickoffControllers(targetArray, filesToCopy, argsForController);
    if (kickoffFailures.size > 0) {
      logger.warn(kickoffFailures.size.toString() + " factories failed to kickoff.", 1, true);
      logger.warn(Array.from(kickoffFailures).join(", "), 2, true);
    } else {
      logger.info("All factories kicked off successfully!", 1, true);
    }

    return 0;
  }


  /**
   * Purchases and sets up the specified number of servers, ensuring the total does not exceed the server limit.
   * @param {number} serverAmount - The desired number of servers to spin up.
   * @returns {Promise<boolean>} - Returns true if the desired number of servers are successfully purchased and set up, otherwise returns false.
   */
  async function spinUpServers(serverAmount: number) {
    // Check if we have as many servers as can hack
    let purchasedServers = ns.getPurchasedServers().sort();
    const serverLimit = ns.getPurchasedServerLimit();
    const serverCeiling = serverAmount <= serverLimit ? serverAmount : serverLimit;
    const requestedRam: number = determinePurchaseServerMaxRam(ns, serverCeiling);

    const generatedServerNames: string[] = [];

    for (let i = 0; i < serverCeiling; i++) {
      const paddedNumber = String(i).padStart(2, '0');
      const newServerName = `${consts.SERVER_PURCHASE_NAME}-${paddedNumber}`;
      generatedServerNames.push(newServerName);
    }

    logger.info("Owned servers: " + purchasedServers.length + "/" + serverCeiling.toString(), 1, true);

    logger.info("Checking servers..", 1, true);

    for (let a = 0; a < serverCeiling; a++) {
      requestServer(generatedServerNames[a], requestedRam);
    }

    return ns.getPurchasedServers().length >= serverAmount;
  }


  /**
   * Spins up controller scripts on purchased servers, copies necessary files, and executes the controller script with specified targets.
   * 
   * @param {NS} ns - The Netscript context.
   * @param {string[]} targets - The list of target hostnames for the controller script.
   * @param {string[]} filesToCopy - The list of files to copy to each server.
   * @param {string[]} argsForController - The arguments to pass to the controller script.
   * @param {boolean} [fillServers=true] - Whether to fill all purchased servers or only use the number of targets.
   * @returns {Promise<Set<string>>} - A set of servers where the controller script failed to start.
   */
  async function kickoffControllers(targets: string[], filesToCopy: string[], argsForController: string[], fillServers: boolean = false) {
    // Begin spinning up factories and copying over necessary files
    const purchasedServers    = ns.getPurchasedServers().sort();
    const numPurchasedServers = purchasedServers.length;
    const maxFactories        = targets.length > numPurchasedServers ? numPurchasedServers : targets.length;

    const failedFactories: Set<string> = new Set();
    
    const deploymentNum = fillServers ? numPurchasedServers : maxFactories;
    
    for (let b = 0; b < deploymentNum; b++) {
      logger.debug(`Sending following files to ${purchasedServers[b]}: ${filesToCopy}`, 2)
      const distribute: number = b % targets.length;

      // kill all scripts then SCP over
      ns.killall(purchasedServers[b]);
      ns.scp(filesToCopy, purchasedServers[b], CURRENT_SERVER.hostname);
      if (ns.exec(consts.CONTROLLER_SCRIPT, purchasedServers[b], 1, targets[distribute]) == 0) {
        logger.error("Could not start " + consts.CONTROLLER_SCRIPT + " on " + purchasedServers[b], 3);
        failedFactories.add(purchasedServers[b]);
      }
      logger.info(`Controller on ${purchasedServers[b]} has been started targeting ${targets[distribute]}`, 2, true);
      await ns.sleep(30);
    }

    return failedFactories;
  }

  /**
   * Requests and purchases a server with the specified name and RAM.
   * @param {string} name - The desired name for the server.
   * @param {number} ram - The amount of RAM for the server.
   * @returns {boolean} - True if the server was successfully purchased, false otherwise.
   */
  function requestServer(name: string, ram: number) {
    logger.debug("Requesting server " + name + " with RAM " + ram.toString() + "...", 1);
    if (name == "") {
      logger.warn("Server is undefined, cannot request", 2, true);
      return false
    }
    const purchasedServers = ns.getPurchasedServers();

    // check if we have enough money
    const currentMoney: number = ns.getServerMoneyAvailable("home");
    const purchaseCost: number = ns.getPurchasedServerCost(ram);
    if (currentMoney < purchaseCost) {
      logger.warn(`Cannot afford ${name}. Cost: ${formatDollar(ns, purchaseCost)}`, 2, true);
      return false;
    }

    // check for already-purchased hostnames and upscale
    if (purchasedServers.includes(name)) { 
      if (ns.getServerMaxRam(name) < ram) {
        logger.info(`${name} already exists with less RAM. Upgrading to ${ram} RAM`, 2, true);
        ns.killall(name);
        return ns.upgradePurchasedServer(name, ram);
      } else {
        logger.info(`Already own ${name} with appropriate ram ${ram}, skipping`);
        return true;
      }
    }

    // check if we have enough server slots
    if ((ns.getPurchasedServerLimit() - purchasedServers.length) <= 0) {
      logger.info("Server limit size reached. Cannot request", 2, true);
      return false;
    }

    // otherwise, purchase it
    else {
      const newServerName: string = ns.purchaseServer(name, ram);
      logger.info("Purchasing server [" + newServerName + "] with RAM " + ram.toString() + " for $" + ns.formatNumber(purchaseCost), 2, true);
      return newServerName != "";
    }
  }

}

