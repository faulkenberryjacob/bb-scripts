export async function main(ns: NS) {
  const files: string[] = ns.ls(`home`).filter((file: string) => file.endsWith(`.ts`));
  for (let file of files) {
    ns.tprint(`Removing ${file}`);
    ns.rm(file, `home`)
  }
}