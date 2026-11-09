# Landing Solana transactions: what does paying more buy?

A mainnet benchmark run on 9 November 2026. All {{TX_TOTAL}} transactions are listed at the end with links, and each one was re-checked against the chain when this report was built.

Code, raw data and the test suite: <https://github.com/bluntbrain/solana-landing-bench>

## In short

We sent 700 memo transactions through seven sending strategies and measured how often each landed, how many slots it took, and what each landed transaction cost. The strategies were plain RPC, Helius Sender at three tip levels, Jito, and two strategies built on durable nonces.

- **Everything landed.** Every path landed about 100% of the time.
- **Paying more didn't land faster.** Sender Max (0.001 SOL tip) matched the 0.000005 SOL SWQOS-only tier on speed, at about 50x the cost per landed transaction.
- **"Start cheap, step up if slow" kept the same landing rate for 2% of the cost.** It was also safe: every version of an operation shared one durable nonce, so at most one could ever execute.
- **Step-ups fire on sends that are already landing.** 13 of 100 cheap sends weren't visible after 4 slots, but every one of them landed anyway. A blind retry would have executed those twice. The shared nonce dropped all 13 extra versions at no cost.
- **No nonce family ever landed twice**, across RPC, Sender and Jito.

## Why we ran it

This started with the "Land or Lose in Transaction Landing" talk at Solana Accelerate Miami in May. Its live demo showed the same script landing 400 of 400 transactions, then 366 of 400 a few minutes later. The talk also described traders paying several RPC providers at once, because they can never be sure what will land. We wanted numbers for two questions:

1. Does a bigger tip actually land faster?
2. Can a sender raise its tip without risking a double execution?

## How it worked

- **Mainnet**, from one cloud machine behind an HTTPS proxy, 14:12–14:23 UTC on 9 November 2026. A 14-operation smoke run went just before.
- **One bench wallet** paid for everything below: [48iyo3adi1oqm6Gu91vM2LH7Fh9NZrry4EMn2yafSCdh](https://solscan.io/account/48iyo3adi1oqm6Gu91vM2LH7Fh9NZrry4EMn2yafSCdh).
- **The same transaction every time**: a unique memo, a compute-unit limit of 19,700 (set by simulation) and a priority fee of 10,001 lamports. The arms differ only in path and tip.
- **Interleaved**: each of 100 rounds ran the seven arms in a random order.
- **Landing** was tracked with `getSignatureStatuses`. "Slots to land" counts from the slot we saw when the request went out to the slot the transaction landed in.
- **Cost** is the fee plus tip of every transaction that landed. The total matched the wallet's balance change to the lamport.

The seven arms:

| Arm | What it sends | Tip |
|---|---|---|
| `rpc` | Plain `sendTransaction` to the public mainnet RPC | none |
| `swqos` | Helius Sender, SWQOS-only (one stake-weighted path) | 0.000005 SOL |
| `sender-mid` | Helius Sender, tip between the two tiers | 0.0002 SOL |
| `sender-max` | Helius Sender Max (every path plus the priority buffer) | 0.001 SOL |
| `jito` | Jito, single-transaction bundle | 0.00001 SOL |
| `ladder` | SWQOS-only first, then Sender Max after 4 slots, same nonce | 0.000005, then 0.001 SOL |
| `race` | RPC, SWQOS-only and Jito fired together, same nonce | depends on the path |

### The nonce trick

A durable nonce replaces a transaction's recent blockhash with a value stored in an on-chain account, and the transaction's first instruction advances that value. Sign several versions of the same operation against the same value (say, a cheap tip and a big tip, or one version per provider) and the runtime lets only one execute. The others become invalid and cost nothing. Even a version that fails on-chain uses the nonce up. We checked all of this against the Solana runtime locally first (the repo's `npm test`), then on mainnet.

## Results

{{RESULTS}}

- The 0.001 SOL tier was no faster than the 0.000005 SOL tier, and the in-between tip did no better.
- From this machine, plain RPC and Jito had the tightest tail: a p90 of 4 slots, vs 6 for every Sender tier.
- Race wins: {{RACE_WINS}}.

## Evidence you can check

### One landed transaction per arm

{{EXAMPLES}}

### Every ladder step-up

The ladder stepped up {{STEP_UP_COUNT}} times. Each time, the cheap version still landed, and the runtime dropped the Sender Max version because the nonce was already used. In {{ALREADY_LANDED}} of them, the cheap version had landed before the step-up was even sent; we just hadn't seen it yet. Without the shared nonce, these would most likely have executed twice, adding {{AVOIDED_SOL}} SOL in fees and tips plus a doubled action.

{{STEP_UPS}}

### One race won by each path

{{RACES}}

### Nonce accounts

Six nonce accounts served every ladder and race operation. They were closed at the end and their rent was returned.

{{NONCES}}

### Verification

{{VERIFIED}}

## Limits

- **No contention.** Memo transactions don't compete for busy accounts, so this is the baseline. It says nothing about the competitive case (liquidations, arbitrage, solving), which is where co-located execution matters.
- **One machine, one window.** About 10 minutes from a single cloud region, through a proxy.
- **Keyless providers.** Sender and Jito were used without API keys, at about 1 request per second.
- **Our clock.** "Slots to land" counts from our own view of the current slot, which can lag by up to one slot. The lag is the same for every arm.

## What's next

- Contended payloads, such as small swaps on a busy pair, from several regions and with API keys.
- The same contended workload through a co-located execution path such as Zela, to see where moving the logic next to the leader pays off.

## Appendix: every transaction

Landed transactions link to Solscan; replace `solscan.io/tx/` with `explorer.solana.com/tx/` if you prefer. Signatures that never landed are shown in full but not linked, because there's nothing on-chain to link to. For the dropped nonce versions, that absence is the evidence.

{{APPENDIX}}
