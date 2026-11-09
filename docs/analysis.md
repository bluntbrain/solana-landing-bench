# Transaction landing: what the talk claims, what checks out, what to build

Source talk: "The Pod: Land or Lose in Transaction Landing", Viktor Fischer (RockawayX), Solana Accelerate Miami, 2026-05-05. <https://www.youtube.com/watch?v=tYANVYrXrUs>

Checked 2026-11-09. Vendor pages change, so re-check before quoting numbers.

## What he's pitching

**Zela** (RockawayX's "zero latency" product; the auto-captions spell it Zila/Zilla) is remote procedure execution. You hand over Rust strategy code, they compile it to WASM and run it on machines next to validators, routed to whichever is closest to the current leader. One call does the read, the compute and the submit. Instead of fetching data and sending transactions across the internet over and over, the code runs where the block is being built.

It helps liquidators, solvers and market makers who fight over milliseconds and run custom logic. It doesn't make an arbitrary transaction land, and it needs your strategy code on their machines. A generic RPC gateway won't replace it for that use case.

Sources: <https://rockawayx.com/zela>, <https://www.rockawayx.com/insights/zela-remote-procedure-execution>

## Claims vs checks

| Claim in the talk | Status |
|---|---|
| Same script landed 400/400, then 366/400 (earlier ~100, 80, 300) | Live demo on a conference network with memo transactions and default settings. It shows variance, not a benchmark. |
| "Only 1.3% of transactions land, 24% dropped" | Misframed. RockawayX's own write-up says 1.3% of raw *ingress attempts reaching the leader* get packed, and most ingress is duplicate bot spam. It doesn't mean 1.3% of your sends land. |
| ~26 slots late on average | Unverified (attributed to third-party research). |
| 110 ms → 70 ms with Zela; 3.12 ms / 72 ms in the demo | Vendor demo, unverified. |
| Alpenglow and 100M CU blocks coming | Now live on mainnet per solana.com/upgrades. |
| Constellation (16 proposers, 50 ms cycles) | Still a proposal planned by Anza, not live. |
| $200–300K to run your own landing stack | His own rough estimate. |

## How landing works today (Helius docs, read 2026-11-09)

- **Helius Sender** sends one transaction over several paths. Two tiers on the same endpoint:
  - **SWQOS-only** (`?swqos_only=true`): one SWQOS path, minimum tip 0.000005 SOL.
  - **Sender Max**: every path (Helius, Jito, Harmonic, Rakurai and others) plus a priority tip buffer, minimum tip 0.001 SOL, and a priority fee of at least 5,000 lamports.
  - Tips in between are accepted but go best-effort through fewer paths, without the buffer.
  - Every transaction needs a tip to a designated tip account *and* a compute-unit price, or it's rejected.
  - Keyless: 1 request per second per egress IP, per region (callers behind one NAT share it). With a Helius API key: 50 per second.
  - No API credits; you pay the tip.
- **Jito**: `sendTransaction?bundleOnly=true` sends a single-transaction bundle with revert protection. That protection isn't absolute: Jito's docs describe uncled blocks, where rebroadcast transactions skip bundle rules.

Sources: <https://www.helius.dev/docs/sending-transactions/sender>, <https://www.helius.dev/docs/sending-transactions/sender-max>, <https://www.helius.dev/docs/sending-transactions/sender-swqos-only>, <https://docs.jito.wtf/lowlatencytxnsend/>

## Duplicates and escalation: the correction

Raising a tip means signing a different transaction. With a normal recent blockhash, **both versions can execute**: a double swap, a double payment. This repo's tests show it against the real runtime.

**A durable nonce fixes this for any program.** Sign every version of an operation against the same nonce account and nonce value (the cheap version, the dear version, one per provider tip account). The runtime then lets at most one execute. The rest are dropped as invalid and pay nothing. The nonce is used up even if the winning version fails on-chain, so nothing from that set can run afterwards. The runtime enforces this, not the app's program, so it works for a plain transfer or a Jupiter swap.

An earlier version of this note said a gateway couldn't protect arbitrary programs and that a nonce doesn't guard a rebuilt transaction. That was wrong: reusing the same nonce value *is* the guard.

The catches:

- One nonce account per operation in flight, so you need a pool, each holding a small refundable rent deposit.
- Every version needs the user's signature: they pre-sign a ladder or stay online to sign escalations.
- These transactions never expire. To give up, you land a cancel: an advance-only transaction with the same nonce. That's cleaner than waiting out blockhash expiry: once the cancel lands, nothing else from that set can.
- Until then, a relay holding a signed copy could land it late, so keep slippage or limit checks inside the instruction.
- Whether every provider accepts nonce transactions is an empirical question. This repo's benchmark tests Sender and Jito.

It's not a moat. eRPC published a nonce fan-out guide in January 2026, and bot builders already use the pattern. But it turns escalation from a trap into something you can honestly promise: **at most one execution per operation**, for clients that use nonces.

Sources: <https://temporal.xyz/writing/durable-nonces>, <https://support.kiln.fi/articles/9657636192-understanding-and-managing-solana-transactions-with-durable-nonces>, <https://erpc.global/en/doc/rpc/durable-nonce-send-transaction/>, <https://glaive.trade/blog/solana-nonce-accounts>

## What to build

Don't promise "all transactions land, all the time, cheaper". Helius Sender already sends through several paths, so another multi-path sender isn't a difference on its own.

The stronger angle is a **budget-aware landing layer**:

- a maximum fee per request and per day,
- a delivery policy (one tier up front, or cheap first and step up under a nonce),
- receipts that keep "landed but failed" (fee paid) apart from "didn't land" (nothing paid), plus "cancelled" and "unknown",
- the actual cost of every operation, and cost per landed transaction per path.

Measure first: this repo's benchmark compares cost per landed transaction across paths and tiers before anyone builds the router.

**Measured on 2026-11-09** (see the README): on uncontended transactions, every path landed about 100%. Sender Max cost 50x more than SWQOS-only for no gain. A cheap-first ladder under one nonce matched Max's landing rate for 2% of the cost. Its 13 premature step-ups were dropped for free by the nonce, where a blind re-sign would have run them twice. Contention is still untested.
