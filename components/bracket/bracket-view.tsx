"use client";

import { Fragment, useMemo } from "react";
import { cn } from "@/components/ui";
import type { BracketMatch, Side } from "@/lib/bracket";

export interface MatchMeta {
  court: string | null;
  scheduled_at: string | null;
}

const CARD_W = 228;
const CARD_H = 78;
const GAP_X = 44;
const GAP_Y = 14;
const HEADER_H = 30;
const STRIDE_X = CARD_W + GAP_X;
const UNIT_Y = CARD_H + GAP_Y;

interface Placed {
  m: BracketMatch;
  col: number;
  y: number;
}

function roundLabel(side: Side, round: number, lastRound: number, code: string) {
  if (side === "GF") return code === "GF1" ? "Grand final" : "Reset match";
  if (side === "W") {
    if (round === lastRound) return "Winners final";
    if (round === lastRound - 1 && lastRound >= 3) return "Winners semis";
    return `Round ${round}`;
  }
  if (round === lastRound) return "Losers final";
  return `Losers R${round}`;
}

/** y = average of the feeder matches in the same panel; first rounds stack evenly. */
function layout(matches: BracketMatch[]) {
  const w = matches.filter((m) => m.side === "W");
  const l = matches.filter((m) => m.side === "L");
  const gf = matches.filter((m) => m.side === "GF");
  const wRounds = Math.max(...w.map((m) => m.round));
  const lRounds = l.length ? Math.max(...l.map((m) => m.round)) : 0;
  const y = new Map<string, number>();

  for (let r = 1; r <= wRounds; r++) {
    for (const m of w.filter((x) => x.round === r)) {
      y.set(
        m.code,
        r === 1
          ? (m.position - 1) * UNIT_Y
          : (y.get(`W${r - 1}-${m.position * 2 - 1}`)! + y.get(`W${r - 1}-${m.position * 2}`)!) / 2,
      );
    }
  }
  for (let j = 1; j <= lRounds; j++) {
    for (const m of l.filter((x) => x.round === j)) {
      let v: number;
      if (j === 1) v = (m.position - 1) * UNIT_Y;
      else if (j % 2 === 0) v = y.get(`L${j - 1}-${m.position}`)!;
      else v = (y.get(`L${j - 1}-${m.position * 2 - 1}`)! + y.get(`L${j - 1}-${m.position * 2}`)!) / 2;
      y.set(m.code, v);
    }
  }
  const wFinalY = y.get(`W${wRounds}-1`) ?? 0;
  for (const m of gf) y.set(m.code, wFinalY);

  const winners: Placed[] = [
    ...w.map((m) => ({ m, col: m.round - 1, y: y.get(m.code)! })),
    ...gf.filter((m) => m.status !== "not_needed").map((m) => ({ m, col: wRounds + m.round - 1, y: y.get(m.code)! })),
  ];
  const losers: Placed[] = l.map((m) => ({ m, col: m.round - 1, y: y.get(m.code)! }));
  return { winners, losers, wRounds, lRounds };
}

/** "Winner of W1-2" style hints for empty slots. */
function feederHints(matches: BracketMatch[]) {
  const hints = new Map<string, string>();
  for (const m of matches) {
    if (m.winnerTo) hints.set(`${m.winnerTo.code}:${m.winnerTo.slot}`, `Winner ${m.code}`);
    if (m.loserTo) hints.set(`${m.loserTo.code}:${m.loserTo.slot}`, `Loser ${m.code}`);
  }
  hints.set("GF2:1", "If needed");
  hints.set("GF2:2", "If needed");
  return hints;
}

export function BracketView({
  matches,
  names,
  meta = {},
  selected,
  onSelect,
}: {
  matches: BracketMatch[];
  names: Record<string, string>;
  meta?: Record<string, MatchMeta>;
  selected?: string | null;
  onSelect?: (code: string) => void;
}) {
  const { winners, losers, wRounds, lRounds } = useMemo(() => layout(matches), [matches]);
  const hints = useMemo(() => feederHints(matches), [matches]);

  const panelProps = { names, meta, hints, selected, onSelect };
  return (
    <div className="space-y-8">
      {winners.length > 0 && (
        <Panel title="Winners bracket" tone="electric" placed={winners} lastRound={wRounds} {...panelProps} />
      )}
      {losers.length > 0 && (
        <Panel title="Losers bracket" tone="magenta" placed={losers} lastRound={lRounds} {...panelProps} />
      )}
    </div>
  );
}

