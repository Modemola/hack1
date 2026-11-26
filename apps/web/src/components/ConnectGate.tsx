"use client";

import { useState, type ReactNode } from "react";
import { Wallet } from "lucide-react";
import { useWallet, type Persona } from "@/lib/wallet";
import { ConnectDialog } from "./WalletButton";

/** Renders children once a wallet is connected; in guest mode, nudges toward the right demo role. */
export function ConnectGate({ children, persona, why }: { children: ReactNode; persona?: Persona; why: string }) {
  const { address, kind, persona: current, setPersona } = useWallet();
  const [open, setOpen] = useState(false);

  if (!address) {
    return (
      <div className="card p-6 text-center grid gap-3 justify-items-center">
        <Wallet className="size-8 text-accent" aria-hidden />
        <p className="font-semibold">Connect to continue</p>
        <p className="text-sm text-muted max-w-sm">{why}</p>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          Connect
        </button>
        {open && <ConnectDialog onClose={() => setOpen(false)} />}
      </div>
    );
  }
  return (
    <>
      {persona && kind === "guest" && current !== persona && (
        <div className="card px-4 py-3 flex flex-wrap items-center gap-3 text-sm bg-accent-soft">
          <span className="flex-1">
            You&apos;re using the demo <strong>{current}</strong> wallet. This page is for the {persona}.
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => setPersona(persona)}>
            Switch to {persona}
          </button>
        </div>
      )}
      {children}
    </>
  );
}
