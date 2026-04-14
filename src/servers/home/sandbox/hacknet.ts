import { defineArgs, parseArgs, printArgUsage } from "@/lib/arg";
import { MONEY_THRESHOLD } from "@/lib/constants";
import { Logger } from "@/lib/logger";

const argDefinitions = defineArgs(
  { name: "moneyThreshold", type: "number", required: false, description: "Amount of player's money we refuse to go below." }
);

export  function main(ns: NS) {
    ns.disableLog("ALL");
    const logger = new Logger(ns);
    const parsedArgs = parseArgs(ns.args, argDefinitions);

    const moneyThreshold = parsedArgs.moneyThreshold as number ?? MONEY_THRESHOLD;



    // ________________________________________________________________________________ 
    //    FUNCTION DEFINITIONS
    // ````````````````````````````````````````````````````````````````````````````````

    
}