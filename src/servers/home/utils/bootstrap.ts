import * as consts from '@/lib/constants';
import {Logger} from '@/lib/logger';

export async function main(ns: NS) {
  const logger = new Logger(ns);


  if (ns.exec(consts.ENGINE_SCRIPT, 'home', 1) != 0) {
    logger.info(`${consts.ENGINE_SCRIPT} started successfully`, 0, true);
  } else {
    logger.error(`${consts.ENGINE_SCRIPT} FAILED`);
  }

  await ns.sleep(1000);

  if (ns.exec('parasite.js', 'home', 1, ...['home']) != 0) {
    logger.info(`[parasite.js home] started successfully`, 0, true);
  } else {
    logger.error(`[parasite.js home] FAILED`);
  }

  if (ns.exec('parasite.js', 'home', 1, ...['share']) != 0) {
    logger.info(`[parasite.js share] started successfully`, 0, true);
  } else {
    logger.error(`[parasite.js share] FAILED`);
  }

}