import { promises as dns } from "node:dns";
import demoKeys from "../fixtures/demo-keys.json" with { type: "json" };

/** Same signature mailauth expects (mirrors dns.promises.resolve). TXT answers are string[][]. */
export type Resolver = (name: string, rrtype: string) => Promise<unknown>;

/** Fictional demo companies live under this TLD. It does not exist on the real internet. */
export const DEMO_TLD = "demo";

export function isDemoDomain(domain: string): boolean {
  return domain.toLowerCase().endsWith(`.${DEMO_TLD}`);
}

function notFound(name: string): Error {
  const err = new Error(`queryTxt ENOTFOUND ${name}`) as NodeJS.ErrnoException;
  err.code = "ENOTFOUND";
  return err;
}

/**
 * Serves DKIM keys for the fictional *.demo companies used in the live demo,
 * so the demo works with no DNS. Never answers for a real domain.
 */
export const demoResolver: Resolver = async (name, rrtype) => {
  const host = name.toLowerCase().replace(/\.$/, "");
  if (rrtype !== "TXT" || !isDemoDomain(host)) throw notFound(name);
  const match = /^[^.]+\._domainkey\./.test(host);
  if (!match) throw notFound(name);
  return [[`v=DKIM1; k=rsa; p=${demoKeys.publicKeyBase64}`]];
};

/** DNS-over-HTTPS resolver, for runtimes without raw DNS (some serverless/edge hosts). */
export function dohResolver(
  endpoint = "https://cloudflare-dns.com/dns-query",
  fetchImpl: typeof fetch = fetch,
): Resolver {
  return async (name, rrtype) => {
    const url = `${endpoint}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(rrtype)}`;
    const res = await fetchImpl(url, { headers: { accept: "application/dns-json" } });
    if (!res.ok) throw new Error(`DoH lookup failed with HTTP ${res.status}`);
    const body = (await res.json()) as { Status: number; Answer?: { type: number; data: string }[] };
    // 16 = TXT. Status 3 = NXDOMAIN.
    const answers = (body.Answer ?? []).filter((a) => a.type === 16);
    if (body.Status === 3 || answers.length === 0) throw notFound(name);
    // DoH returns TXT data as one or more quoted chunks: "abc" "def"
    return answers.map((a) => {
      const chunks = a.data.match(/"((?:[^"\\]|\\.)*)"/g);
      return chunks ? chunks.map((c) => c.slice(1, -1).replace(/\\(.)/g, "$1")) : [a.data];
    });
  };
}

export const systemResolver: Resolver = (name, rrtype) => dns.resolve(name, rrtype as "TXT");

/**
 * Default production resolver: demo domains are answered locally; everything else goes to
 * system DNS, with DNS-over-HTTPS as a fallback when system DNS is unavailable.
 */
export function defaultResolver(opts: { doh?: boolean } = {}): Resolver {
  const doh = dohResolver();
  return async (name, rrtype) => {
    const host = name.toLowerCase().replace(/\.$/, "");
    if (isDemoDomain(host)) return demoResolver(name, rrtype);
    try {
      return await systemResolver(name, rrtype);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // A definite "no such record" is an answer, not an outage: don't retry it elsewhere.
      if (code === "ENOTFOUND" || code === "ENODATA") throw err;
      if (opts.doh === false) throw err;
      return doh(name, rrtype);
    }
  };
}
