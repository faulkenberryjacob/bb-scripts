import { Logger } from "@/lib/logger";
import * as consts from "@/lib/constants";
import { getRootedServersBySpace, getServersBySpace, simulatedServers } from "@/lib/system";

/** @param {NS} ns **/
export function main(ns: NS) {
  const logger = new Logger(ns);
  ns.disableLog("ALL");

  const grsbs = getRootedServersBySpace(ns);
  logger.info(`getRootedServersBySpace():
    ${JSON.stringify(grsbs)}`);


  const servers = simulatedServers(ns);
  logger.info(`simulatedServers():
    ${JSON.stringify(Object.fromEntries(servers), null, 2)}`);

  logger.info(`Testing simulatedServers sorting`);
  const reqRam = 10;
  const viableServers: string[] = Array.from(servers.entries())
    .filter(([host, free]) => free > reqRam)
    .map(([host, free]) => host);

  logger.info(`First choice is: ${viableServers[0]} with ${servers.get(viableServers[0]) as number} GB free`);
  logger.info(`Viable servers is:
    ${JSON.stringify(viableServers)}`);
}
