/* 

The All In One™ BitBurner Script

  _______________________________________________________________________
  High level decision tree in chronological order
  ```````````````````````````````````````````````````````````````````````
    > ✔ Run engine.ts
      - recursively scans through and roots servers
      - builds up a "current" JSON-formatted database of server info
      - repeats on a fast loop
    > Determine what state of the game we're in
      - check money, programs, server RAM, cores, etc.
      - return what opportunities are available
      - check game state on a loop to 'progress' automatically
    > Kickoff controllers for h/g/w (hack/grow/weaken)
      - if early game, spin up starter scripts and/or controllers on
        the servers themselves
      - if we have enough resources on "home", start a controller there
        focused on the most money/per/second server
      - if we have enough money to purchase servers that are greater than
        or equal to our "home" resources, spin them up
    > Kickoff go.ts
      - plays basic AI against enemies on a loop

  _______________________________________________________________________
  Notes
  ```````````````````````````````````````````````````````````````````````
    > This script should be worked on as the game progresses
    > Game state definitions:
      - EARLY: Unable to host a controller anywhere. Need to put
               starter scripts on target machines.
      - MID: We can host a controller on our home to min/max
             a target machine
      - END: We can host controllers on purchased servers
    

*/

import { Logger } from '@/lib/logger';

import { determinePurchaseServerMaxRam } from '@/servers/home/utils';

import { HackAlgorithm, 
         maxHackAlgorithm, 
         maxPrepAlgorithm, 
         isHackPossible, 
         isPrepPossible } from '@/lib/hack-algorithm';
import { NetscriptPort } from '../../../NetscriptDefinitions';
import { GameState, Controller} from '@/lib/types';
import { getTopServerByMoneyPerSecond } from '@/lib/calc';

const CONFIG_FILE: string = 'config.json';
const MAIN_PORT: number = 1;
const NULL_PORT: string = 'NULL PORT DATA';



class AIO {
  private ns: NS;
  private readonly logger: Logger;
  private readonly engineScript: string;
  private readonly controllerScript: string;
  private readonly hackScript: string;
  private readonly weakScript: string;
  private readonly growScript: string;
  private readonly host: string;
  private readonly port: NetscriptPort;

  private gameState: GameState;
  private mem: number;
  private children: Controller[];


  constructor(ns: NS) {
    const config = loadConfig(ns);

    this.ns = ns;
    this.logger = new Logger(ns);
    this.engineScript = config.engineScriptName;
    this.controllerScript = config.controllerScriptName;
    this.hackScript = config.hackScriptName;
    this.weakScript = config.weakenScriptName;
    this.growScript = config.growScriptName;
    this.host = ns.getHostname();
    this.port = ns.getPortHandle(MAIN_PORT);
    
    this.gameState = "early";
    this.mem = Math.floor(ns.getServerMaxRam(this.host) - ns.getServerUsedRam(this.host));
    this.children = [];
  }

  public async start(): Promise<void> {
    // Run engine.ts
    if (await this.startEngine() <= 0) {
      this.logger.tlog(`ERROR -- ${this.engineScript} cannot start! Exiting..`);
      return;
    }

    // Main Loop
    let previousState: GameState = this.gameState;
    while (true) {
      // Determine what state of the game we're in
      previousState = this.gameState;
      this.gameState = await this.determineGameState();

      // If our state hasn't changed, do maintenance logging
      if (previousState === this.gameState) {


      // If our state has changed, transition
      } else {
        switch (this.gameState) {
          case "early":
            // distribute starter hack script directly on servers
            break;
          case "mid":
            // host controller on "home" server targeting cheap server
            break;
          case "end":
            // 
            break;
          default:
            this.logger.tlog(`ERROR -- Unable to parse game state: [${this.gameState}]`)
        }
      }

      await this.ns.sleep(100);
    }

  }

/* --- start -------- AIO FUNCTION DEFINITIONS --------------------------------------------------------------- */

