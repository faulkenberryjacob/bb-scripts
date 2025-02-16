export async function main(ns: NS) {
  const ownedServers = ns.getPurchasedServers();
  for (let i = 0; i < ownedServers.length; i++) {
    ns.tprint("Terminating " + ownedServers[i]);
    ns.killall(ownedServers[i]);
    ns.deleteServer(ownedServers[i]);
    ns.tprint("\tDone!");
  }
}