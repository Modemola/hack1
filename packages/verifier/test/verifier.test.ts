import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { dkimSign } from "mailauth";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  analyzeEmail,
  ATTESTATION_TYPES,
  classify,
  demoResolver,
  dohResolver,
  eip712Domain,
  extractOffer,
  findDate,
  impersonatedEmployer,
  makeDemoEmail,
  signAttestation,
} from "../src/index.js";

const fx = (name: string) => readFileSync(new URL(`../fixtures/${name}.eml`, import.meta.url), "utf8");
const opts = { resolver: demoResolver, ai: false as const };

describe("DKIM verification", () => {
  it("verifies a genuine signed offer and reads its details", async () => {
    const r = await analyzeEmail(fx("nimbus-offer"), opts);
    expect(r.dkim.status).toBe("pass");
    expect(r.dkim.domain).toBe("nimbus.demo");
    expect(r.verdict).toBe("verified");
    expect(r.email.kind).toBe("OFFER");
    expect(r.offer.joinDate?.value).toBe("2027-01-15");
    expect(r.offer.role?.value).toBe("Associate Software Engineer");
    expect(r.offer.ctc?.value).toMatch(/6,50,000/);
    expect(r.offer.candidateName?.value).toBe("Aarav Sharma");
    expect(r.attestable).toBe(true);
    expect(r.emailId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.emailTime).toBe(Date.parse("2026-07-10T09:30:00Z") / 1000);
    expect(r.sender.isDemo).toBe(true);
  });

  it("catches an offer whose salary was edited after it was sent", async () => {
    const r = await analyzeEmail(fx("tampered-offer"), opts);
    expect(r.dkim.status).toBe("fail");
    expect(r.verdict).toBe("danger");
    expect(r.dkim.reason).toMatch(/changed after it was sent/);
    expect(r.attestable).toBe(false);
  });

  it("refuses to vouch for an email with no signature", async () => {
    const r = await analyzeEmail(fx("unsigned-offer"), opts);
    expect(r.dkim.status).toBe("none");
    expect(r.verdict).toBe("warning");
    expect(r.attestable).toBe(false);
  });

  it("flags a validly signed email from a lookalike domain that asks for money", async () => {
    const r = await analyzeEmail(fx("scam-lookalike"), opts);
    expect(r.dkim.status).toBe("pass");
    expect(r.verdict).toBe("danger");
    const codes = r.flags.map((f) => f.code);
    expect(codes).toContain("LOOKALIKE_DOMAIN");
    expect(codes).toContain("ASKS_FOR_MONEY");
    expect(codes).toContain("OFF_PLATFORM_CONTACT");
    expect(codes).toContain("URGENCY");
    expect(codes).toContain("NO_INTERVIEW");
    expect(r.attestable).toBe(false);
  });

  it("rejects a signature from a different domain than the From header", async () => {
    const raw = [
      'From: "HR" <talent@nimbus.demo>',
      "To: someone@student.demo",
      "Subject: Offer Letter",
      "Date: Fri, 10 Jul 2026 09:30:00 +0000",
      "",
      "Dear Aarav, we are pleased to offer you the position of Analyst.",
      "",
    ].join("\r\n");
    const keys = JSON.parse(readFileSync(new URL("../fixtures/demo-keys.json", import.meta.url), "utf8"));
    const signed = await dkimSign(raw, {
      signatureData: [{ signingDomain: "orbit.demo", selector: "pakka", privateKey: keys.privateKeyPem }],
    });
    const r = await analyzeEmail(signed.signatures + raw, opts);
    expect(r.dkim.status).toBe("fail");
    expect(r.dkim.reason).toMatch(/signed by orbit\.demo/);
  });

  it("flags offers from free mailboxes even when the signature is valid", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const resolver = async (name: string) => {
      if (name === "sel._domainkey.gmail.com") return [[`v=DKIM1; k=rsa; p=${pub}`]];
      throw Object.assign(new Error("nf"), { code: "ENOTFOUND" });
    };
    const raw = [
      'From: "Infosys HR" <infosys.hr.recruit@gmail.com>',
      "To: someone@student.demo",
      "Subject: Offer Letter",
      "Date: Fri, 10 Jul 2026 09:30:00 +0000",
      "",
      "Dear Aarav, we are pleased to offer you the position of Analyst.",
      "",
    ].join("\r\n");
    const signed = await dkimSign(raw, {
      signatureData: [{ signingDomain: "gmail.com", selector: "sel", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) }],
    });
    const r = await analyzeEmail(signed.signatures + raw, { resolver, ai: false });
    expect(r.dkim.status).toBe("pass");
    expect(r.verdict).toBe("danger");
    expect(r.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["FREE_EMAIL_DOMAIN", "DISPLAY_NAME_SPOOF"]));
  });

  it("produces a unique email id per email, so the same proof can't be submitted twice", async () => {
    const a = await analyzeEmail(await makeDemoEmail({ company: "orbit", kind: "OFFER", joinDate: new Date("2027-02-01") }), opts);
    const b = await analyzeEmail(await makeDemoEmail({ company: "orbit", kind: "OFFER", joinDate: new Date("2027-02-01") }), opts);
    expect(a.dkim.status).toBe("pass");
    expect(a.emailId).not.toBe(b.emailId);
    const again = await analyzeEmail(fx("nimbus-offer"), opts);
    const once = await analyzeEmail(fx("nimbus-offer"), opts);
    expect(again.emailId).toBe(once.emailId);
  });
});

