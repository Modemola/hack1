"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { getLeaderboard, type CompanyStats } from "@/lib/pakka";
import { isConfigured } from "@/lib/config";
import { plural } from "@/lib/format";
import { ScoreBadge } from "./ScoreBadge";

export function Leaderboard({ limit }: { limit?: number }) {
  const [rows, setRows] = useState<CompanyStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) return setError("Contracts are not configured for this deployment.");
    getLeaderboard()
      .then(setRows)
      .catch(() => setError("Couldn't reach the chain. Refresh in a moment."));
  }, []);

  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!rows)
    return (
      <p className="text-sm text-muted flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Reading the public record…
      </p>
    );
  if (rows.length === 0)
    return <p className="text-sm text-muted">No companies on the record yet. Verify an offer email to add the first one.</p>;

  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <ul className="grid gap-2">
      {shown.map((r, i) => (
        <li key={r.domain}>
          <Link href={`/companies/${encodeURIComponent(r.domain)}`} className="card px-4 py-3 flex items-center gap-4 hover:border-accent transition-colors">
            <span className="w-5 text-sm text-muted tabular text-right">{i + 1}</span>
            <ScoreBadge score={r.score} judged={r.judged} size={48} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{r.domain}</p>
              <p className="text-xs text-muted">
                {plural(r.offers, "offer")} on record
                {r.joinedOnTime ? ` · ${r.joinedOnTime} on time` : ""}
                {r.delayed ? ` · ${r.delayed} delayed` : ""}
                {r.revoked ? ` · ${r.revoked} revoked` : ""}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
