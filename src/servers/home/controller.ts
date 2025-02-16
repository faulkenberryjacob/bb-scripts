/*
* PURPOSE:
*   To target a server remotely and efficiently guide the
*   weaken/grow/hack workers as quickly as possible.
*
* HOW:
*   The Controller will be streaming server data and
*   intelligently starting/killing required scripts to 
*   maximize the amount of memory available on the host.
*/



/* 
 * 
 * 1. IF a server is not at maximum money AND not at minimum security, run the Preparation algorithm
 *    1a. The Preparation algorithm tries to maximize grow() threads to return a server's money
 *        available to its maxMoney - in as little as one run. It then determines what the
 *        security increase would be for that action, then runs weaken() to counter it.
 *    1b. Once the grow() and weaken() Workers report that they're done to their PID ports,
 *        the Controller will return to step 1.
 * 2. IF a server is at maximum money AND at minimum security, run the Hacking algorithm
 *    2a. The Hacking algorithm tries to maximize hack() so that it can steal all the server's
 *        money in as little as a single batch.
 *    2b. It will then work similarly to the Prep algorithm and use a following weaken() to
 *        counter the hack()'s security increase, then finish with a grow() and weaken() to 
 *        bring the money back to max with minimum security.
 *    2c. Once the hack(), grow(), and weaken() workers report that they're done to their
 *        PID ports, the Controller will return to step 1 (in case the Hack algorithm
 *        did not work perfectly)
 *
 *
 *
 *
 *
*/

//import * as utils from 'utils';
import { Worker } from '@/lib/types';
import { Logger } from '@/lib/logger';
import { loadConfig } from '@/lib/defaults';
import { formatTime } from '@/lib/formatter';
import * as algo from '@/lib/hack-algorithm';

