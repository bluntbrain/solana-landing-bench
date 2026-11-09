# Plan

## The question

Does **starting cheap and stepping up under a durable nonce** beat **paying the full tip up front**, on cost per landed transaction, without losing much speed?

A durable nonce makes the step-up safe: every version of an operation is signed against the same nonce value, so the runtime lets at most one execute. Without it, a re-signed transaction with a bigger tip is a second, independent transaction, and both can land.

## Arms

Every transaction carries a unique memo, the same compute-unit limit and the same priority fee (10,000 lamports by default; Sender Max asks for at least 5,000). The arms differ only in path and tip.

| Arm | What it sends | Tip |
|---|---|---|
| `rpc` | Plain `sendTransaction` to the public mainnet RPC (it rebroadcasts on its own) | none |
| `swqos` | Helius Sender, `?swqos_only=true` (single SWQOS path) | 0.000005 SOL |
| `sender-mid` | Helius Sender, tip between the tiers: best effort, fewer paths, no priority buffer | 0.0002 SOL |
| `sender-max` | Helius Sender Max: every path plus the priority tip buffer | 0.001 SOL |
| `jito` | Jito `sendTransaction?bundleOnly=true` (single-transaction bundle, revert-protected) | Jito tip floor p50, clamped to 10k–100k lamports, fixed at run start |
| `ladder` | Nonce family: `swqos` version first; if it isn't seen after 4 slots, a `sender-max` version with the same nonce | 0.000005 SOL, then 0.001 SOL |
| `race` | Nonce family: `rpc`, `swqos` and `jito` versions fired at the same moment with the same nonce; whichever lands names the fastest path | per version |

Families that don't land within 30 seconds get **cancelled**: an advance-only version with the same nonce. If the cancel lands, no other version can.

## Metrics

Per arm:

- **Landed rate.** Provider rate-limit rejections (HTTP 429) are counted on their own, not as landing failures, because they come from this run's keyless, shared egress IP.
- **Slot distance**: landed slot minus our latest view of the processed slot at send. We report p50, p90, p99, and the share landing within 1, 2 and 4 slots.
- **Cost per landed operation**: base fee + priority fee + tip for every transaction that landed (fees for ones that landed but failed too), divided by the number that landed OK. A nonce family pays for at most one version.
- **Ladder**: how often step 2 was needed, and which step won.
- **Race**: wins per path.
- **Nonce check**: any family where more than one version landed is flagged as an anomaly. The expected count is zero.

Receipts use five states: `landed_ok`, `landed_err` (fee paid), `not_landed` (expired or superseded, nothing paid), `cancelled`, `unknown`. A transaction is only called `not_landed` after its blockhash has expired and a history search still can't find it.

## Decision rule (fixed before running)

On this uncontended baseline, the ladder is worth building around if, compared with `sender-max`:

1. its landed rate is no more than 2 percentage points lower,
2. its p90 slot distance is no more than 2 slots worse, and
3. its cost per landed operation is at most half.

If `swqos` alone already matches `sender-max` on landing and speed, we say so: the ladder only adds value where the cheap path fails, and uncontended memo transactions may never show that. The next run would then use a contended payload, such as a small swap on a busy pair.

## Budget and safety

- Hard spend cap (default 0.27 SOL for 100 operations per arm). The harness books each operation's worst-case cost before sending and releases it to the actual cost once resolved. When the cap is reached, it stops starting new operations.
- Refuses to run unless the RPC reports the mainnet genesis hash.
- Refuses to sign any tip above 0.002 SOL. Sender tip accounts come from Helius's docs; Jito tip accounts come from the block engine and must match the known list.
- Nonce accounts (about 0.0015 SOL rent each, refundable) are closed afterwards, and leftovers are returned to the funding wallet.
- The wallet key stays in `keys/` and is never committed.

## Known limits of this run

- One region (wherever this container runs), sent through an HTTPS proxy. Compare arms with each other, not absolute milliseconds with a colocated bot.
- Keyless Sender and Jito allow about 1 request per second per egress IP, so sends are paced and the run takes about 15 minutes. That's one time-of-day window.
- Memo transactions don't fight over busy accounts. This measures path and tier behaviour, not competition for hot accounts.
- Landing is tracked by polling the public RPC every 400 ms, so time-to-confirm is coarse. Slot distance is the main speed metric.
