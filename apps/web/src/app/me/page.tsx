"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, ChevronRight, Clock } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { getCandidateOffers, getGuarantee, getGuaranteeIds, reportSilentDelay, type Guarantee, type Offer } from "@/lib/pakka";
import { StatusPill } from "@/components/StatusPill";
import { ConnectGate } from "@/components/ConnectGate";
import { date, usd } from "@/lib/format";

const GRACE = 7 * 86400;

export default function MyOffersPage() {
  const { address, send } = useWallet();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [guarantees, setGuarantees] = useState<Guarantee[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    try {
      const [o, ids] = await Promise.all([getCandidateOffers(address), getGuaranteeIds(address, "candidate")]);
      setOffers(o.filter((x) => !x.escrowed));
      setGuarantees(await Promise.all(ids.map(getGuarantee)));
    } catch {
      setError("Couldn't reach the chain. Refresh in a moment.");
    }
  }, [address]);

  useEffect(() => {
    setOffers(null);
    setGuarantees(null);
    void load();
  }, [load]);

  async function silentDelay(id: `0x${string}`) {
    setBusy(id);
    setError(null);
    try {
      await reportSilentDelay(send, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-8 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold">My offers</h1>
        <p className="text-muted mt-2">Your verified offers and joining guarantees. Got an update email from the company? Verify it on the home page to add it here.</p>
      </div>
      <ConnectGate persona="candidate" why="Your offers are tied to your wallet.">
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}

        <section className="grid gap-3">
          <h2 className="font-display text-xl font-bold">Joining guarantees</h2>
          {!guarantees && <Loading />}
          {guarantees?.length === 0 && <p className="text-sm text-muted">No guaranteed offers yet. When an employer makes you one, it shows up here.</p>}
          {guarantees?.map((g) => (
            <Link key={String(g.id)} href={`/guarantee/${g.id}`} className="card px-4 py-3 flex items-center gap-4 hover:border-accent transition-colors">
              <Lock className="size-5 text-verified shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">
                  {g.role} · {g.companyDomain}
                </p>
                <p className="text-xs text-muted">
                  {usd(g.amount, 0)} guaranteed · joining {date(g.currentJoinDate)}
                  {g.claimable > 0n ? ` · ${usd(g.claimable)} ready to claim` : ""}
                </p>
              </div>
              <StatusPill status={g.state} guarantee />
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </Link>
          ))}
        </section>

        <section className="grid gap-3">
          <h2 className="font-display text-xl font-bold">Verified offers</h2>
          {!offers && <Loading />}
          {offers?.length === 0 && (
            <p className="text-sm text-muted">
              None yet. <Link className="underline underline-offset-2" href="/">Verify an offer email</Link> and record it.
            </p>
          )}
          {offers?.map((o) => {
            const overdue = o.status === "ACTIVE" && o.promisedDate > 0n && Date.now() / 1000 > Number(o.promisedDate) + GRACE;
            return (
              <div key={o.id} className="card px-4 py-3 grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/companies/${encodeURIComponent(o.domain)}`} className="font-semibold hover:underline underline-offset-2">
                    {o.domain}
                  </Link>
                  <StatusPill status={o.status} />
                  <span className="text-sm text-muted ml-auto">
                    Promised {date(o.promisedDate)}
                    {o.status === "DELAYED" ? ` → ${o.currentDate ? date(o.currentDate) : "no new date"}` : ""}
                  </span>
                </div>
                {overdue && (
                  <div className="flex flex-wrap items-center gap-3 bg-warn-soft rounded-lg px-3 py-2 text-sm">
                    <Clock className="size-4 text-warn" aria-hidden />
                    <span className="flex-1">Your joining date has passed. Company gone silent?</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => silentDelay(o.id)} disabled={busy === o.id}>
                      {busy === o.id && <Loader2 className="size-3.5 animate-spin" />} Report a silent delay
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </ConnectGate>
    </div>
  );
}

function Loading() {
  return (
    <p className="text-sm text-muted flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </p>
  );
}
