import * as consts from '@/lib/constants';
import { LogLevel } from '@/lib/types';
import { Logger } from '@/lib/logger';

export async function main(ns: NS) {
  ns.disableLog("ALL");
  const logger = new Logger(ns, LogLevel.DEBUG);

  // startup UI hacks

  // Start engine script depending on current progression level
  if (ns.getServerMaxRam(`home`) < (ns.getScriptRam(consts.ENGINE_SCRIPT) + consts.HOME_RAM_BUFFER)) {
    // STARTER
    logger.debug(`Running starter script: ${consts.ENGINE_STARTER_SCRIPT}`);
    if (!ns.isRunning(consts.ENGINE_STARTER_SCRIPT, `home`)) {
      logger.info(`Starting ${consts.ENGINE_STARTER_SCRIPT}..`,0,true);
      ns.killall(`home`, true);
      ns.exec(consts.ENGINE_STARTER_SCRIPT, `home`, 1);
    } else {
      logger.warn(`${consts.ENGINE_STARTER_SCRIPT} is already running!`);
    }
  } else {
    // ENDGAME
    logger.debug(`Running endgame scripts`);
    if (!ns.isRunning(consts.ENGINE_SCRIPT, `home`)) {
      logger.info(`Starting ${consts.ENGINE_SCRIPT}..`,0,true);
      ns.killall(`home`, true);
      ns.exec(consts.ENGINE_SCRIPT, `home`, 1);
    } else {
      logger.warn(`${consts.ENGINE_SCRIPT} is already running!`);
    }
  }

  await ns.sleep(1000);

  // startup local and remove parasites
  // if (ns.exec('parasite.js', 'home', 1, ...['home']) != 0) {
  //   logger.info(`[parasite.js home] started successfully`, 0, true);
  // } else {
  //   logger.error(`[parasite.js home] FAILED`);
  // }

  // if (ns.exec('parasite.js', 'home', 1, ...['starter']) != 0) {
  //   logger.info(`[parasite.js starter] started successfully`, 0, true);
  // } else {
  //   logger.error(`[parasite.js starter] FAILED`);
  // }

}