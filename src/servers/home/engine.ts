import { Logger } from "@/lib/logger";
import * as consts from "@/lib/constants";
import { Queue, ScriptConfig, exitCodeMessages, Time, Worker, LogLevel, PriorityQueue, Priority, Script } from "@/lib/types";
import { verifyScript, orchestrateScript, getScriptName } from "@/lib/system";
import { NetscriptPort } from "NetscriptDefinitions";
import { getRandomInt } from '@/lib/calc';

/*
   The main engine/progression script of this repository.

   The purpose is to add/remove functionality whenever we want, where each
   major function is placed in their own scripts. This allows us to orchestrate
   each function wherever we have the resources to manage it.

   If we don't happen to have any resources available - for example, a large Singularity
   script - the functionality will be queued and prioritized during the next loop. This
   allows us to give our best effort for each modular piece of functionality while also
   maintaining whatever our current progress is.

   Here's a practical example to visualize it:
   |   We kickoff our engine and we have the following functionality deploying in
   |   different scripts:
   |
   |   scriptName        memoryRequired
   |   ---------------------------------
   |   mapServers        2.5 GB
   |   rootServers       3.0 GB
   |   deployHacks       4.0 GB
   |   playGo            6.0 GB
   |   manageGang        16.8 GB
   |   joinFactions      128 GB
   |   buyPrograms       84 GB
   |
   |   When our engine starts on a brand new BitNode, it will be able to successfully
   |   [mapServers] and [rootServers], but might run out of `home` memory by the time
   |   it gets to the others. It then puts them in a queue and loops, always checking
   |   if space has freed them up. By the time [mapServers] and [rootServers] has cleared
   |   up, it can pop [deployHacks] from the queue and get started there.
   |
   |   Later, once our `home` has been upgraded or we have bought new hosts, the queue
   |   will eventually be able to deploy the resource-heavy scripts and progress our game.
   |   In the endgame everything will be able to run without constraint!

   If you want to add functionality to this script, you must make it in a separate script.
   You can view examples from the ones already integrated.

*/

class Engine {
   ns: NS;
   logger: Logger;
   queue: PriorityQueue;
   bench: Map<string, ScriptConfig>

   private pollingRate: number; // milliseconds
   private intervalPeriod: number; // minutes
   private port: number;
   private handler: NetscriptPort;

