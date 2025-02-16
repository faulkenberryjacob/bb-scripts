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
    script: `weaken.ts`,
    value: weakenAmount
  };
  const jsonEnvelope = JSON.stringify(envelope);
  ns.tryWritePort(PORT, jsonEnvelope);
}