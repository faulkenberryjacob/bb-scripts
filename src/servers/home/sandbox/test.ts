import { Logger } from "@/lib/logger";
import { GangEngine } from "@/lib/gang";

/** @param {NS} ns **/
export  function main(ns: NS) {
  const logger = new Logger(ns);
  ns.disableLog("ALL");

  const gangEngine = new GangEngine(ns);

   gangEngine.start();
}
