"use client";

import { useEffect, useRef, useState } from "react";
import { Wallet, UserRound, Building2, LogOut, Zap, X } from "lucide-react";
import { useWallet, type Persona } from "@/lib/wallet";
import { shortAddress } from "@/lib/format";

export function WalletButton() {
  const { address, kind, persona, setPersona, disconnect, connecting } = useWallet();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  if (!address) {
    return (
      <>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)} disabled={connecting}>
          <Wallet className="size-4" /> {connecting ? "Connecting…" : "Connect"}
        </button>
        {open && <ConnectDialog onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      {kind === "guest" && <PersonaSwitch persona={persona} onChange={setPersona} />}
      <button className="btn btn-ghost btn-sm tabular" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
        <span className="size-2 rounded-full bg-verified" aria-hidden />
        {shortAddress(address)}
      </button>
      {menu && (
        <div role="menu" className="card absolute right-0 top-11 w-64 p-2 fade-up">
          <p className="px-2 py-1.5 text-xs text-muted">
            {kind === "guest" ? "Guest wallet (stored in this browser)" : kind === "coinbase" ? "Coinbase Smart Wallet" : "Browser wallet"}
          </p>
          <p className="px-2 pb-2 text-xs font-mono break-all">{address}</p>
          <button
            role="menuitem"
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-sunk"
            onClick={() => {
              setMenu(false);
              disconnect();
            }}
          >
            <LogOut className="size-4" /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function PersonaSwitch({ persona, onChange }: { persona: Persona; onChange: (p: Persona) => void }) {
  return (
    <div className="hidden sm:flex rounded-lg border border-line p-0.5 text-xs font-semibold" role="group" aria-label="Demo role">
      {(
        [
          ["candidate", "Candidate", UserRound],
          ["company", "Company", Building2],
        ] as const
      ).map(([p, label, Icon]) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          aria-pressed={persona === p}
          className={`flex items-center gap-1 px-2 py-1 rounded-md ${persona === p ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function ConnectDialog({ onClose }: { onClose: () => void }) {
  const { connect, error, connecting, address } = useWallet();

  useEffect(() => {
    if (address) onClose();
  }, [address, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="connect-title" onClick={onClose}>
      <div className="card w-full max-w-sm p-5 fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="connect-title" className="font-display text-lg font-bold">
              Connect to Pakka
            </h2>
            <p className="text-sm text-muted">Your wallet is your Pakka account. No seed phrase needed.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-sunk" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button className="btn btn-primary justify-start" onClick={() => connect("guest")} disabled={connecting}>
            <Zap className="size-4" /> Instant guest wallet
            <span className="ml-auto text-xs font-normal opacity-80">fastest</span>
          </button>
          <button className="btn btn-ghost justify-start" onClick={() => connect("coinbase")} disabled={connecting}>
            <span className="size-4 rounded-full bg-[#0052ff]" aria-hidden /> Coinbase Smart Wallet (passkey)
          </button>
          <button className="btn btn-ghost justify-start" onClick={() => connect("injected")} disabled={connecting}>
            <Wallet className="size-4" /> Browser wallet (MetaMask etc.)
          </button>
        </div>
        <p className="text-xs text-muted mt-4">
          Guest wallets live in this browser and get free test gas. You can switch between a candidate and a company
          wallet to try both sides.
        </p>
        {error && <p className="text-sm text-danger mt-3">{error}</p>}
      </div>
    </div>
  );
}
