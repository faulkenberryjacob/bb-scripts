//import { CityName, LocationName } from 'NetscriptDefinitions';

import { NetscriptPort, ScriptArg, Server } from "NetscriptDefinitions"

// ________________________________________________________________________________ 
//    Hack algorithm types 
// ````````````````````````````````````````````````````````````````````````````````

export class Worker {
  pid: number;
  script: string;
  value: number;
  host?: string;
  duration?: number;

  constructor(pid: number, script: string, value: number, host?: string, duration?: number) {
    this.pid = pid;
    this.script = script;
    this.value = value;
    this.host = host;
    this.duration = duration;
  }

  toString(): string {
    return `Worker { pid: ${this.pid}, script: ${this.script}, value: ${this.value}, host: ${this.host}, duration: ${this.duration}ms }`;
  }
}

export type Controller = {
  name: string,
  host: string,
  pid: number,
  args?: string[]
}

export type Plan = {
  script: string,
  threads: number,
  args: string[],
  runTime: number
}


// ________________________________________________________________________________ 
//    GO types 
// ````````````````````````````````````````````````````````````````````````````````

export type Move = {
  type: "move" | "pass" | "gameOver";
  x?: number | null;
  y?: number | null;
}

export type GoOpponent =
  | "Netburners"
  | "Slum Snakes"
  | "The Black Hand"
  | "Tetrads"
  | "Daedalus"
  | "Illuminati"
  | "????????????";

export type BoardSize = 5 | 7 | 9 | 13;

export type AdjacentNodes = {
  north: string | undefined,
  east: string | undefined,
  south: string | undefined,
  west: string | undefined
};


// ________________________________________________________________________________ 
//    Gang types 
// ````````````````````````````````````````````````````````````````````````````````

export type GangEquipment = {
  [type: string]: string[];
}

export type GangTask = {
  name: string,
  moneyGain: number,
  respectGain: number,
  wantedLevelGain: number,
  agiExp: number,
  chaExp: number,
  defExp: number,
  dexExp: number,
  strExp: number,
  hackExp: number
}

// ________________________________________________________________________________ 
//    Stock types 
// ````````````````````````````````````````````````````````````````````````````````

export enum StockPosition {
  LONG = "Long",
  SHORT = "Short"
}

// ________________________________________________________________________________ 
//    Meta types 
// ````````````````````````````````````````````````````````````````````````````````

export interface ServerData extends Server {
  freeRam: number,
  ramBuffer: number,
  minRamForHack?: number,
  minRamForPrep?: number
}

// Gets time interval via milliseconds
export enum Time {
  SECOND = 1000,
  MINUTE = 60000,
  HOUR = 3600000
}

export const exitCodeMessages: Record<number, string> = {
  0: "Success",
  1: "Execution failure",
  2: "Not enough space",
  3: "Script not found"
}

export enum ManagerExitCode {
  SUCCESS = 0,
  FAILURE = 1,
  UNOBTAINABLE = 2
}

export const ManagerExitCodes: Record<number, string> = {
  0: "Success",
  1: "Execution failure",
  2: "Not obtainable at this point in the game"
}

export interface RunnerConfig {
  fn: () => number;
  enabled: boolean;
  name: string;
  script: string;
  args?: string[];
}

export enum Priority {
  REQUIRED = 0,
  PRIORITY = 1,
  STANDARD = 2
}

export interface ScriptConfigOptions {
   args?: Record<string, ScriptArg>;
   port?: number;
   homeLocked?: boolean;
   isRunning?: boolean;
}

export interface ScriptConfig {
  script: string,
  priority: Priority,
  args?: ScriptArg[],
  port?: number,
  homeLocked?: boolean,
  pid?: number,
  host?: string
}

export function updateScriptConfigArg(config: ScriptConfig, key: string, newValue: ScriptArg) {
  if (!config.args) return;

  // Find the index of the JSON string that contains this key
  const index = config.args.findIndex(arg => {
    try {
      return key in JSON.parse(arg as string);
    } catch { return false; }
  });

  const newEntry = JSON.stringify({ [key]: newValue });

  if (index !== -1) {
    // Modify existing
    config.args[index] = newEntry;
  } else {
    // Add new if it didn't exist
    config.args.push(newEntry);
  }
}

export class PriorityQueue {
  private required: ScriptConfig[] = [];
  private priority: ScriptConfig[] = [];
  private standard: ScriptConfig[] = [];

  enqueue(config: ScriptConfig): void {
    // Check if script already exists in any queue
    if (this.exists(config.script)) {
      return; // Don't add duplicate
    }

    if (config.priority === Priority.REQUIRED) {
      this.required.push(config);
    } else if (config.priority === Priority.PRIORITY) {
      this.priority.push(config);
    } else {
      this.standard.push(config);
    }
  }

  dequeue(): ScriptConfig | undefined {
    // Check Required first, then Priority, then Standard
    if (this.required.length > 0) return this.required.shift();
    if (this.priority.length > 0) return this.priority.shift();
    if (this.standard.length > 0) return this.standard.shift();
    return undefined;
  }