   constructor(ns: NS) {
      this.ns = ns;
      this.logger = new Logger(ns);
      this.queue = new PriorityQueue;
      this.bench = new Map();

      this.pollingRate = 1000;
      this.intervalPeriod = 30 * Time.MINUTE;
      this.port = getRandomInt();
      this.handler = this.ns.getPortHandle(this.port);
      this.handler.clear();

      /*
         This manages all the main functionality of our engine.
         If you want to add/remove something, do it here.

         Each of these are, in essence, just configuration for scripts to run.
         The script names are handled by our constants, that way we can use it as
         a "proxy" to point to different scripts if we want to develop an enhancement.

         For example, if we make a better gang manager script, we can just edit our
         constants file and point GANG_SCRIPT at your new one, and this will pick up the
         changes. This might be better to read from a JSON in the future so we can do
         live changes, but this is good for now.
      */

      // Map all servers to DB
      const serverMapper = this.createScriptConfig(
         "Server Mapper",
         consts.SERVER_MAPPER_SCRIPT,
         Priority.REQUIRED,
         null,
         true
      );
      this.register(serverMapper);

      // Attempt to root all servers
      const rooter = this.createScriptConfig(
         "Server Rooter",
         consts.ROOT_SCRIPT,
         Priority.STANDARD,
         null,
         true // run on home
      );
      this.register(rooter);

      // Keep up hacking controllers
      const controller = this.createScriptConfig(
         "Controller Manager",
         consts.CONTROLLER_MANAGER_SCRIPT,
         Priority.PRIORITY
      );
      this.register(controller);

      // Keep an eye on upgrading our hosts
      const hostManager = this.createScriptConfig(
         "Host Manager",
         consts.HOST_MANAGER_SCRIPT,
         Priority.STANDARD
      );
      this.register(hostManager);

      // Commit the best crime to obtain money (and bad karma)
      const crimeManager = this.createScriptConfig(
         "Crime Manager",
         consts.CRIME_MANAGER_SCRIPT,
         Priority.PRIORITY
      );
      this.register(crimeManager);

      // Join factions that don't have any enemies
      const factionManager = this.createScriptConfig(
         "Faction Manager",
         consts.FACTION_MANAGER_SCRIPT,
         Priority.STANDARD
      );
      this.register(factionManager);

      // Manage our gang
      const gangManager = this.createScriptConfig(
         "Gang manager",
         consts.GANG_SCRIPT,
         Priority.STANDARD,
         {
            prioritizeRespect: true
         }
      )
      this.register(gangManager);

      // Upgrade home computer as long as it keeps us above money buffer
      const homeManager = this.createScriptConfig(
         "Home Computer Manager",
         consts.HOME_MANAGER_SCRIPT,
         Priority.STANDARD
      );
      this.register(homeManager);

      // Buy Dark Web programs
      const torManager = this.createScriptConfig(
         "Dark Web Manager",
         consts.TOR_MANAGER_SCRIPT,
         Priority.STANDARD
      );
      this.register(torManager);

      // Ensure we are playing GO
      // goManager: this.createScriptConfig(ns,
      //    "Go Manager",
      //    undefined,
      //    getRandomInt()
      // ),

      // Attempt to backdoor do-able servers
      const backdoorManager = this.createScriptConfig(
         "Backdoor Manager",
         consts.BACKDOOR_MANAGER_SCRIPT,
         Priority.STANDARD
      );
      this.register(backdoorManager);
   }

   async start() {
      // Begin main loop
      try {
         let timer: number = 0;
         let startup: boolean = true;

         while (true) {
            await this.deployAllScripts(startup);
            startup = false;

            // After a period of time let's try to re-enable our disabled scripts
            // This will automatically "progress" us by rechecking milestones
            if (timer >= this.intervalPeriod) {
               this.reenableDisabledScripts();
            }

            await this.ns.sleep(this.pollingRate)
            timer += this.pollingRate;

            await this.monitorPort();
         }
      } catch (error) {
         this.logger.error(`ERROR -- Engine died due to: ${error}`);
      }
   }

   /* ------------------------------------------------------------------------------------------------------------------- */
   /* --------------------- FUNCTION DEFINITIONS ------------------------------------------------------------------------ */
   /* ------------------------------------------------------------------------------------------------------------------- */

   /**
    * Creates a script configuration object with the specified parameters.
    * @param {string} name - The display name for the script.
    * @param {string} script - The script filename to execute.
    * @param {string[]} [args] - Optional array of arguments to pass to the script.
    * @param {boolean} [homeLocked=false] - Whether the script should only run on the home server.
    * @param {boolean} [enabled=true] - Whether the script is enabled for execution.
    * @returns {ScriptConfig} - A configured script object ready for deployment.
    */
   createScriptConfig(
      name: string,
      script: string,
      priority: Priority,
      args?: any,
      homeLocked: boolean = false,
      enabled: boolean = true,
      isRunning: boolean = false
   ): ScriptConfig {
      // We use this format to enforce we pass a port, which is required
      // for a child script to write back that it's finished. Without that,
      // our engine will never know when a child script is done.
      const scriptArgs = {
         port: this.port,
         args: args
      }
      const jsonArgs = JSON.stringify(scriptArgs);
      this.logger.debug(`Created ScriptConfig for ${script} that is ${jsonArgs}`);
      const obj: ScriptConfig = {
         name,
         script,
         priority,
         args: [jsonArgs],
         port: this.port,
         enabled,
         homeLocked,
         isRunning
      };
      return obj;
   }

   register(sc: ScriptConfig) {
      this.bench.set(getScriptName(sc.script), sc);
      this.queue.enqueue(sc);
   }

