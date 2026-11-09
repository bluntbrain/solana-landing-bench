# solana-landing-bench

What does it cost to land a Solana transaction, by path and by tier? And does **starting cheap and stepping up under a durable nonce** beat **paying the full tip up front**?

This repo runs that comparison on mainnet with real SOL. It also proves locally, against the real Solana runtime, the property the step-up depends on.

- [PLAN.md](PLAN.md): arms, metrics, budget and the decision rule (fixed before running)
- [docs/analysis.md](docs/analysis.md): the talk that prompted this, what checks out, and what to build
- [results/](results/): one folder per run (`summary.md`, `summary.json`, `ops.jsonl`, `meta.json`)

## Results

Run `20261109T141247Z`: mainnet, 2026-11-09 14:12–14:23 UTC, 700 operations (100 per arm). Full numbers are in [results/20261109T141247Z/summary.md](results/20261109T141247Z/summary.md).

| Arm | Landed | Slots p50 / p90 / p99 | Within 4 slots | Cost per landed (SOL) |
|---|---:|---|---:|---:|
| `rpc` | 99/99 (+1 refused, 429) | 3 / 4 / 10 | 96% | 0.000015 |
| `swqos` | 100/100 | 3 / 6 / 11 | 78% | 0.000020 |
| `sender-mid` | 100/100 | 3 / 6 / 12 | 72% | 0.000215 |
| `sender-max` | 100/100 | 3 / 6 / 9 | 82% | 0.001015 |
| `jito` | 100/100 | 3 / 4 / 13 | 93% | 0.000025 |
| `ladder` | 100/100 | 3 / 7 / 15 | 69% | 0.000020 |
| `race` | 100/100 | 3 / 6 / 8 | 78% | 0.000021 |

**The expensive tier bought nothing here.** Sender Max (0.001 SOL tip) didn't land more often or faster than SWQOS-only (0.000005 SOL), and it cost about 50x more per landed transaction. The in-between tip (0.0002 SOL) did no better either.

**The ladder passed all three pre-set criteria.** It landed 100% (same as Max), its p90 was 7 slots vs 6 (within the allowed 2), and it cost 2% as much. But the cheap step won all 100 times, so on these transactions the step-up never mattered.

**Step-ups fire on sends that are already landing.** The ladder stepped up on 13 operations, and the cheap version landed anyway in every one. In 6 of them it had landed before the step-up even went out; we just hadn't seen it yet. Because every version shared one nonce, all 13 dear versions were dropped and cost nothing. Without the nonce, each would very likely have run a second time: about 0.013 SOL in extra tips here, plus a doubled action.

**No nonce family ever landed twice.** 113 families had two or three versions in flight across RPC, Sender and Jito, and at most one landed each time. Sender and Jito both accept durable-nonce transactions.

**From this location, plain RPC and Jito had the tightest tail**: p90 of 4 slots, vs 6 for every Sender tier. In the race, Jito won 53 times, RPC 28 and Sender SWQOS-only 19.

**The money reconciles to the lamport.** The recorded cost (0.133111 SOL) equals the wallet's balance change, and 14 of 14 spot-checked transactions matched their on-chain fee and debit.

### What it means for a landing product

1. For uncontended transactions, default to the cheap tier. Paying 0.001 SOL per send bought nothing.
2. Never step up without a guard. Even with nothing failing, 13% of cheap sends weren't visible after 4 slots, and a blind re-sign would have run them twice. A shared nonce makes step-ups free and safe.
3. Match the step-up delay to how fast you can see a landing. At 4 slots (about 1.6 s) every step-up was premature. A faster landing signal (websocket or Geyser) or a longer delay would cut that waste.
4. The open question is contention. Next run: a small swap on a busy pair, a Helius API key (no shared 1-per-second limit), and a second region.

The whole experiment cost 0.135976 SOL: 0.133111 for the full run, 0.00264 for an earlier smoke run ([results/20261109T133645Z](results/20261109T133645Z/summary.md); its one 429 came from a pacing bug fixed before the full run), and 0.000225 in setup and cleanup fees. All nonce rent was recovered, and 0.164024 SOL went back to the funding wallet.

## Proven locally

`npm test` runs the real Solana runtime ([solana-bankrun](https://github.com/kevinheavey/solana-bankrun)) and checks:

1. **The trap**: without a nonce, re-signing with a bigger tip makes a second transaction. Both execute, and you pay twice.
2. **One nonce**: two versions signed against the same nonce value. The first executes; the second is rejected ("Blockhash not found") and costs nothing. Same in the other order.
3. **Failure still counts**: a version that fails on-chain pays its fee (not its tip) and still uses up the nonce, so no other version can run.
4. **Cancel**: an advance-only transaction with the same nonce invalidates every pending version.

Plus unit tests for fee math, the spend cap, quantiles and the report.

## Arms

| Arm | Path | Tip |
|---|---|---|
| `rpc` | public mainnet RPC | none |
| `swqos` | Helius Sender, SWQOS-only | 0.000005 SOL |
| `sender-mid` | Helius Sender, between tiers | 0.0002 SOL |
| `sender-max` | Helius Sender Max | 0.001 SOL |
| `jito` | Jito, single-transaction bundle | tip floor p50 (10k–100k lamports) |
| `ladder` | SWQOS-only first, Sender Max after 4 slots, one nonce | 0.000005, then 0.001 SOL |
| `race` | RPC, SWQOS-only and Jito fired together, one nonce | per version |

Every transaction is a memo with the same compute-unit limit and the same 10,000-lamport priority fee, so arms differ only in path and tip.

## Run it

```bash
npm install
npm test                                   # local runtime proofs + unit tests
npm run wallet                             # prints the bench wallet (created in keys/, gitignored)
npm run bench -- --dry-run                 # endpoint checks and a cost estimate; sends nothing
npm run bench -- --per-arm 2 --cap 0.01    # smoke run
npm run bench -- --per-arm 100 --cap 0.27  # full run
npm run report -- results/<run-id>         # rebuild a summary
npm run sweep                              # dry run: what would be closed and returned
npm run sweep -- --yes                     # close nonce accounts, return leftovers to the funder
```

The run waits for the wallet to be funded, refuses to run off mainnet, books each operation's worst case against a hard cap before sending, and refuses to sign any tip above 0.002 SOL. Set `RPC_URL` to use another RPC.

## Caveats

- One region, through an HTTPS proxy: compare arms with each other, not with a colocated bot.
- Keyless Sender and Jito allow about 1 request per second per egress IP, so the run is paced and covers one 10-minute window.
- Memo transactions don't compete for busy accounts. This measures path and tier behaviour, not contention. The next step is a contended payload, like a small swap on a busy pair.
- Slot distance is measured from our own view of the current slot, which lags by up to a slot. It's the same for every arm, so compare arms rather than reading the numbers as absolute latency.
