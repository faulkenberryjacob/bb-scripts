export async function main(ns: NS) {
  const rawArg = ns.args[0];
  //const logger = new Logger(ns);

  let funcName: string;
  if (rawArg) {
    funcName = rawArg.toString().toLowerCase();
  } else {
    funcName = "";
  }
  

  switch (funcName) {
    // case "buildserverdb":
    //   await buildServerDB(ns);
    //   break;
    // case "printserverdata":
    //   await printServerData(ns, ns.args[1].toString());
    //   break;
    // case "dryrun":
    //   if (ns.args[1] && ns.args[2]) {
    //     //logger.tlog("Prep Algorithm:");
    //     await printPrepAlgorithm(ns, ns.args[1].toString(), ns.args[2].toString());

    //     //logger.tlog("");
    //     //logger.tlog("Hack Algorithm:");
    //     await printHackAlgorithm(ns, ns.args[1].toString(), ns.args[2].toString());
    //   } else {
    //     ns.tprint("Missing args! Require targetServer and sourceServer");
    //     ns.tprint("\tex: run utils.ts dryRun n00dles home");
    //   }
    //   break;
    // case "maxram":
    //   ns.tprint(`Max ram you can purchase per server:  ${determinePurchaseServerMaxRam(ns)}`);
    //   break;
    // case "getserverpaths":
    //   ns.tprint(`Getting server paths from home`);
    //   await getServerPaths(ns);
    //   break;
    // case "top":
    //   ns.tprint(`Showing top 25 servers:`);
    //   await showTopServers(ns);
    //   break;
    // case "killall":
    //   ns.tprint("Killing all scripts on servers");
    //   await killAll(ns);
    //   break;
    default:
      ns.tprint(`
         utils.ts [function] [...args]
         ------------------------------------------------------------------------------
         buildServerDB              Scans and fills out the server DB file

         printServerData [server]   Returns the [server]'s attributes in JSON format

         dryrun [target] [source]   Prints to the terminal the intended Prep and Hack algorithm
                                    plan for [target] presuming the scripts were run on [source].

         maxram                     Prints the maximum amount of ram you could distribute
                                    amongst the max amount of purchased servers.

        getServerPaths              Saves all servers and their connected 'paths' to others
                                    in 'server-paths.txt'

        top                         Print the top servers (in terms of maxMoney) in desc order

        killAll                     Kills all scripts on known servers
        `);
      break;
  }
}