   /**
    * Deploys all queued and configured scripts.
    * First processes any scripts in the deployment queue, then iterates through all runner functions.
    */
   async deployAllScripts(startup: boolean = false) {
      this.logger.debug(`Deploying all scripts..`);

      // If this is our first time starting the script, run all the required scripts and pause for a second
      // We do this because of things like server-mapper needing to build our database first
      if (startup) {
         this.logger.info(`Starting up, focusing on required items`,1);
         while (!this.queue.isEmpty() && this.queue.peek() && this.queue.peek()?.priority === Priority.REQUIRED) {
            const script = this.queue.dequeue();
            if (script) { this.deployScript(script); }
         }

         await this.ns.sleep(5000);
      } 

      while (!this.queue.isEmpty()) {
         const script = this.queue.dequeue();
         if (script) { this.deployScript(script); }
      }

      this.logger.debug(`Finished deploying queue`,1);
   }

   /**
    * Attempts to deploy a script and handles the exit code accordingly.
    * Disables the script on execution errors, or re-queues it if insufficient RAM.
    * @param {ScriptConfig} config - The script configuration to deploy.
    */
   deployScript(config: ScriptConfig) {
      const result = this.runScript(config);
      this.logger.info(`${config.name}: [${result.code}] ${exitCodeMessages[result.code]} on ${result.host}`);

      // If there was an execution or script not found failure, let's skip this one
      if (result.code == 1 || result.code == 3) {
         this.logger.debug(`${config} returned 1 or 3, disabling..`, 1);
         config.enabled = false;

         // If there wasn't enough space, add this to the queue
      } else if (result.code == 2) {
         this.queue.enqueue(config);
      }
      this.logger.debug(`Deployed ${config.name}`, 1);
   }

   /**
    * Executes a script with verification and error handling.
    * Verifies the script exists before orchestrating its execution.
    * @param {ScriptConfig} config - The script configuration to run.
    * @returns {number} - The exit code from script orchestration (3 if verification fails).
    */
   runScript(config: ScriptConfig) {
      this.logger.debug(`Starting ${config.name} (${config.script})..`);

      // Everything hinges on our ServerMapper, so we're going to baby this onto `home`
      if (config.script == consts.SERVER_MAPPER_SCRIPT) {
         const args = config.args ?? [];
         const result = this.ns.exec(consts.SERVER_MAPPER_SCRIPT, `home`, 1, ...args);

         return { code: result > 0 ? 0 : 3, pid: result, host: `home` };
      } else {
         return orchestrateScript(this.ns, config.script, 1, config.args, config.homeLocked);
      }
   }

   async monitorPort() {
      this.logger.debug(`Monitoring port ${this.port}..`);
      if (this.queue.size() == this.bench.size) {
         this.logger.debug(`Nothing to monitor for, skipping port check`, 1);
         return;
      }

      if (this.handler.empty()) {
         this.logger.debug(`Port is empty, skipping..`, 1);
         return;
      }


      while (this.handler.peek() != "NULL PORT DATA") {
         const result: Worker = JSON.parse(this.handler.read()) as Worker;
         this.logger.debug(`Port ${this.port} read: ${result.script} [${result.pid}]`);

         const duration: string = result.duration ? `in ${result.duration / Time.SECOND} seconds` : "";
         const host: string = result.host ? `on ${result.host}` : "";
         this.logger.info(`${result.script} finished ${duration} with PID ${result.pid} ${host}`, 1);
         debugger;
         let benchedConfig = this.bench.get(getScriptName(result.script));
         if (benchedConfig) {
            this.queue.enqueue(benchedConfig);
         }

         await this.ns.sleep(10);
      }
      this.logger.debug(`Done checking port`, 1);
   }

   reenableDisabledScripts() {
      for (const [script, config] of this.bench) {
         config.enabled = true;
      }
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const engine: Engine = new Engine(ns);
   await engine.start();
}