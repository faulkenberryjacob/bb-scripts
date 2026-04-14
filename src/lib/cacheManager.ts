import { Logger } from "@/lib/logger";

const CACHE_FILE = "cache/cache.json";


export  function clearCache(ns: NS): void {
    const logger = new Logger(ns);
    ns.write(CACHE_FILE, JSON.stringify({}), "w");
    logger.debug("Cache cleared");
}

/**
 * Writes a key-value pair to the cache file.
 */
export  function write(ns: NS, key: string, value: any): void {
    const logger = new Logger(ns);
    
    try {
        // Load existing cache or create empty object
        let cache: Record<string, any> = {};
        if (ns.fileExists(CACHE_FILE)) {
            const cached = ns.read(CACHE_FILE);
            cache = JSON.parse(cached);
        }
        
        logger.debug(`Updating cache key ${key} with value: ${JSON.stringify(value)}`);
        cache[key] = value;
        
        // Write back to file
        ns.write(CACHE_FILE, JSON.stringify(cache), "w");
    } catch (error) {
        logger.error(`Failed to write cache: ${error}`);
    }
}

/**
 * Reads a value from the cache file by key.
 */
export  function read(ns: NS, key: string): any | null {
    const logger = new Logger(ns);
    
    try {
        if (!ns.fileExists(CACHE_FILE)) {
            logger.debug(`Cache file does not exist`);
            return null;
        }
        
        const cached = ns.read(CACHE_FILE);
        const cache: Record<string, any> = JSON.parse(cached);
        
        if (cache.hasOwnProperty(key)) {
            logger.debug(`Retrieved cache key ${key}: ${JSON.stringify(cache[key])}`);
            return cache[key];
        }
        
        logger.debug(`Cache key ${key} not found`);
        return null;
    } catch (error) {
        logger.error(`Failed to read cache: ${error}`);
        return null;
    }
}

/**
 * Clears a specific key from the cache.
 */
export  function clear(ns: NS, key: string): void {
    const logger = new Logger(ns);
    
    try {
        if (!ns.fileExists(CACHE_FILE)) return;
        
        const cached = ns.read(CACHE_FILE);
        const cache: Record<string, any> = JSON.parse(cached);
        
        delete cache[key];
        ns.write(CACHE_FILE, JSON.stringify(cache), "w");
        
        logger.debug(`Cleared cache key ${key}`);
    } catch (error) {
        logger.error(`Failed to clear cache: ${error}`);
    }
}