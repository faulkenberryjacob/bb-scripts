export async function main(ns: NS) {
  const TARGET = ns.args[0].toString();

  await ns.hack(TARGET);
}