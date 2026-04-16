import { BaseManager } from "@/lib/BaseManager";
import { getServersWithoutRoot, getServerData } from "@/lib/db";
import { ScriptArg, Server } from "NetscriptDefinitions";
import { canCrackFTP, canCrackHTTP, canCrackSMTP, canCrackSQL, canCrackSSH, getPortsCanCrack } from "@/lib/defaults";
import { Colors } from "@/lib/logger";

class RootManager extends BaseManager {
   scannedServers: Set<string>;

   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      super(ns, scriptArgs);

      this.scannedServers = new Set();
   }

   async start() {
      this.rootServers()
      this.success();
   }

   rootServers() {
      this.logger.debug(`Rooting servers..`);

      const unrootedServers: string[] = getServersWithoutRoot(this.ns);
      if (!unrootedServers || unrootedServers.length == 0) {
         this.logger.debug(`No unrooted servers found. Exiting..`,1);
         return;
      }
      this.logger.debug(`Found ${unrootedServers.length} server to root!`,1);

      for (const s of unrootedServers) {
         // Checking if our hacking skills is high enough
         this.logger.debug(`Checking hacking requirement for ${s}..`, 1);
         if (this.ns.getHackingLevel() < this.ns.getServerRequiredHackingLevel(s)) {
            this.logger.debug(`Our hacking level is too low! Skipping`, 2);
            continue;
         }
         this.logger.debug(`Our hacking level is high enough!`, 2);

         // Check if enough ports are already open. Otherwise, check if we can crack open the rest
         this.logger.debug(`Attempting to open ports..`, 1);
         const serverData = getServerData(this.ns, s);
         const reqPortNum = this.ns.getServerNumPortsRequired(s);
         const openPorts = serverData?.openPortCount ?? 0;
         const portsWeCanOpen = getPortsCanCrack(this.ns);
         if (openPorts < reqPortNum) {
            if (this.openPorts(serverData) >= reqPortNum) {
               this.logger.debug(`We opened enough ports!`,2);
            } else {
               this.logger.debug(`We can only open ${portsWeCanOpen} and ${s} requires ${reqPortNum}. Skipping`, 2);
               continue;
            }
         }

         // Nuking
         this.logger.debug(`Nuking ${s}..`,1);
         if (this.ns.nuke(s)) {
            this.logger.debug(`Nuke successful!`,2);
            this.logger.info(`New server rooted! ${s}`,0, Colors.Green, true);
            continue;
         } else {
            this.logger.warn(`Nuke on ${s} FAILED.`,2);
         }
      }

   }

   openPorts(serverData: Server) {
      let portsOpened = 0;
      const server = serverData.hostname;
      if (!serverData.sshPortOpen && canCrackSSH(this.ns)) {
         this.ns.brutessh(server);
         portsOpened++;
      }
      if (!serverData.ftpPortOpen && canCrackFTP(this.ns)) {
         this.ns.ftpcrack(server);
         portsOpened++;
      }
      if (!serverData.smtpPortOpen && canCrackSMTP(this.ns)) {
         this.ns.relaysmtp(server);
         portsOpened++;
      }
      if (!serverData.httpPortOpen && canCrackHTTP(this.ns)) {
         this.ns.httpworm(server);
         portsOpened++;
      }
      if (!serverData.sqlPortOpen && canCrackSQL(this.ns)) {
         this.ns.sqlinject(server);
         portsOpened++;
      }
      return portsOpened;
   }

}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const root = new RootManager(ns, ns.args);
   await root.start();
}