describe("event emails", () => {
  it("reads a postponement and its new date", async () => {
    const r = await analyzeEmail(fx("nimbus-postponed"), opts);
    expect(r.email.kind).toBe("POSTPONED");
    expect(r.offer.joinDate?.value).toBe("2027-06-01");
    expect(r.attestable).toBe(true);
  });
  it("reads a revocation", async () => {
    const r = await analyzeEmail(fx("nimbus-revoked"), opts);
    expect(r.email.kind).toBe("REVOKED");
    expect(r.attestable).toBe(true);
  });
  it("reads a joining confirmation", async () => {
    const r = await analyzeEmail(fx("nimbus-joined"), opts);
    expect(r.email.kind).toBe("JOINED");
  });
  it("reads a company wallet verification email", async () => {
    const r = await analyzeEmail(fx("company-verify"), opts);
    expect(r.email.kind).toBe("COMPANY_VERIFY");
    expect(r.walletToVerify).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(r.attestable).toBe(true);
  });
});

describe("extraction", () => {
  it("parses the date formats Indian HR teams use", () => {
    const iso = (s: string) => findDate(s)?.toISOString().slice(0, 10);
    expect(iso("join on 15th January 2027")).toBe("2027-01-15");
    expect(iso("January 15, 2027")).toBe("2027-01-15");
    expect(iso("15/01/2027")).toBe("2027-01-15");
    expect(iso("15-01-2027")).toBe("2027-01-15");
    expect(iso("2027-01-15")).toBe("2027-01-15");
    expect(iso("1st Sept 2027")).toBe("2027-09-01");
    expect(iso("31/02/2027")).toBeUndefined();
  });
  it("prefers the date next to a joining cue over other dates", () => {
    const o = extractOffer("Offer Letter", "Dear Riya,\nThis letter dated 01/07/2026 is to offer you the role. Date of joining: 3rd March 2027.");
    expect(o.joinDate?.toISOString().slice(0, 10)).toBe("2027-03-03");
  });
  it("classifies revocation before postponement", () => {
    expect(classify("Update", "After postponing twice, your offer has been withdrawn.")).toBe("REVOKED");
  });
  it("detects lookalike employer domains without false positives", () => {
    expect(impersonatedEmployer("tcs-careers.in")?.name).toBe("TCS");
    expect(impersonatedEmployer("inf0sys.com")?.name).toBe("Infosys");
    expect(impersonatedEmployer("infosys-hr.co.in")?.name).toBe("Infosys");
    expect(impersonatedEmployer("wipr0.com")?.name).toBe("Wipro");
    expect(impersonatedEmployer("infosys.com")).toBeUndefined();
    expect(impersonatedEmployer("careers.infosys.com")).toBeUndefined();
    expect(impersonatedEmployer("etcsoft.com")).toBeUndefined();
    expect(impersonatedEmployer("nimbus.demo")).toBeUndefined();
  });
});

describe("attestations", () => {
  it("signs EIP-712 attestations that recover to the verifier", async () => {
    const pk = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
    const registry = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
    const att = {
      kind: 1,
      subject: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const,
      emailId: `0x${"11".repeat(32)}` as const,
      offerId: `0x${"11".repeat(32)}` as const,
      domain: "nimbus.demo",
      date: 1800000000n,
      emailTime: 1783675800n,
      deadline: 1900000000n,
    };
    const sig = await signAttestation(pk, 84532, registry, att);
    const signer = await recoverTypedDataAddress({
      domain: eip712Domain(84532, registry),
      types: ATTESTATION_TYPES,
      primaryType: "Attestation",
      message: att,
      signature: sig,
    });
    expect(signer).toBe(privateKeyToAccount(pk).address);
  });
});

describe("resolvers", () => {
  it("never answers for real domains from the demo key table", async () => {
    await expect(demoResolver("pakka._domainkey.infosys.com", "TXT")).rejects.toMatchObject({ code: "ENOTFOUND" });
  });
  it("parses DNS-over-HTTPS TXT answers split into chunks", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ Status: 0, Answer: [{ type: 16, data: '"v=DKIM1; k=rsa; " "p=ABC\\"D"' }] })),
    );
    const r = await dohResolver("https://doh.example/q", fetchImpl as never)("s._domainkey.x.com", "TXT");
    expect(r).toEqual([["v=DKIM1; k=rsa; ", 'p=ABC"D']]);
  });
});

describe("AI read (optional)", () => {
  it("fills gaps and adds flags but never overrides the signature verdict", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"kind":"OFFER","role":null,"redFlags":["Unusually high pay for a fresher"],"summary":"An offer."}' } }] })),
    );
    const r = await analyzeEmail(fx("tampered-offer"), { resolver: demoResolver, ai: { fetchImpl: fetchImpl as never } });
    expect(r.verdict).toBe("danger");
    expect(r.ai.used).toBe(true);
    expect(r.flags.some((f) => f.code === "AI_FLAG")).toBe(true);
  });
  it("is skipped cleanly when the AI service fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const r = await analyzeEmail(fx("nimbus-offer"), { resolver: demoResolver, ai: { fetchImpl: fetchImpl as never } });
    expect(r.ai.used).toBe(false);
    expect(r.verdict).toBe("verified");
  });
});
