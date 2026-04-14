import { Logger } from '@/lib/logger';
import { LogLevel } from '@/lib/types';
import { getServerData } from '@/lib/db';
import { hasSingularity } from '@/lib/defaults';
import { connectChainToServer } from '@/lib/system';

export async function main(ns: NS) {
  const logger = new Logger(ns, LogLevel.DEBUG);
  ns.disableLog("ALL");

  let servers: string[];

  if (ns.args && ns.args.length == 0) {
    logger.error(`No arguments passed to backdoor script. Exiting`);
    ns.exit();
  } else {
    const argString: string = ns.args[0] as string;
    servers = argString.split(',');
    logger.debug(`Backdoor script started with input: ${argString}`);
  }
  

  //for (const server of servers) {
  for (const s of servers) {
    logger.debug(`Backdooring ${s}..`);
    const serverData =  getServerData(ns, s);

    // Root server if we don't have admin rights
    logger.debug(`Checking for admin rights..`, 1)
    
    if (!ns.hasRootAccess(s)) {
      logger.debug("No admin rights. Skipping..", 2)
      continue;
    }

    // Backdoor the server
    const backdoorInstalled: boolean = serverData?.backdoorInstalled ?? true;
    if (!backdoorInstalled && hasSingularity(ns)) {
      logger.debug(`Executing backdoor on ${s}..`, 1, true);
      connectChainToServer(ns, s);
      await ns.singularity.installBackdoor();

      // Return home
      logger.debug("Done! Returning home..",2, true);
      ns.singularity.connect("home")    ;
    }
  }


}