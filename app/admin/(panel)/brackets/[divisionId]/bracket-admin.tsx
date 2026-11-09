"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { BracketView } from "@/components/bracket/bracket-view";
import { Podium } from "@/components/bracket/podium";
import { Alert, Badge, Button, Card, cn, Field, Input, Select } from "@/components/ui";
import {
  describeFormat,
  getPodium,
  previewUndo,
  recordResult,
  scoreGames,
  type BracketMatch,
  type MatchFormat,
} from "@/lib/bracket";
import { toEngine } from "@/lib/bracket-db";
import type { BracketBundle } from "@/lib/queries";
import type { Division } from "@/lib/types";
import {
  deleteBracket,
  generateBracket,
  publishBracket,
  revertToDraft,
  scoreMatch,
  swapEntrants,
  undoMatch,
  updateMatchDetails,
  walkoverMatch,
  type BracketResult,
} from "../../../actions/bracket";

export function BracketAdmin({ division, bundle }: { division: Division; bundle: BracketBundle | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const format: MatchFormat = {
    gamesToWin: division.match_format.games_to_win,
    pointsTo: division.match_format.points_to,
    winBy: division.match_format.win_by,
  };
  const engine = useMemo(
    () => (bundle ? toEngine(bundle.bracket.grand_final_reset, bundle.matches) : null),
    [bundle],
  );
  const meta = useMemo(
    () => Object.fromEntries((bundle?.matches ?? []).map((r) => [r.code, { court: r.court, scheduled_at: r.scheduled_at }])),
    [bundle],
  );

  function run(action: () => Promise<BracketResult>, success?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      if (res.cleared?.length) setNotice(`Cleared downstream results: ${res.cleared.join(", ")}`);
      else if (success) setNotice(success);
      router.refresh();
    });
  }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge tone={division.kind === "singles" ? "electric" : "magenta"}>{division.kind}</Badge>
          {bundle && (
            <Badge tone={bundle.bracket.status === "draft" ? "ball" : bundle.bracket.status === "completed" ? "court" : "electric"}>
              {bundle.bracket.status}
            </Badge>
          )}
        </div>
        <h1 className="display mt-2 text-4xl">{division.name}</h1>
        <p className="text-sm text-ink">
          {division.confirmed_count} confirmed · {describeFormat(format)} ·{" "}
          {division.grand_final_reset ? "grand final reset on" : "single grand final"}
        </p>
      </div>
    </div>
  );

  if (!bundle || !engine) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="space-y-4 p-6">
          <p className="display text-2xl">No bracket yet</p>
          <p className="text-ink">
            Drawing places every confirmed entry at random. You can re-shuffle or swap positions before publishing.
          </p>
          {error && <Alert>{error}</Alert>}
          <Button size="lg" disabled={pending || division.confirmed_count < 2} onClick={() => run(() => generateBracket(division.id), "Bracket drawn.")}>
            {pending ? "Drawing…" : "Draw random bracket"}
          </Button>
        </Card>
      </div>
    );
  }

  const { bracket } = bundle;
  const isDraft = bracket.status === "draft";
  const hasResults = engine.matches.some((m) => m.status === "completed");
  const match = selected ? engine.matches.find((m) => m.code === selected) : undefined;

  return (
    <div className="space-y-6">
      {header}

      <Card className="flex flex-wrap items-center gap-2 p-4">
        {isDraft ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                if (confirm("Publish this draw? Registration for this division will close and the bracket goes public."))
                  run(() => publishBracket(bracket.id), "Bracket published.");
              }}
            >
              Publish
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => generateBracket(division.id), "Re-shuffled.")}>
              Re-shuffle draw
            </Button>
            <SwapControl
              entrants={bundle.entrants}
              disabled={pending}
              onSwap={(a, b) => run(() => swapEntrants(bracket.id, a, b), "Positions swapped.")}
            />
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || hasResults}
            title={hasResults ? "Undo all results first" : undefined}
            onClick={() => run(() => revertToDraft(bracket.id), "Back to draft.")}
          >
            Revert to draft
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          className="ml-auto"
          disabled={pending}
          onClick={() => {
            if (confirm("Delete this bracket and every result in it?")) run(() => deleteBracket(bracket.id), "Bracket deleted.");
          }}
        >
          Delete bracket
        </Button>
      </Card>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="court">{notice}</Alert>}
      {engine.matches.length === 0 && <Alert>This bracket has no matches left. Delete it, then draw again.</Alert>}

      <Podium podium={getPodium(engine)} names={bundle.entrants} />

      {match && (
        <MatchPanel
          key={`${match.code}:${bracket.version}`}
          match={match}
          names={bundle.entrants}
          format={format}
          court={meta[match.code]?.court ?? ""}
          isDraft={isDraft}
          pending={pending}
          onClose={() => setSelected(null)}
          onScore={(games) => {
            const trial = structuredClone(engine);
            try {
              const cleared = recordResult(trial, match.code, games, format);
              if (cleared.length && !confirm(`Changing the winner clears: ${cleared.join(", ")}. Continue?`)) return;
            } catch (e) {
              return setError(e instanceof Error ? e.message : "Invalid score");
            }
            run(() => scoreMatch(bracket.id, match.code, games), `${match.code} saved.`);
          }}
          onWalkover={(winner) => {
            if (match.status === "completed") {
              const cleared = previewUndo(engine, match.code).filter((c) => c !== match.code);
              if (cleared.length && !confirm(`This clears: ${cleared.join(", ")}. Continue?`)) return;
            }
            run(() => walkoverMatch(bracket.id, match.code, winner), `${match.code}: walkover recorded.`);
          }}
          onUndo={() => {
            const cleared = previewUndo(engine, match.code);
            if (!confirm(`Undo ${cleared.join(", ")}?`)) return;
            run(() => undoMatch(bracket.id, match.code));
          }}
          onDetails={(court, live) => run(() => updateMatchDetails(bracket.id, match.code, { court, live }), "Match updated.")}
        />
      )}

      {engine.matches.length > 0 && <p className="text-sm text-ink">Tap a match to score it, set a court, or undo a result.</p>}
      <BracketView matches={engine.matches} names={bundle.entrants} meta={meta} selected={selected} onSelect={setSelected} />
    </div>
  );
}

