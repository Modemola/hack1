import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);
import hre from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { getAddress, keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { ATTESTATION_TYPES, eip712Domain, AttestationKind } from "../attestation";

const DAY = 86_400n;
const USD = (n: number) => parseUnits(String(n), 6);

async function deploy(demoMode = true) {
  const [owner, verifier, company, candidate, stranger, company2] = await hre.viem.getWalletClients();
  const registry = await hre.viem.deployContract("PakkaRegistry", [verifier.account.address]);
  const escrow = await hre.viem.deployContract("JoiningGuarantee", [registry.address, demoMode]);
  await registry.write.setReporter([escrow.address, true]);
  const usd = await hre.viem.deployContract("TestUSD", []);
  const publicClient = await hre.viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  let nonce = 0;
  async function attest(a: {
    kind: keyof typeof AttestationKind;
    subject: Address;
    domain?: string;
    offerId?: Hex;
    emailId?: Hex;
    date?: bigint;
    emailTime?: bigint;
    deadline?: bigint;
    signer?: typeof verifier;
  }) {
    const now = BigInt(await time.latest());
    const emailId = a.emailId ?? keccak256(toHex(`email-${nonce++}`));
    const message = {
      kind: AttestationKind[a.kind],
      subject: a.subject,
      emailId,
      offerId: a.offerId ?? (a.kind === "OFFER" ? emailId : (`0x${"00".repeat(32)}` as Hex)),
      domain: a.domain ?? "nimbus.demo",
      date: a.date ?? 0n,
      emailTime: a.emailTime ?? now,
      deadline: a.deadline ?? now + 3600n,
    };
    const signature = await (a.signer ?? verifier).signTypedData({
      domain: eip712Domain(chainId, registry.address),
      types: ATTESTATION_TYPES,
      primaryType: "Attestation",
      message,
    });
    return { message, signature };
  }

  async function asWallet(wallet: typeof owner) {
    return {
      registry: await hre.viem.getContractAt("PakkaRegistry", registry.address, { client: { wallet } }),
      escrow: await hre.viem.getContractAt("JoiningGuarantee", escrow.address, { client: { wallet } }),
      usd: await hre.viem.getContractAt("TestUSD", usd.address, { client: { wallet } }),
    };
  }

  return { owner, verifier, company, candidate, stranger, company2, registry, escrow, usd, attest, asWallet, publicClient };
}

const deployDemo = () => deploy(true);
const deployProd = () => deploy(false);

describe("PakkaRegistry", () => {
  it("records a verified offer once and rejects a replay of the same email", async () => {
    const { candidate, registry, attest, asWallet } = await loadFixture(deployDemo);
    const now = BigInt(await time.latest());
    const { message, signature } = await attest({ kind: "OFFER", subject: candidate.account.address, date: now + 60n * DAY });
    const c = await asWallet(candidate);
    await c.registry.write.submit([message, signature]);

    const offer = await registry.read.getOffer([message.offerId]);
    expect(getAddress(offer.candidate)).to.equal(getAddress(candidate.account.address));
    expect(offer.domain).to.equal("nimbus.demo");
    expect(offer.status).to.equal(1); // ACTIVE
    expect((await registry.read.statsOf(["nimbus.demo"])).offers).to.equal(1);
    expect(await registry.read.allDomains()).to.deep.equal(["nimbus.demo"]);
    expect(await registry.read.offersOf([candidate.account.address])).to.deep.equal([message.offerId]);
    expect(await registry.read.offersOfDomain(["nimbus.demo"])).to.deep.equal([message.offerId]);

    await expect(c.registry.write.submit([message, signature])).to.be.rejectedWith("EmailAlreadyUsed");
  });

  it("rejects attestations not signed by the verifier, expired, or submitted by someone else", async () => {
    const { candidate, stranger, attest, asWallet } = await loadFixture(deployDemo);
    const c = await asWallet(candidate);
    const forged = await attest({ kind: "OFFER", subject: candidate.account.address, signer: stranger });
    await expect(c.registry.write.submit([forged.message, forged.signature])).to.be.rejectedWith("BadSignature");

    const now = BigInt(await time.latest());
    const expired = await attest({ kind: "OFFER", subject: candidate.account.address, deadline: now - 1n });
    await expect(c.registry.write.submit([expired.message, expired.signature])).to.be.rejectedWith("Expired");

    const good = await attest({ kind: "OFFER", subject: candidate.account.address });
    const s = await asWallet(stranger);
    await expect(s.registry.write.submit([good.message, good.signature])).to.be.rejectedWith("NotSubject");
  });

  it("verifies a company wallet from a DKIM-proven email", async () => {
    const { company, registry, attest, asWallet } = await loadFixture(deployDemo);
    const { message, signature } = await attest({ kind: "COMPANY", subject: company.account.address, domain: "nimbus.demo" });
    await (await asWallet(company)).registry.write.submit([message, signature]);
    expect(await registry.read.companyDomain([company.account.address])).to.equal("nimbus.demo");
  });

  it("tracks postponements, revocations and the Promise Score", async () => {
    const { candidate, registry, attest, asWallet } = await loadFixture(deployDemo);
    const c = await asWallet(candidate);
    const now = BigInt(await time.latest());

    // Three offers from the same company.
    const offers: Hex[] = [];
    for (let i = 0; i < 3; i++) {
      const o = await attest({ kind: "OFFER", subject: candidate.account.address, date: now + 30n * DAY, emailTime: now });
      await c.registry.write.submit([o.message, o.signature]);
      offers.push(o.message.offerId);
    }
    // No judged offers yet.
    expect(await registry.read.promiseScore(["nimbus.demo"])).to.deep.equal([0n, 0n]);

    // Offer 0 joined on time.
    const j = await attest({ kind: "JOINED", subject: candidate.account.address, offerId: offers[0], emailTime: now + 31n * DAY });
    await c.registry.write.submit([j.message, j.signature]);
    // Offer 1 postponed, then revoked.
    const p = await attest({ kind: "POSTPONED", subject: candidate.account.address, offerId: offers[1], date: now + 200n * DAY, emailTime: now + 20n * DAY });
    await c.registry.write.submit([p.message, p.signature]);
    let s = await registry.read.statsOf(["nimbus.demo"]);
    expect(s.delayed).to.equal(1);
    const r = await attest({ kind: "REVOKED", subject: candidate.account.address, offerId: offers[1], emailTime: now + 90n * DAY });
    await c.registry.write.submit([r.message, r.signature]);
    // Offer 2 postponed (still delayed).
    const p2 = await attest({ kind: "POSTPONED", subject: candidate.account.address, offerId: offers[2], date: 0n, emailTime: now + 25n * DAY });
    await c.registry.write.submit([p2.message, p2.signature]);

    s = await registry.read.statsOf(["nimbus.demo"]);
    expect(s.offers).to.equal(3);
    expect(s.joinedOnTime).to.equal(1);
    expect(s.revoked).to.equal(1);
    expect(s.delayed).to.equal(1);
    // (1 + 0 + 0.5) / 3 = 50
    expect(await registry.read.promiseScore(["nimbus.demo"])).to.deep.equal([50n, 3n]);

    const o2 = await registry.read.getOffer([offers[2]]);
    expect(o2.status).to.equal(2); // DELAYED
    expect(o2.currentDate).to.equal(0n); // to be confirmed
    // A closed offer can't change again.
    const again = await attest({ kind: "JOINED", subject: candidate.account.address, offerId: offers[1] });
    await expect(c.registry.write.submit([again.message, again.signature])).to.be.rejectedWith("OfferClosed");
  });

  it("counts a join well after the promised date as late and tallies delay days", async () => {
    const { candidate, registry, attest, asWallet } = await loadFixture(deployDemo);
    const c = await asWallet(candidate);
    const now = BigInt(await time.latest());
    const o = await attest({ kind: "OFFER", subject: candidate.account.address, date: now + 10n * DAY, emailTime: now });
    await c.registry.write.submit([o.message, o.signature]);
    const j = await attest({ kind: "JOINED", subject: candidate.account.address, offerId: o.message.offerId, emailTime: now + 40n * DAY });
    await c.registry.write.submit([j.message, j.signature]);
    const s = await registry.read.statsOf(["nimbus.demo"]);
    expect(s.joinedLate).to.equal(1);
    expect(s.totalDelayDays).to.equal(30n);
  });

  it("only accepts event emails from the offer's own company, sent after the offer", async () => {
    const { candidate, attest, asWallet } = await loadFixture(deployDemo);
    const c = await asWallet(candidate);
    const now = BigInt(await time.latest());
    const o = await attest({ kind: "OFFER", subject: candidate.account.address, emailTime: now });
    await c.registry.write.submit([o.message, o.signature]);
    const other = await attest({ kind: "REVOKED", subject: candidate.account.address, offerId: o.message.offerId, domain: "orbit.demo" });
    await expect(c.registry.write.submit([other.message, other.signature])).to.be.rejectedWith("WrongCompany");
    const early = await attest({ kind: "REVOKED", subject: candidate.account.address, offerId: o.message.offerId, emailTime: now - DAY });
    await expect(c.registry.write.submit([early.message, early.signature])).to.be.rejectedWith("EventBeforeOffer");
  });

  it("lets a candidate report a silent delay only after the promised date plus grace", async () => {
    const { candidate, registry, attest, asWallet } = await loadFixture(deployDemo);
    const c = await asWallet(candidate);
    const now = BigInt(await time.latest());
    const o = await attest({ kind: "OFFER", subject: candidate.account.address, date: now + 10n * DAY });
    await c.registry.write.submit([o.message, o.signature]);
    await expect(c.registry.write.reportSilentDelay([o.message.offerId])).to.be.rejectedWith("TooEarly");
    await time.increase(18 * 86_400);
    await c.registry.write.reportSilentDelay([o.message.offerId]);
    const offer = await registry.read.getOffer([o.message.offerId]);
    expect(offer.status).to.equal(2);
    expect(offer.selfReportedDelay).to.equal(true);
  });

  it("keeps escrow-reporting functions for the escrow contract only", async () => {
    const { stranger, asWallet } = await loadFixture(deployDemo);
    const s = await asWallet(stranger);
    await expect(
      s.registry.write.recordEscrowOffer([keccak256(toHex("x")), stranger.account.address, "nimbus.demo", 0n, 0n]),
    ).to.be.rejectedWith("NotReporter");
  });
});

describe("JoiningGuarantee", () => {
  async function withVerifiedCompany(demoMode = true) {
    const ctx = await (demoMode ? loadFixture(deployDemo) : loadFixture(deployProd));
    const { company, candidate, attest, asWallet } = ctx;
    const co = await asWallet(company);
    const ca = await asWallet(candidate);
    const v = await attest({ kind: "COMPANY", subject: company.account.address, domain: "nimbus.demo" });
    await co.registry.write.submit([v.message, v.signature]);
    await co.usd.write.faucet();
    await ca.usd.write.faucet();
    await co.usd.write.approve([ctx.escrow.address, USD(1_000_000)]);
    await ca.usd.write.approve([ctx.escrow.address, USD(1_000_000)]);
    const now = BigInt(await time.latest());
    const joinDate = now + 30n * DAY;
    // Guarantee: 900 pUSD, stipend 300/month after 15 days' grace, candidate pledge 20.
    await co.escrow.write.create([candidate.account.address, ctx.usd.address, USD(900), USD(300), joinDate, 15n * DAY, USD(20), "Associate Software Engineer"]);
    return { ...ctx, co, ca, joinDate, id: 0n };
  }

  const bal = async (ctx: { usd: { read: { balanceOf: (a: [Address]) => Promise<bigint> } } }, a: Address) => ctx.usd.read.balanceOf([a]);

  it("only lets verified companies lock a guarantee", async () => {
    const { stranger, candidate, usd, asWallet } = await loadFixture(deployDemo);
    const s = await asWallet(stranger);
    const now = BigInt(await time.latest());
    await expect(
      s.escrow.write.create([candidate.account.address, usd.address, USD(900), USD(300), now + 30n * DAY, 0n, 0n, "Role"]),
    ).to.be.rejectedWith("NotVerifiedCompany");
  });

  it("lets the company cancel an unaccepted offer for a full refund", async () => {
    const ctx = await withVerifiedCompany();
    const before = await bal(ctx, ctx.company.account.address);
    await ctx.co.escrow.write.cancel([ctx.id]);
    expect(await bal(ctx, ctx.company.account.address)).to.equal(before + USD(900));
    await expect(ctx.ca.escrow.write.accept([ctx.id])).to.be.rejectedWith("WrongState");
  });

  it("streams a stipend once joining is late, even after a postponement", async () => {
    const ctx = await withVerifiedCompany();
    await ctx.ca.escrow.write.accept([ctx.id]);
    expect((await ctx.registry.read.statsOf(["nimbus.demo"])).offers).to.equal(1);

    // Before the join date + grace: nothing.
    await ctx.ca.escrow.write.demoWarp([ctx.id, 44n * DAY]);
    expect(await ctx.escrow.read.claimable([ctx.id])).to.equal(0n);

    // Company postpones; the stipend clock stays on the original date.
    await ctx.co.escrow.write.postpone([ctx.id, ctx.joinDate + 120n * DAY]);
    expect((await ctx.registry.read.statsOf(["nimbus.demo"])).delayed).to.equal(1);

    // 31 days after the original date: 16 days past the 15-day grace → 300 * 16/30 = 160.
    await ctx.ca.escrow.write.demoWarp([ctx.id, 17n * DAY]);
    const claimable = await ctx.escrow.read.claimable([ctx.id]);
    expect(Number(claimable)).to.be.closeTo(Number(USD(160)), Number(USD(0.01)));

    const before = await bal(ctx, ctx.candidate.account.address);
    await ctx.ca.escrow.write.claimStipend([ctx.id]);
    const got = (await bal(ctx, ctx.candidate.account.address)) - before;
    expect(Number(got)).to.be.closeTo(Number(USD(160)), Number(USD(0.01)));

    // Capped at the guarantee.
    await ctx.ca.escrow.write.demoWarp([ctx.id, 400n * DAY]);
    expect(await ctx.escrow.read.earned([ctx.id])).to.equal(USD(900));
  });

  it("pays the candidate everything left, plus their pledge, when the company revokes", async () => {
    const ctx = await withVerifiedCompany();
    await ctx.ca.escrow.write.accept([ctx.id]);
    await ctx.ca.escrow.write.demoWarp([ctx.id, 60n * DAY]);
    await ctx.ca.escrow.write.claimStipend([ctx.id]);
    const paid = (await ctx.escrow.read.get([ctx.id])).paid;
    const before = await bal(ctx, ctx.candidate.account.address);
    await ctx.co.escrow.write.revoke([ctx.id]);
    const after = await bal(ctx, ctx.candidate.account.address);
    expect(after - before).to.equal(USD(900) - paid + USD(20));
    expect(await bal(ctx, ctx.escrow.address)).to.equal(0n);
    const s = await ctx.registry.read.statsOf(["nimbus.demo"]);
    expect(s.revoked).to.equal(1);
    expect(await ctx.registry.read.promiseScore(["nimbus.demo"])).to.deep.equal([0n, 1n]);
  });

  it("refunds the company in full when the candidate joins on time", async () => {
    const ctx = await withVerifiedCompany();
    const companyStart = await bal(ctx, ctx.company.account.address);
    const candidateStart = await bal(ctx, ctx.candidate.account.address);
    await ctx.ca.escrow.write.accept([ctx.id]);
    await ctx.ca.escrow.write.demoWarp([ctx.id, 30n * DAY]);
    await ctx.ca.escrow.write.confirmJoined([ctx.id]);
    expect(await bal(ctx, ctx.company.account.address)).to.equal(companyStart + USD(900));
    expect(await bal(ctx, ctx.candidate.account.address)).to.equal(candidateStart);
    expect((await ctx.registry.read.statsOf(["nimbus.demo"])).joinedOnTime).to.equal(1);
    expect(await ctx.registry.read.promiseScore(["nimbus.demo"])).to.deep.equal([100n, 1n]);
  });

  it("splits the guarantee when the candidate joins late", async () => {
    const ctx = await withVerifiedCompany();
    await ctx.ca.escrow.write.accept([ctx.id]);
    const companyBefore = await bal(ctx, ctx.company.account.address);
    const candidateBefore = await bal(ctx, ctx.candidate.account.address);
    await ctx.ca.escrow.write.demoWarp([ctx.id, 75n * DAY]); // 45 days late → 30 days of stipend
    await ctx.ca.escrow.write.confirmJoined([ctx.id]);
    const toCandidate = (await bal(ctx, ctx.candidate.account.address)) - candidateBefore;
    const toCompany = (await bal(ctx, ctx.company.account.address)) - companyBefore;
    expect(Number(toCandidate)).to.be.closeTo(Number(USD(300 + 20)), Number(USD(0.01)));
    expect(toCandidate + toCompany).to.equal(USD(920));
    const s = await ctx.registry.read.statsOf(["nimbus.demo"]);
    expect(s.joinedLate).to.equal(1);
    expect(s.totalDelayDays).to.equal(45n);
  });

  it("settles a company's join claim after the dispute window", async () => {
    const ctx = await withVerifiedCompany();
    await ctx.ca.escrow.write.accept([ctx.id]);
    await ctx.ca.escrow.write.demoWarp([ctx.id, 30n * DAY]);
    await ctx.co.escrow.write.claimJoined([ctx.id]);
    await expect(ctx.co.escrow.write.finalizeJoined([ctx.id])).to.be.rejectedWith("DisputeWindowOpen");
    await ctx.co.escrow.write.demoWarp([ctx.id, 8n * DAY]);
    // The stipend paused at the claim time, so nothing accrued during the window.
    expect(await ctx.escrow.read.claimable([ctx.id])).to.equal(0n);
    await ctx.co.escrow.write.finalizeJoined([ctx.id]);
    expect((await ctx.escrow.read.get([ctx.id])).state).to.equal(3); // JOINED
    expect((await ctx.registry.read.statsOf(["nimbus.demo"])).joinedOnTime).to.equal(1);
  });

  it("lets the candidate dispute a false join claim, and the stipend keeps running", async () => {
    const ctx = await withVerifiedCompany();
    await ctx.ca.escrow.write.accept([ctx.id]);
    await ctx.ca.escrow.write.demoWarp([ctx.id, 60n * DAY]);
    await ctx.co.escrow.write.claimJoined([ctx.id]);
    await ctx.ca.escrow.write.disputeJoined([ctx.id]);
    const earnedAtDispute = await ctx.escrow.read.earned([ctx.id]);
    await ctx.ca.escrow.write.demoWarp([ctx.id, 30n * DAY]);
    expect((await ctx.escrow.read.earned([ctx.id])) > earnedAtDispute).to.equal(true);
    await ctx.ca.escrow.write.claimStipend([ctx.id]);

    // Dispute desk finds the candidate had not joined: claim is cleared.
    await ctx.escrow.write.resolveDispute([ctx.id, false]);
    const g = await ctx.escrow.read.get([ctx.id]);
    expect(g.joinClaimedAt).to.equal(0n);
    expect(g.state).to.equal(2); // still ACCEPTED

    // Later the company claims again and the desk confirms. Paid stipend is never clawed back.
    await ctx.co.escrow.write.claimJoined([ctx.id]);
    await ctx.ca.escrow.write.disputeJoined([ctx.id]);
    await ctx.escrow.write.resolveDispute([ctx.id, true]);
    expect((await ctx.escrow.read.get([ctx.id])).state).to.equal(3);
    expect(await bal(ctx, ctx.escrow.address)).to.equal(0n);
  });

  it("returns the guarantee and pledge to the company when the candidate backs out", async () => {
    const ctx = await withVerifiedCompany();
    await ctx.ca.escrow.write.accept([ctx.id]);
    const before = await bal(ctx, ctx.company.account.address);
    await ctx.ca.escrow.write.withdraw([ctx.id]);
    expect(await bal(ctx, ctx.company.account.address)).to.equal(before + USD(920));
    expect(await ctx.escrow.read.renegeCount([ctx.candidate.account.address])).to.equal(1);
    // A candidate backing out doesn't count against the company.
    expect(await ctx.registry.read.promiseScore(["nimbus.demo"])).to.deep.equal([0n, 0n]);
  });

  it("blocks strangers and disables time travel outside demo mode", async () => {
    const ctx = await withVerifiedCompany(false);
    const s = await ctx.asWallet(ctx.stranger);
    await expect(s.escrow.write.accept([ctx.id])).to.be.rejectedWith("NotCandidate");
    await expect(s.escrow.write.revoke([ctx.id])).to.be.rejectedWith("NotCompany");
    await ctx.ca.escrow.write.accept([ctx.id]);
    await expect(ctx.ca.escrow.write.demoWarp([ctx.id, DAY])).to.be.rejectedWith("NoDemo");
  });
});
