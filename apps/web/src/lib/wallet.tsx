"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  custom,
  http,
  type Account,
  type Address,
  type EIP1193Provider,
  type Hash,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { chain, rpcUrl } from "./config";
import { publicClient } from "./chain";

export type WalletKind = "guest" | "injected" | "coinbase";
/** In guest mode one browser can play both sides of the demo. */
export type Persona = "candidate" | "company";

interface WalletState {
  kind: WalletKind | null;
  persona: Persona;
  address: Address | null;
  client: WalletClient | null;
  connecting: boolean;
  error: string | null;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
  setPersona: (p: Persona) => void;
  /** Sends a transaction and waits for it. Throws a readable Error on failure. */
  send: (write: (client: WalletClient, account: Account | Address) => Promise<Hash>) => Promise<Hash>;
}

const WalletContext = createContext<WalletState | null>(null);

const KEY_PREFIX = "pakka.guestKey.";
const KIND_KEY = "pakka.walletKind";
const PERSONA_KEY = "pakka.persona";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function guestKey(persona: Persona): `0x${string}` {
  const s = storage();
  const existing = s?.getItem(KEY_PREFIX + persona);
  if (existing && /^0x[0-9a-f]{64}$/i.test(existing)) return existing as `0x${string}`;
  const key = generatePrivateKey();
  s?.setItem(KEY_PREFIX + persona, key);
  return key;
}

/** Address of this browser's demo wallet for a persona (created on first use). */
export function guestAddress(persona: Persona): Address {
  return privateKeyToAccount(guestKey(persona)).address;
}

/** Ask the app's gas drip for a little testnet ETH so a fresh wallet can transact. */
export async function requestGas(address: Address): Promise<void> {
  try {
    await fetch("/api/gas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
  } catch {
    // Non-fatal: the transaction will explain if gas is missing.
  }
}

const FRIENDLY: Record<string, string> = {
  EmailAlreadyUsed: "This email is already recorded on Pakka.",
  BadSignature: "The verification signature didn't check out. Please verify the email again.",
  Expired: "The verification expired. Please verify the email again.",
  NotSubject: "This proof was issued for a different wallet.",
  UnknownOffer: "Pick the offer this email belongs to first.",
  OfferExists: "This offer is already recorded.",
  WrongCompany: "This update comes from a different company than the offer.",
  OfferClosed: "This offer is already closed (joined or revoked).",
  TooEarly: "You can report a silent delay once the joining date plus 7 days has passed.",
  EventBeforeOffer: "This update is dated before the offer itself.",
  NotVerifiedCompany: "Verify your company domain first.",
  NotCompany: "Only the company that made this offer can do that.",
  NotCandidate: "Only the candidate can do that.",
  NotParty: "Only the company or the candidate can do that.",
  WrongState: "That action isn't available at this stage.",
  BadParams: "Check the values: amounts must be positive, the stipend no larger than the guarantee, and the joining date in the future.",
  NoDemo: "Time travel only works on the demo deployment.",
  NothingToClaim: "Nothing to claim yet.",
  DisputeWindowOpen: "The candidate still has time to dispute this.",
  AlreadyDisputed: "This is already under dispute.",
  NoJoinClaim: "There's no joining claim to act on.",
  ERC20InsufficientBalance: "Not enough test dollars. Use the faucet first.",
  ERC20InsufficientAllowance: "Token approval missing. Try again.",
};

export function readableError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      return FRIENDLY[name] ?? (name ? `Transaction rejected: ${name}` : revert.shortMessage);
    }
    if (/user (rejected|denied)/i.test(err.message)) return "You cancelled the request in your wallet.";
    if (/insufficient funds/i.test(err.message)) return "This wallet needs a little test ETH for gas. Try again in a few seconds.";
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

async function injectedProvider(): Promise<EIP1193Provider> {
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!eth) throw new Error("No browser wallet found. Use a guest wallet or Coinbase Smart Wallet instead.");
  return eth;
}

async function coinbaseProvider(): Promise<EIP1193Provider> {
  const { createCoinbaseWalletSDK } = await import("@coinbase/wallet-sdk");
  const sdk = createCoinbaseWalletSDK({
    appName: "Pakka",
    appChainIds: [chain.id],
    preference: { options: "smartWalletOnly" },
  });
  return sdk.getProvider() as unknown as EIP1193Provider;
}

async function ensureChain(provider: EIP1193Provider) {
  const hex = `0x${chain.id.toString(16)}` as const;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [rpcUrl],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        },
      ],
    });
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<WalletKind | null>(null);
  const [persona, setPersonaState] = useState<Persona>("candidate");
  const [address, setAddress] = useState<Address | null>(null);
  const [client, setClient] = useState<WalletClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectAs = useCallback(async (k: WalletKind, p: Persona) => {
    setConnecting(true);
    setError(null);
    try {
      if (k === "guest") {
        const account = privateKeyToAccount(guestKey(p));
        const c = createWalletClient({ account, chain, transport: http(rpcUrl) });
        setClient(c);
        setAddress(account.address);
        void requestGas(account.address);
      } else {
        const provider = k === "injected" ? await injectedProvider() : await coinbaseProvider();
        const [account] = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
        if (k === "injected") await ensureChain(provider);
        const c = createWalletClient({ account, chain, transport: custom(provider) });
        setClient(c);
        setAddress(account);
        void requestGas(account);
      }
      setKind(k);
      storage()?.setItem(KIND_KEY, k);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  // Restore the previous guest session (browser wallets reconnect on demand).
  useEffect(() => {
    const s = storage();
    const p = (s?.getItem(PERSONA_KEY) as Persona | null) ?? "candidate";
    setPersonaState(p);
    if (s?.getItem(KIND_KEY) === "guest") void connectAs("guest", p);
  }, [connectAs]);

  const connect = useCallback((k: WalletKind) => connectAs(k, persona), [connectAs, persona]);

  const disconnect = useCallback(() => {
    setKind(null);
    setAddress(null);
    setClient(null);
    storage()?.removeItem(KIND_KEY);
  }, []);

  const setPersona = useCallback(
    (p: Persona) => {
      setPersonaState(p);
      storage()?.setItem(PERSONA_KEY, p);
      if (kind === "guest") void connectAs("guest", p);
    },
    [kind, connectAs],
  );

  const send = useCallback<WalletState["send"]>(
    async (write) => {
      if (!client || !address) throw new Error("Connect a wallet first.");
      try {
        const balance = await publicClient.getBalance({ address });
        if (balance === 0n) {
          await requestGas(address);
          // Give the drip a moment to land.
          for (let i = 0; i < 10 && (await publicClient.getBalance({ address })) === 0n; i++) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        // Pass the account object, not the bare address: for a guest (local) wallet viem must sign
        // locally instead of asking the node to sign with an account it doesn't have.
        const hash = await write(client, client.account ?? address);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction failed onchain.");
        return hash;
      } catch (e) {
        throw new Error(readableError(e));
      }
    },
    [client, address],
  );

  const value = useMemo<WalletState>(
    () => ({ kind, persona, address, client, connecting, error, connect, disconnect, setPersona, send }),
    [kind, persona, address, client, connecting, error, connect, disconnect, setPersona, send],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
