import { Worker } from '@/lib/types';

export async function main(ns: NS) {
  if (ns.args.length < 3) {
    ns.print(`Not enough arguments [${ns.args}] provided for grown.ts`);
    return;
  }
  const TARGET   = ns.args[0].toString();
  const msDelay  = ns.args[1];
  const DELAY: number = msDelay ? Number(msDelay) : 0;
  const PORT     = Number(ns.args[2]);

  const growAmount = await ns.grow(TARGET, {additionalMsec: DELAY});

  const envelope: Worker = {
    pid: ns.pid,
    host: ns.getHostname(),
    script: ns.getScriptName(),
    value: growAmount
  };
  ns.print(`${ns.getScriptName()} finished, writing to port: ${JSON.stringify(envelope)}`);
  const jsonEnvelope = JSON.stringify(envelope);
  while (!ns.tryWritePort(PORT, jsonEnvelope)) { await ns.sleep(1); }
}