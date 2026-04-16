import { ScriptArg } from "NetscriptDefinitions";
import { LogLevel, Priority, ScriptConfig, ScriptConfigOptions } from "./types";
import { Logger } from "./logger";

export const DEFAULT_LOG_LEVEL = LogLevel.ERROR;

// numbers for when im lazy
const MIL = 1000000;
const BIL = 1000000000;
const TRIL = 1000000000000;

export const SERVER_PURCHASE_NAME = "host";
export const SERVER_PURCHASE_RAM = 32;

export const CONTROLLER_SCRIPT = "controller.js";
export const ENGINE_SCRIPT = "engine.js";
export const UTILS_SCRIPT = "utils.js";

export const HACK_SCRIPT = "hgw/hack.js";
export const GROW_SCRIPT = "hgw/grow.js";
export const WEAK_SCRIPT = "hgw/weaken.js";
export const SHARE_SCRIPT = "hgw/share.js";
export const SHARE_LOOP_SCRIPT = "hgw/shareLoop.js";

export const STARTER_HACK_SCRIPT = "hgw/starter-hack.js";

export const HACK_ALGO_SCRIPT = "managers/hack-algorithm.js";
export const HACK_ALGO_DB = "hack-algo.json";

export const DB_FILE = "db.txt";

export const STARTER_GO_SCRIPT = "go/go-starter.js";
export const GO_SCRIPT = "go/go.js";


export const MONEY_THRESHOLD = 0.70;
export const SECURITY_THRESHOLD = 1.20;
export const HOME_RAM_BUFFER = 32;
export const MONEY_BUFFER = 50000;

export const GANG_KARMA_REQ = -54000;
export const GANG_MEMBER_NAME = "johnny";
export const GANG_WANTED_PENALTY_THRESHOLD = 0.30; // % Wanted Level Penalty. The higher the number the less of a penalty
export const GANG_WANTED_LEVEL_THRESHOLD = 60.0
export const GANG_ASCENSION_MULT_THRESHOLD = 2.0;



export const TOR_COST = 200000;

/**
 * Creates a script configuration object with the specified parameters.
 * @param {string} name - The display name for the script.
 * @param {string} script - The script filename to execute.
 * @param {string[]} [args] - Optional array of arguments to pass to the script.
 * @param {boolean} [homeLocked=false] - Whether the script should only run on the home server.
 * @param {boolean} [enabled=true] - Whether the script is enabled for execution.
 * @returns {ScriptConfig} - A configured script object ready for deployment.
 */
export function createScriptConfig(
   script: string,
   priority: Priority,
   options: ScriptConfigOptions = {}
): ScriptConfig {
   // Access values with defaults
   const {
      args,
      port,
      homeLocked = false,
      isRunning = false
   } = options;

   // We use this format to enforce we pass a port, which is required
   // for a child script to write back that it's finished. Without that,
   // our engine will never know when a child script is done.
   const scriptArgs: Record<string, ScriptArg> = {
      port: port ? port : -1,
      ...args
   }
   const jsonArgs: ScriptArg[] = Object.entries(scriptArgs).map(([key, value]) =>
      JSON.stringify({ [key]: value })
   );
   const obj: ScriptConfig = {
      script,
      priority,
      args: jsonArgs,
      port: port,
      homeLocked,
   };
   return obj;
}

// -- MANAGER SCRIPTS -------------------------------------------------
export const CONTROLLER_MANAGER_SCRIPT = "managers/controller-manager.js";
export const PARASITE_MANAGER_SCRIPT = "managers/parasite-manager.js";
export const GANG_SCRIPT = "managers/gang-engine.js";
export const SERVER_MAPPER_SCRIPT = "managers/server-mapper.js";
export const ROOT_SCRIPT = "managers/root.js";
export const ORCHESTRATOR_SCRIPT = "managers/orchestrator.js";
export const CRIME_MANAGER_SCRIPT = "managers/crime-manager.js";
export const HOST_MANAGER_SCRIPT = "managers/host-manager.js";
export const FACTION_MANAGER_SCRIPT = "managers/faction-manager.js";
export const HOME_MANAGER_SCRIPT = "managers/home-manager.js";
export const TOR_MANAGER_SCRIPT = "managers/tor-manager.js";
export const BACKDOOR_MANAGER_SCRIPT = "managers/backdoor-manager.js";
export const ALGO_MANAGER_SCRIPT = "managers/algo-manager.js";

export const CORE_SCRIPTS: ScriptConfig[] = [
   // Required (highest) priority       //
   createScriptConfig(                  //
      SERVER_MAPPER_SCRIPT,             //
      Priority.REQUIRED,                //
      { homeLocked: true }              //
   ),                                   //
   createScriptConfig(                  //
      CRIME_MANAGER_SCRIPT,             //
      Priority.REQUIRED                 //
   ),                                   //
                                        //
   // High priority                     //
   createScriptConfig(                  //
      ALGO_MANAGER_SCRIPT,              //
      Priority.PRIORITY,                //
   ),                                   //
   createScriptConfig(                  //
      CONTROLLER_MANAGER_SCRIPT,        //
      Priority.PRIORITY                 //
   ),                                   //
   createScriptConfig(                  //
      PARASITE_MANAGER_SCRIPT,          //
      Priority.PRIORITY                 //
   ),                                   //
                                        //
   // Standard priority                 //
   createScriptConfig(                  //
      ROOT_SCRIPT,                      //
      Priority.STANDARD,                //
      { homeLocked: true }              //
   ),                                   //
   createScriptConfig(                  //
      HOST_MANAGER_SCRIPT,              //
      Priority.STANDARD                 //
   ),                                   //
   createScriptConfig(                  //
      FACTION_MANAGER_SCRIPT,           //
      Priority.STANDARD                 //
   ),                                   //
   createScriptConfig(                  //
      HOME_MANAGER_SCRIPT,              //
      Priority.STANDARD                 //
   ),                                   //
   createScriptConfig(                  //
      TOR_MANAGER_SCRIPT,               //
      Priority.STANDARD                 //
   ),                                   //
   createScriptConfig(                  //
      BACKDOOR_MANAGER_SCRIPT,          //
      Priority.STANDARD                 //
   ),                                   //
   createScriptConfig(
      GANG_SCRIPT,
      Priority.STANDARD,
      { args: {
         prioritizeRespect: true
      }}
   )

   /*
      TO DO:
         - Gang manager (that doesn't keep failing)
         - GO manager


   */


]
// --------------------------------------------------------------------