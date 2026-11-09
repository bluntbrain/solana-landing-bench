# solana-landing-bench

What does it cost to land a Solana transaction, by path and by tier? And does **starting cheap and stepping up under a durable nonce** beat **paying the full tip up front**?

This repo runs that comparison on mainnet with real SOL. It also proves locally, against the real Solana runtime, the property the step-up depends on.

- [PLAN.md](PLAN.md): arms, metrics, budget and the decision rule (fixed before running)
- [docs/analysis.md](docs/analysis.md): the talk that prompted this, what checks out, and what to build
- [results/](results/): one folder per run (`summary.md`, `summary.json`, `ops.jsonl`, `meta.json`)

## Results

_Pending: the first mainnet run hasn't finished yet._

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
- Keyless Sender and Jito allow about 1 request per second per egress IP, so the run is paced and covers one short window.
- Memo transactions don't compete for busy accounts. This measures path and tier behaviour, not contention. The next step is a contended payload, like a small swap on a busy pair.
