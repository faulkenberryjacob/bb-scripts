
export async function main(ns: NS) {
  // Defines the "target server"
  const TARGET_HOSTNAME = ns.args[0].toString();

  const MONEY_THRESHOLD     = 0.80;
  const SECURITY_THRESHOLD  = 1.15;

  ns.disableLog("ALL");

  // check if we can hack
  const hackingLevel: number          = ns.getHackingLevel();
  const requiredHackingLevel: number  = ns.getServerRequiredHackingLevel(TARGET_HOSTNAME);
  ns.print("Hacking: " + hackingLevel + "/" + requiredHackingLevel);

  // Define static thresholds
  const moneyThresh = ns.getServerMaxMoney(TARGET_HOSTNAME);
  if (moneyThresh <= 0) { return; }
  const acceptableMoney = moneyThresh * MONEY_THRESHOLD;

  const securityThresh = ns.getServerMinSecurityLevel(TARGET_HOSTNAME);
  const acceptableSecurity = securityThresh * SECURITY_THRESHOLD;

  // Infinite loop that continously hacks/grows/weakens the target server
  // If we don't have the required hacking, sleep
  while (true) {
    const securityLevel: number  = ns.getServerSecurityLevel(TARGET_HOSTNAME);
    const moneyAvailable: number = ns.getServerMoneyAvailable(TARGET_HOSTNAME);
    ns.print("Security: " + securityLevel.toString() + "/" + securityThresh + ". Acceptable is " + acceptableSecurity);
    ns.print("Money: " + moneyAvailable.toString() + "/" + moneyThresh + ". Acceptable is " + acceptableMoney);
    
    if (securityLevel > acceptableSecurity) {
      ns.print("  Weakening..");
      await ns.weaken(TARGET_HOSTNAME);
    } 
    else if (moneyAvailable < acceptableMoney) { 
      ns.print("  Growing..");
      await ns.grow(TARGET_HOSTNAME);
    } 
    else { 
      ns.print("  Hacking..");
      await ns.hack(TARGET_HOSTNAME);
    }
  }
}

