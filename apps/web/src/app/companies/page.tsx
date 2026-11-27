import Link from "next/link";
import { Scale } from "lucide-react";
import { Leaderboard } from "@/components/Leaderboard";

export const metadata = { title: "Promise Scores · Pakka" };

export default function CompaniesPage() {
  return (
    <div className="grid gap-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold">Promise Scores</h1>
        <p className="text-muted mt-2">
          How reliably each company keeps the joining dates it promises, built only from verified offer emails and
          escrowed offers. On time earns 1 point, a delay or late joining 0.5, a revocation 0. Offers still before
          their joining date aren&apos;t judged yet.
        </p>
        <Link href="/compare" className="btn btn-ghost mt-4">
          <Scale className="size-4" /> Compare companies side by side
        </Link>
      </div>
      <Leaderboard />
    </div>
  );
}
