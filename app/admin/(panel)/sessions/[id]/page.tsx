import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonClass, Card, cn, Field, Input, Select, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { bookingWhen, dateTime, money } from "@/lib/format";
import { KIND_LABEL, LEVELS, levelLabel, playerStates, rotationOrder, SIGNUP_STATUS_LABEL, suggestNextGame } from "@/lib/open-play";
import { getAdminCourtConfig } from "@/lib/queries";
import type { QueueGame, Session, SessionQueue, SessionSignup } from "@/lib/types";
import {
  addWalkin,
  cancelSession,
  deleteSession,
  finishGame,
  resendSignupEmail,
  saveSession,
  signupAction,
  startGame,
  voidGame,
} from "../../../actions/sessions";
import { SessionFields } from "../session-fields";
import { LiveRefresh } from "./live-refresh";

export const metadata: Metadata = { title: "Open play session" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIME = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export default function SessionAdminPage({ params }: PageProps<"/admin/sessions/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/admin/sessions/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { sb } = await requireAdmin();

  const [{ data: session }, { data: rows }, { data: queueData }, { settings }] = await Promise.all([
    sb.from("sessions").select("*").eq("id", id).maybeSingle<Session>(),
    sb.from("session_signups").select("*").eq("session_id", id).order("created_at").returns<SessionSignup[]>(),
    sb.rpc("get_session_queue", { p_session_id: id }),
    getAdminCourtConfig(),
  ]);
  if (!session) notFound();
  const signups = rows ?? [];
  const queue = (queueData ?? { players: [], games: [] }) as SessionQueue;
  const currency = settings?.currency ?? "PHP";
  const now = new Date().getTime();

  const paths = signups.map((s) => s.payment_proof_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await sb.storage.from("payment-proofs").createSignedUrls(paths, 60 * 60) : { data: [] };
  const signedUrls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const proofOf = (s: SessionSignup) => (s.payment_proof_path && signedUrls.get(s.payment_proof_path)) || undefined;

  const live = (s: SessionSignup) => (s.status === "held" || s.status === "offered") && !!s.hold_expires_at && Date.parse(s.hold_expires_at) > now;
  const confirmed = signups.filter((s) => s.status === "confirmed");
  const paying = signups.filter(live);
  const waitlist = signups.filter((s) => s.status === "waitlisted");
  const refunds = signups.filter((s) => s.refund_needed);
  const inactive = signups.filter((s) => !["confirmed", "waitlisted"].includes(s.status) && !live(s));
  const scheduled = session.status === "scheduled";
  const ended = Date.parse(session.ends_at) <= now;
  const collected = confirmed.reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    <div className="space-y-8">
      <LiveRefresh sessionId={session.id} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/sessions" className="text-sm font-bold text-ink hover:text-fg">
            ← Sessions
          </Link>
          <h1 className="display mt-2 text-4xl">{session.title}</h1>
          <p className="mt-2 font-semibold">{bookingWhen(session.starts_at, session.ends_at)}</p>
          <p className="mt-1 text-sm text-ink">
            {KIND_LABEL[session.kind]} · {money(session.fee, currency)} per player · {session.level_note ?? "All levels"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!scheduled ? (
            <Badge tone="danger">Cancelled</Badge>
          ) : ended ? (
            <Badge>Ended</Badge>
          ) : (
            <Badge tone={session.signups_open ? "electric" : "neutral"}>{session.signups_open ? "Sign-ups open" : "Sign-ups closed"}</Badge>
          )}
          <Link href={`/play/${session.id}`} className={buttonClass("secondary", "sm")} target="_blank">
            Public page
          </Link>
          <Link href={`/play/${session.id}/queue`} className={buttonClass("secondary", "sm")} target="_blank">
            Queue board
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Confirmed" value={`${confirmed.length}/${session.capacity}`} sub={money(collected, currency)} />
        <Stat label="Checked in" value={String(confirmed.filter((s) => s.checked_in_at).length)} sub="in the rotation" />
        <Stat label="Waitlist" value={String(waitlist.length)} sub={`${paying.length} paying now`} />
        <Stat label="Refunds" value={String(refunds.length)} sub="paid, no spot" alert={refunds.length > 0} />
      </div>

      {scheduled && <GameQueue session={session} queue={queue} signups={signups} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="display text-2xl">Players</h2>
        </div>
        {confirmed.length === 0 ? (
          <Card className="p-6 text-center text-ink">No confirmed players yet.</Card>
        ) : (
          <div className="space-y-2">
            {confirmed.map((s) => (
              <SignupRow key={s.id} s={s} proof={proofOf(s)} currency={currency} scheduled={scheduled} />
            ))}
          </div>
        )}
        {scheduled && (
          <details className="rounded-2xl border border-dashed border-fg/20 p-5">
            <summary className="cursor-pointer font-bold text-accent">+ Add walk-in</summary>
            <p className="mt-2 text-sm text-ink">Confirmed and checked in straight away, no receipt. Leave the amount blank to charge the session fee.</p>
            <ActionForm action={addWalkin} className="mt-4 grid gap-4 md:grid-cols-5">
              <input type="hidden" name="session_id" value={session.id} />
              <Field label="Name">
                <Input name="name" required />
              </Field>
              <Field label="Mobile (optional)">
                <Input name="phone" type="tel" />
              </Field>
              <Field label="Level">
                <Select name="level" defaultValue="2">
                  {LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount">
                <Input name="amount" type="number" min={0} step="0.01" placeholder={String(Number(session.fee))} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold">
                <input type="checkbox" name="override" className="size-4 accent-[var(--color-ball)]" />
                Over capacity
              </label>
              <div className="md:col-span-5">
                <SubmitButton>Add walk-in</SubmitButton>
              </div>
            </ActionForm>
          </details>
        )}
      </section>

      {(paying.length > 0 || waitlist.length > 0) && (
        <section className="space-y-3">
          <h2 className="display text-2xl">Paying now &amp; waitlist</h2>
          <div className="space-y-2">
            {paying.map((s) => (
              <SignupRow key={s.id} s={s} currency={currency} scheduled={scheduled} />
            ))}
            {waitlist.map((s, i) => (
              <SignupRow key={s.id} s={s} currency={currency} scheduled={scheduled} place={i + 1} />
            ))}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section className="space-y-3">
          <h2 className="display text-2xl">Cancelled &amp; lapsed</h2>
          <div className="space-y-2">
            {inactive.map((s) => (
              <SignupRow key={s.id} s={s} proof={proofOf(s)} currency={currency} scheduled={scheduled} />
            ))}
          </div>
        </section>
      )}

      {scheduled && (
        <section className="space-y-3">
          <h2 className="display text-2xl">Session settings</h2>
          <Card className="p-5">
            <ActionForm action={saveSession} className="grid gap-4 md:grid-cols-3">
              <SessionFields s={session} defaultDay={session.starts_at.slice(0, 10)} />
              <div className="md:col-span-3">
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </ActionForm>
          </Card>
          <div className="flex flex-wrap gap-3">
            <ActionForm
              action={cancelSession}
              confirm="Cancel this session? Every player is emailed, paid ones are flagged for refund, and the court is freed."
            >
              <input type="hidden" name="id" value={session.id} />
              <SubmitButton variant="danger" pendingLabel="Cancelling…">
                Cancel session
              </SubmitButton>
            </ActionForm>
            {signups.length === 0 && (
              <ActionForm action={deleteSession} confirm="Delete this session and its court booking?">
                <input type="hidden" name="id" value={session.id} />
                <SubmitButton variant="ghost" pendingLabel="Deleting…">
                  Delete
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <Card className={alert ? "border-ball/60 p-5" : "p-5"}>
      <p className="text-xs font-bold uppercase tracking-widest text-ink">{label}</p>
      <p className={alert ? "score mt-2 text-4xl text-accent" : "score mt-2 text-4xl"}>{value}</p>
      <p className="mt-1 text-sm text-ink">{sub}</p>
    </Card>
  );
}

const STATUS_TONE = {
  confirmed: "court",
  held: "ball",
  offered: "ball",
  waitlisted: "electric",
  cancelled: "danger",
  expired: "neutral",
} as const;

function Act({ id, action, label, variant = "secondary", confirm }: { id: string; action: string; label: string; variant?: "secondary" | "danger" | "ghost" | "primary"; confirm?: string }) {
  return (
    <ActionForm action={signupAction} confirm={confirm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton variant={variant} size="sm" pendingLabel="…">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

function SignupRow({ s, proof, currency, scheduled, place }: { s: SessionSignup; proof?: string; currency: string; scheduled: boolean; place?: number }) {
  return (
    <Card className={cn("p-4", s.refund_needed && "border-ball/50")}>
      <div className="flex flex-wrap items-center gap-4">
        {proof ? (
          <a href={proof} target="_blank" rel="noreferrer" className="shrink-0" title="Open payment proof">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof} alt="Payment proof" className="size-14 rounded-lg border border-fg/10 object-cover" />
          </a>
        ) : (
          <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-dashed border-fg/15 text-center text-[10px] font-bold uppercase text-ink">
            {s.source === "admin" ? "Walk-in" : place ? `#${place}` : "No proof"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{s.name}</p>
            <Badge tone={STATUS_TONE[s.status]}>{SIGNUP_STATUS_LABEL[s.status]}</Badge>
            <Badge>{levelLabel(s.level)}</Badge>
            {s.status === "confirmed" && s.checked_in_at && <Badge tone="court">In {TIME.format(new Date(s.checked_in_at))}</Badge>}
            {s.queue_paused && <Badge tone="ball">Resting</Badge>}
            {s.refund_needed && <Badge tone="ball">Refund</Badge>}
            {s.refunded_at && <Badge>Refunded</Badge>}
          </div>
          <p className="mt-1 text-sm break-words text-ink">
            <span className="font-mono text-accent">{s.code}</span> · {s.phone || "no mobile"}
            {s.email && ` · ${s.email}`} · {money(s.amount, currency)}
            {s.payment_ref && ` · ref ${s.payment_ref}`}
            {(s.status === "held" || s.status === "offered") && s.hold_expires_at && ` · until ${dateTime(s.hold_expires_at)}`}
          </p>
          {s.admin_notes && <p className="mt-1 text-sm text-accent">Note: {s.admin_notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {scheduled && s.status === "confirmed" && (
            <>
              {s.checked_in_at ? (
                <>
                  <Act id={s.id} action={s.queue_paused ? "resume" : "pause"} label={s.queue_paused ? "Back in" : "Rest"} />
                  <Act id={s.id} action="check_out" label="Check out" variant="ghost" />
                </>
              ) : (
                <Act id={s.id} action="check_in" label="Check in" variant="primary" />
              )}
              {s.email && (
                <ActionForm action={resendSignupEmail}>
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Sending…">
                    Email code
                  </SubmitButton>
                </ActionForm>
              )}
            </>
          )}
          {scheduled && s.status === "waitlisted" && <Act id={s.id} action="offer" label="Offer spot" />}
          {scheduled && ["held", "confirmed", "waitlisted", "offered"].includes(s.status) && (
            <Act
              id={s.id}
              action="cancel"
              label="Cancel"
              variant="danger"
              confirm={s.payment_proof_path ? `Cancel ${s.name}'s spot? They paid, so they'll be flagged for refund.` : `Cancel ${s.name}'s spot?`}
            />
          )}
          {scheduled && (s.status === "cancelled" || s.status === "expired") && (s.payment_proof_path || s.source === "admin") && (
            <Act id={s.id} action="restore" label="Restore" />
          )}
          {s.refund_needed && <Act id={s.id} action="refunded" label="Mark refunded" confirm={`Mark ${s.name} as refunded?`} />}
        </div>
      </div>
    </Card>
  );
}

function GameQueue({ session, queue, signups }: { session: Session; queue: SessionQueue; signups: SessionSignup[] }) {
  const fullName = new Map(signups.map((s) => [s.id, s.name]));
  const name = (id: string) => fullName.get(id) ?? "Player";
  const states = playerStates(queue.players, queue.games);
  const order = rotationOrder(states);
  const suggestion = suggestNextGame(queue.players, queue.games);
  const playing = queue.games.find((g) => g.status === "playing");
  const done = queue.games.filter((g) => g.status === "done");
  const ready = order.map((s) => s.player);
  const playedOf = new Map(states.map((s) => [s.player.id, s.played]));
  const team = (g: Pick<QueueGame, "team1" | "team2">, t: 1 | 2) => (t === 1 ? g.team1 : g.team2).map(name).join(" & ");

  return (
    <section className="space-y-4">
      <h2 className="display text-2xl">Court</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="on-board rounded-md bg-board p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-ink">{playing ? `Game ${playing.number} · on court` : "Court free"}</p>
          {playing ? (
            <ActionForm action={finishGame} className="space-y-4" key={playing.id}>
              <input type="hidden" name="id" value={playing.id} />
              <div className="grid grid-cols-[1fr_4.5rem] items-center gap-3">
                <p className="font-bold">{team(playing, 1)}</p>
                <Input name="score1" type="number" min={0} max={99} inputMode="numeric" aria-label="Team 1 score" className="text-center" />
                <p className="font-bold">{team(playing, 2)}</p>
                <Input name="score2" type="number" min={0} max={99} inputMode="numeric" aria-label="Team 2 score" className="text-center" />
              </div>
              <p className="text-xs text-ink">Started {TIME.format(new Date(playing.startedAt))}. Scores are optional.</p>
              <div className="flex flex-wrap gap-2">
                <SubmitButton pendingLabel="Saving…">Finish game</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-ink">
              {ready.length >= 4 ? "Start the next game below." : `${ready.length} player(s) ready. Check in at least four to start a game.`}
            </p>
          )}
          {playing && (
            <div className="mt-3">
              <ActionForm action={voidGame} confirm="Void this game? It won't count towards anyone's games played.">
                <input type="hidden" name="id" value={playing.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Voiding…">
                  Void game
                </SubmitButton>
              </ActionForm>
            </div>
          )}
        </div>

        <Card className="p-5">
          <p className="mb-1 font-bold">Next game</p>
          <p className="mb-4 text-xs text-ink">Suggested: fewest games, then longest wait, levels mixed. Change anyone you like.</p>
          {ready.length < 4 ? (
            <p className="text-ink">Need four ready players (checked in, not resting, not on court).</p>
          ) : (
            <ActionForm action={startGame} className="space-y-3" key={`${queue.games.length}-${session.version}`}>
              <input type="hidden" name="session_id" value={session.id} />
              {(
                [
                  ["Team 1", "t1a", "t1b", suggestion?.team1],
                  ["Team 2", "t2a", "t2b", suggestion?.team2],
                ] as const
              ).map(([label, a, b, pick]) => (
                <div key={label} className="grid grid-cols-[4rem_1fr_1fr] items-center gap-2">
                  <span className="text-sm font-bold text-ink">{label}</span>
                  {[a, b].map((field, i) => (
                    <Select key={field} name={field} defaultValue={pick?.[i] ?? ""} aria-label={`${label} player ${i + 1}`} required>
                      <option value="" disabled>
                        Pick…
                      </option>
                      {ready.map((p) => (
                        <option key={p.id} value={p.id}>
                          {name(p.id)} · {levelLabel(p.level)} · {playedOf.get(p.id) ?? 0}g
                        </option>
                      ))}
                    </Select>
                  ))}
                </div>
              ))}
              <SubmitButton disabled={!!playing} pendingLabel="Starting…">
                {playing ? "Finish the current game first" : "Start game"}
              </SubmitButton>
            </ActionForm>
          )}
          {order.length > 4 && (
            <p className="mt-4 text-xs text-ink">
              Then: {order.slice(4).map((s) => name(s.player.id).split(" ")[0]).join(", ")}
            </p>
          )}
        </Card>
      </div>

      {done.length > 0 && (
        <details className="rounded-md border border-fg/10 p-4">
          <summary className="cursor-pointer font-bold">Finished games ({done.length})</summary>
          <ul className="mt-3 divide-y divide-fg/10">
            {done.map((g) => (
              <li key={g.id} className="py-3">
                <ActionForm action={finishGame} className="grid items-center gap-2 sm:grid-cols-[3rem_1fr_4rem_4rem_auto]">
                  <input type="hidden" name="id" value={g.id} />
                  <span className="score text-ink">#{g.number}</span>
                  <span className="text-sm">
                    <strong>{team(g, 1)}</strong> vs <strong>{team(g, 2)}</strong>
                  </span>
                  <Input name="score1" type="number" min={0} max={99} defaultValue={g.score1 ?? ""} aria-label="Team 1 score" className="h-9 text-center" />
                  <Input name="score2" type="number" min={0} max={99} defaultValue={g.score2 ?? ""} aria-label="Team 2 score" className="h-9 text-center" />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="…">
                    Save
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