  peek(): ScriptConfig | undefined {
    // Check Required first, then Priority, then Standard
    if (this.required.length > 0) return this.required[0];
    if (this.priority.length > 0) return this.priority[0];
    if (this.standard.length > 0) return this.standard[0];
    return undefined;
  }

  exists(scriptName: string): boolean {
    return this.required.some(c => c.script === scriptName) ||
      this.priority.some(c => c.script === scriptName) ||
      this.standard.some(c => c.script === scriptName);
  }

  isEmpty(): boolean {
    return this.required.length === 0 &&
      this.priority.length === 0 &&
      this.standard.length === 0;
  }

  size(): number {
    return this.required.length + this.priority.length + this.standard.length;
  }
}

export class Queue<T> {
  private items: T[] = [];

  // Add to end (enqueue)
  enqueue(element: T): void {
    this.items.push(element);
  }

  // Remove from front (dequeue)
  dequeue(): T | undefined {
    return this.items.shift();
  }

  // Check front without removing
  peek(): T | undefined {
    return this.items[0];
  }

  // Check if empty
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  // Get size
  size(): number {
    return this.items.length;
  }

  includes(element: T): boolean {
    return this.items.includes(element);
  }
}

export type Script = {
  name: string,
  args: string[],
  port?: number
}

export const enum LogLevel {
  INFO,
  WARN,
  ERROR,
  DEBUG
}

export interface DarkWebProgram {
  name: string;
  cost: number;
  owned: boolean;
}

export type BracketPair = {
  [key: string]: string;
};

export const BRACKET_PAIRS: BracketPair = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
};

export enum InfiltrationGame {
  CloseTheBrackets,
  TypeItBackwards,
  SaySomethingNiceAboutTheGuard,
  EnterTheCode,
  MatchTheSymbols,
  RememberTheMines,
  CutTheWires
}

// export type CityLocations = Record<CityName, LocationName[]>;

// export const CITY_LOCATIONS: CityLocations = {
//   [CityName.Aevum]: [
//     LocationName.AevumAeroCorp,
//     LocationName.AevumBachmanAndAssociates,
//     LocationName.AevumClarkeIncorporated,
//     LocationName.AevumCrushFitnessGym,
//     LocationName.AevumECorp,
//     LocationName.AevumFulcrumTechnologies,
//     LocationName.AevumGalacticCybersystems,
//     LocationName.AevumNetLinkTechnologies,
//     LocationName.AevumPolice,
//     LocationName.AevumRhoConstruction,
//     LocationName.AevumSnapFitnessGym,
//     LocationName.AevumSummitUniversity,
//     LocationName.AevumWatchdogSecurity,
//     LocationName.AevumCasino,
//   ],
//   [CityName.Chongqing]: [
//     LocationName.ChongqingKuaiGongInternational,
//     LocationName.ChongqingSolarisSpaceSystems,
//     LocationName.ChongqingChurchOfTheMachineGod
//   ],
//   [CityName.Ishima]: [
//     LocationName.IshimaNovaMedical,
//     LocationName.IshimaOmegaSoftware,
//     LocationName.IshimaStormTechnologies,
//     LocationName.IshimaGlitch
//   ],
//   [CityName.NewTokyo]: [
//     LocationName.NewTokyoDefComm,
//     LocationName.NewTokyoGlobalPharmaceuticals,
//     LocationName.NewTokyoNoodleBar,
//     LocationName.NewTokyoVitaLife,
//     LocationName.NewTokyoArcade
//   ],
//   [CityName.Sector12]: [
//     LocationName.Sector12AlphaEnterprises,
//     LocationName.Sector12BladeIndustries,
//     LocationName.Sector12CIA,
//     LocationName.Sector12CarmichaelSecurity,
//     LocationName.Sector12CityHall,
//     LocationName.Sector12DeltaOne,
//     LocationName.Sector12FoodNStuff,
//     LocationName.Sector12FourSigma,
//     LocationName.Sector12IcarusMicrosystems,
//     LocationName.Sector12IronGym,
//     LocationName.Sector12JoesGuns,
//     LocationName.Sector12MegaCorp,
//     LocationName.Sector12NSA,
//     LocationName.Sector12PowerhouseGym,
//     LocationName.Sector12RothmanUniversity,
//     LocationName.Sector12UniversalEnergy
//   ],
//   [CityName.Volhaven]: [
//     LocationName.VolhavenCompuTek,
//     LocationName.VolhavenHeliosLabs,
//     LocationName.VolhavenLexoCorp,
//     LocationName.VolhavenMilleniumFitnessGym,
//     LocationName.VolhavenNWO,
//     LocationName.VolhavenOmniTekIncorporated,
//     LocationName.VolhavenOmniaCybersystems,
//     LocationName.VolhavenSysCoreSecurities,
//     LocationName.VolhavenZBInstituteOfTechnology
//   ],
// };