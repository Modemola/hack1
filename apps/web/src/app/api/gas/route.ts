import { NextResponse } from "next/server";
import { getAddress, isAddress, parseEther } from "viem";
import { publicClient } from "@/lib/chain";
import { clientIp, faucetWallet, isLocal, rateLimited } from "@/lib/server";

export const runtime = "nodejs";

// Testnet gas is cheap: this covers dozens of Pakka transactions.
const DRIP = isLocal ? parseEther("1") : parseEther(process.env.GAS_DRIP_ETH ?? "0.0004");
const MIN_BALANCE = DRIP / 2n;

// Drips go out one at a time so concurrent requests don't reuse the faucet's nonce.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** Gives a new wallet a little testnet ETH so guests can transact without a faucet hunt. */
export async function POST(req: Request) {
  let address: string | undefined;
  try {
    ({ address } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Bad address." }, { status: 400 });
  const to = getAddress(address);

  const wallet = faucetWallet();
  if (!wallet) return NextResponse.json({ error: "Gas drip is not configured." }, { status: 503 });

  const balance = await publicClient.getBalance({ address: to });
  if (balance >= MIN_BALANCE) return NextResponse.json({ ok: true, funded: false });

  if (rateLimited(`gas:addr:${to}`, 2, 60 * 60_000) || rateLimited(`gas:ip:${clientIp(req)}`, 40, 60 * 60_000)) {
    return NextResponse.json({ error: "Gas drip limit reached for now." }, { status: 429 });
  }
  try {
    const result = await serialized(async () => {
      // Re-check inside the queue: an earlier queued drip may already have funded this address.
      if ((await publicClient.getBalance({ address: to })) >= MIN_BALANCE) return null;
      const hash = await wallet.sendTransaction({ to, value: DRIP, chain: wallet.chain, account: wallet.account! });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    });
    return NextResponse.json({ ok: true, funded: !!result, hash: result ?? undefined });
  } catch (e) {
    console.error("gas drip failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : "Drip failed." }, { status: 500 });
  }
}
