export type Worker = {
    pid: number,
    script: string,
    value: number
}

export type GameState =
  | "early"
  | "mid"
  | "end";

export type Controller = {
  name: string,
  host: string,
  pid: number,
  args?: string[]
}

export type Move = {
    type: "move" | "pass" | "gameOver";
    x?: number | null;
    y?: number | null;
  }
  
  export type GoOpponent =
| "Netburners"
| "Slum Snakes"
| "The Black Hand"
| "Tetrads"
| "Daedalus"
| "Illuminati"
| "????????????";

export type BoardSize = 5 | 7 | 9 | 13;

export type AdjacentNodes = {
    north: string | undefined,
    east: string  | undefined,
    south: string | undefined,
    west: string  | undefined
};