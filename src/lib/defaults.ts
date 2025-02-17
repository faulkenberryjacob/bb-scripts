import * as consts from "./constants";

export function getPurchasedServerNames(ns: NS) {
  // generate a list of purchased server names
  const generatedServerNames: string[] = [];

  for (let i = 0; i < ns.getPurchasedServerLimit(); i++) {
    const paddedNumber = String(i).padStart(2, '0');
    const newServerName = `${consts.SERVER_PURCHASE_NAME}-${paddedNumber}`;
    generatedServerNames.push(newServerName);
  }

  return generatedServerNames;
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