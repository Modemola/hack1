import { addresses, addressUrl, chain, demoMode } from "@/lib/config";
import { shortAddress } from "@/lib/format";

export function Footer() {
  const links = [
    { label: "Registry", address: addresses.registry },
    { label: "Guarantees", address: addresses.escrow },
  ];
  return (
    <footer className="border-t border-line mt-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-sm text-muted flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p>
          Pakka runs on {chain.name}
          {demoMode ? " (demo deployment: test money only)" : ""}. Your emails are checked and discarded, never stored.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap">
          {links.map((l) => {
            const url = addressUrl(l.address);
            return url ? (
              <a key={l.label} href={url} target="_blank" rel="noreferrer" className="hover:text-ink underline-offset-4 hover:underline">
                {l.label} {shortAddress(l.address)}
              </a>
            ) : (
              <span key={l.label}>
                {l.label} {shortAddress(l.address)}
              </span>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
