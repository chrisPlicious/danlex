export type Side = "W" | "L" | "GF";
export type SlotIndex = 1 | 2;

/**
 * pending     – waiting on a feeder match
 * ready       – both entrants known, can be played
 * live        – admin marked as being played (scorable like ready)
 * completed   – result recorded
 * bye         – auto-resolved because one or both slots are a BYE
 * not_needed  – grand final reset that never had to be played
 */
export type MatchStatus = "pending" | "ready" | "live" | "completed" | "bye" | "not_needed";

export interface Slot {
  entrantId: string | null;
  bye: boolean;
}

export interface SlotRef {
  code: string;
  slot: SlotIndex;
}

export interface Game {
  p1: number;
  p2: number;
}

export interface BracketMatch {
  code: string;
  side: Side;
  round: number;
  position: number;
  slot1: Slot;
  slot2: Slot;
  games: Game[];
  winner: SlotIndex | null;
  walkover: boolean;
  status: MatchStatus;
  winnerTo: SlotRef | null;
  loserTo: SlotRef | null;
}

export interface Bracket {
  grandFinalReset: boolean;
  matches: BracketMatch[];
}

export interface MatchFormat {
  gamesToWin: number;
  pointsTo: number;
  winBy: number;
}

export class BracketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BracketError";
  }
}