function SwapControl({
  entrants,
  disabled,
  onSwap,
}: {
  entrants: Record<string, string>;
  disabled: boolean;
  onSwap: (a: string, b: string) => void;
}) {
  const options = Object.entries(entrants).sort((a, b) => a[1].localeCompare(b[1]));
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="First entrant" value={a} onChange={(e) => setA(e.target.value)} className="h-8 w-40 text-sm">
        <option value="">Swap…</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
      <span className="text-ink">⇄</span>
      <Select aria-label="Second entrant" value={b} onChange={(e) => setB(e.target.value)} className="h-8 w-40 text-sm">
        <option value="">with…</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" disabled={disabled || !a || !b || a === b} onClick={() => onSwap(a, b)}>
        Swap
      </Button>
    </div>
  );
}

function MatchPanel({
  match: m,
  names,
  format,
  court: initialCourt,
  isDraft,
  pending,
  onClose,
  onScore,
  onWalkover,
  onUndo,
  onDetails,
}: {
  match: BracketMatch;
  names: Record<string, string>;
  format: MatchFormat;
  court: string;
  isDraft: boolean;
  pending: boolean;
  onClose: () => void;
  onScore: (games: { p1: number; p2: number }[]) => void;
  onWalkover: (winner: 1 | 2) => void;
  onUndo: () => void;
  onDetails: (court: string, live: boolean) => void;
}) {
  const maxGames = format.gamesToWin * 2 - 1;
  const [rows, setRows] = useState(() =>
    Array.from({ length: maxGames }, (_, i) => ({
      p1: m.games[i] ? String(m.games[i].p1) : "",
      p2: m.games[i] ? String(m.games[i].p2) : "",
    })),
  );
  const [court, setCourt] = useState(initialCourt);

  const name = (slot: 1 | 2) => {
    const s = slot === 1 ? m.slot1 : m.slot2;
    return s.entrantId ? (names[s.entrantId] ?? "Unknown") : s.bye ? "BYE" : "TBD";
  };
  const games = rows
    .filter((r) => r.p1 !== "" || r.p2 !== "")
    .map((r) => ({ p1: Number(r.p1), p2: Number(r.p2) }));
  const check = games.length ? scoreGames(games, format) : null;
  const scorable = !isDraft && (m.status === "ready" || m.status === "live" || m.status === "completed");

  return (
    <Card className="space-y-5 border-ball/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink">
            {m.code} · {m.status}
            {m.walkover && " · walkover"}
          </p>
          <p className="display mt-1 text-2xl">
            {name(1)} <span className="text-ink">vs</span> {name(2)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>

      {isDraft && <Alert tone="ball">Publish the bracket to start entering results.</Alert>}
      {m.status === "pending" && <Alert tone="ball">Waiting for both players to be decided.</Alert>}

      {scorable && (
        <div className="space-y-3">
          <div className="grid max-w-md grid-cols-[4rem_1fr_1fr] items-center gap-2 text-sm">
            <span />
            <span className="truncate font-bold">{name(1)}</span>
            <span className="truncate font-bold">{name(2)}</span>
            {rows.map((r, i) => (
              <div key={i} className="contents">
                <span className="text-ink">Game {i + 1}</span>
                {(["p1", "p2"] as const).map((k) => (
                  <Input
                    key={k}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    aria-label={`Game ${i + 1} ${k === "p1" ? name(1) : name(2)}`}
                    value={r[k]}
                    onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                    className="h-10 text-center"
                  />
                ))}
              </div>
            ))}
          </div>
          {check && !check.ok && <p className="text-sm font-semibold text-accent">{check.error}</p>}
          {check?.ok && (
            <p className="text-sm font-semibold text-court">Winner: {name(check.winner)}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || !check?.ok} onClick={() => onScore(games)}>
              {m.status === "completed" ? "Update result" : "Save result"}
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => onWalkover(1)}>
              Walkover → {name(1)}
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => onWalkover(2)}>
              Walkover → {name(2)}
            </Button>
            {m.status === "completed" && (
              <Button variant="danger" size="sm" disabled={pending} onClick={onUndo}>
                Undo result
              </Button>
            )}
          </div>
        </div>
      )}

      <div className={cn("flex flex-wrap items-end gap-3 border-t border-fg/10 pt-4")}>
        <Field label="Court">
          <Input value={court} onChange={(e) => setCourt(e.target.value)} className="h-9 w-28" maxLength={20} />
        </Field>
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => onDetails(court, m.status === "live")}>
          Save court
        </Button>
        {(m.status === "ready" || m.status === "live") && !isDraft && (
          <Button
            variant={m.status === "live" ? "secondary" : "primary"}
            size="sm"
            disabled={pending}
            onClick={() => onDetails(court, m.status !== "live")}
          >
            {m.status === "live" ? "Stop live" : "Mark live"}
          </Button>
        )}
      </div>
    </Card>
  );
}