  /**
   * Starts the engine script on the specified host. If the script is already running, it will be killed first.
   * 
   * @private
   * @returns {number} - The PID of the newly started script.
   */
  private async startEngine(): Promise<number> {
    if (this.ns.scriptRunning(this.engineScript, this.host)) {
      this.ns.scriptKill(this.engineScript, this.host);
    }
    return this.ns.exec(this.engineScript, this.host);
  }

  private async determineGameState(): Promise<GameState> {
    let gameState: GameState = "early";

    this.logger.log(`:: Determining game state ::::::`);

    const topServers = await getTopServerByMoneyPerSecond(this.ns);
    if (topServers.length <= 0) {
      this.logger.log(`No earnable servers found!`, 2);
      return gameState;
    }

    // -- CHECKING FOR END STATE --------------------------------
    this.logger.log(`Checking for END state..`, 1)
  
    // grab most profitable target server
    const topServer = topServers[0];

    // find the most expensive server we can purchase
    const mostRam: number = determinePurchaseServerMaxRam(this.ns, 1);

    // check if any algorithm resolves for that server. we're going to pass in the max
    // amount of ram we can afford for a single server
    this.logger.log(`Running prep/hack plans on top server [${topServer}]`, 2);
    if (await isHackPossible(this.ns, topServer, mostRam) || await isPrepPossible(this.ns, topServer, mostRam)) {
      
      // a plan exists!
      const purchaseCost: number = this.ns.getPurchasedServerCost(mostRam);
      this.logger.log(`Plans found! \$${this.ns.formatNumber(purchaseCost)} for ${this.ns.formatNumber(mostRam)} RAM`, 3);
      return "end";
    } else {
      this.logger.log(`No plans found!`, 3);
    }

    // -- CHECKING FOR MID STATE --------------------------------
    this.logger.log(`Checking for MID state..`, 1)
    const ramExcludingController = this.ns.getServerMaxRam(this.host) - this.ns.getScriptRam(this.controllerScript);
    const cheapServer = topServers[topServers.length-1];

    // check if any algorithm resolves for that server.
    this.logger.log(`Running prep/hack plans on cheap server [${cheapServer}]`, 2);
    if (await isHackPossible(this.ns, cheapServer, ramExcludingController) || await isPrepPossible(this.ns, cheapServer, ramExcludingController)) {
      
      // a plan exists!
      const purchaseCost: number = this.ns.getPurchasedServerCost(mostRam);
      this.logger.log(`Plans found! \$${this.ns.formatNumber(purchaseCost)} for ${this.ns.formatNumber(mostRam)} RAM`, 3);
      return "mid";
    } else {
      this.logger.log(`No plans found!`, 3);
    }


    return gameState;

  }


/* --- end ---------- AIO FUNCTION DEFINITIONS -------------------------------------------------------------- */
}

/* ---------------- ENTRY POINT -------------------------------------------------------------------------- */
export async function main(ns: NS) {
  // parse arguments
  ns.disableLog("ALL");

  // construct AIO, which begins main loop
  const aio: AIO = new AIO(ns);
  aio.start();

}

/* --------------------------------------------------------------------------------------------------------- */
/* --------------------- PUBLIC DEFINITIONS ---------------------------------------------------------------- */
/* --------------------------------------------------------------------------------------------------------- */

/**
 * Loads the configuration data from the specified configuration file.
 * @param {NS} ns - The NS object.
 * @returns {object} - The parsed configuration data.
 */
function loadConfig(ns: NS) {
  return JSON.parse(ns.read(CONFIG_FILE));
}

/**
 * Determines the lowest "n" for 2^n that will fit a particular number.
 * @param number - The number to fit.
 * @returns The lowest "n" such that 2^n is greater than or equal to the given number.
 */
function findLowestPowerOfTwo(num: number): number {
  if (num <= 0) {
      throw new Error("Number must be greater than zero");
  }
  return Math.ceil(Math.log2(num));
}
