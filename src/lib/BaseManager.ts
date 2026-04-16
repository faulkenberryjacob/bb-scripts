import { Logger } from "@/lib/logger";
import { NetscriptPort, ScriptArg } from "NetscriptDefinitions";
import { LogLevel, ManagerExitCode, Priority, ScriptConfig, Worker } from "@/lib/types";
import { createScriptConfig } from "./constants";

/**
 * Abstract base class that provides common lifecycle, logging, and port-handling
 * utilities for manager-style scripts.
 *
 * Responsibilities:
 * - Store and expose common runtime services: Netscript API handle (`ns`),
 *   a `Logger` instance (`logger`), and a `NetscriptPort` port handle (`handler`).
 * - Record the script start time (`startTime`) to produce execution duration info.
 * - Register an exit handler that writes a worker summary to the configured port
 *   and terminates the script.
 * - Delegate argument parsing to subclasses via {@link parseArgs} and ensure the
 *   derived class can obtain a port to communicate termination/status.
 *
 * Usage:
 * - Subclasses must implement {@link parseArgs} to parse and validate the raw
 *   `args` and return the port number to use, or `null`/`undefined` on failure.
 * - Subclasses must implement {@link start} to perform the script's main work.
 *
 * Constructor:
 * @param ns - The Netscript API handle provided by the runtime environment.
 * @param args - Raw script arguments; subclasses are expected to parse these.
 *
 * Lifecycle details and behavior:
 * - The constructor registers the instance's {@link finish} method as an exit
 *   handler using `ns.atExit(...)`.
 * - After parsing arguments, the constructor obtains a port handle
 *   (`ns.getPortHandle(port)`) and clears it so the port starts empty.
 * - If argument parsing fails (no port returned), this class logs an error and
 *   triggers {@link finish} to write a failure summary and exit.
 *
 * Protected and abstract members:
 * - {@link parseArgs}: Implemented by subclasses to parse `args` and return a
 *   valid port number. Returning `null` (or a falsy value) signals a parsing
 *   failure and causes the base class to abort execution.
 * - {@link start}: The entry point for subclass-specific behavior; invoked by
 *   subclasses after construction and successful argument parsing.
 *
 * finish():
 * - Writes a JSON-serialized "worker" summary object to the configured port.
 *   The summary contains { pid, script, value, host, duration } where `duration`
 *   is computed from `startTime`.
 * - Calls `ns.exit()` to terminate the script.
 *
 * Notes:
 * - Subclasses should not rebind or override the exit registration behavior
 *   unless they manage registration/unregistration explicitly.
 * - The concrete implementation of {@link parseArgs} must ensure the returned
 *   port number is valid for `ns.getPortHandle`.
 */
export abstract class BaseManager {
   ns: NS;
   status: ManagerExitCode
   logger: Logger;
   handler?: NetscriptPort;
   startTime: number;
   port?: number;
   args: Record<string, ScriptArg>;


   // assume all the elements in ScriptArg[] are maps with the format
   // {key: string, value: ScriptArg}
   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      this.ns = ns;
      this.status = ManagerExitCode.FAILURE;
      this.ns.atExit(async () => await this.finish());
      this.logger = new Logger(ns, LogLevel.DEBUG);
      this.logger.info(`-- Starting ${this.ns.getScriptName()} --`);
      this.startTime = Date.now();

      // 1. Flatten the array of JSON strings into a single Record
      const combinedArgs: Record<string, ScriptArg> = scriptArgs.reduce((acc, arg) => {
         try {
            const parsed = JSON.parse(arg as string);
            return { ...acc, ...parsed };
         } catch {
            return acc;
         }
      }, {});

      // 2. Extract and assign the port if it exists
      if ("port" in combinedArgs) {
         this.port = combinedArgs["port"] as number;
         // 3. Remove it so subclasses don't see it in this.args
         delete combinedArgs["port"];
      } else {
         this.port = -1;
      }

      // 4. Assign the remaining clean Record to the class
      this.args = combinedArgs;

      if (this.port > 0) {
         this.logger.info(`Port has been set to ${this.port}`);
         this.handler = ns.getPortHandle(this.port);
      } else {
         this.logger.warn(`No port was set for ${this.ns.getScriptName()}!`);
      }
   }

   /**
    * Parse and validate arguments. Return the port number to use.
    * Subclasses override this to handle their specific argument structure.
    * @param {string[]} args - The raw arguments passed to the script
    * @returns {number | null} - The port number, or null if parsing fails
    */
   parseArgs(args: Map<string, ScriptArg> | undefined, desired: string): any {
      const target = args?.get(desired);
      if (target) {
         return target;
      }
      this.logger.error(`Could not find arg [${desired}] in [${this.ns.getScriptName()}]`, 0, true);
      return undefined;
   }

   /**
    * Creates a script configuration object with the specified parameters.
    * @param {string} name - The display name for the script.
    * @param {string} script - The script filename to execute.
    * @param {string[]} [args] - Optional array of arguments to pass to the script.
    * @param {boolean} [homeLocked=false] - Whether the script should only run on the home server.
    * @param {boolean} [enabled=true] - Whether the script is enabled for execution.
    * @returns {ScriptConfig} - A configured script object ready for deployment.
    */
   createScriptConfig = createScriptConfig;

   abstract start(): void;

   success() {
      this.status = ManagerExitCode.SUCCESS;
      this.ns.exit();
   }

   fail() {
      this.status = ManagerExitCode.FAILURE;
      this.ns.exit();
   }

   skipMe() {
      this.status = ManagerExitCode.UNOBTAINABLE;
      this.ns.exit();
   }

   async finish() {
      this.logger.info(`Exiting ${this.ns.getScriptName()}..`);
      if (this.handler) {
         const worker: Worker = {
            pid: this.ns.pid,
            script: this.ns.getScriptName(),
            value: this.status,
            host: this.ns.getHostname(),
            duration: Date.now() - this.startTime == 0 ? 1 : Date.now() - this.startTime
         };
         this.logger.debug(`Writing finish to port ${this.port}:`);
         this.logger.debug(`${JSON.stringify(worker)}`);
         while (!this.handler.tryWrite(JSON.stringify(worker))) { await this.ns.sleep(1); }
      }
   }
}