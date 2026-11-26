"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion, ChevronDown, Sparkles, AlertTriangle, Info } from "lucide-react";
import type { AnalysisReport } from "@pakka/verifier";

const KIND_LABEL: Record<string, string> = {
  OFFER: "Offer letter",
  POSTPONED: "Joining postponed",
  REVOKED: "Offer revoked",
  JOINED: "Joining confirmed",
  COMPANY_VERIFY: "Company wallet verification",
  UNKNOWN: "Not an offer email",
};

export function VerdictCard({ report }: { report: AnalysisReport }) {
  const [tech, setTech] = useState(false);
  const tone = report.verdict;
  const Icon = tone === "verified" ? ShieldCheck : tone === "danger" ? ShieldAlert : ShieldQuestion;
  const stampText = tone === "verified" ? "Pakka" : tone === "danger" ? "Fake" : "Unverified";
  const toneBg = tone === "verified" ? "bg-verified-soft" : tone === "danger" ? "bg-danger-soft" : "bg-warn-soft";
  const toneText = tone === "verified" ? "text-verified" : tone === "danger" ? "text-danger" : "text-warn";

  const fields: [string, { value: string; source: string } | undefined][] = [
    ["Candidate", report.offer.candidateName],
    ["Role", report.offer.role],
    ["Compensation", report.offer.ctc],
    [report.email.kind === "POSTPONED" ? "New joining date" : "Joining date", report.offer.joinDate],
  ];
  const shownFields = fields.filter(([, v]) => v);

  return (
    <div className="card overflow-hidden fade-up" data-verdict={tone}>
      <div className={`${toneBg} px-5 py-5 sm:px-6 flex gap-4 items-start relative`}>
        <Icon className={`size-8 shrink-0 ${toneText}`} aria-hidden />
        <div className="min-w-0 pr-24 sm:pr-40">
          <p className={`text-xs font-semibold uppercase tracking-wider ${toneText}`}>{KIND_LABEL[report.email.kind]}</p>
          <h3 className="font-display text-xl sm:text-2xl font-bold leading-tight mt-0.5 break-words">{report.headline}</h3>
          <p className="text-sm mt-1.5 text-ink/80">{report.detail}</p>
        </div>
        <div
          className={`stamp stamp-in absolute right-3 top-4 sm:right-6 sm:top-5 text-sm sm:text-2xl ${
            tone === "danger" ? "stamp-danger" : tone === "warning" ? "stamp-warn" : ""
          }`}
          aria-hidden
        >
          {stampText}
          {tone === "verified" && <span className="text-[0.55rem] tracking-[0.2em] font-semibold -mt-0.5">DKIM ✓</span>}
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5 grid gap-5">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="label">From</p>
            <p className="font-medium break-all">
              {report.sender.name ? `${report.sender.name} ` : ""}
              <span className="text-muted">&lt;{report.sender.address}&gt;</span>
            </p>
          </div>
          <div>
            <p className="label">Subject</p>
            <p className="font-medium break-words">{report.email.subject || "(no subject)"}</p>
          </div>
          {shownFields.map(([label, v]) => (
            <div key={label}>
              <p className="label flex items-center gap-1">
                {label}
                {v!.source === "ai" && (
                  <span className="inline-flex items-center gap-0.5 text-[0.65rem] font-semibold text-accent" title="Read by AI from the signed email text">
                    <Sparkles className="size-3" /> AI
                  </span>
                )}
              </p>
              <p className="font-medium">{label.includes("date") ? formatDay(v!.value) : v!.value}</p>
            </div>
          ))}
        </div>

        {report.flags.length > 0 && (
          <ul className="grid gap-2" aria-label="Warning signs">
            {report.flags.map((f, i) => (
              <li
                key={i}
                className={`flex gap-2 text-sm rounded-lg px-3 py-2 ${f.severity === "high" ? "bg-danger-soft" : "bg-warn-soft"}`}
              >
                <AlertTriangle className={`size-4 mt-0.5 shrink-0 ${f.severity === "high" ? "text-danger" : "text-warn"}`} aria-hidden />
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}

        {report.ai.summary && (
          <p className="text-sm text-muted flex gap-2">
            <Sparkles className="size-4 mt-0.5 shrink-0 text-accent" aria-hidden />
            <span>{report.ai.summary}</span>
          </p>
        )}

        {report.sender.isDemo && (
          <p className="text-xs text-muted flex gap-2">
            <Info className="size-3.5 mt-0.5 shrink-0" aria-hidden />
            {report.sender.domain} is a fictional demo company. Real emails are checked against the company&apos;s real DNS keys.
          </p>
        )}

        <button onClick={() => setTech((t) => !t)} className="text-xs text-muted flex items-center gap-1 self-start hover:text-ink" aria-expanded={tech}>
          <ChevronDown className={`size-3.5 transition-transform ${tech ? "rotate-180" : ""}`} /> Technical details
        </button>
        {tech && (
          <dl className="text-xs font-mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 bg-sunk rounded-lg p-3 break-all">
            <dt className="text-muted">dkim</dt>
            <dd>{report.dkim.status}{report.dkim.domain ? ` (d=${report.dkim.domain})` : ""}</dd>
            {report.dkim.signedAt && (
              <>
                <dt className="text-muted">signed</dt>
                <dd>{new Date(report.dkim.signedAt).toUTCString()}</dd>
              </>
            )}
            {report.emailId && (
              <>
                <dt className="text-muted">email id</dt>
                <dd>{report.emailId}</dd>
              </>
            )}
            <dt className="text-muted">ai read</dt>
            <dd>{report.ai.used ? report.ai.model : "not used"}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

function formatDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
