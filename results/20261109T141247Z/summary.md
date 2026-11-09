# Run 20261109T141247Z

2026-11-09T14:12:51.953Z → 2026-11-09T14:23:28.095Z · RPC https://api.mainnet-beta.solana.com · 100 ops per arm requested

| Arm | Ops | Landed OK | Landed rate | Refused (429) | Slots p50 / p90 / p99 | ≤1 / ≤2 / ≤4 slots | Cost per landed (SOL) | Total (SOL) |
|---|---:|---:|---:|---:|---|---|---:|---:|
| `rpc` | 100 | 99 | 100% | 1 (1) | 3 / 4 / 10 | 0% / 29% / 96% | 0.000015 | 0.001485 |
| `swqos` | 100 | 100 | 100% | 0 (0) | 3 / 6 / 11 | 0% / 28% / 78% | 0.000020 | 0.002000 |
| `sender-mid` | 100 | 100 | 100% | 0 (0) | 3 / 6 / 12 | 0% / 19% / 72% | 0.000215 | 0.021500 |
| `sender-max` | 100 | 100 | 100% | 0 (0) | 3 / 6 / 9 | 0% / 33% / 82% | 0.001015 | 0.101500 |
| `jito` | 100 | 100 | 100% | 0 (0) | 3 / 4 / 13 | 0% / 30% / 93% | 0.000025 | 0.002500 |
| `ladder` | 100 | 100 | 100% | 0 (0) | 3 / 7 / 15 | 1% / 17% / 69% | 0.000020 | 0.002000 |
| `race` | 100 | 100 | 100% | 0 (0) | 3 / 6 / 8 | 1% / 24% / 78% | 0.000021 | 0.002125 |

**Ladder:** stepped up to Sender Max on 13% of operations. Wins by step: {"rung1":100}.

**Race:** wins by path: {"rpc":28,"jito":53,"sender-swqos":19}.

**Other outcomes:** none.

## Decision rule

- ✅ Landed rate within 2 points of Sender Max: ladder 100.0% vs sender-max 100.0%
- ✅ p90 slot distance at most 2 slots worse: ladder 7 vs sender-max 6 slots
- ✅ Cost per landed at most half of Sender Max: ladder 0.000020 vs sender-max 0.001015 SOL

## Money

- Recorded cost of all operations: 0.133111 SOL
- Wallet balance change over the same window: 0.133111 SOL (matches)
- Spend cap: 0.270000 SOL
- On-chain spot check: 14/14 landed transactions matched the expected fee and payer debit.

## Anomalies

None. No nonce family landed more than one version.

## Settings

```json
{
  "targetPriorityLamports": 10000,
  "escalateAfterSlots": 4,
  "cancelAfterMs": 30000,
  "giveUpAfterMs": 60000,
  "expiryMarginBlocks": 5,
  "cuLimit": 19700,
  "cuPrice": 507615,
  "jitoTipLamports": 10000,
  "tips": {
    "swqos": 5000,
    "senderMid": 200000,
    "senderMax": 1000000,
    "jitoMin": 10000,
    "jitoMax": 100000
  },
  "jitoTipFloorP50Lamports": 2162,
  "cuMeasured": {
    "blockhash memo": 14789,
    "blockhash memo + tip": 14939,
    "nonce memo": 14939,
    "nonce memo + tip": 15089
  },
  "concurrency": 10,
  "noncePool": 6
}
```

Slot distance = landed slot minus our latest view of the processed slot when the request went out.
Cost per landed = everything the arm paid (fees and tips of every transaction that landed) divided by operations that landed OK.