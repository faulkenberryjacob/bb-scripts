import { Logger } from "./logger";
import { getOwnedServers, getServerData, readDB } from "@/lib/db";
import { getServersWithRoot } from "@/lib/db";
import { ScriptArg } from "NetscriptDefinitions";

/**
 * Kills any other script running with the same name, regardless of arguments.
 *
 * This function retrieves the list of all running scripts and kills any script
 * that has the same name as the current script.
 *
 * @param {NS} ns - The Netscript object.
 */
export function killOtherInstances(ns: NS) {
  const scriptName = ns.getScriptName();
  const runningScripts = ns.ps(ns.getHostname());

  for (const script of runningScripts) {
    if (script.filename === scriptName && script.pid !== ns.pid) {
      ns.kill(script.pid);
    }
  }
}

export function isRunningIgnoreArgs(ns: NS, script: string, host?: string) {
  const runningScripts = ns.ps(host);
  const isRunning: boolean = runningScripts.some(p => p.filename === script);

  return isRunning;
}


export function getServerPathToHome(ns: NS, server: string): string[] {
  const path = [server];
  while (server != 'home') {
    server = ns.scan(server)[0];
    path.unshift(server);
  }
  return path;
}

export function connectChainToServer(ns: NS, server: string) {
  const path: string[] = getServerPathToHome(ns, server);
  for (const host of path) {
    ns.singularity.connect(host);
  }
}

export function verifyScript(ns: NS, script: string, hostname?: string) {
  const logger = new Logger(ns);

  // Verify we have access to the script
  logger.debug(`Verifying ${script} exists${hostname ? ' on' + hostname : '.'}`);
  if (!ns.fileExists(script, hostname)) {
    logger.debug(`${script} file DOES NOT exist!`, 1);
    return false;
  }
  logger.debug(`${script} file exists!`, 1);

  // Verify the script isn't already running
  logger.debug(`Verifying ${script} isn't running${hostname ? ' on' + hostname : '.'}`);
  if (ns.isRunning(script, hostname)) {
    logger.debug(`${script} is already running!`);
    return false;
  } else {
    logger.debug(`${script} is NOT running`, 1);
  }

  return true;
}

export function getScriptName(path: string): string {
  return path.split("/").pop() || "";
}


/**
 * Orchestrates running a script across available servers
 * @param {NS} ns - The Netscript environment
 * @param {string} script - Path to the script to run
 * @param {number} [threads=1] - Number of threads to use
 * @param {string[]} [args=[]] - Arguments to pass to the script
 * @returns {number} Exit code (0 = success, 1 = execution failure, 2 = not enough space, 3 = script not found)
 */
export function orchestrateScript(ns: NS, script: string, threads: number = 1, args: ScriptArg[] = [], homeLocked: boolean = false): { code: number, pid: number, host: string } {
  const logger = new Logger(ns);

  // Validation checking on the script and parameters
  if (!ns.fileExists(script)) {
    logger.error(`${script} doesn't exist on ${ns.getHostname()}`);
    return { code: 3, pid: -1, host: "" };
  }

  if (script == "") {
    logger.error(`No proper script name was given!`);
    return { code: 3, pid: -1, host: "" };
  }

  if (threads < 1) {
    logger.error(`Was given ${threads} threads!`);
    return { code: 3, pid: -1, host: "" };
  }

  // Determine RAM required for script
  const reqRam: number = (ns.getScriptRam(script) * threads) * 2;

  // Set the targetServer to "home" if we set that flag, otherwise find the server with the most amount of ram
  let targetServer: string = "";
  if (homeLocked) {
    const homeRam = ns.getServerMaxRam(`home`) - ns.getServerUsedRam(`home`);
    if (homeRam > reqRam) {
      targetServer = "home";
    } else {
      logger.error(`Home is prioritized but there's not enough ram to run ${script} with ${threads} threads! Required: ${reqRam}, Available: ${homeRam}`);
      return { code: 1, pid: -1, host: "" };
    }
  } else {

    // Get all owned servers and their available space
    let ownedServers: string[] = [...new Set([...getServersWithRoot(ns), ...getOwnedServers(ns)])];

    const viableServers = ownedServers
      .filter(s => ns.getServerMaxRam(s) - ns.getServerUsedRam(s) > reqRam)
      .sort((a, b) => ns.getServerMaxRam(a) - ns.getServerUsedRam(b));

    if (!viableServers || viableServers.length <= 0) {
      logger.error(`No valid server space was found for ${script}, which utilizes ${reqRam} ram`);
      return { code: 2, pid: -1, host: "" };
    }

    // Prioritize "home" server if it's viable
    targetServer = viableServers.includes("home") ? "home" : viableServers[0];
  }

  // Attempt to scp and exec the script on the first available space
  const targetServerRam = ns.getServerMaxRam(targetServer) - ns.getServerUsedRam(targetServer);
  logger.info(`Attempting to run ${script} [${reqRam} GB] on ${targetServer} [${targetServerRam} GB free] with args [${args}]..`);
  if (!ns.fileExists(script, targetServer)) {
    ns.scp(script, targetServer);
  }


  const pid = ns.exec(script, targetServer, threads, ...args)
  if (pid == 0) {
    logger.error(`Failed to start ${script} [${reqRam} GB] with ${threads} threads on ${targetServer} [${targetServerRam} GB free]`);
    return { code: 1, pid: -1, host: targetServer };
  }

  return { code: 0, pid: pid, host: targetServer };
}

export function killOrchestratedScripts(ns: NS, scripts: { pid: number, host: string }[]) {
  const logger = new Logger(ns);

  if (!scripts || scripts.length <= 0) {
    logger.warn(`No scripts were given to kill!`);
    return false;
  }

  // Kill list of given scripts
  for (const s of scripts) {
    logger.debug(`Killing ${s.pid} on ${s.host}`);
    ns.scriptKill(s.pid.toString(), s.host);
  }

  // Verify all the given scripts are actually dead
  for (const s of scripts) {
    if (ns.isRunning(s.pid, s.host)) {
      logger.error(`Failed to kill ${s.pid} on ${s.host}`);
      return false;
    }
  }
  return true;
}

