import { Colors, Logger } from "@/lib/logger";
import * as consts from "@/lib/constants";
import { Queue, ScriptConfig, exitCodeMessages, Time, Worker, LogLevel, PriorityQueue, Priority, Script, ManagerExitCode, updateScriptConfigArg } from "@/lib/types";
import { verifyScript, orchestrateScript, getScriptName } from "@/lib/system";
import { NetscriptPort, ScriptArg } from "NetscriptDefinitions";
import { getRandomInt } from '@/lib/calc';
import { getOwnedServers, getOwnedServersData, getServersWithRoot, readDB } from "@/lib/db";

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

const RESET_INTERVAL = 30 * Time.MINUTE;
const STARTUP_GRACE_PERIOD = 10 * Time.SECOND;
const DEPLOY_RATE = 500;

class Engine {
   ns: NS;
   logger: Logger;
   queue: PriorityQueue;
   failed: Queue<ScriptConfig>;
   bench: Map<string, ScriptConfig>;

   private pollingRate: number; // milliseconds
   private port: number;
   private handler: NetscriptPort;
   private canController: boolean;
   private startTime: number;

   constructor(ns: NS) {
      this.ns = ns;
      this.logger = new Logger(ns);
      this.queue = new PriorityQueue;
      this.bench = new Map();
      this.failed = new Queue();

      this.startTime = Date.now();
      this.pollingRate = 1000;
      this.port = getRandomInt();
      this.handler = this.ns.getPortHandle(this.port);
      this.handler.clear();

      let ownedRam: number = 0;
      try {
         for (const s of getOwnedServersData(this.ns)) {
            ownedRam += s.maxRam;
         }
      } catch (error) {
         this.logger.warn(`DB likely isn't populated yet. Error: ${error}`);
      }

      this.canController = ownedRam >= 64;


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

      for (const sc of consts.CORE_SCRIPTS) {
         this.register(sc);
      }
   }

   async start() {
      // Begin main loop
      try {
         let startup: boolean = true;

         while (true) {
            await this.deployAllScripts(startup);
            startup = false;

            await this.ns.sleep(this.pollingRate)

            await this.monitorPort();

            this.reenableFailedScripts();

            if (Date.now() - this.startTime > RESET_INTERVAL) {
               // Once enough time as elapsed, kill ourselves and start 
               // anew to automatically check progression
               this.finish();
               break;
            }
            this.logger.info(`
               Queue size:  ${this.queue.size()}
               Failed size: ${this.failed.size()}
               Bench size:  ${this.bench.size}
               `);

         }
      } catch (error) {
         this.logger.error(`ERROR -- Engine died due to: ${error}`);
      }

      this.logger.info(`Engine hit ${RESET_INTERVAL / Time.MINUTE} minutes, restarting!`, 0, Colors.Blue, true);
   }

   /* ------------------------------------------------------------------------------------------------------------------- */
   /* --------------------- FUNCTION DEFINITIONS ------------------------------------------------------------------------ */
   /* ------------------------------------------------------------------------------------------------------------------- */



   register(sc: ScriptConfig) {
      // add our port to the config
      updateScriptConfigArg(sc, `port`, this.port);
      this.logger.debug(`Registering script: ${JSON.stringify(sc)}`);
      this.bench.set(sc.script, sc);
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
         this.logger.info(`Starting up, focusing on required items`, 1);

         while (!this.queue.isEmpty() && this.queue.peek() && this.queue.peek()?.priority === Priority.REQUIRED) {
            const script = this.queue.dequeue();
            if (script) { this.deployScript(script); }
            await this.ns.sleep(200);
         }

         await this.ns.sleep(STARTUP_GRACE_PERIOD);
      }

      while (!this.queue.isEmpty()) {
         const script = this.queue.dequeue();

         if (script) {
            // if we're launching the controller manager after obtaining enough RAM to do so,
            // let's make sure all our dangling parasites are killed off first
            if (script.script == consts.CONTROLLER_MANAGER_SCRIPT) { this.killAllParasites(); }
            this.deployScript(script);
         }

         await this.ns.sleep(DEPLOY_RATE);
      }

      this.logger.debug(`Finished deploying queue`, 1);
   }

   deleteServerDB() {
      this.ns.rm(consts.DB_FILE, `home`);
   }

   /**
    * Attempts to deploy a script and handles the exit code accordingly.
    * Disables the script on execution errors, or re-queues it if insufficient RAM.
    * @param {ScriptConfig} config - The script configuration to deploy.
    */
   deployScript(config: ScriptConfig) {
      const result = orchestrateScript(this.ns, config.script, 1, config.args, config.homeLocked);
      this.logger.debug(`${config.script}: [${result.code}] ${exitCodeMessages[result.code]} ${result.host ? `on ${result.host}` : ``}`);

      // If there was an execution or script not found failure, let's skip this one and mark it as failed
      if (result.code > 0) {
         this.logger.warn(`${config.script} returned [${result.code}] ${exitCodeMessages[result.code]}..`, 1);
         this.failed.enqueue(config);
      } else {
         this.logger.info(`Deployed ${config.script}`);
      }
   }

   async monitorPort() {
      this.logger.info(`Monitoring port ${this.port}..`);
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
         this.logger.debug(`Port ${this.port} read: ${result.script} [${result.pid}] with return ${result.value}`);

         const duration: string = result.duration ? `in ${result.duration / Time.SECOND} seconds` : "";
         const host: string = result.host ? `on ${result.host}` : "";
         this.logger.info(`${result.script} finished ${duration} with PID ${result.pid} ${host} and exit code [${result.value}]`, 1);
         const returnedConfig = this.bench.get(result.script);
         if (!returnedConfig) {
            this.logger.warn(`No match for this returned config, skipping..\r\n` +
               `Return: ${result}`
            );
            continue;
         }


         // Figure out what we should do with the result
         switch (result.value) {
            case ManagerExitCode.SUCCESS:
            case ManagerExitCode.FAILURE:
               let benchedConfig = this.bench.get(result.script);
               if (benchedConfig) {
                  this.logger.debug(`Re-queueing ${benchedConfig.script}`);
                  this.queue.enqueue(benchedConfig);
               }
               break;
            case ManagerExitCode.UNOBTAINABLE:
               this.bench.delete(returnedConfig.script);
               break;
         }


         await this.ns.sleep(10);
      }
      this.logger.debug(`Done checking port`, 1);
   }

   reenableFailedScripts() {
      this.logger.debug(`Re-queueing all missing scripts..`);
      while (!this.failed.isEmpty()) {
         if (this.failed.peek()) {
            this.logger.debug(`Re-queueing ${(this.failed.peek() as ScriptConfig).script}`);
            this.queue.enqueue(this.failed.dequeue() as ScriptConfig);
         }
      }
   }

   killAllParasites() {
      for (const s of getServersWithRoot(this.ns)) {
         this.ns.scriptKill(consts.STARTER_HACK_SCRIPT, s);
      }
   }

   finish() {
      this.logger.info(`Destroying all scripts before engine stops..`);
      for (const s of readDB(this.ns).values()) {
         this.ns.killall(s.hostname, true);
      }
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");

   while (true) {
      const engine: Engine = new Engine(ns);
      await engine.start();
   }

}