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