const CONFIG_FILE: string = 'config.json';

/**
 * Loads the configuration data from the specified configuration file.
 * @param {NS} ns - The NS object.
 * @returns {object} - The parsed configuration data.
 */
export function loadConfig(ns: NS) {
    return JSON.parse(ns.read(CONFIG_FILE));
  }

  
export function getConfigName() {
return CONFIG_FILE;
}

export function canCrackSSH(ns: NS) {
  return ns.fileExists("BruteSSH.exe", "home");
}

export function canCrackFTP(ns: NS) {
  return ns.fileExists("FTPCrack.exe", "home");
}

export function canCrackSMTP(ns: NS) {
  return ns.fileExists("relaySMTP.exe", "home");
}

export function canCrackHTTP(ns: NS) {
  return ns.fileExists("HTTPWorm.exe", "home");
}

export function canCrackSQL(ns: NS) {
  return ns.fileExists("SQLInject.exe", "home");
}

export function getPortsCanCrack(ns: NS) {
  let counter: number = 0;
  counter += canCrackSSH(ns)  ? 1 : 0;
  counter += canCrackFTP(ns)  ? 1 : 0;
  counter += canCrackSMTP(ns) ? 1 : 0;
  counter += canCrackHTTP(ns) ? 1 : 0;
  counter += canCrackSQL(ns)  ? 1 : 0;

  return counter;
}