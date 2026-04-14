import { Logger } from "@/lib/logger";
import { NetscriptPort, ScriptArg } from "NetscriptDefinitions";
import { Priority, ScriptConfig, Worker } from "@/lib/types";

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
   logger: Logger;
   handler: NetscriptPort;
   startTime: number;
   port: number;
   args: Record<string, any>;

   constructor(ns: NS, scriptArgs: ScriptArg[]) {
      this.ns = ns;
      this.ns.atExit(() => this.finish);
      this.logger = new Logger(ns);
      this.logger.info(`-- Starting ${this.ns.getScriptName()} --`);
      this.startTime = Date.now();

      const rawArgs = JSON.parse(scriptArgs[0] as string);
      this.args = rawArgs.args;
      
      if (this.args) {
         this.logger.debug(`${ns.getScriptName()} received args:`);
         for (const [key, value] of Object.entries(this.args)) {
            this.logger.debug(`${key}:${value}`,1);
         }
      }
      // Let subclasses parse args however they need
      this.port = rawArgs[`port`] as number;

      this.handler = ns.getPortHandle(this.port as number);
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
      this.logger.error(`Could not find arg [${desired}] in [${this.ns.getScriptName()}]`,0,true);
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
      createScriptConfig(
         name: string,
         script: string,
         args?: any,
         homeLocked: boolean = false,
         enabled: boolean = true,
         isRunning: boolean = false,
         priority: Priority = Priority.STANDARD
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

   abstract start(): void;

   finish() {
      this.logger.debug(`Exiting ${this.ns.getScriptName()}..`);
      const worker: Worker = {
         pid: this.ns.pid,
         script: this.ns.getScriptName(),
         value: 0,
         host: this.ns.getHostname(),
         duration: Date.now() - this.startTime == 0 ? 1 : Date.now() - this.startTime
      };
      this.logger.debug(`Writing finish to port ${this.port}:`);
      this.logger.debug(`${JSON.stringify(worker)}`);
      this.handler.write(JSON.stringify(worker));
      this.ns.exit();
   }
}