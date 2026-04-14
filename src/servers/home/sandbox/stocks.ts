import * as C from "@/lib/constants";
import { formatDollar } from "@/lib/formatter";
import { Logger } from "@/lib/logger";

/*
    My limited, rambling stock strategy will be recorded here.

    When we only have basic TIX API access:
        Focus on basic Longs, or typical stock trading. We likely
        don't have access to Limit or Stop orders until we finish
        a later BitNode so we'll have to do that manually.

        Commission fees are brutal, so we should bulk buy.







*/

export  function main(ns: NS) {
    ns.disableLog("ALL");
    const logger = new Logger(ns);

    const WSE_ACCOUNT_COST          = ns.stock.getConstants().WSEAccountCost;
    const TIX_API_COST              = ns.stock.getConstants().TIXAPICost;
    const MARKET_DATA_TIX_API_COST  = ns.stock.getConstants().MarketDataTixApi4SCost;
    const MARKET_DATA_COST          = ns.stock.getConstants().MarketData4SCost;

    let hasWSEAccount: boolean          = false;
    let hasTIXAPIAccess: boolean        = false;
    let hasMarketTIXAPIAccess: boolean  = false;
    let hasMarketData: boolean          = false;

    // Check our accesses
    hasWSEAccount =  checkWSEAccountAccess();
    hasTIXAPIAccess =  checkTIXAPIAccess();
    hasMarketTIXAPIAccess =  check4SMarketTIXAPIAccess();
    hasMarketData =  check4SMarketDataAccess();

    
    
 
    
    // ________________________________________________________________________________ 
    //    FUNCTION DEFINITIONS
    // ````````````````````````````````````````````````````````````````````````````````

     function checkWSEAccountAccess() : boolean {
        // Check if we have a WSE account, and try to buy it if we don't
        if (!ns.stock.hasWSEAccount) {
            if (ns.getPlayer().money - WSE_ACCOUNT_COST > C.MONEY_BUFFER) {
                const wseAccountSuccess: boolean = ns.stock.purchaseWseAccount();
                if (!wseAccountSuccess) {
                    logger.warn(`Failed to purchase WSE account for ${formatDollar(ns, WSE_ACCOUNT_COST)}.`);
                    return false;
                }
            } else {
                logger.warn(`Cannot afford WSE account. Need ${formatDollar(ns, WSE_ACCOUNT_COST - ns.getPlayer().money + C.MONEY_BUFFER)} more to purchase while maintaining money buffer.`);
                return false;
            }
        }
        return true;
    }

     function checkTIXAPIAccess() : boolean {
        // Check if we have TIX API access, and try to buy it if we don't
        if (!ns.stock.hasTIXAPIAccess) {
            if (ns.getPlayer().money - TIX_API_COST > C.MONEY_BUFFER) {
                const tixAPISuccess: boolean = ns.stock.purchaseTixApi();
                if (!tixAPISuccess) {
                    logger.warn(`Failed to purchase TIX API access for ${formatDollar(ns, TIX_API_COST)}.`);
                    return false;
                }
            } else {
                logger.warn(`Cannot afford TIX API access. Need ${formatDollar(ns, TIX_API_COST - ns.getPlayer().money + C.MONEY_BUFFER)} more to purchase while maintaining money buffer.`);
                return false;
            }
        }
        return true;
    }

     function check4SMarketTIXAPIAccess() : boolean {
        // Check if we have Market TIX API access, and try to buy it if we don't
        if (!ns.stock.has4SDataTIXAPI) {
            if (ns.getPlayer().money - MARKET_DATA_TIX_API_COST > C.MONEY_BUFFER) {
                const tixMarketAPISuccess: boolean = ns.stock.purchase4SMarketDataTixApi();
                if (!tixMarketAPISuccess) {
                    logger.warn(`Failed to purchase Market TIX API access for ${formatDollar(ns, MARKET_DATA_TIX_API_COST)}.`);
                    return false;
                }
            } else {
                logger.warn(`Cannot afford Market TIX API access. Need ${formatDollar(ns, MARKET_DATA_TIX_API_COST - ns.getPlayer().money + C.MONEY_BUFFER)} more to purchase while maintaining money buffer.`);
                return false;
            }
        }
        return true;
    }

     function check4SMarketDataAccess() : boolean {
        // Check if we have Market data access, and try to buy it if we don't
        if (!ns.stock.has4SData) {
            if (ns.getPlayer().money - MARKET_DATA_COST > C.MONEY_BUFFER) {
                const marketDataSuccess: boolean = ns.stock.purchase4SMarketData();
                if (!marketDataSuccess) {
                    logger.warn(`Failed to purchase Market data for ${formatDollar(ns, MARKET_DATA_COST)}.`);
                    return false;
                }
            } else {
                logger.warn(`Cannot afford Market data. Need ${formatDollar(ns, MARKET_DATA_COST - ns.getPlayer().money + C.MONEY_BUFFER)} more to purchase while maintaining money buffer.`);
                return false;
            }
        }
        return true;
    }
}