"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, FileCheck2, Loader2, RotateCcw, ExternalLink, HelpCircle, Stamp, Share2 } from "lucide-react";
import type { AnalysisReport } from "@pakka/verifier";
import type { Hex } from "viem";
import { VerdictCard } from "./VerdictCard";
import { ConnectDialog } from "./WalletButton";
import { useWallet } from "@/lib/wallet";
import { getCandidateOffers, submitAttestation, type Offer, type SignedAttestation } from "@/lib/pakka";
import { txUrl } from "@/lib/config";
import { date } from "@/lib/format";

export const SAMPLES = [
  { id: "genuine", label: "Genuine offer", url: "/api/demo-email?company=nimbus&kind=OFFER" },
  { id: "tampered", label: "Salary edited", url: "/api/demo-email?company=nimbus&kind=OFFER&tamper=1" },
  { id: "scam", label: "Lookalike scam", url: "/api/demo-email?kind=SCAM" },
] as const;

async function analyze(eml: string): Promise<AnalysisReport> {
  const res = await fetch("/api/verify", { method: "POST", body: eml, headers: { "content-type": "message/rfc822" } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not check that email.");
  return data as AnalysisReport;
}

type Sample = { id: string; label: string; url: string };

export function Verifier({
  compact = false,
  initialSample,
  samples,
  dropTitle = "Drop your offer email here",
  dropText = "The original .eml file. We check the company's signature in seconds and store nothing.",
}: {
  compact?: boolean;
  initialSample?: string;
  samples?: readonly Sample[];
  dropTitle?: string;
  dropText?: string;
}) {
  const list: readonly Sample[] = samples ?? SAMPLES;
  const [eml, setEml] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [help, setHelp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async (text: string, label: string) => {
    setBusy(label);
    setError(null);
    setReport(null);
    try {
      const r = await analyze(text);
      setEml(text);
      setReport(r);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return setError("That file is too large to be an email (2 MB max).");
      await run(await file.text(), "file");
    },
    [run],
  );

  const sample = useCallback(
    async (url: string, id: string) => {
      setBusy(id);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Could not load the sample.");
        await run(await res.text(), id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(null);
      }
    },
    [run],
  );

  useEffect(() => {
    const s = list.find((x) => x.id === initialSample);
    if (s) void sample(s.url, s.id);
    // Run once for the initial sample only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSample]);

  const reset = () => {
    setReport(null);
    setEml(null);
    setError(null);
  };

  return (
    <div className="grid gap-5">
      {!report && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void onFile(e.dataTransfer.files[0]);
          }}
          className={`card border-2 border-dashed ${drag ? "border-accent bg-accent-soft" : "border-line"} ${
            compact ? "p-5" : "p-6 sm:p-8"
          } text-center transition-colors`}
        >
          <input ref={fileRef} type="file" accept=".eml,message/rfc822,text/plain" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Upload className="size-8 mx-auto text-accent" aria-hidden />
          <p className="font-display font-semibold text-lg mt-3">{dropTitle}</p>
          <p className="text-sm text-muted mt-1">{dropText}</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy === "file" ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />} Choose .eml file
            </button>
            <button className="btn btn-ghost" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
              <HelpCircle className="size-4" /> How do I get it?
            </button>
          </div>
          {help && (
            <div className="text-left text-sm bg-sunk rounded-xl p-4 mt-4 grid gap-1.5 fade-up">
              <p>
                <strong>Gmail:</strong> open the email → ⋮ (More) → <em>Download message</em>.
              </p>
              <p>
                <strong>Outlook:</strong> open the email → File → <em>Save as</em> → Outlook Message Format / .eml.
              </p>
              <p>
                <strong>Apple Mail:</strong> select the email → File → <em>Save As</em> → Raw Message Source.
              </p>
              <p className="text-muted">Don&apos;t forward it to yourself first: forwarding removes the company&apos;s signature.</p>
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-line">
            <p className="text-xs text-muted mb-2">{samples ? "Demo shortcut:" : "No offer email handy? Try a sample:"}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {list.map((s) => (
                <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => void sample(s.url, s.id)} disabled={!!busy}>
                  {busy === s.id && <Loader2 className="size-3.5 animate-spin" />}
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <div ref={resultRef} className="grid gap-4 scroll-mt-28" aria-live="polite">
        {report && (
          <>
            <VerdictCard report={report} />
            {eml && <RecordPanel report={report} eml={eml} />}
            <button className="btn btn-ghost self-start" onClick={reset}>
              <RotateCcw className="size-4" /> Check another email
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RecordPanel({ report, eml }: { report: AnalysisReport; eml: string }) {
  const { address, send, persona, kind } = useWallet();
  const [connectOpen, setConnectOpen] = useState(false);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [offerId, setOfferId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: Hex } | null>(null);

  const k = report.email.kind;
  const isEvent = k === "POSTPONED" || k === "REVOKED" || k === "JOINED";

  useEffect(() => {
    if (!isEvent || !address) return;
    getCandidateOffers(address)
      .then((all) => {
        const open = all.filter((o) => o.domain === report.dkim.domain && (o.status === "ACTIVE" || o.status === "DELAYED") && !o.escrowed);
        setOffers(open);
        if (open[0]) setOfferId(open[0].id);
      })
      .catch(() => setOffers([]));
  }, [isEvent, address, report.dkim.domain]);

  if (!report.attestable) return null;

  const title =
    k === "OFFER"
      ? "Record this offer on Pakka"
      : k === "COMPANY_VERIFY"
        ? `Link this wallet to ${report.dkim.domain}`
        : k === "POSTPONED"
          ? "Record the postponement"
          : k === "REVOKED"
            ? "Record the revocation"
            : "Record that you joined";
  const blurb =
    k === "OFFER"
      ? `Creates a permanent, verifiable record of this offer, without publishing the letter. It counts toward ${report.dkim.domain}'s Promise Score, and you can show it to anyone.`
      : k === "COMPANY_VERIFY"
        ? "Proves this wallet speaks for the company, so it can make offers backed by a joining guarantee."
        : `Updates your offer's record and ${report.dkim.domain}'s public Promise Score.`;

  async function record() {
    if (!address) return setConnectOpen(true);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eml, subject: address, offerId: isEvent ? offerId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not verify the email.");
      const hash = await submitAttestation(send, data as SignedAttestation);
      setDone({ hash });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const url = txUrl(done.hash);
    return (
      <div className="card p-5 fade-up flex flex-col sm:flex-row sm:items-center gap-3 border-verified">
        <Stamp className="size-6 text-verified shrink-0" aria-hidden />
        <div className="flex-1">
          <p className="font-semibold">Recorded onchain.</p>
          <p className="text-sm text-muted">
            {k === "COMPANY_VERIFY" ? "Your wallet now speaks for " + report.dkim.domain + "." : "It's now part of " + report.dkim.domain + "'s public record."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {k === "OFFER" && report.emailId && (
            <Link className="btn btn-ghost btn-sm" href={`/offer/${report.emailId}`}>
              <Share2 className="size-3.5" /> Share proof
            </Link>
          )}
          {url && (
            <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">
              Transaction <ExternalLink className="size-3.5" />
            </a>
          )}
          <Link className="btn btn-primary btn-sm" href={k === "COMPANY_VERIFY" ? "/employer" : k === "OFFER" ? "/me" : `/companies/${report.dkim.domain}`}>
            {k === "COMPANY_VERIFY" ? "Employer console" : k === "OFFER" ? "My offers" : "See Promise Score"}
          </Link>
        </div>
      </div>
    );
  }

  const wrongPersona = kind === "guest" && ((k === "COMPANY_VERIFY" && persona !== "company") || (k !== "COMPANY_VERIFY" && persona !== "candidate"));

  return (
    <div className="card p-5 grid gap-3">
      <div>
        <p className="font-display font-semibold text-lg">{title}</p>
        <p className="text-sm text-muted">{blurb}</p>
      </div>
      {isEvent && address && offers && offers.length === 0 && (
        <p className="text-sm bg-warn-soft rounded-lg px-3 py-2">
          You have no open offer from {report.dkim.domain} recorded with this wallet. Record the original offer email first.
        </p>
      )}
      {isEvent && offers && offers.length > 0 && (
        <label className="block">
          <span className="label">Which offer is this about?</span>
          <select className="input" value={offerId} onChange={(e) => setOfferId(e.target.value)}>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.domain} offer, joining {date(o.promisedDate)} ({o.status.toLowerCase()})
              </option>
            ))}
          </select>
        </label>
      )}
      {wrongPersona && (
        <p className="text-sm text-muted">
          Tip: switch the demo role to <strong>{k === "COMPANY_VERIFY" ? "Company" : "Candidate"}</strong> in the header first.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={record} disabled={busy || (isEvent && !!address && !offerId)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Stamp className="size-4" />}
          {address ? title : "Connect to record"}
        </button>
        <span className="text-xs text-muted">Only a hash, the company domain and the dates go onchain.</span>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {connectOpen && <ConnectDialog onClose={() => setConnectOpen(false)} />}
    </div>
  );
}
