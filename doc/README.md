# bitburner-scripts
My scripts for the game BitBurner

# TL;DR
1. Run `run utils.ts maxRam` to find out how much RAM you can disperse across your server limit, then set that amount under `defaultServerPurchaseRam` in `config.json`.
2. Run `run generator.ts` to keep that lil' engine chugging along and constantly rooting servers.
3. Run `run parasite.ts home` to get a factory going on your home machine, presuming you have enough RAM to do so.
   - If you DON'T have enough RAM, try `run parasite.ts starter`
4. Once you are able to purchase servers of decent RAM (revert to step 1 to check), you can begin with `run parasite.ts auto` to target the top earning servers.
5. Once that is successful, `run parasite.ts share` to get `share()` functions going on unowned servers and boost your reputation gain.

# Usage
## config.json
Put all your desired settings in here. Script names, the amount of default RAM you want to purchase for servers, etc.

## utils.ts 
Contains all the main "important" functionality of my scripts. Most of the time I am adding useful functions in here and importing into other scripts.

``` 
utils.ts [FUNCTION] [arguments?]
-----------------------------------------
buildServerDb              Recurses through all servers, converts them to JSON objects, and writes to a json file.
                           The JSON filename is configurable in config.json

printServerData [server]   Prints all the target server's variables in JSON format in the terminal.

dryrun [server] [host]     Prints the Prep and Hack algorithm output assuming we are targeting [server] while
                           ran on the [host].

maxRam                     Prints the maximum RAM you can purchase equally among the purchased server limit.
```



## generator.ts
Runs on a constant cycle performing two basic duties:
1. `rootServers()` - recursively seeks through all servers and their connections and attempts to root them. More specifically, will check their required hacking level, open ports by intelligently checking what port-opening programs we have, and nukes them to gain admin access.
2. `buildServerDB()` - same as described in the `utils.ts` help above.



## factory.ts
Sets up ideal hack/grow/weaken algorithms on its current server.
``` 
factory.ts [targetServer]
```

The factory's ultimate goal is peak efficiency - and it's split into two parts:
1. **The Prep Cycle**: If a server's money is low and/or it's security is high, this will determine the maximum amount of threads it can throw at the `grow.ts` and `weaken.ts` scripts. The purpose is to run `grow()` and `weaken()` so they end at the exact same time, with the `weaken()` cancelling out `grow()`'s security increase.
2. **The Hack Cycle**: Once a server is properly "prepped" (full money, minimal security), this will use an algorithm to hack the most amount of money while countering all its demerits and utilizing available RAM. More specifically, if running `hack()` with 200 threads, we want to `weaken()` enough to counteract the security increase. Immediately after we will `grow()` to counter how much money was lost, then finally `weaken()` a final time to offset the security increase.

Both of the above are done in "blocks", where a **Hack Cycle** block is something like `{hack -> weaken -> grow -> weaken}`. If a block doesn't utilize all of the factory's hosted server's memory, it will attempt to stack them atop each other, ultimately resulting in a visual like below:
```
                        |= hack 1===================|              ---
      |=weaken 1======================================|              | Block 1
                    |= grow 1=========================|              |
        |=weaken 2======================================|          ---
                              |= hack 2===================|        ---
          |=weaken 3======================================|          | Block 2
                        |= grow 2=========================|          |
            |=weaken 4======================================|      ---
  
```

## parasite.ts
The starting point for our lil' hackathon. This combines much of the above into an all-in-one process.
```
parasite.ts [FUNCTION] [arguments?]
-----------------------------------------
Parasite gives you various ways to orchestrate your factories based on what you want to target and where you
want to host everything. This is ultimately what will purchase your servers, transfer your files,
and kickoff your factories.


top                Targets the server with highest maxMoney attribute and that is also hackable.
                   Only requests 1 host if you don't have one.

target [server]    Targets a server of your choosing. Only requests 1 host if you don't have one.

share              Copies over and kicks off the shareLoop.ts script on all unowned servers with
                   the maximum possible thread count.

starter            Copies over and kicks off the configured 'starterHackScriptName' on all
                   unowned servers with maximum thread count.

auto               Find the top N servers with the highest maxMoney attribute (in descending order)
                   and that is also hackable. Spins up as many hosts as possible to target them.
                   ex: If you can target 17 servers, it will purchase 17 hosts and kick off factories
                   on them.

home               Starts a factory on your home machine with a configurable 'homeRamBuffer' space
                   so you can still run scripts on your own server.
```



## bootstrap.ts
Intended to be ran when you are starting the game with no scripts running or upon installing augmentations and 'starting over'. Meant to effectively be a startup script.


# Recommendations
1. Setup an alias with the `utils.ts printServerData` so you can easily check server information. I personally use `ping`.  
Example: `alias ping=run utils.ts printServerData`  
Usage: `ping n00dles`
2. Setup an alias for the bootstrap function, and modify `bootstrap.ts` to run whatever you want upon starting the game with no scripts running.  
Example: `alias startup=run bootstrap.ts`
3. Setup an alias for the `utils.ts dryrun` function to test algorithm output on servers.  
Example: `alias dryrun=run utils.ts dryrun`  
Usage: `dryrun n00dles home`
4. Run the `utils.ts maxRam` function every now and then, and if you're comfortable with the given amount, use it in your config.json field `defaultServerPurchaseRam`