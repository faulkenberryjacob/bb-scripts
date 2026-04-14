import { Worker } from '@/lib/types';

export async function main(ns: NS) {
  if (ns.args.length < 3) {
    ns.print(`Not enough arguments [${ns.args}] provided for weaken.ts`);
    return;
  }
  const TARGET   = ns.args[0].toString();
  const msDelay  = ns.args[1];
  const DELAY: number = msDelay ? Number(msDelay) : 0;
  const PORT     = Number(ns.args[2]);

  const weakenAmount = await ns.weaken(TARGET, {additionalMsec: DELAY});
  
  const envelope: Worker = {
    pid: ns.pid,
    host: ns.getHostname(),
    script: ns.getScriptName(),
    value: weakenAmount
  };
  ns.print(`${ns.getScriptName()} finished, writing to port: ${JSON.stringify(envelope)}`);
  const jsonEnvelope = JSON.stringify(envelope);
  ns.tryWritePort(PORT, jsonEnvelope);
}