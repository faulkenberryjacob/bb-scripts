import { Logger } from "./logger";
import * as consts from "@/lib/constants";
import { getOwnedServers, getServerData, getServerDatasWithRoot, readDB } from "@/lib/db";
import { getServersWithRoot } from "@/lib/db";
import { ScriptArg } from "NetscriptDefinitions";
import { read } from "./cacheManager";
import { Plan } from "./types";

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
export function orchestrateScript(
  ns: NS,
  script: string,
  threads: number = 1,
  args: ScriptArg[] = [],
  homeLocked: boolean = false,
  dependencies: string[] = []): { code: number, pid: number, host: string } {
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
  const reqRam: number = (ns.getScriptRam(script) * threads);

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
    let ownedServers: string[] = [...new Set([...getServersWithRoot(ns)])];

    const viableServers = ownedServers
      .filter(s => getServerFreeSpace(ns, s) > reqRam)
      .sort((a, b) => getServerFreeSpace(ns, b) - getServerFreeSpace(ns, a));

    if (!viableServers || viableServers.length <= 0) {
      logger.error(`No valid server space was found for ${script}, which utilizes ${reqRam} ram`);
      return { code: 2, pid: -1, host: "" };
    }

    // Prioritize "home" server if it's viable
    targetServer = viableServers.includes("home") ? "home" : viableServers[0];
  }

  // Attempt to scp and exec the script on the first available space
  const targetServerRam = homeLocked ? ns.getServerMaxRam(`home`) - ns.getServerUsedRam(`home`) : getServerFreeSpace(ns, targetServer);
  logger.debug(`Attempting to run ${script} [${reqRam} GB] on ${targetServer} [${targetServerRam} GB free] with args [${args}]..`);
  if (!ns.fileExists(script, targetServer)) {
    ns.scp(script, targetServer);
  }

  if (dependencies.length > 0) {
    for (const d of dependencies) {
      const scpResult = ns.scp(d, targetServer, `home`);
      if (!scpResult) {
        logger.error(`Could not find dependency [${d}] for [${script}]! Aborting..`);
        return { code: 3, pid: -1, host: "" };
      }
    }
  }

  const pid = ns.exec(script, targetServer, threads, ...args)
  if (pid == 0) {
    logger.error(`Failed to start ${script} [${reqRam} GB] with ${threads} threads on ${targetServer} [${targetServerRam} GB free]`);
    return { code: 1, pid: -1, host: targetServer };
  } else {
    logger.debug(`Successfully started ${script} [${reqRam} GB] with ${threads} threads on ${targetServer} [${targetServerRam} GB free]`);
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

export function canWeDeploy(ns: NS,
  script: string,
  threads: number = 1,
  homeLocked: boolean = false): boolean {
  const logger = new Logger(ns);
  const servers: Map<string, number> = simulatedServers(ns);

  // Validation checking on the script and parameters
  if (script == "") {
    logger.error(`No proper script name was given!`);
    return false;
  }

  if (threads < 1) {
    logger.error(`Was given ${threads} threads!`);
    return false;
  }

  // Determine RAM required for script
  const reqRam: number = (ns.getScriptRam(script) * threads);

  // Set the targetServer to "home" if we set that flag, otherwise find the server with the most amount of ram
  let targetServer: string = "";
  if (homeLocked) {
    const homeRam = servers.get(`home`) as number;
    if (homeRam > reqRam) {
      targetServer = "home";
    } else {
      logger.warn(`Home is prioritized but there's not enough ram to run ${script} with ${threads} threads! Required: ${reqRam}, Available: ${homeRam}`);
      return false;
    }
  } else {

    const viableServers: string[] = Array.from(servers.entries())
      .filter(([host, free]) => free > reqRam)
      .map(([host, free]) => host);

    if (!viableServers || viableServers.length <= 0) {
      logger.warn(`No valid server space was found for ${script}, which utilizes ${reqRam} ram`);
      return false;
    }

    // Prioritize "home" server if it's viable
    targetServer = viableServers.includes("home") ? "home" : viableServers[0];
  }

  logger.debug(`Returning true! You can deploy to ${targetServer} which has ${getServerFreeSpace(ns, targetServer)} GB free`);

  return true;

}

export function canWeDeployPlan(ns: NS, plan: Plan[]): boolean {
  const logger = new Logger(ns);
  const servers: Map<string, number> = simulatedServers(ns);
  logger.debug(`Simulating deploying ${JSON.stringify(plan)}`);
  debugger;

  for (const p of plan) {
    // Validation checking on the script and parameters
    if (p.script == "") {
      logger.warn(`No proper script name was given!`);
      return false;
    }

    if (p.threads < 1) {
      logger.warn(`Was given ${p.threads} threads!`);
      return false;
    }

    // Determine RAM required for script
    const reqRam: number = (ns.getScriptRam(p.script) * p.threads);
    logger.debug(`${p.script} requires ${reqRam} GB RAM`,1);

    const viableServers: string[] = Array.from(servers.entries())
      .filter(([host, free]) => free > reqRam)
      .map(([host, free]) => host);

    logger.debug(`Found ${viableServers.length} viable servers`);

    if (!viableServers || viableServers.length <= 0) {
      logger.warn(`No valid server space was found for ${p.script}, which utilizes ${reqRam} ram`);
      return false;
    }

    // Prioritize "home" server if it's viable
    const targetServer = viableServers.includes("home") ? "home" : viableServers[0];
    const originalRam = servers.get(targetServer) as number;
    servers.set(targetServer, originalRam - reqRam);
    logger.debug(`${p.script} succeeded. Subtracting ${reqRam} from chosen host ${targetServer}`);
  }

  return true;
}

/**
 * Get free space of a server. If it's home, subtract our ram buffer from it.
 * 
 * @param ns 
 * @param target 
 * @returns 
 */
export function getServerFreeSpace(ns: NS, target: string): number {
  const freeSpace: number = Math.floor(ns.getServerMaxRam(target) - ns.getServerUsedRam(target));
  return target == `home` ? Math.max(freeSpace - consts.HOME_RAM_BUFFER, 0) : freeSpace;
}

export function simulatedServers(ns: NS): Map<string, number> {
  const simServers = new Map<string, number>();
  getRootedServersBySpace(ns).forEach(s => {
    if (s.free > 0) {
      simServers.set(s.host, s.free);
    }
  });
  return simServers;
  //return new Map(getRootedServersBySpace(ns).map(s => [s.host, s.free]));
}

export function getRootedServersBySpace(ns: NS): { host: string, free: number }[] {
  const servers = Array.from(getServerDatasWithRoot(ns).values())
    .map((s) => ({
      host: s.hostname,
      free: getServerFreeSpace(ns, s.hostname)
    }))
    .sort((a, b) => b.free - a.free);
  return servers;
}

export function getServersBySpace(ns: NS): { host: string, free: number }[] {
  const servers = Array.from(readDB(ns).values())
    .map((s) => ({
      host: s.hostname,
      free: getServerFreeSpace(ns, s.hostname)
    }))
    .sort((a, b) => b.free - a.free);
  return servers;
}

export function getFreeSpace(ns: NS): number {
  let freeSpace: number = 0;
  for (const s of readDB(ns).values()) {
    freeSpace += ns.getServerMaxRam(s.hostname) - ns.getServerUsedRam(s.hostname);
  }
  return freeSpace;
}

