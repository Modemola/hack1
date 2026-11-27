# Pakka pitch kit

## One line

Pakka makes a job offer something you can verify and something with money behind it: candidates can prove an offer is genuine, see which companies keep their joining dates, and get paid while they wait when a company doesn't.

## 60-second spoken pitch

> Infosys, Wipro and TCS have postponed joining for more than ten thousand freshers. Tech Mahindra left a thousand graduates waiting for nearly a year. And students keep losing money to fake offer letters that copy real company logos.
>
> An offer letter is a promise with no teeth. Pakka gives it teeth.
>
> First, verify. Every company's mail server signs its emails. Drop your offer email into Pakka and in two seconds you know if it's genuine, edited, or a scam from a lookalike domain.
>
> Second, record. Your verified offer, and any postponement, goes onchain. Every company builds a public Promise Score from real, verified emails that it can't edit or delete.
>
> Third, guarantee. Employers who mean it lock a joining guarantee in stablecoins. If joining slips, a stipend streams to the candidate every second. If they revoke, the candidate keeps the rest.
>
> Students can use Pakka today, without waiting for any employer to sign up. Employers who opt in get a badge that wins them the best candidates.

## 2-minute demo video script

| Time | Screen | Say |
|---|---|---|
| 0:00 | Home page | "This is Pakka. Infosys, Wipro and TCS postponed joining for ten thousand freshers, and fake offers keep costing students money." |
| 0:12 | Click **Lookalike scam** | "Here's a fake TCS offer. It's validly signed, but by tcs-onboarding, not tcs.com. And it asks for a ₹4,999 deposit. Pakka flags all of it." |
| 0:27 | Click **Salary edited** | "Here someone edited the salary in a real offer. The company's signature no longer matches, so it's marked fake." |
| 0:37 | Click **Genuine offer** | "A genuine offer gets the Pakka stamp. Pakka has read the role, pay and joining date." |
| 0:45 | Record with guest wallet | "One click records it onchain, with no seed phrase. Only a hash and the dates go public." |
| 0:55 | Switch to Company → Employers | "Now the employer side. The company proves its domain the same way, with one signed email." |
| 1:05 | Create guaranteed offer | "It locks a joining guarantee: 1,500 dollars, with a 500-a-month stipend if joining is late." |
| 1:15 | Switch to Candidate → Accept → **+1 month** | "The candidate accepts. Now joining slips a month… and the stipend starts streaming, every second. The company postponing doesn't stop it." |
| 1:35 | Claim, then Company → **Revoke** | "If the company revokes, the candidate gets everything left in the guarantee." |
| 1:45 | Promise Score page | "And the company's Promise Score drops, publicly and permanently." |
| 1:55 | Home | "Pakka. Make every offer pakka." |

A captioned silent version is already in [`pakka-demo.mp4`](pakka-demo.mp4); record your own voice-over over it or redo it live.

Record at 1280×800, browser zoom 110%, and do one dry run first so the guest wallets already have gas.

## Questions judges will ask

**Why does this need a blockchain?**
Three things a database can't promise. The escrow is held by code neither side controls, so the stipend pays out without the company's cooperation. The Promise Score can't be quietly edited or deleted, even if a large employer pressures the operator; review sites face exactly that pressure. And anyone can verify a recorded offer without trusting us.

**Why would a company lock up money?**
They get it all back if they onboard on time; the only cost is the guarantee being locked up for a few months. In return they get a "Pakka Verified" badge that wins candidates in a market where candidates hold several offers. Many accepted offers are dropped, and companies can ask candidates for an optional pledge. Go-to-market is placement cells: one college requiring escrowed offers brings in every company that recruits there.

**What if the company never adopts it?**
Candidates still get full value: verifying offers and building the Promise Score need nothing from the company. That's the cold-start answer.

**Can't someone fake the email?**
Not without the company's private DKIM key. Pakka requires the signature to match the From domain and cover the whole body, so changing one digit of the salary breaks it. A scammer can sign mail from their own lookalike domain, which is why Pakka also checks for lookalikes, free mailboxes and fee requests.

**Do you trust your own verifier?**
Today, yes: one key signs attestations after checking DKIM, and it can be rotated. The roadmap moves the check onchain with zkEmail proofs so no one has to be trusted.

**Privacy?**
Emails are checked and discarded, never stored. Only a hash, the company domain and the dates go onchain. The AI read is optional and can be turned off.

**Is the candidate pledge legal?**
Courts in India limit penalty bonds on employees, so the pledge is optional and small, and it's refunded on joining. The product's center of gravity is protecting candidates.

**What's real vs demo?**
The DKIM verification is real and works on real emails from real domains. The contracts are deployed on Base Sepolia. The demo companies use a fictional `.demo` domain whose key only works inside Pakka, and the time machine only exists on the demo deployment.

## Submission checklist

- [ ] Web app deployed (Vercel), with `VERIFIER_PRIVATE_KEY`, `FAUCET_PRIVATE_KEY` and `NEARAI_API_KEY` set
- [ ] The deployer wallet has Base Sepolia ETH for the gas drip
- [ ] Demo video recorded (script above)
- [ ] Repository public, README up to date
- [ ] Contract addresses in the submission form
- [ ] Teammate added to the team on Hack4Hack (2–4 members required)
