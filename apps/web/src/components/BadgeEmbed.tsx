"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Shows a company's live Promise Score badge and the HTML to put it on a careers page. */
export function BadgeEmbed({ domain }: { domain: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const d = encodeURIComponent(domain);
  const snippet = `<a href="${origin}/companies/${d}"><img src="${origin}/api/badge/${d}" alt="Pakka Promise Score for ${domain}"></a>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this HTML", snippet);
    }
  }

  return (
    <section className="card p-5 grid gap-3">
      <div>
        <h2 className="font-display text-lg font-bold">Show this score on your careers page</h2>
        <p className="text-sm text-muted">A live badge that updates as offers are recorded. Companies that keep their dates can prove it.</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/badge/${d}`} alt={`Pakka Promise Score for ${domain}`} height={20} className="h-5 w-auto self-start" />
      <div className="flex flex-col sm:flex-row gap-2">
        <code className="flex-1 min-w-0 rounded-lg bg-sunk px-3 py-2 text-xs font-mono break-all">{origin ? snippet : "…"}</code>
        <button className="btn btn-ghost btn-sm self-start" onClick={copy} disabled={!origin}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy HTML"}
        </button>
      </div>
    </section>
  );
}
