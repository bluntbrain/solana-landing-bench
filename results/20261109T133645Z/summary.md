# Run 20261109T133645Z

2026-11-09T14:10:50.669Z → 2026-11-09T14:11:13.141Z · RPC https://api.mainnet-beta.solana.com · 2 ops per arm requested

| Arm | Ops | Landed OK | Landed rate | Refused (429) | Slots p50 / p90 / p99 | ≤1 / ≤2 / ≤4 slots | Cost per landed (SOL) | Total (SOL) |
|---|---:|---:|---:|---:|---|---|---:|---:|
| `rpc` | 2 | 2 | 100% | 0 (0) | 3 / 3 / 3 | 0% / 0% / 100% | 0.000015 | 0.000030 |
| `swqos` | 2 | 1 | 100% | 1 (1) | 6 / 6 / 6 | 0% / 0% / 0% | 0.000020 | 0.000020 |
| `sender-mid` | 2 | 2 | 100% | 0 (0) | 3 / 4 / 4 | 0% / 0% / 100% | 0.000215 | 0.000430 |
| `sender-max` | 2 | 2 | 100% | 0 (0) | 3 / 4 / 4 | 0% / 0% / 100% | 0.001015 | 0.002030 |
| `jito` | 2 | 2 | 100% | 0 (0) | 3 / 3 / 3 | 0% / 0% / 100% | 0.000025 | 0.000050 |
| `ladder` | 2 | 2 | 100% | 0 (0) | 2 / 3 / 3 | 0% / 50% / 100% | 0.000020 | 0.000040 |
| `race` | 2 | 2 | 100% | 0 (0) | 2 / 3 / 3 | 0% / 50% / 100% | 0.000020 | 0.000040 |

**Ladder:** stepped up to Sender Max on 0% of operations. Wins by step: {"rung1":2}.

**Race:** wins by path: {"rpc":1,"jito":1}.

**Other outcomes:** none.

## Decision rule

- ✅ Landed rate within 2 points of Sender Max: ladder 100.0% vs sender-max 100.0%
- ✅ p90 slot distance at most 2 slots worse: ladder 3 vs sender-max 4 slots
- ✅ Cost per landed at most half of Sender Max: ladder 0.000020 vs sender-max 0.001015 SOL

## Money

- Recorded cost of all operations: 0.002640 SOL
- Wallet balance change over the same window: 0.002640 SOL (matches)
- Spend cap: 0.010000 SOL
- On-chain spot check: 13/13 landed transactions matched the expected fee and payer debit.

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
  "jitoTipFloorP50Lamports": 5000,
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