export async function main(ns: NS) {
  const TARGET_HOSTNAME: string = ns.args[0].toString();
  const CURRENT_SERVER: string  = ns.getHostname();

  const config = loadConfig(ns);
  const PORT   = getRandomInt(100, 1000000);

  const logger = new Logger(ns);
  ns.disableLog("ALL");
  const handler = ns.getPortHandle(PORT);
  handler.clear();

  logger.log(`--- FACTORY STARTUP targeting ${TARGET_HOSTNAME} ---`);
  logger.log(`---- HOSTED ON ${CURRENT_SERVER} ---- `)

  const maxMoney = ns.getServerMaxMoney(TARGET_HOSTNAME);
  const minSecurity = ns.getServerMinSecurityLevel(TARGET_HOSTNAME);

  // return if no money can be made
  if (maxMoney <= 0) { return; }
  while (true) {
    logger.log(`Security: ${ns.getServerSecurityLevel(TARGET_HOSTNAME)} /  ${ns.getServerMinSecurityLevel(TARGET_HOSTNAME)}`);
    logger.log(`Money: ${ns.formatNumber(ns.getServerMoneyAvailable(TARGET_HOSTNAME))} / ${ns.formatNumber(ns.getServerMaxMoney(TARGET_HOSTNAME))}`);

    const moneyNotMaxed = ns.getServerMoneyAvailable(TARGET_HOSTNAME) < maxMoney;
    const securityNotMinimal = ns.getServerSecurityLevel(TARGET_HOSTNAME) > minSecurity;
    if (moneyNotMaxed || securityNotMinimal) {
      const isPrepped: boolean = await prepServer(TARGET_HOSTNAME);
      if (!isPrepped) {
        logger.log(`Could not find prep algorithm for ${TARGET_HOSTNAME}, aborting`);
        return;
      }
    } else {
      await hackServer(TARGET_HOSTNAME);
    }

    logger.log(`Security: ${ns.getServerSecurityLevel(TARGET_HOSTNAME)} /  ${ns.getServerMinSecurityLevel(TARGET_HOSTNAME)}`);
    logger.log(`Money: ${ns.formatNumber(ns.getServerMoneyAvailable(TARGET_HOSTNAME))} / ${ns.formatNumber(ns.getServerMaxMoney(TARGET_HOSTNAME))}`);
  }

  /**
   * Prepares the target server by running grow and weaken scripts until the server's security is minimized and money is maximized.
   * @param {string} target - The target server to prepare.
   */
  async function prepServer(target: string) {
    logger.log(`--- PREP START ------------------------------`);
    let prepPids: Set<number> = new Set;

    // loop growing/weakening until we hit our desired threshold
    const plan = await algo.maxPrepAlgorithm(ns, target, CURRENT_SERVER);
    if (plan.length == 0 ) {
      logger.log(`ERROR (${CURRENT_SERVER}) -- no PREP algorithm found for ${TARGET_HOSTNAME}, aborting`);
      return false;
    }

    for (let i = 0; i < plan.length; i++) {
      if (plan[i].threads == 0){ continue; }
      
      // tell the script what Port to report to
      plan[i].args.push(PORT.toString());

      // start the worker
      const pid = ns.exec(plan[i].script, CURRENT_SERVER, plan[i].threads, ...plan[i].args)
      if (pid == 0) {
        logger.tlog(`ERROR: ns.exec(${plan[i].script}, ${CURRENT_SERVER}, ${plan[i].threads}, ${plan[i].args.join(', ')} failed)`);
        break;
      } else {
        prepPids.add(pid);
        const executeTime = plan[i].runTime + Number(plan[i].args[1]);
        const strExecuteTime = formatTime(executeTime);

        logger.log(`${plan[i].script} (${plan[i].threads}) with args ${plan[i].args} will execute in ${strExecuteTime}`, 1);
      }
    }

    // watch our PORT for any reporting workers. when they report, aggregate their
    // data and remove them from the pid set. Once the pid set is empty, we know
    // all our workers are done
    logger.log(`Watching port ${PORT} and waiting for workers to finish..`);
    let scriptsRunning = true;
    let counter = 0;
    while (scriptsRunning) {
      if (await handler.peek() != `NULL PORT DATA`) {
        // we have data! parse the JSON and assume it's one of our worker types
        const data: Worker = JSON.parse(await handler.read());
        if (prepPids.has(data.pid)) {
          logger.log(`Worker ${data.script} (${data.pid}) reported!`,1)
          switch (data.script) {
            case `hack.ts`:
              logger.log(`HACK stole ${ns.formatNumber(data.value)}`,2);
              break;
            case `grow.ts`:
              logger.log(`GROW ${ns.formatNumber(data.value)}, putting money at ${ns.getServerMoneyAvailable(TARGET_HOSTNAME)} / ${maxMoney}`,2)
              break;
            case `weaken.ts`:
              logger.log(`WEAKEN ${data.value}, putting security at ${ns.getServerSecurityLevel(TARGET_HOSTNAME)} / ${minSecurity}`,2);
              break;
            default:
              logger.log(`UNKNOWN data: ${data.pid}, ${data.script}, ${data.value}`,2);
              break;
          }

          // remove that process from our set
          prepPids.delete(data.pid);
        }
      }

      // when our set is empty, all our processes finished.
      if (prepPids.size == 0) {
        scriptsRunning = false;
      }
      await ns.sleep(25);

      // wait 1 minute to report pending PIDs
      counter++;
      if (counter >= 2400) {
        counter = 0;
        let pidsString = "";
        prepPids.forEach(p => pidsString = pidsString + p.toString());
        logger.log(`Waiting on PIDS: ${pidsString}`);
      }
    }

    const usedRamPercent = parseFloat((ns.getServerUsedRam(CURRENT_SERVER) / ns.getServerMaxRam(CURRENT_SERVER)).toFixed(2));
    logger.log(`Done waiting! Server is using ${usedRamPercent}% RAM`, 1);

    logger.log(`---------------------------------`);
    logger.log("");
    return true;
  }

  /**
   * Executes a hacking algorithm on the target server, running grow, weaken, and hack scripts in a loop.
   * @param {string} target - The target server to hack.
   */
  async function hackServer(target: string) {
    logger.log(`--- HACK START ------------------------------`);
    let hackPids: Set<number> = new Set;

    // get the algorithm plan
    const plan: algo.HackAlgorithm[] = await algo.maxHackAlgorithm(ns, TARGET_HOSTNAME, CURRENT_SERVER);
    if (plan.length == 0) {
      logger.tlog(`ERROR (${CURRENT_SERVER}) -- no HACK algorithm found for ${TARGET_HOSTNAME}, returning to prep`);
      logger.log(`Security: ${ns.getServerSecurityLevel(target)} /  ${ns.getServerMinSecurityLevel(target)}`,1);
      logger.log(`Money: ${ns.formatNumber(ns.getServerMoneyAvailable(target))} / ${ns.formatNumber(ns.getServerMaxMoney(target))}`,1);
      return false;
    }

    
    for (let i = 0; i < plan.length; i++) {
      if (plan[i].threads == 0){ continue; }
      plan[i].args.push(PORT.toString());

      const processId = await ns.exec(plan[i].script, CURRENT_SERVER, plan[i].threads, ...plan[i].args);
      if (processId == 0) {
        logger.log(`ERROR: ns.exec(${plan[i].script}, ${CURRENT_SERVER}, ${plan[i].threads}, ${plan[i].args.join(', ')} failed)`);
        return false;
      } else {
        hackPids.add(processId);
        const executeTime = plan[i].runTime + Number(plan[i].args[1]);
        const strExecuteTime = formatTime(executeTime);

        logger.log(`${plan[i].script} (${plan[i].threads}) with args ${plan[i].args} will execute in ${strExecuteTime}`, 1);
      }       
    }

  // watch our PORT for any reporting workers. when they report, aggregate their
  // data and remove them from the pid set. Once the pid set is empty, we know
  // all our workers are done
  logger.log(`Watching port ${PORT} and waiting for workers to finish..`);
  let scriptsRunning = true;
  let counter: number = 0;
  while (scriptsRunning) {
    if (await handler.peek() != `NULL PORT DATA`) {
      // we have data! parse the JSON and assume it's one of our worker types
      const data: Worker = JSON.parse(await handler.read());
      if (hackPids.has(data.pid)) {
        logger.log(`Worker ${data.script} (${data.pid}) reported!`,1)
        switch (data.script) {
          case `hack.ts`:
            logger.log(`HACK stole ${ns.formatNumber(data.value)}`,2);
            break;
          case `grow.ts`:
            logger.log(`GROW ${ns.formatNumber(data.value)}, putting money at ${ns.getServerMoneyAvailable(TARGET_HOSTNAME)} / ${maxMoney}`,2)
            break;
          case `weaken.ts`:
            logger.log(`WEAKEN ${data.value}, putting security at ${ns.getServerSecurityLevel(TARGET_HOSTNAME)} / ${minSecurity}`,2);
            break;
          default:
            logger.log(`UNKNOWN data: ${data.pid}, ${data.script}, ${data.value}`,2);
            break;
        }

        // remove that process from our set
        hackPids.delete(data.pid);
      }
    }

    // when our set is empty, all our processes finished.
    if (hackPids.size == 0) {
      scriptsRunning = false;
    }
    await ns.sleep(25);

    // wait 1 minute to report pending PIDs
    counter++;
    if (counter >= 2400) {
      counter = 0;
      let pidsString = "";
      hackPids.forEach(p => pidsString = pidsString + p.toString());
      logger.log(`Waiting on PIDS: ${pidsString}`);
    }
  }

    const usedRamPercent = ((ns.getServerUsedRam(CURRENT_SERVER) / ns.getServerMaxRam(CURRENT_SERVER))*100);
    logger.log(`Done waiting! Server is using ${usedRamPercent}% RAM`, 1);

    logger.log(`---------------------------------`);
    logger.log("");

    return true;
  }
}

/**
 * Generates a random integer between the specified minimum and maximum values, inclusive.
 * 
 * @param {number} min - The minimum value (inclusive).
 * @param {number} max - The maximum value (inclusive).
 * @returns {number} - A random integer between min and max.
 */
function getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}