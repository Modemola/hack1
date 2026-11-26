"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { FastForward, Loader2, Lock, ExternalLink, Info } from "lucide-react";
import { getAddress } from "viem";
import { useWallet } from "@/lib/wallet";
import {
  acceptGuarantee,
  escrowAction,
  getCompanyStats,
  getGuarantee,
  postponeGuarantee,
  warp,
  type CompanyStats,
  type Guarantee,
} from "@/lib/pakka";
import { demoMode, txUrl } from "@/lib/config";
import { date, dayCount, plural, shortAddress, usd } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { ScoreBadge } from "@/components/ScoreBadge";
import { ConnectDialog } from "@/components/WalletButton";

const MONTH = 30 * 86400;
const DISPUTE_WINDOW = 7 * 86400;

export default function GuaranteePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = /^\d+$/.test(raw) ? BigInt(raw) : null;
  const [g, setG] = useState<Guarantee | null>(null);
  const [score, setScore] = useState<CompanyStats | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (id === null) return setError("No such guarantee.");
    try {
      const next = await getGuarantee(id);
      if (next.state === "NONE") return setError("No such guarantee.");
      setG(next);
      setFetchedAt(Date.now());
      setScore(await getCompanyStats(next.companyDomain));
    } catch {
      setError("No such guarantee, or the chain is unreachable.");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!g)
    return (
      <p className="text-sm text-muted flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Loading guarantee…
      </p>
    );

  return (
    <div className="grid gap-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Lock className="size-4 text-verified" aria-hidden /> Guaranteed offer #{String(g.id)}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold mt-1 break-words">{g.role}</h1>
          <p className="text-muted mt-1">
            from{" "}
            <Link className="font-semibold text-ink underline underline-offset-2" href={`/companies/${encodeURIComponent(g.companyDomain)}`}>
              {g.companyDomain}
            </Link>{" "}
            to <span className="font-mono text-sm">{shortAddress(g.candidate)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={g.state} guarantee />
          {score && (
            <Link href={`/companies/${encodeURIComponent(g.companyDomain)}`} className="flex items-center gap-2 text-xs text-muted">
              <ScoreBadge score={score.score} judged={score.judged} size={44} />
              <span className="hidden sm:block leading-tight">
                Promise
                <br />
                Score
              </span>
            </Link>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
        <Ticker g={g} fetchedAt={fetchedAt} />
        <Facts g={g} />
      </div>
      <Timeline g={g} />
      <Explainer g={g} />
      <Actions g={g} onDone={load} />
    </div>
  );
}

function accruing(g: Guarantee): boolean {
  return g.state === "ACCEPTED" && !(g.joinClaimedAt > 0n && !g.disputed) && g.now >= g.stipendStart && g.earned < g.amount;
}

function Ticker({ g, fetchedAt }: { g: Guarantee; fetchedAt: number }) {
  const [tick, setTick] = useState(0);
  const live = accruing(g);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [live]);

  const earned = useMemo(() => {
    if (!live) return g.earned;
    const elapsed = BigInt(Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000)));
    const e = g.earned + (g.stipendPerMonth * elapsed) / BigInt(MONTH);
    return e > g.amount ? g.amount : e;
    // tick drives re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, fetchedAt, live, tick]);
  const claimable = g.state === "ACCEPTED" ? earned - g.paid : 0n;
  const pct = Number((earned * 1000n) / (g.amount || 1n)) / 10;

  const caption =
    g.state === "OFFERED"
      ? "Starts once the candidate accepts."
      : live
        ? `Streaming ${usd(g.stipendPerMonth, 0)}/month because joining is late.`
        : g.state === "ACCEPTED" && g.now < g.stipendStart
          ? `Starts ${date(g.stipendStart)} if the candidate hasn't joined by then.`
          : g.state === "ACCEPTED" && g.joinClaimedAt > 0n && !g.disputed
            ? "Paused: the company says the candidate has joined."
            : g.earned >= g.amount
              ? "The full guarantee has been earned."
              : "The stipend has stopped.";

  return (
    <div className="card p-5 sm:p-6 grid gap-3" aria-live="off">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Delay stipend earned</p>
      <p className={`font-display text-5xl sm:text-6xl font-bold tabular ${live ? "text-verified" : ""}`} data-testid="earned">
        {usd(earned, live ? 4 : 2)}
      </p>
      <div className="h-2 rounded-full bg-sunk overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of guarantee earned">
        <div className="h-full bg-verified transition-[width] duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="text-sm text-muted">
        {caption} {pct > 0 ? `${pct.toFixed(1)}% of the ${usd(g.amount, 0)} guarantee.` : ""}
      </p>
      {g.state === "ACCEPTED" && (
        <p className="text-sm">
          Ready to claim: <strong className="tabular">{usd(claimable > 0n ? claimable : 0n)}</strong> · Paid so far:{" "}
          <span className="tabular">{usd(g.paid)}</span>
        </p>
      )}
    </div>
  );
}

function Facts({ g }: { g: Guarantee }) {
  const rows: [string, string][] = [
    ["Guarantee locked", usd(g.amount)],
    ["Stipend if late", `${usd(g.stipendPerMonth)} / month`],
    ["Grace period", plural(dayCount(g.grace), "day")],
    ["Promised joining", date(g.joinDate)],
  ];
  if (g.currentJoinDate !== g.joinDate) rows.push(["Announced joining", date(g.currentJoinDate)]);
  rows.push(["Candidate pledge", g.pledge ? usd(g.pledge) : "None"]);
  return (
    <dl className="card p-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm content-start">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="font-semibold text-right tabular">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Timeline({ g }: { g: Guarantee }) {
  const points = [
    { t: g.createdAt, label: "Offer made", tone: "bg-ink" },
    { t: g.joinDate, label: "Promised joining", tone: "bg-accent" },
    { t: g.stipendStart, label: "Stipend starts", tone: "bg-verified" },
  ];
  if (g.currentJoinDate !== g.joinDate) points.push({ t: g.currentJoinDate, label: "New date", tone: "bg-warn" });
  const end = g.stoppedAt || g.now;
  const min = Number(g.createdAt);
  const maxT = Math.max(...points.map((p) => Number(p.t)), Number(end)) ;
  const span = Math.max(1, maxT - min) * 1.06;
  const pos = (t: bigint) => `${Math.min(100, Math.max(0, ((Number(t) - min) / span) * 100))}%`;
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between text-xs text-muted mb-5">
        <span className="font-semibold uppercase tracking-wider">Timeline</span>
        <span>
          {g.timeOffset > 0n ? "Demo clock: " : "Today: "}
          <strong className="text-ink">{date(end)}</strong>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-sunk mx-2" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-ink/20" style={{ width: pos(end) }} />
        {points.map((p) => (
          <span
            key={p.label}
            className={`absolute -translate-x-1/2 block size-4 rounded-full border-2 border-card ${p.tone}`}
            style={{ left: pos(p.t), top: -4 }}
          />
        ))}
        <span className="absolute -translate-x-1/2 block w-0.5 h-6 bg-danger" style={{ left: pos(end), top: -8 }} />
      </div>
      <ul className="mt-6 grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 gap-y-2 text-xs">
        {points.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full shrink-0 ${p.tone}`} aria-hidden />
            <span className="text-muted">{p.label}</span>
            <span className="font-semibold">{date(p.t)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="w-0.5 h-3 bg-danger shrink-0" aria-hidden />
          <span className="text-muted">{g.stoppedAt ? "Stopped" : "Now"}</span>
          <span className="font-semibold">{date(end)}</span>
        </li>
      </ul>
    </div>
  );
}

function Explainer({ g }: { g: Guarantee }) {
  let text = "";
  switch (g.state) {
    case "OFFERED":
      text = `${g.companyDomain} has locked ${usd(g.amount, 0)}. Once the candidate accepts${g.pledge ? ` (with a ${usd(g.pledge, 0)} refundable pledge)` : ""}, the money stays locked until joining.`;
      break;
    case "ACCEPTED":
      text =
        g.now < g.stipendStart
          ? `Joining is due ${date(g.currentJoinDate)}. If it hasn't happened by ${date(g.stipendStart)}, the candidate starts earning ${usd(g.stipendPerMonth, 0)} a month from the guarantee. Postponing doesn't pause it.`
          : `Joining is late. The candidate earns ${usd(g.stipendPerMonth, 0)} a month until they join or the guarantee runs out. If ${g.companyDomain} revokes the offer, the candidate gets everything left.`;
      if (g.joinClaimedAt > 0n && !g.disputed)
        text = `${g.companyDomain} says the candidate joined on ${date(g.joinClaimedAt)}. The candidate has until ${date(g.joinClaimedAt + BigInt(DISPUTE_WINDOW))} to dispute it.`;
      if (g.disputed) text = "The candidate disputes the joining claim. Pakka's dispute desk will resolve it; the stipend keeps running meanwhile.";
      break;
    case "JOINED":
      text = `The candidate joined. They kept ${usd(g.paid)} in stipend${g.pledge ? " and got their pledge back" : ""}; the rest went back to ${g.companyDomain}.`;
      break;
    case "REVOKED":
      text = `${g.companyDomain} revoked the offer. The candidate received everything left in the guarantee${g.pledge ? " plus their pledge" : ""}.`;
      break;
    case "WITHDRAWN":
      text = "The candidate backed out. The guarantee and pledge went back to the company.";
      break;
    case "CANCELLED":
      text = "The company cancelled the offer before it was accepted, with no penalty.";
      break;
  }
  return (
    <p className="text-sm flex gap-2">
      <Info className="size-4 mt-0.5 shrink-0 text-muted" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

function Actions({ g, onDone }: { g: Guarantee; onDone: () => Promise<void> }) {
  const { address, send, kind, persona, setPersona } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [connect, setConnect] = useState(false);
  const [newDate, setNewDate] = useState(() => new Date((Number(g.currentJoinDate) + 90 * 86400) * 1000).toISOString().slice(0, 10));

  const me = address ? getAddress(address) : null;
  const isCompany = me === getAddress(g.company);
  const isCandidate = me === getAddress(g.candidate);

  async function run(label: string, fn: () => Promise<`0x${string}`>) {
    setBusy(label);
    setError(null);
    try {
      const hash = await fn();
      setLastTx(hash);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const B = ({ id, children, onClick, tone = "btn-ghost" }: { id: string; children: React.ReactNode; onClick: () => void; tone?: string }) => (
    <button className={`btn ${tone}`} onClick={onClick} disabled={!!busy}>
      {busy === id && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );

  const claimWindowOpen = g.joinClaimedAt > 0n && !g.disputed && g.now < g.joinClaimedAt + BigInt(DISPUTE_WINDOW);
  const claimWindowOver = g.joinClaimedAt > 0n && !g.disputed && g.now >= g.joinClaimedAt + BigInt(DISPUTE_WINDOW);

  if (!address) {
    return (
      <div className="card p-5 flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm">Connect as the company or the candidate to act on this offer.</p>
        <button className="btn btn-primary" onClick={() => setConnect(true)}>
          Connect
        </button>
        {connect && <ConnectDialog onClose={() => setConnect(false)} />}
      </div>
    );
  }

  if (!isCompany && !isCandidate) {
    const other = persona === "candidate" ? "company" : "candidate";
    return (
      <div className="card p-5 text-sm flex flex-wrap items-center gap-3">
        <span className="flex-1">You&apos;re viewing this offer. Only the company and the candidate can act on it.</span>
        {kind === "guest" && (
          <button className="btn btn-ghost btn-sm" onClick={() => setPersona(other)}>
            Switch to demo {other}
          </button>
        )}
      </div>
    );
  }

  const active = g.state === "OFFERED" || g.state === "ACCEPTED";

  return (
    <div className="grid gap-4">
      {active && (
        <div className="card p-5 grid gap-4">
          <p className="font-display font-semibold text-lg">{isCompany ? "Company actions" : "Your actions"}</p>
          <div className="flex flex-wrap gap-2">
            {isCandidate && g.state === "OFFERED" && (
              <B id="accept" tone="btn-primary" onClick={() => run("accept", () => acceptGuarantee(send, address, g))}>
                Accept offer{g.pledge ? ` (pledge ${usd(g.pledge, 0)})` : ""}
              </B>
            )}
            {isCandidate && g.state === "ACCEPTED" && (
              <>
                <B id="claim" tone="btn-primary" onClick={() => run("claim", () => escrowAction(send, "claimStipend", g.id))}>
                  Claim stipend
                </B>
                <B id="joined" onClick={() => run("joined", () => escrowAction(send, "confirmJoined", g.id))}>
                  I&apos;ve joined
                </B>
                {claimWindowOpen && (
                  <B id="dispute" tone="btn-danger" onClick={() => run("dispute", () => escrowAction(send, "disputeJoined", g.id))}>
                    I haven&apos;t joined: dispute
                  </B>
                )}
                <B id="withdraw" onClick={() => run("withdraw", () => escrowAction(send, "withdraw", g.id))}>
                  Decline the job
                </B>
              </>
            )}
            {isCompany && g.state === "OFFERED" && (
              <B id="cancel" onClick={() => run("cancel", () => escrowAction(send, "cancel", g.id))}>
                Cancel offer (no penalty)
              </B>
            )}
            {isCompany && g.state === "ACCEPTED" && (
              <>
                {!g.joinClaimedAt && !g.disputed && (
                  <B id="claimJoined" tone="btn-primary" onClick={() => run("claimJoined", () => escrowAction(send, "claimJoined", g.id))}>
                    Candidate has joined
                  </B>
                )}
                {claimWindowOver && (
                  <B id="finalize" tone="btn-primary" onClick={() => run("finalize", () => escrowAction(send, "finalizeJoined", g.id))}>
                    Settle joining
                  </B>
                )}
                <B id="revoke" tone="btn-danger" onClick={() => run("revoke", () => escrowAction(send, "revoke", g.id))}>
                  Revoke offer
                </B>
              </>
            )}
          </div>
          {isCompany && g.state === "ACCEPTED" && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="label">Postpone joining to</span>
                <input className="input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </label>
              <B id="postpone" onClick={() => run("postpone", () => postponeGuarantee(send, g.id, BigInt(Date.parse(`${newDate}T04:30:00Z`) / 1000)))}>
                Postpone
              </B>
              <span className="text-xs text-muted basis-full">Postponing is public and doesn&apos;t pause the stipend.</span>
            </div>
          )}
        </div>
      )}

      {demoMode && active && g.state === "ACCEPTED" && (
        <div className="card p-5 grid gap-3 border-dashed">
          <div className="flex items-center gap-2">
            <FastForward className="size-5 text-accent" aria-hidden />
            <p className="font-display font-semibold">Demo time machine</p>
          </div>
          <p className="text-sm text-muted">
            Fast-forward this offer&apos;s clock to see what happens when joining slips. It only exists on the demo deployment.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ["1 week", 7],
              ["1 month", 30],
              ["3 months", 90],
            ].map(([label, d]) => (
              <B key={label} id={`warp${d}`} onClick={() => run(`warp${d}`, () => warp(send, g.id, BigInt(Number(d) * 86400)))}>
                +{label}
              </B>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {lastTx && txUrl(lastTx) && (
        <a className="text-xs text-muted inline-flex items-center gap-1 hover:text-ink" href={txUrl(lastTx)} target="_blank" rel="noreferrer">
          Last transaction <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
