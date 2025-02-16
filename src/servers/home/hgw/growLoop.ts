export async function main(ns: NS) {
  const TARGET = ns.args[0].toString();

  while (true) {
    await ns.grow(TARGET);
  }
}