function Panel({
  title,
  tone,
  placed,
  lastRound,
  names,
  meta,
  hints,
  selected,
  onSelect,
}: {
  title: string;
  tone: "electric" | "magenta";
  placed: Placed[];
  lastRound: number;
  names: Record<string, string>;
  meta: Record<string, MatchMeta>;
  hints: Map<string, string>;
  selected?: string | null;
  onSelect?: (code: string) => void;
}) {
  const cols = Math.max(...placed.map((p) => p.col)) + 1;
  const width = cols * STRIDE_X - GAP_X;
  const height = HEADER_H + Math.max(...placed.map((p) => p.y)) + CARD_H;
  const pos = new Map(placed.map((p) => [p.m.code, p]));
  const headers = new Map<number, string>();
  for (const p of placed) {
    if (!headers.has(p.col)) headers.set(p.col, roundLabel(p.m.side, p.m.round, lastRound, p.m.code));
  }

  const lines: string[] = [];
  for (const p of placed) {
    const targetCode = p.m.code === "GF1" ? "GF2" : p.m.winnerTo?.code;
    const t = targetCode ? pos.get(targetCode) : undefined;
    if (!t) continue;
    const x1 = p.col * STRIDE_X + CARD_W;
    const y1 = HEADER_H + p.y + CARD_H / 2;
    const x2 = t.col * STRIDE_X;
    const y2 = HEADER_H + t.y + CARD_H / 2;
    const xm = x1 + GAP_X / 2;
    lines.push(`M${x1} ${y1}H${xm}V${y2}H${x2}`);
  }

  return (
    <section className={cn("rounded-md border-t-[10px] bg-panel", tone === "electric" ? "border-t-electric" : "border-t-magenta")}>
      <h3 className="display px-4 pt-4 text-2xl">{title}</h3>
      <div className="overflow-x-auto p-4">
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            {lines.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="var(--color-fg)" strokeOpacity={0.55} strokeWidth={2} />
            ))}
          </svg>
          {[...headers].map(([col, label]) => (
            <p
              key={col}
              className="absolute top-0 text-sm font-semibold text-ink"
              style={{ left: col * STRIDE_X, width: CARD_W }}
            >
              {label}
            </p>
          ))}
          {placed.map((p) => (
            <MatchCard
              key={p.m.code}
              m={p.m}
              names={names}
              meta={meta[p.m.code]}
              hints={hints}
              selected={selected === p.m.code}
              onSelect={onSelect}
              style={{ left: p.col * STRIDE_X, top: HEADER_H + p.y, width: CARD_W, height: CARD_H }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function MatchCard({
  m,
  names,
  meta,
  hints,
  selected,
  onSelect,
  style,
}: {
  m: BracketMatch;
  names: Record<string, string>;
  meta?: MatchMeta;
  hints: Map<string, string>;
  selected: boolean;
  onSelect?: (code: string) => void;
  style: React.CSSProperties;
}) {
  const isBye = m.status === "bye";
  const empty = isBye && !m.slot1.entrantId && !m.slot2.entrantId;
  const clickable = !!onSelect && !isBye && m.status !== "not_needed";
  const isGF = m.side === "GF";

  const label = (slot: 1 | 2) => {
    const s = slot === 1 ? m.slot1 : m.slot2;
    if (s.bye) return { text: "BYE", muted: true };
    if (s.entrantId) return { text: names[s.entrantId] ?? "Unknown", muted: false };
    return { text: hints.get(`${m.code}:${slot}`) ?? "TBD", muted: true };
  };

  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={clickable ? () => onSelect!(m.code) : undefined}
      className={cn(
        "on-board absolute flex flex-col overflow-hidden rounded border bg-board text-left transition",
        isGF ? "border-ball" : "border-fg/15",
        empty && "opacity-25",
        isBye && !empty && "opacity-55 light:opacity-75",
        m.status === "live" && "border-court shadow-[0_0_0_1px_var(--color-court),0_0_24px_-4px_var(--color-court)]",
        selected && "ring-2 ring-ball",
        clickable && "hover:border-ball",
      )}
      style={style}
    >
      <div className="flex h-[18px] items-center justify-between bg-fg/5 px-2 text-[10px] font-bold uppercase tracking-wider text-ink">
        <span>{m.code}</span>
        <span className="flex items-center gap-1.5">
          {meta?.court && <span>Court {meta.court}</span>}
          {m.status === "live" && <span className="animate-pulse-live text-court">● Live</span>}
          {m.walkover && <span className="text-accent">W/O</span>}
          {isBye && !empty && <span>Bye</span>}
        </span>
      </div>
      {([1, 2] as const).map((slot) => {
        const { text, muted } = label(slot);
        const won = m.winner === slot && m.status === "completed";
        const lost = m.status === "completed" && m.winner !== null && m.winner !== slot;
        return (
          <div
            key={slot}
            className={cn(
              "flex min-h-0 flex-1 items-center justify-between gap-2 border-l-[3px] px-2 text-sm",
              slot === 1 && "border-b border-b-fg/10",
              won ? "border-l-ball bg-ball/10 font-bold text-fg" : "border-l-transparent",
              lost && "text-ink/70",
              muted && "text-ink/60 italic",
            )}
          >
            <span className="truncate">{text}</span>
            <span className="flex shrink-0 gap-1">
              {m.games.map((g, i) => (
                <Fragment key={i}>
                  <span
                    className={cn(
                      "score rounded-sm bg-black px-1.5 py-0.5 text-sm",
                      (slot === 1 ? g.p1 > g.p2 : g.p2 > g.p1) ? "text-accent" : "text-ink",
                    )}
                  >
                    {slot === 1 ? g.p1 : g.p2}
                  </span>
                </Fragment>
              ))}
            </span>
          </div>
        );
      })}
    </Tag>
  );
}
