import { Worker } from '@/lib/types';

export async function main(ns: NS) {
  if (ns.args.length < 3) {
    ns.print(`Not enough arguments [${ns.args}] provided for hack.ts`);
    return;
  }
  const TARGET   = ns.args[0].toString();
  const msDelay  = ns.args[1];
  const DELAY: number = msDelay ? Number(msDelay) : 0;
  const PORT     = Number(ns.args[2]);
  
  const stolen = await ns.hack(TARGET, {additionalMsec: DELAY});

  const envelope: Worker = {
    pid: ns.pid,
    script: `hack.ts`,
    value: stolen
  };
  const jsonEnvelope = JSON.stringify(envelope);
  ns.tryWritePort(PORT, jsonEnvelope);
}