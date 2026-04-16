import { buildServerDB } from "@/lib/db";
import { BaseManager } from "@/lib/BaseManager";
import * as consts from "@/lib/constants";
import { LogLevel } from "@/lib/types";

class ServerMapperEngine extends BaseManager {
   async start() {
      this.logger.setLogLevel(LogLevel.DEBUG);
      //this.ns.ui.openTail();
      await buildServerDB(this.ns);
      this.success();
   }
}

export async function main(ns: NS) {
   ns.disableLog("ALL");
   const sme = new ServerMapperEngine(ns, ns.args);
   await sme.start();
}