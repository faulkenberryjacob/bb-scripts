import { hasSingularity } from "@/lib/defaults";
import { Logger } from "@/lib/logger";
import * as C from "@/lib/constants";
import { GangMemberAscension, GangOtherInfo, GangTaskStats, Server, SourceFileLvl } from "NetscriptDefinitions";
import { GangEquipment } from "@/lib/types";

/** @param {NS} ns **/
export async function main(ns: NS) {
  const logger = new Logger(ns);
  ns.disableLog("ALL");

  if (!ns.gang.inGang()) {
    logger.warn(`You aren't in a gang! Exiting..`, 0, true);
    return;
  }

  let gangMembers: string[] = ns.gang.getMemberNames();
  const hackTasks = ns.gang.getTaskNames()
                    .filter(t => ns.gang.getTaskStats(t).isHacking)
                    .sort((a, b) => ns.gang.getTaskStats(a).difficulty - ns.gang.getTaskStats(b).difficulty);
  const combatTasks = ns.gang.getTaskNames()
                    .filter(t => ns.gang.getTaskStats(t).isCombat)
                    .sort((a, b) => ns.gang.getTaskStats(a).difficulty - ns.gang.getTaskStats(b).difficulty);

  for (const member of gangMembers) {
    const info = ns.gang.getMemberInformation(member);
    const asc = ns.gang.getAscensionResult(member);
    const hackMultGain = (info.hack_asc_mult * asc.hack) - info.hack_asc_mult;

    ns.tprint(`${member}: hack_asc_mult ${info.hack_asc_mult} / hack_asc_points ${info.hack_asc_points} / asc.hack ${asc.hack} -- total gain: ${hackMultGain}`);
  }
  





}
