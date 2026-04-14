# bitburner-scripts
My scripts for the game BitBurner

# TL;DR
1. Run `run utils/bootstrap.js`. This does dummy logic on what stage of the game you're at and kicks off one of the `engines` to push forward some progression.
2. I recommend the following aliases:

   | Alias                                | Description |
   | ------------------------------------ | ----------- |
   | `alias dryrun=run utils.js dryrun`            | Takes two arguments: targetServer and hostname. Prints out the results of the HGW algorithm assuming its trying to hack `targetServer` with the resources of `hostname` |
   | `alias infil=run utils/infiltrate.js`         | Prints out the best infiltration targets, their rewards, difficulty, levels, and location |
   | `alias ping=run utils.js printserverdata`     | A cheap and manual ServerProfiler that prints out the data of the passed-in hostname. This is assuming you've compiled the `server-database.json` with either utils.js `buildserverdb` argument, or automatically via `engine.js` |
   | `alias tree=run utils.js getserverpaths`      | Creates a `server-paths.txt` that creates an indented view of how hostnames network with each other |
   | `alias rep=run utils.js reptodonate`          | Tells you how much reputation you need to achieve the favor donation threshold |
   | `alias sa5=scan-analyze 5`                    | Quick alias for doing a full DeepScanV1  |
   | `alias sa10=scan-analyze 10`                  | Quick alias for doing a full DeepScanV2  |
   | `alias tops=run utils.js top`                 | Prints the most lucrative targets to HGW in descending order. Factors in hack success rate, timing, and max money |
   | `alias bootstrap=run utils/bootstrap.js`      | Kicks off the bootstrap dummy logic, which kicks off the appropriate `engine.js` for the state of the game you're in. Ideally this will work with optimal efficiency in any game state |
   | `alias playgo=run go/go.js Netburners 7`      | Kickoff your preferred GO script against the easiest, default enemy |
   | `alias ka=run utils.js killAll`               | Kills all scripts on all hosts |

# WIP Features
## Engine v2
- Every separate task (building server data, rooting servers, managing gang) is put into their own "engine" script, and each of these are pushed and popped from a queue and orchestrated to wherever we have free space.
   - Why? This handles all our resource concerns across progression. When we merge all functionality into a single script it will bloat its memory usage (doubly so for Singularity functions). Orchestrating out bite-sized tasks this way lets us fill up whatever space we have in smaller chunks. 
   - The end result is that the engine script will run slower in the early game, but it can at least get through everything we need. Anything that hogs up too much memory will be skipped, but will later be unlocked when we buy hosts and upgrade our home computer.