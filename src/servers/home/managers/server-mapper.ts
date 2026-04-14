import { buildServerDB } from "@/lib/db";
import { BaseManager } from "@/lib/BaseManager";

class ServerMapperEngine extends BaseManager {
   start() {
      this.logger.info(`Running buildServerDB..`);
      buildServerDB(this.ns);
      this.finish();
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const sme = new ServerMapperEngine(ns, ns.args);
   sme.start();
}