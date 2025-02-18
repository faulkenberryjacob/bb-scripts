/*
  Example boardState:
      "XX.O."
      "X..OO"
      ".XO.."
      "XXO.."
      ".XOO."

  X's are player routers
  O's are enemy routers
  . are open spaces
  # are empty spaces (null)
  
  boardState[0][0] refers to the bottom left of the visual board
  Each string is a vertical column, each character is a point
  Referring to the above, the LEFT is actually the BOTTOM of the
  visual board. Therefore to move 'up/north' would be boardState[x][y+1]?


*/

import { Move, GoOpponent, BoardSize, AdjacentNodes } from '@/lib/types';
import { RunningScript } from 'NetscriptDefinitions';

const DEAD: string = "#";

export async function main(ns: NS) {
  let wins = 0;
  let losses = 0;
  debugger;

  // Check arguments
  if (ns.args.length < 2) {
    ns.tprint(`ERROR - pass in args! run go.ts [opponent] [boardSize]`);
    return;
  }
  const opp: GoOpponent = ns.args[0].toString() as GoOpponent;
  const size: BoardSize = Number(ns.args[1]) as BoardSize;

  // Kill any current running scripts
  await killDuplicateScripts();

  ns.tprint(`Starting go.ts`);
  
  while (true) {
    // Create a new game with the given arguments
    ns.go.resetBoardState(opp, size);
    let inProgress = true;
    const opponent = await ns.go.getOpponent();
    ns.print(`Starting GO with ${opponent}`);

    while (inProgress) {
      // check for best move in main logic
      await determineBestMove();

      // check if game is over
      inProgress = ns.go.getCurrentPlayer() != "None";
    }

    ns.print(`GAME OVER!`)

    // Record wins v. losses
    const gameState = ns.go.getGameState();
    if (gameState.blackScore > gameState.whiteScore) { wins++; } 
    else { losses++; }
    ns.tprint(`WINS ${wins} / ${losses} LOSSES -- RATE: ${(wins/(wins+losses))*100} %`)

    
  }




// -------------------------------------------------------------------------------------------------------------------------------
// ----------------------------------------- FUNCTION DEFINITIONS ----------------------------------------------------------------
//--------------------------------------------------------------------------------------------------------------------------------

  async function killDuplicateScripts(): Promise<void> {
    const currentScript = ns.getRunningScript() as RunningScript;
    const server = ns.getHostname();

    ns.tprint(`Killing duplicate [${currentScript.filename}] script..`);
    const runningProcesses = ns.ps(ns.getHostname());
    for (const process of runningProcesses) {
      if (process.filename === currentScript.filename && process.pid !== currentScript.pid) {
        ns.tprint(`Killing ${process.filename} with pid ${process.pid}`, 1);
        ns.kill(process.filename, server, process.pid);
      }
    }
  }


  /**
   * Retrieves the valid moves on a Go board.
   * A move is considered valid if it is an open node (.) and not surrounded by enemy or dead spaces.
   * 
   * @returns {Promise<boolean[][]>} - A 2D array representing the valid moves on the board.
   */
  async function getValidMoves(): Promise<boolean[][]> {
    const board = ns.go.getBoardState();
    const size  = board[0].length;

    const validMoves: boolean[][] = [];
    const enemy: string = await getOpponentSymbol();
    if (enemy == "") {
      ns.tprint("ERROR - Current player is None. Is there a Go game started?");
      const empty: boolean[][] = [];
      return empty;
    }

    // Iterate through each space on the board
    for (let x = 0; x < size; x++) {
      validMoves[x] = [];
      for (let y = 0; y < size; y++) {

        // Check if space is an open node (.)
        if (board[x][y] == '.') {

          const north = board[x]?.[y+1];
          const south = board[x]?.[y-1];
          const east  = board[x+1]?.[y];
          const west  = board[x-1]?.[y];
          

          // Check if the node is surrounded
          if (   (north === enemy || north === DEAD || y+1 >= size)
              && (east  === enemy || east  === DEAD || x+1 >= size)
              && (south === enemy || south === DEAD || y-1 < 0)
              && (west  === enemy || west  === DEAD || x-1 < 0)) 
          {
            validMoves[x][y] = false;
          } else {
            validMoves[x][y] = true;
          }
        } else {
          validMoves[x][y] = false;
        }
      }
    }
    
    return validMoves;
  }



  /**
   * Retrieves the symbol of the opponent player in a Go game.
   * 
   * @returns {Promise<string>} - A promise that resolves to the opponent's symbol ("X" for White, "O" for Black), or an empty string if the current player is None.
   */
  async function getOpponentSymbol(): Promise<string> {
    const player = ns.go.getCurrentPlayer();
    if (player == "White")      { return "X"; }
    else if (player == "Black") { return "O"; }
    else { return ""; }
  }

  async function checkForNewBoard() {
    ns.print(`Checking if board is empty..`);
    const state = ns.go.getBoardState();
    let isEmpty = true;
    const size = state[0].length;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        if (state[x][y] == 'X' || state[x][y] == 'O') {
          isEmpty = false;
        }
      }
    }
    ns.print(`\tReturning ${isEmpty}`);
    return isEmpty;
  }

  /**
   * Retrieves the adjacent nodes around a given position on the Go board.
   * 
   * @param {number} x - The x-coordinate of the position.
   * @param {number} y - The y-coordinate of the position.
   * @returns {Promise<AdjacentNodes>} - An object containing the values of the adjacent nodes (north, east, south, and west).
   */
  async function getAdjacentNodes(x: number, y: number): Promise<AdjacentNodes>  {
    const board = ns.go.getBoardState();
    const tempNorth = board[x]?.[y+1] ? board[x][y+1] : undefined;
    const tempEast  = board[x+1]?.[y] ? board[x+1][y] : undefined;
    const tempSouth = board[x]?.[y-1] ? board[x][y-1] : undefined;
    const tempWest  = board[x-1]?.[y] ? board[x-1][y] : undefined;
    const adjacents: AdjacentNodes = {
      north: tempNorth,
      east: tempEast,
      south: tempSouth,
      west: tempWest
    }
    return adjacents;
  }

  async function determineBestMove(): Promise<void> {
    const [x, y] = await move_PlaceRandomNode();
    await ns.go.makeMove(x, y);

  }

  /**
   * Places a random node on the Go board at a valid position.
   * The function first tries to find an 'ideal' random spot that is not reserved space.
   * If no such spot is found, it chooses from all available valid moves.
   * If no valid moves are found, it passes the turn.
   * 
   * @returns {Promise<Move>} - The move made by placing a node or passing the turn.
   */
  async function move_PlaceRandomNode() : Promise<[number, number] | undefined> {
    ns.print(`Placing random node..`);
    const moveOptions = [];
    const validMoves = await getValidMoves();
    const length = validMoves[0].length;

    for (let x = 0; x < length; x++) {
      for (let y = 0; y < length; y++) {
        // Make sure the point is a valid move
        const isValidMove: boolean = validMoves[x][y] === true;
        // Leave some spaces to make it harder to capture our pieces.
        // We don't want to run out of empty node connections!
        const isNotReservedSpace = x % 2 === 1 || y % 2 === 1;

        if (isValidMove && isNotReservedSpace) {
          moveOptions.push([x, y]);
        }
      }
    }

    // if we couldn't find an 'ideal' random spot, just pick all available
    if (moveOptions.length == 0) {
      for (let x = 0; x < length; x++) {
        for (let y = 0; y < length; y++) {
          // Make sure the point is a valid move
          const isValidMove: boolean = validMoves[x][y] === true;
          if (isValidMove) { moveOptions.push([x, y]); }
        }
      }
    }

    ns.print(`\tFound ${moveOptions.length} move options.`);
    
    // if we end up not finding anything, just place a node in the next available spot
    if (moveOptions && moveOptions.length > 0) {
      const randIndex = Math.floor(Math.random() * moveOptions.length);
      ns.print(`\tmove_PlaceRandomNode chose: ${moveOptions[randIndex]}`);
      return [moveOptions[randIndex][0], moveOptions[randIndex][1]];
    } else {
      return undefined;
    }
    
  }

  async function move_NetExpansion() {
    const board: string[]         = ns.go.getBoardState();
    const size: number            = board[0].length;
    const validMoves: boolean[][] = await getValidMoves();
    const moveOptions = [];

    const friendly: string = ns.go.getCurrentPlayer() === "White" ? "O" : "X";

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {

        // If the empty point is a valid move, and
        if (validMoves[x][y]) {
          const nodes: AdjacentNodes = await getAdjacentNodes(x, y);
          
          // If the point is not an open space reserved to protect the network [see getRandomMove()], and

          // If a point to the north, south, east, or west is a friendly router
          if (nodes.north == friendly || nodes.east == friendly
              || nodes.south == friendly || nodes.west == friendly)
          {
            moveOptions.push([x, y]);
          }
          // Then, the move will expand an existing network
        }
      }
    }

    // Detect expansion moves:
    //   For each point on the board:

  }

  async function move_CaptureNetwork() {
    const board: string[]         = ns.go.getBoardState();
    const size: number            = board[0].length;
    const validMoves: boolean[][] = await getValidMoves();
    const moveOptions = [];

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        if (validMoves[x][y]) {

        }
      }
    }

    // For each point on the board:
    //   * If the empty point is a valid move, and
    //   * If a point to the north, south, east, or west is a router with exactly 1 liberty [via its coordinates in getLiberties()], and
    //   * That point is controlled by the opponent [it is a "O" via getBoardState()]

    //   Then, playing that move will capture the opponent's network.
  }

}
