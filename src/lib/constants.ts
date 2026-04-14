import { LogLevel } from "./types";

export const DEFAULT_LOG_LEVEL = LogLevel.ERROR;

// numbers for when im lazy
const MIL = 1000000;
const BIL = 1000000000;
const TRIL = 1000000000000;

export const SERVER_PURCHASE_NAME = "host";
export const SERVER_PURCHASE_RAM = 32;

export const CONTROLLER_SCRIPT = "controller.js";
export const HACK_ALGO_SCRIPT = "hack-algorithm.js";
export const ENGINE_SCRIPT = "engine.js";
export const ENGINE_STARTER_SCRIPT = "engine-starter.js";

export const HACK_LOOP_SCRIPT = "hgw/hackLoop.js";
export const GROW_LOOP_SCRIPT = "hgw/growLoop.js";
export const WEAK_LOOP_SCRIPT = "hgw/weakenLoop.js";
export const SHARE_LOOP_SCRIPT = "hgw/shareLoop.js";

export const HACK_SCRIPT = "hgw/hack.js";
export const GROW_SCRIPT = "hgw/grow.js";
export const WEAK_SCRIPT = "hgw/weaken.js";
export const SHARE_SCRIPT = "hgw/share.js";

export const STARTER_HACK_SCRIPT = "hgw/starter-hack.js";
export const BACKDOOR_SCRIPT = "hgw/backdoor.js";


// -- MANAGER SCRIPTS -------------------------------------------------
export const CONTROLLER_MANAGER_SCRIPT = "managers/controller-manager.js";
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
// --------------------------------------------------------------------

export const DB_FILE = "server-database.json";

export const MONEY_THRESHOLD = 0.70;
export const SECURITY_THRESHOLD = 1.20;
export const HOME_RAM_BUFFER = 32;
export const MONEY_BUFFER = 50000;


export const GANG_KARMA_REQ = -54000;
export const GANG_MEMBER_NAME = "johnny";
export const GANG_WANTED_PENALTY_THRESHOLD = 0.30; // % Wanted Level Penalty. The higher the number the less of a penalty
export const GANG_WANTED_LEVEL_THRESHOLD = 60.0
export const GANG_ASCENSION_MULT_THRESHOLD = 2.0;

export const STARTER_GO_SCRIPT = "go/go-starter.js";
export const GO_SCRIPT = "go/go.js";

export const TOR_COST = 200000;