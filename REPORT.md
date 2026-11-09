# Landing Solana transactions: what does paying more buy?

A mainnet benchmark run on 9 November 2026. All 943 transactions are listed at the end with links, and each one was re-checked against the chain when this report was built.

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

| Arm | Landed | Slots to land p50 / p90 / p99 | Landed within 4 slots | Cost per landed (SOL) |
|---|---:|---|---:|---:|
| `rpc` | 99/99 (+1 refused, HTTP 429) | 3 / 4 / 10 | 96% | 0.000015 |
| `swqos` | 100/100 | 3 / 6 / 11 | 78% | 0.000020 |
| `sender-mid` | 100/100 | 3 / 6 / 12 | 72% | 0.000215 |
| `sender-max` | 100/100 | 3 / 6 / 9 | 82% | 0.001015 |
| `jito` | 100/100 | 3 / 4 / 13 | 93% | 0.000025 |
| `ladder` | 100/100 | 3 / 7 / 15 | 69% | 0.000020 |
| `race` | 100/100 | 3 / 6 / 8 | 78% | 0.000021 |

- The 0.001 SOL tier was no faster than the 0.000005 SOL tier, and the in-between tip did no better.
- From this machine, plain RPC and Jito had the tightest tail: a p90 of 4 slots, vs 6 for every Sender tier.
- Race wins: Jito 53, public RPC 28, Sender SWQOS-only 19.

## Evidence you can check

### One landed transaction per arm

| Arm | Op | Path | Slots after send | Paid (lamports) | Transaction |
|---|---|---|---:|---:|---|
| `rpc` | 0-rpc | public RPC | 3 | 15,001 | [4xGeHisG…Xg7wuE](https://solscan.io/tx/4xGeHisGb7TeJFDxWYjcDTJcun8AYiQnwxMeXAjgGjZ9dmDHGHMDbpxYZYXziSD7dby4FZnPr26buFUvvdXg7wuE) |
| `swqos` | 0-swqos | Sender SWQOS-only | 2 | 20,001 | [58Y2dMg9…5rLPtT](https://solscan.io/tx/58Y2dMg95DS1m4UdxFAYyjAuLW7bc6KYuJymiUrgAQ255yzzWvaPcedUTtLAtqMTo1EXr14CZTcoBKG5sY5rLPtT) |
| `sender-mid` | 0-sender-mid | Sender | 4 | 215,001 | [HFLrr3Wp…GRQYXj](https://solscan.io/tx/HFLrr3WpyJaekrNzhurZi2hQm5YZpFXqTig2WGV5pgFruPcLopBVw3s8euJJtYqEJ4DXXidwNnDjvkGMWGRQYXj) |
| `sender-max` | 0-sender-max | Sender | 3 | 1,015,001 | [4pJaScfq…xVeMza](https://solscan.io/tx/4pJaScfqHr3GYBzXXJUuvF1bH7SyiGEyLAWm1EAv6tuBZN2uu5JZz8m2qCbqUqUvekCcxpsSZwZTwXVjGQxVeMza) |
| `jito` | 0-jito | Jito | 3 | 25,001 | [4zEYN8yZ…C4Tthi](https://solscan.io/tx/4zEYN8yZv3RihK7DfmiQ8LgBPLfsAk8EqNbV9ZvhTBRWeXXGMgCPJEpTo4a16xKrdoMcf8KyfKVLmgHmLZC4Tthi) |
| `ladder` | 0-ladder | Sender SWQOS-only | 5 | 20,001 | [3SwYdwYv…9KRtvz](https://solscan.io/tx/3SwYdwYvuLQNtrucyeS89jWjZKw89jD9Y8RaWJhC2mRBauv4f5GU3vn4hFt1UBQAtEw7xmEkwD7aqCZKG29KRtvz) |
| `race` | 0-race | public RPC | 4 | 15,001 | [3LHrwzbh…4nYQXs](https://solscan.io/tx/3LHrwzbhgxX7Hq8k9NK8gCcTgdn199UAGnEqrTw1XWTMb2VTsZyNMCkSLNiirvHFzHL7prmcUCMg3ybtgC4nYQXs) |

### Every ladder step-up

The ladder stepped up 13 times. Each time, the cheap version still landed, and the runtime dropped the Sender Max version because the nonce was already used. In 6 of them, the cheap version had landed before the step-up was even sent; we just hadn't seen it yet. Without the shared nonce, these would most likely have executed twice, adding 0.013195 SOL in fees and tips plus a doubled action.

| Op | v1 (cheap, 5,000-lamport tip): landed | v1 landed at | v2 (Sender Max, 1,000,000-lamport tip): dropped | v2 sent at |
|---|---|---:|---|---:|
| 0-ladder | [3SwYdwYv…9KRtvz](https://solscan.io/tx/3SwYdwYvuLQNtrucyeS89jWjZKw89jD9Y8RaWJhC2mRBauv4f5GU3vn4hFt1UBQAtEw7xmEkwD7aqCZKG29KRtvz) | +5 slots | `5iQr4g1xZkYteuyHVJbrBGACYjR3jT1tstwMWiacwvZRhypdxwc58YvjTFCVUCEBCmdrbvJFr95nZj51qKZySbV6` | +8 slots |
| 8-ladder | [2yvLgijM…UWYpmj](https://solscan.io/tx/2yvLgijMW6pYxHJzciaXA39GTnduDNQJztXCPUkhBt3JCDtV2RZt3Vfxs3qFMsrFzAQt5JVcUtbiuYm4hQUWYpmj) | +4 slots | `5Crt7K8cpFpc2HZfLUrbxphF1cXSJ8ZkQt3nThrg1RKJsfR7gQ9kMNePZBuhPfYM4yLHZZibuKysEEkEswxNjk1z` | +6 slots |
| 9-ladder | [61nQ7cAh…iDsrNv](https://solscan.io/tx/61nQ7cAhqypGyfJmUFHHpMFUNDLUK2Sz4U7UHv6drqo8V7P35FV3dBDCnyYCq8GjWfmRwa3u3ztFt6HMWsiDsrNv) | +5 slots | `45cjznxoCSFYjRCSapoTQ354DkBzGR2bUCQ5e4SZ23scqaszyQ5BQy2igdKkX3VDkaz1prkiFxibivEaamvG2r2y` | +4 slots |
| 26-ladder | [42PJ4JKV…rPMjJg](https://solscan.io/tx/42PJ4JKVpdV16Q4XwnqVRRN8XpEerzraaU78j3P3SKJhDQxqMkPwka4Yd5Hj3vDbEiM98TX4ZaGG9CNeRhrPMjJg) | +8 slots | `2nQKA7tqrUoB4P9kXR8KuTUffn1MqDysgu7zBGGoaS1p61ZbsN28TprYwS8XJEXKADgJttHNU5LuBiCpq7CTkQvJ` | +10 slots |
| 51-ladder | [3QvnYKpK…mNVQGu](https://solscan.io/tx/3QvnYKpK7gGxpn3pyXoXexVkcAhubYoxY31DYHphMswdPQmD3Cvaaq34i86qL5cNQeaX2EY2vHXYoedEhZmNVQGu) | +7 slots | `3TJZ6T6bzXn9k3odD9SatMDj7XZbXeAjJsBZtoyb6mRuJDXdQ9sN7zVGVTRz5GyivDJnMGuxqCky6HpAdy7gzwdv` | +5 slots |
| 52-ladder | [5HH8FWry…UqtJN7](https://solscan.io/tx/5HH8FWrySyEoLXC8raqPy81TBykNU3inmktBVgbiZJbtueMqxmK8Mzrbk2U7iwocnbv95HeYyGjyDWFyZqUqtJN7) | +6 slots | `5Z5MUapcu8B63vgVowYxCA3cSEsJ4Qyuv66qJmzBKFfhNcBqLLuYWRUc71ijZSSpMQtNNFagjW6yvfjRFWzz1wNz` | +6 slots |
| 54-ladder | [3GRSZCmo…X72n1f](https://solscan.io/tx/3GRSZCmoQ3CAmoYaXyDxu8ZFXrnqZ7HYt3u2pZf5R2heTgddvQ6GQyrUoSdKvs4QJcpM4pXvvLAgF19atcX72n1f) | +4 slots | `4qgkKPXBbiA9J1RMpvVYg3k8RB9tvNmg1vgQqpVmKrSm7ms9yjdrnNsim9Tw53BRbcwfQu6q8zw84on8tcN8DdFV` | +4 slots |
| 57-ladder | [3GLQUNiR…Y3vQRF](https://solscan.io/tx/3GLQUNiRPwk6UQT2xA5GaSB4g5cUyqvixW1Mgx9vBMZMNSxhKdKWdn39yAuAPSYpvqnu7wEiiNQcC76HMsY3vQRF) | +7 slots | `2nS6uD3NBiQbQYLCYHQZ2VtBuzpVa1ur1tRqkbraDmMZKRbmAxCZ38XnLmXDQqcFSWUhNCgUNz1C4C3CMdPNi6pt` | +6 slots |
| 73-ladder | [5hBBpbaY…ZRcDxq](https://solscan.io/tx/5hBBpbaYMbn43TWCGrxY9d24SEu7unHPBL4wS5q2K65SAb62MKAbEiRCUKdJVf61cP2FkTjnDSukhm555pZRcDxq) | +5 slots | `2eUqpTBsafisRnNjYFNWR5axm1gFSZMo4qPJADq9rxDf3tLRxps617yJUr37eAfXUpBEm2qmLK4fLJR8waSKcCP2` | +6 slots |
| 75-ladder | [3nsXLd1E…ti6MNw](https://solscan.io/tx/3nsXLd1E8f68S3AsWW7bj3RtxHKTq2g5VAP2KGRH7NZSNsPgFNiPYYFpds2g74H5D7LLqTFmBGH34Afaiwti6MNw) | +5 slots | `2TtncnDMnHNuxMhkPY7q2L3BKaZ6E21sQXy3RdWT7gAPonYDvHWWyPgMPvLxzri57P7agWZcAsdfdkgSWR11eMNg` | +8 slots |
| 79-ladder | [89oEpcL8…H7DzM1](https://solscan.io/tx/89oEpcL8kz621BPjVZecKpPQuj6JyL4aGv4dmuxBwykJUHWiXBqJ2xHCV4oBEnbWJpeEYFxWoVGBB2gYLH7DzM1) | +4 slots | `2jYPnNhKHu9Zf8aDrbFXsJ3xxpjTH1sCwtjyyZ478po5ErzZDtgc6icS2L8BDJ64Lv5q5Q1fuLferYRdqSmDhQA8` | +4 slots |
| 91-ladder | [5DiBnH8y…WENuRB](https://solscan.io/tx/5DiBnH8yKhy8bZBoCWZAfUwdTEF3WGXAbJXQvEjE4JF5xbH86aUKHtQTCDX5uUugu9TJqdf613M4aa6YqHWENuRB) | +6 slots | `57rEqb5dgaoSzxpT4E6TREyxJrAKACQhMJcixLTGNbbzV2YznpmBpSZfvDS17YAHfZJ7LFrbZfWxkfDVfzGFjVPK` | +9 slots |
| 92-ladder | [4HNZjL5s…JxiHQM](https://solscan.io/tx/4HNZjL5sjus7jrp42pZA5WcEc5Ff8mGz9UevnetK8D3UefXoP57Q49TGmbgCuxBxPdLsW7oBmieWQEX6sRJxiHQM) | +5 slots | `4qArXGXJozHmqEXeFei46eN6CwYWwSLvrMMdmhYmjsLMLoedRG6CqEbcc6vyjKiUMF2k9nYaozUhxGPrPwLjiCYB` | +5 slots |

### One race won by each path

| Op | Winner | Winning transaction | Dropped versions (same nonce) |
|---|---|---|---|
| 1-race | Jito | [5sCjFRcx…pBud97](https://solscan.io/tx/5sCjFRcx1k96WUEtVNnGFtAoCeSfobopMdxanjo7fXF86D3XU3MqqHmky2SKJaYiqo3vAPSuJBkna8X6ohpBud97) | public RPC: `2NbjRRUNFQbcii2GzLS6n75fkVxTWPMoiBKmFw72pRsUo2CSTXSPZdesaMM2yoc6VfASqHHbNKh69Rc8ELY8yNFU`<br>Sender SWQOS-only: `5Qbo1SNvxfYWhoLVqpWpZBbJBKdAiegdzCapQhBRjgNKex9fA9vNsFHy8AWwN2k2rLwg6Mt5YM6zHJ4U7BMBT91y` |
| 0-race | public RPC | [3LHrwzbh…4nYQXs](https://solscan.io/tx/3LHrwzbhgxX7Hq8k9NK8gCcTgdn199UAGnEqrTw1XWTMb2VTsZyNMCkSLNiirvHFzHL7prmcUCMg3ybtgC4nYQXs) | Sender SWQOS-only: `475zYhzWkcEnj3mCWXHbtVXcxRUyF37PTpP6tB9ATCtWEDimiWL1MPSuupvgw16L7F2vvEBMb8jhahF6BG7RKvyH`<br>Jito: `3mbV9PbehKGBbBJfZqJQmmKgLXqY572KJdndMiuTgsW5cQDVB3aqaZm3TJaCF6qykAAQcmGAyT2wZxmEhFxtNJZB` |
| 3-race | Sender SWQOS-only | [49PMDyZX…Dx9qhB](https://solscan.io/tx/49PMDyZXwBk3NEahWSSjU5BUpZmMHFJ6VCSSe4s3aXPkQWAXGABbmkWvzWPEER6LNRscK6Hvbag19QbKeXDx9qhB) | public RPC: `3XhQ3NNXRepLzMo3FkLgTTsMVknD3oMEv7ySg87LnAzuEVmiwo7Z42e9SxGeGCthHDLd9rC73quzbtBQBTx3YnNX`<br>Jito: `36aUtYopTKdoMrjLuSP8RPBmsSMFbs6mEJc5HbcbiTY4SpT9R6KMpdumHJ9qwDrWmgANieh9Qg8ybBLGjXFaKxvg` |

### Nonce accounts

Six nonce accounts served every ladder and race operation. They were closed at the end and their rent was returned.

| Nonce account | Created | Closed (rent returned) | Operations that advanced it |
|---|---|---|---:|
| [2u7GYdSm…DQaxvH](https://solscan.io/account/2u7GYdSm3X35Q4JTriucJTShXYqYE2RW3tC2oWDQaxvH) | [5PPjW16t…79LEik](https://solscan.io/tx/5PPjW16tQgHmFBz5WH8tMC4AcJVLvLj3rNGqZiZbdZYGZ1WAE3g6s34M2wcrkEvJCRtb4Fy91v4CLsxxpy79LEik) | [zzTsgWoC…ceFBbJ](https://solscan.io/tx/zzTsgWoCD7bh2dMAqM4dQN73Vprp4RwrHJu7iC6edT4rwCPgjhDCZVjoMnSJRaWWpaBxsb2EyDSGza9TTceFBbJ) | 45 |
| [3yrxJCoQ…JocecV](https://solscan.io/account/3yrxJCoQfHWLHLGm8PwPE8NLdfT8yVJjnLxUenJocecV) | [wGkuMuc6…vGMyCw](https://solscan.io/tx/wGkuMuc62ZZXkZqqcxy6BzvAHhvGYmoUPvqMXyUS92qUBtroivknN1xo6s7Zrccn1gEk8uFhht1AGZuLxvGMyCw) | [UNj1y4if…NfRv4n](https://solscan.io/tx/UNj1y4ifMp9jfQAjcVG5xN4LZvLtzvCxXCpdAKzp732dWZdALgsvKxq2vwPpDA6rRT2e9fo9GEDt4diVbNfRv4n) | 41 |
| [4EAYiYbc…e489uH](https://solscan.io/account/4EAYiYbcKsDzY5MfnHwSmQLw2FKFTLeJSPJpfke489uH) | [yQfzhJ6u…Kaxks3](https://solscan.io/tx/yQfzhJ6uhNvwySiZpb1KnnZdy2UCMAY7XKj9yGf7oY74hq82cAcCChBTALytUHeuxzKjaiXq76eNnSCnrKaxks3) | [3QEf77Fc…MFoSc9](https://solscan.io/tx/3QEf77Fcj4cRxmPH7rcJrY9kiXY4F1SLTTxG2CmSmPUG7kAAXKK4dEXkFRHF62hY8cRwRssBHCY36xYkGPMFoSc9) | 40 |
| [5WCTjk8f…UA5KEu](https://solscan.io/account/5WCTjk8fhJFiqsxL3PRsSihmGyu2k9H2YLAxB6UA5KEu) | [YrX9R54w…YZEteQ](https://solscan.io/tx/YrX9R54wwUhkqNXnMzNcEjDDBKKj68RPf3Kuh2RWJ4dKseCPEYftn2jHJG8iXCg3JbuNURzfKLD7X1gp3YZEteQ) | [2Pf8yEQa…GcqykM](https://solscan.io/tx/2Pf8yEQa5k6dQft2LaeWLq5yrtcL9QAf7MgXvuAVGEqknLHUeBG9tee9e1ff1g29UbCV23P4nNH7wfQrcxGcqykM) | 37 |
| [EHYBohpY…Wm85eK](https://solscan.io/account/EHYBohpYoHZMoMUynFb9mvWc83YEZ7xnz7ERfGWm85eK) | [3K5jJsSR…dwcgfN](https://solscan.io/tx/3K5jJsSRbkxfNhhKBuJWRK4x3oesQzae73RaEbSvJTUxk1zo6NNXukSXzaafWXfp1LaThwVoGK3dMC9PfjdwcgfN) | [54qa8o2m…rxGjc9](https://solscan.io/tx/54qa8o2mCQzijPE8FjB9nDqyYrh7ZccRzDG6aozDAnbD1BJZanQwUPDC6QHtgPDQx1yMhyNfyV3ngkzszJrxGjc9) | 30 |
| [FMPxKkT7…unu6nf](https://solscan.io/account/FMPxKkT7Y8GTxsKm2qBZGopiv6nrWQ9WNookUxunu6nf) | [5VRMxVCx…fHEA8j](https://solscan.io/tx/5VRMxVCx8qsZyWL24UHvei2VfJhv6e4YzuEkcsMD6wNUGWWCJLFpXHWVa7iN8MVKRehbLsfHLvHGUR12AGfHEA8j) | [xyvf89eT…V6Zikx](https://solscan.io/tx/xyvf89eTNo94q6VY8wEYUeEEsZj2pGfNRBuxwXUPDwjUPxFNEydyytTSR7ZZPCVJ1frryMagPGYz2FLnyV6Zikx) | 11 |

### Verification

Checked against mainnet on 2026-11-09T14:33:27Z with `getSignatureStatuses` (history search on):

- **712 of 712** transactions recorded as landed are finalized on-chain, in the slot and with the result recorded here.
- **219 of 219** signatures recorded as never landed have no record on-chain. That's the point for the nonce families: look one up, and the explorer finds nothing.
- **12 of 12** setup and cleanup transactions (nonce accounts) are finalized.
- 113 nonce families had two or three versions in flight; the most that landed in any one of them was **1**.

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

### Full run (14:12–14:23 UTC, 700 operations)

<details>
<summary><code>rpc</code>: 100 operations, 100 transactions</summary>

Plain `sendTransaction` to the public mainnet RPC (`api.mainnet-beta.solana.com`). No tip; the RPC node rebroadcasts on its own.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-rpc | only version | public RPC | 0 | 467346794 | 3 | 15,001 | landed | [4xGeHisG…Xg7wuE](https://solscan.io/tx/4xGeHisGb7TeJFDxWYjcDTJcun8AYiQnwxMeXAjgGjZ9dmDHGHMDbpxYZYXziSD7dby4FZnPr26buFUvvdXg7wuE) |
| 1-rpc | only version | public RPC | 0 | 467346804 | 10 | 15,001 | landed | [3HjmDD2A…tdHMTs](https://solscan.io/tx/3HjmDD2AnjDXS6aSd4cmrHyKDdPxDrmSYAt9M6fWTG6uW6mF6aFq9ju1nnBZvM7zrQX76Jfyx15X5HfmcqtdHMTs) |
| 2-rpc | only version | public RPC | 0 | 467346835 | 3 | 15,001 | landed | [ihvZo7dV…2pR9NQ](https://solscan.io/tx/ihvZo7dVm7W1KS6Fcqg5hsFQJUWKk2pn9HDZq53fbYCScR4R5j2kJ5eukbxxCRymMNaoouJjaWRwae5V82pR9NQ) |
| 3-rpc | only version | public RPC | 0 | 467346840 | 3 | 15,001 | landed | [oDdBrfer…bJVf5K](https://solscan.io/tx/oDdBrfereMxsPJcWpNUcQcbEng6y49ije58Jmyk56DWuRpUubBr24217rfDKXSyjKB9oZdikrZrjNhpNjbJVf5K) |
| 4-rpc | only version | public RPC | 0 | 467346887 | 3 | 15,001 | landed | [6672AJuF…1iJsDG](https://solscan.io/tx/6672AJuFvvjzhJQ5nzZEkrZphtxXrbKBejMFVADeDzo26jBnwLvRRaKszoN7TfMkjWyysJvCeuY7tHc16b1iJsDG) |
| 5-rpc | only version | public RPC | 0 | 467346920 | 4 | 15,001 | landed | [3yRH9haU…jKR2D7](https://solscan.io/tx/3yRH9haUEcTTpG4BmPA8mhWb64osqUdoSvrLTiXhJiyWtFKBnz1sJbsuKdC4dV17BxvtFdLXXbmyqQV8cPjKR2D7) |
| 6-rpc | only version | public RPC | 0 | 467346928 | 3 | 15,001 | landed | [4qXqLLHn…Ya67GS](https://solscan.io/tx/4qXqLLHnq979uWByEr14i5aG3QXpDxFUQc37ZJxdaaSzTN5roD9YsYDfV6E6QkmCA4f9dP89qBjaQnAQvMYa67GS) |
| 7-rpc | only version | public RPC | 0 | 467346969 | 2 | 15,001 | landed | [4zdYkxKc…9EF7gX](https://solscan.io/tx/4zdYkxKcEGkuzo2xvnsZm1vx2HivG1VteoEiSRzapoGaEYvwT9KEkV6fFznrRbt5jvotWmteHgmSk98ryJ9EF7gX) |
| 8-rpc | only version | public RPC | 0 | 467347004 | 3 | 15,001 | landed | [zmtQB96v…Nx5Srx](https://solscan.io/tx/zmtQB96vJJRhD17AzW1t9KQ9pvEvVey1VJh8ucFNJMiMD7dxDhRckHB39GBnDHwctCqbWuySYks4xoGMZNx5Srx) |
| 9-rpc | only version | public RPC | 0 | 467347008 | 2 | 15,001 | landed | [yShLBD1C…rvg8M3](https://solscan.io/tx/yShLBD1CrBmpHiun6FQFeSh75EunP77mh1HC1c9SSvbnwqtpbbXRRfdGzCBtSKN4FhyPv7pWupyCSqsw3rvg8M3) |
| 10-rpc | only version | public RPC | 0 | 467347054 | 3 | 15,001 | landed | [3oqeTFz9…MjDsTW](https://solscan.io/tx/3oqeTFz93r6HQuJeFLXkjs1qkbvYHAsUyL9pEnK3sNJcyZUmf1WHHzU94M288QkCCqbFeck5bMy2r14dmZMjDsTW) |
| 11-rpc | only version | public RPC | 0 | 467347083 | 3 | 15,001 | landed | [2SXENcxd…Lrhzfx](https://solscan.io/tx/2SXENcxdJv6ZTc3HWXYjf6tojznJxLnPknDh35JWQbARgxcQuLGmaME4FV554rGyBb9Yzv5Zt1CxJnWuN7Lrhzfx) |
| 12-rpc | only version | public RPC | 0 | 467347110 | 3 | 15,001 | landed | [4AwVtVkY…L9V5Wn](https://solscan.io/tx/4AwVtVkYdxrdwEwKoboBmLZP1sdLd7uyAstZjo3YRFtime1QDZL1w2L9KVoUnH1j4Ct9xts8fyCEG6AfmyL9V5Wn) |
| 13-rpc | only version | public RPC | 0 | 467347119 | 2 | 15,001 | landed | [4mTycaW5…4eotBw](https://solscan.io/tx/4mTycaW5KnFsVSSiPX7DjjseCcPt2q3TaRsCKCeoTsA9EnYSfFFgxL8xKX9rK3t5qj3DHsRW8CcgFC72Dy4eotBw) |
| 14-rpc | only version | public RPC | 0 | 467347172 | 3 | 15,001 | landed | [uE5sVXde…sBHEfv](https://solscan.io/tx/uE5sVXdevEafZPYAbt3G1VARMyQDi5jNB38pcK8Y9ZqdxjDL3VyMU6Bm7ZjpDHArKhpVxJKQJVCThZW9msBHEfv) |
| 15-rpc | only version | public RPC | 0 | 467347186 | 3 | 15,001 | landed | [W5BMthMN…EkBzAU](https://solscan.io/tx/W5BMthMNq5svX6vtWaSZ6HoFW5F9UQVowETFxm8sxtV2utLrdbHWo3W4DowwQXAJob2hDxuxPvqkVU6A5EkBzAU) |
| 16-rpc | only version | public RPC | 0 | 467347237 | 3 | 15,001 | landed | [3nrSHTmn…NE1nY2](https://solscan.io/tx/3nrSHTmnaEzAwaViSTZ2bjKF88bTzVo4BfyqGXXY6YACZzva78Kdf7JQSLmk8WRcUzac8ZMUHddzBid9FYNE1nY2) |
| 17-rpc | only version | public RPC | 0 | 467347249 | 2 | 15,001 | landed | [XDJ4TdSG…n7Ba5t](https://solscan.io/tx/XDJ4TdSGJHf9XbCnMpkuBar2Agn5ikLXfxFa49RsYsJsuFahyMHCRYPAZehrSufDBeB2eEB94oe7FEm8Un7Ba5t) |
| 18-rpc | only version | public RPC | 0 | 467347291 | 4 | 15,001 | landed | [2JbtLmcW…GsCua2](https://solscan.io/tx/2JbtLmcWbtPkm8UPkcRQGkow6MrKYiKAUDir6ckJLbw6mBWKLU9DRcEqexugu3kM4M97oGfWk4vWA9rKuDGsCua2) |
| 19-rpc | only version | public RPC | 0 | 467347296 | 3 | 15,001 | landed | [53QZxGy8…67PrE2](https://solscan.io/tx/53QZxGy8cLp2xRsNfLaJgLmT7QHHDL8d7W8hjmk2cUnSPMeUpRZDSMNBbD2Mwh4gFUsuuP1LMfHgTtfssz67PrE2) |
| 20-rpc | only version | public RPC | 0 | 467347320 | 3 | 15,001 | landed | [4RzA9Wtu…ikRQVd](https://solscan.io/tx/4RzA9WturkHq5DYnjaHUmm3qGqB6yJxrDSmoGvJRgCGcEbY41iA28GSrAG3LNCw4X8AvhsorQnz59RMjyaikRQVd) |
| 21-rpc | only version | public RPC | 0 | 467347347 | 4 | 15,001 | landed | [4mCATsFw…sfNc5J](https://solscan.io/tx/4mCATsFwreMvbizwDYDG8MCmm3wu75rrXFtt5QvtixFM1NnvrcUXodVudwkoRCfTGS49YTTfcR5ZN6k2dvsfNc5J) |
| 22-rpc | only version | public RPC | 0 | 467347398 | 2 | 15,001 | landed | [Mz4Vf2xh…8KidmH](https://solscan.io/tx/Mz4Vf2xhXCZgqYKx5ZVNLgAvPjZdGLKJYrJZ5Ldjv4cHWkFV7bCxGQGpTS4Qhn2E735TXxaKYdprZ4D6b8KidmH) |
| 23-rpc | only version | public RPC | 0 | 467347409 | 3 | 15,001 | landed | [5rPAsmej…vEaABh](https://solscan.io/tx/5rPAsmejaD98ZJuJDAHPjp7smSDNGUQhnFBYJasLhVwkYpKnoyFWyBxECY3esxwqohg8YVyuwRMSMTym7vvEaABh) |
| 24-rpc | only version | public RPC | 0 | 467347447 | 3 | 15,001 | landed | [51H8n8Ep…uLwdg5](https://solscan.io/tx/51H8n8EpxYLhKpSKWueFLxsL9X6uSWdX31JyGYB1bCbY4w3NKksn1v9wB56jdzBq8pvZpWtT4DPnjiacmhuLwdg5) |
| 25-rpc | only version | public RPC | 0 | 467347464 | 3 | 15,001 | landed | [6YnYMSZb…SEBp1h](https://solscan.io/tx/6YnYMSZbJQMKDjdZPQipEAHi97HxeEeof21tUHBAxtegbzqCLoLk12HJXuyHfafrcRkgtK852Ys3XePYcSEBp1h) |
| 26-rpc | only version | public RPC | 0 | 467347513 | 3 | 15,001 | landed | [Z5nN7J78…uuwBHE](https://solscan.io/tx/Z5nN7J78p4R1MiorTbz2peHDQsmgqaDGghWNzQTF5YVgBSPrDMWv7z443KVJFHQ8nYBkxy6KMKuTcFnCruuwBHE) |
| 27-rpc | only version | public RPC | 0 | – | – | 0 | refused by the provider (HTTP 429), not forwarded | `4MtPrj87nErmJqGksmeDii1f721HJXazyWeUmQM63it5h7Kdhraco6AUsQj4QaKpC7JQiKTjBnCFvynZiskLDeke` |
| 28-rpc | only version | public RPC | 0 | 467347557 | 4 | 15,001 | landed | [5gMNGfEo…D6UZRB](https://solscan.io/tx/5gMNGfEo1kSxWsRwkvfC679kBvSzDnv9wjM4SmosMHTABCZrJRVXZwnms22gfxfmsEyfXkWZ5ATuTTmtEBD6UZRB) |
| 29-rpc | only version | public RPC | 0 | 467347617 | 3 | 15,001 | landed | [4c98vo2z…TNW3e6](https://solscan.io/tx/4c98vo2zuD5mD7SxUPnucXTUyVdNZGkeiADEPrznpvnHDGzFyJa9Qh5MicS1saiXgP3SN4Rw4PYBEBmS7aTNW3e6) |
| 30-rpc | only version | public RPC | 0 | 467347644 | 4 | 15,001 | landed | [1aWqHgih…gu3Dnt](https://solscan.io/tx/1aWqHgihAdYXqkAUKSwrgRrhKPNFKYWFh9ZkEF3VGnUgKMZSvP8opQagddvDpWesxG7ZRT6ChR2FZBNV1gu3Dnt) |
| 31-rpc | only version | public RPC | 0 | 467347671 | 3 | 15,001 | landed | [55tUMz37…vdJ6fx](https://solscan.io/tx/55tUMz37MQzBZpdaPxxJFxhiyuFshpgJifaG4mVoY8U7kqe83We3P3eqnDaNcWWDKYYTdSSKqAXxfpQnaZvdJ6fx) |
| 32-rpc | only version | public RPC | 0 | 467347698 | 3 | 15,001 | landed | [4i7C5emX…fp3k38](https://solscan.io/tx/4i7C5emX5A1uFr9BcobvegLNyMqaU7XDK5aCeTH4BezMPR66y7ujonj3snuEVErJKjJoLPC8Nd6n2F42Ydfp3k38) |
| 33-rpc | only version | public RPC | 0 | 467347705 | 4 | 15,001 | landed | [4U32qvHu…XtosEm](https://solscan.io/tx/4U32qvHuvoDXk66tAZr69G5YwRa1iU73fLgHuz2fVZK4aWDJtKiPkUQqdgUmnHsLwwNxUYsVW8AZAfSkmQXtosEm) |
| 34-rpc | only version | public RPC | 0 | 467347735 | 2 | 15,001 | landed | [3kkP3NmF…5AzxNS](https://solscan.io/tx/3kkP3NmFpruhhLPr8o5Y67iM14ffE15LFY6U56ES6zzcNAYdBgLyvyQhEADvpQFvW52z8NSy6TBTTA72D75AzxNS) |
| 35-rpc | only version | public RPC | 0 | 467347753 | 3 | 15,001 | landed | [3X5fBR4T…iKfU6b](https://solscan.io/tx/3X5fBR4T9N68RqKgYf1CkPj3hVyohSrGWtcip1uYu1kif14TxPG1ZiKtfffoqwsQ1H1ZHTGh1bdZbkLDL4iKfU6b) |
| 36-rpc | only version | public RPC | 0 | 467347783 | 3 | 15,001 | landed | [3PHYg8Ws…Kt1kjF](https://solscan.io/tx/3PHYg8Ws68F7jWTdiBpYjhnS1Mpvcz96qabAt5gv32y43Ywu278AosKF4WuVF9UncqhMZEsABYJXVqwfTMKt1kjF) |
| 37-rpc | only version | public RPC | 0 | 467347816 | 3 | 15,001 | landed | [2w8ZEGH8…3DrAH1](https://solscan.io/tx/2w8ZEGH8M3aRd7VUpG9iGnibqyM37TKxWoCdKtWwVnFpT7dmpDqbE12U4hgMuP6FBfV5QGvcjJjH2yDfof3DrAH1) |
| 38-rpc | only version | public RPC | 0 | 467347847 | 3 | 15,001 | landed | [5JbJxBNa…yfQzhy](https://solscan.io/tx/5JbJxBNaazgwDFoyZg8tqkEmMbZ5FC69AXbqadYRcidBN3fqT3dGBM6cbMmoEQRYuiWtChsX7523daPSsYyfQzhy) |
| 39-rpc | only version | public RPC | 0 | 467347891 | 3 | 15,001 | landed | [5JMQke26…vC9hV1](https://solscan.io/tx/5JMQke26RYZJ2WkD9kk2najuxYcMmY84X2g5PSu9c51vjx9TWdnFoK5eoQWRbi5in26FRsAZkUGC3knvsVvC9hV1) |
| 40-rpc | only version | public RPC | 0 | 467347925 | 2 | 15,001 | landed | [5xnTH6GX…7XVnQ4](https://solscan.io/tx/5xnTH6GXnRW9pJd4C2apqhK8AL6Ecf3qxPb1MWYt1L2rQunVgarAqMg5Crg8u7MLw6y369mzD1D84dZGQu7XVnQ4) |
| 41-rpc | only version | public RPC | 0 | 467347933 | 5 | 15,001 | landed | [3471oKD4…LnMXQ9](https://solscan.io/tx/3471oKD4MbAmfSRrzkwP8b5K7ov5msQaPNozkV4ESf3F5VRXjsdwzjFW7vnfRkcHPbDrH1mDz8s42rVTuCLnMXQ9) |
| 42-rpc | only version | public RPC | 0 | 467347969 | 3 | 15,001 | landed | [22Tc6cMs…6JB6pk](https://solscan.io/tx/22Tc6cMsnrjqsWitmFEnNweRZnJenc8Z7k6sVJ51RBDmpcuMBCxxiAkW1KRVvotoNZDF59Hy99jw7rLYqC6JB6pk) |
| 43-rpc | only version | public RPC | 0 | 467348012 | 3 | 15,001 | landed | [5vnEsiYF…vfa8VD](https://solscan.io/tx/5vnEsiYFoyUynGPv1ohpCZna2X7te5pesDbXLoUvbHqqpgTB5mc9FC6UntobQdhwXN1rP34VbwK8A57wE7vfa8VD) |
| 44-rpc | only version | public RPC | 0 | 467348019 | 3 | 15,001 | landed | [3faaX1US…8QKkTw](https://solscan.io/tx/3faaX1USnncNHZUBBiHpyqNLKmiNLUFpws7ARzuMZ4j9xZg6ANKDWdZtTg1HHyY4nhWUzzGxUVtq7gzjxt8QKkTw) |
| 45-rpc | only version | public RPC | 0 | 467348044 | 4 | 15,001 | landed | [3rWkFz52…gBZTtM](https://solscan.io/tx/3rWkFz521Pgh9Ccovu7mY4JXjB3W45H9JYcRxbjyEGqsjahrWb7KyyXCqCw3isAh5MjzHwYwdtQAR1YQeSgBZTtM) |
| 46-rpc | only version | public RPC | 0 | 467348091 | 4 | 15,001 | landed | [5LxqcoS2…6Xw9re](https://solscan.io/tx/5LxqcoS2kNoimiZuBJ2CXCbB6edTC7yX9QmtSdyriggZPDmjGqdvU6zxRYC5hVdYMMvAesa8XUh5dR1D3J6Xw9re) |
| 47-rpc | only version | public RPC | 0 | 467348129 | 2 | 15,001 | landed | [3SAX5Eud…92vAqC](https://solscan.io/tx/3SAX5EudVaCyfWLav4KsYCtFHMge9uebeaLzmfTEgpdA3upCF6HdaLfDA64kJPvsqPu1VGtgK7QHo4UTah92vAqC) |
| 48-rpc | only version | public RPC | 0 | 467348162 | 3 | 15,001 | landed | [tg9fRPuh…bBabWk](https://solscan.io/tx/tg9fRPuh5S76qRQ4SsEpb5VwS89TjrsWTReRHigh7CRv8FenG8XnDXrwupw2AWzrmk3se31TjARLEqaZfbBabWk) |
| 49-rpc | only version | public RPC | 0 | 467348183 | 2 | 15,001 | landed | [34jyDFM9…JQwMSM](https://solscan.io/tx/34jyDFM91HPX3x9myd8xEfNZJZXBzmBAXCYP9StDcxTxTJwiN3MSaN5dJCq1ik1GW8KBFfbenEBoqGaaYTJQwMSM) |
| 50-rpc | only version | public RPC | 0 | 467348206 | 3 | 15,001 | landed | [4SzkHSNu…qStXGa](https://solscan.io/tx/4SzkHSNuWoydJuYqicNeYyJkNSWZ8u63RhQriMpJhyM8buqGF1QKSS65b7YneByKWDEvWD7amvNCFJoL9QqStXGa) |
| 51-rpc | only version | public RPC | 0 | 467348230 | 2 | 15,001 | landed | [5aDX2eeF…9EgN7C](https://solscan.io/tx/5aDX2eeFGU9uJXDU5CKa6P1x1wHd6Z3e3UDxXvZYqsQtjT5zK5ffq5cpZYwJ4WhAa2JvpEq99EMhn2VaXQ9EgN7C) |
| 52-rpc | only version | public RPC | 0 | 467348240 | 2 | 15,001 | landed | [2ZBhxKkt…KhJc6P](https://solscan.io/tx/2ZBhxKktTTUeKi4Avd8nz5Mku4weg5N89JEBDFmukFcP1LWx1tKDaALoWbu8Gscag1gdRm2TDMorfFKjY1KhJc6P) |
| 53-rpc | only version | public RPC | 0 | 467348282 | 3 | 15,001 | landed | [4bRcDmUw…x7GV6b](https://solscan.io/tx/4bRcDmUw47p5LKKz3xcrL3YiF7Lf73Ent32vCcDUpa2GKeM3oAQGGxy2pRW5tRt2ntVhqJannuqwKfm6irx7GV6b) |
| 54-rpc | only version | public RPC | 0 | 467348332 | 4 | 15,001 | landed | [67JXJuHK…W6obp2](https://solscan.io/tx/67JXJuHKZLiHcrPmKXLSnSH9xxC9YAerJpFmnAPKGbpoWqC643UqcQtnGCTmkiSuyK1MUuTHH4DgTgcb5RW6obp2) |
| 55-rpc | only version | public RPC | 0 | 467348350 | 3 | 15,001 | landed | [3yHfKG87…tzJkT2](https://solscan.io/tx/3yHfKG87amTj96yQ1gacAXeMtehieXfUn3U1VnZHLrKraRkjTpbTcgVDtrmBDXLmsr9YEpTToLbYueJwastzJkT2) |
| 56-rpc | only version | public RPC | 0 | 467348373 | 3 | 15,001 | landed | [nZUtbQpV…JY6Skt](https://solscan.io/tx/nZUtbQpVKnp9Gt7MVRuKjUBbtMF1hBrYb8ABKdnmww2LzrRHwoGyKK3sk1cVcsf2wiv6ExeN9bWEDkRcCJY6Skt) |
| 57-rpc | only version | public RPC | 0 | 467348396 | 2 | 15,001 | landed | [2kNqrhH2…4ZJghy](https://solscan.io/tx/2kNqrhH2g4ox2txXmmvosb83yJsuGLTkJ3ivkVUacijMSEtfdkfyqiLrpx8vnNiYQfuEWLfYjmFer53yHL4ZJghy) |
| 58-rpc | only version | public RPC | 0 | 467348420 | 3 | 15,001 | landed | [RR87xDTZ…72aXBG](https://solscan.io/tx/RR87xDTZQfcpunHSNswQoNuQewzXpQ3Fw4D1XdSCRNpeQTJ2wmhofqio25w97hnAxZXXCwbeUWTFUGrvV72aXBG) |
| 59-rpc | only version | public RPC | 0 | 467348447 | 4 | 15,001 | landed | [hyGvKiMg…sFP69m](https://solscan.io/tx/hyGvKiMgRfSkUAzNma7k5hybDoag3mcY5dcJPAW5Dc2doa5WXiVEJkFhTUwtprFC9UA45Y8uHnUD1HsT8sFP69m) |
| 60-rpc | only version | public RPC | 0 | 467348475 | 3 | 15,001 | landed | [49R1sqaa…BFGc4r](https://solscan.io/tx/49R1sqaaXx5q5kjSFFvQQ7WKcA3fupCX7ri5NZ2KTrSS2Ydw2MevjjmYm2uGaMCSaB9EAESRhY7bxTzMbkBFGc4r) |
| 61-rpc | only version | public RPC | 0 | 467348519 | 2 | 15,001 | landed | [5u5Z4dBu…Ua7227](https://solscan.io/tx/5u5Z4dBuqkp1xoWE5PP5sUZnyoubGTLCBNmT2gTu2t7EQsBVsbQ9V7LDZrQPQFkvvBB6BnryCdQ4XQfK4Ua7227) |
| 62-rpc | only version | public RPC | 0 | 467348554 | 7 | 15,001 | landed | [5oiBgKAV…woLB7i](https://solscan.io/tx/5oiBgKAVtMGf2mV7x4QLwSaYCYamJGrBkD37VomAYBwwqVw675qYaELkTV5aBE4y7p118Ex1CG5o3aTyoowoLB7i) |
| 63-rpc | only version | public RPC | 0 | 467348590 | 2 | 15,001 | landed | [bgJidtXY…4ZJjwZ](https://solscan.io/tx/bgJidtXYCHzn7F9bJFvYhY3ztLU1uUcYWv9ALN6uFyEicZNQz56Un7XFN7fUjsdnrPQHbg1YQRXmhpYm64ZJjwZ) |
| 64-rpc | only version | public RPC | 0 | 467348608 | 3 | 15,001 | landed | [HWmhxxWQ…4P6gSU](https://solscan.io/tx/HWmhxxWQM36agU7JMDatXLNuNjvDt6HCpDZTXSZ7HqNjxHcYJUtLw4CwoFyr3VFgmeuwZCUMg9Szm5ZRU4P6gSU) |
| 65-rpc | only version | public RPC | 0 | 467348614 | 3 | 15,001 | landed | [5fFtfPf4…6smHuZ](https://solscan.io/tx/5fFtfPf43Wq4wxuMEShnNDMQFGpvr8KA4Hw6Sxy8HPQiR3dPJKhsiSemw1vPA9aisgC5SCSQtCvEGuXeFG6smHuZ) |
| 66-rpc | only version | public RPC | 0 | 467348672 | 3 | 15,001 | landed | [4WuPeYpw…Zomm7y](https://solscan.io/tx/4WuPeYpwhRLrcmDbLAXNMVS64DJU4oFLuN2VVx9aqapSCh3YU1XjU7H5aaK4LB2rDwVTDt9uavjJubFXHfZomm7y) |
| 67-rpc | only version | public RPC | 0 | 467348705 | 2 | 15,001 | landed | [2jKjzw7V…EQkcBQ](https://solscan.io/tx/2jKjzw7VCLq4j5AeDuxncV3ekW111V5rXZumH5q2Aff4bnoXmabk1nqBAmwSk19rKNpyV12Kvh6j841rmEQkcBQ) |
| 68-rpc | only version | public RPC | 0 | 467348732 | 3 | 15,001 | landed | [2f5HVVkY…gcR7iL](https://solscan.io/tx/2f5HVVkYZYwwSuWskpHxsvWUQmqQgr1YxLEEWV1vXfvRPVcv8aHERskaVEdQr5hyFR5qHvTfBpo2vJXYuogcR7iL) |
| 69-rpc | only version | public RPC | 0 | 467348739 | 2 | 15,001 | landed | [3h6dvW4Y…wECqWq](https://solscan.io/tx/3h6dvW4YwMn48dzvDxnjs4yRgzrB4WkVkrjGNVqtBpMgS4WUvfjafewSQ1GVgAB8R38CU23RMzmksFp6YcwECqWq) |
| 70-rpc | only version | public RPC | 0 | 467348762 | 2 | 15,001 | landed | [3eQzCDD6…gLkCx3](https://solscan.io/tx/3eQzCDD6AeJJuLeoFzNPk6jfVofji8wfgtauqqy8GP5VDb5BN3JyZheuQ4cJgmhEmze5RjffEBXvg8gsC2gLkCx3) |
| 71-rpc | only version | public RPC | 0 | 467348811 | 3 | 15,001 | landed | [5fYEYWcg…MBTq7y](https://solscan.io/tx/5fYEYWcgqhvXuU74iq1hF6PudHZx2bZdAxh6GVLonAWDNfFESbszg8SFrVpPv1bGirczqFoSYAp8JcMNvqMBTq7y) |
| 72-rpc | only version | public RPC | 0 | 467348824 | 2 | 15,001 | landed | [2MBheF4T…21EMBG](https://solscan.io/tx/2MBheF4TPmiYRCdMo4bNjC2PRUXJ4iiernh2qE22tdT2Q9aP2amBy7mQLSWExv8Juc82AYUG5LkkwefMZe21EMBG) |
| 73-rpc | only version | public RPC | 0 | 467348870 | 2 | 15,001 | landed | [3zfM36XZ…sFUfew](https://solscan.io/tx/3zfM36XZfFxpLB3c4zx3cagqEU9zh4jugKBSg6UvriCAzKGLKyoA9PEVJFBgJGpgfy5dHJk1La7SsNYJzWsFUfew) |
| 74-rpc | only version | public RPC | 0 | 467348892 | 3 | 15,001 | landed | [mkQw35BD…dxaR6p](https://solscan.io/tx/mkQw35BDhw8ouSNVobgd1e2BWzWYMu8cS3wVPv29EGc3BLShxMWzQMoocxHbj3KyzQWBFgLrYY4sf2NnQdxaR6p) |
| 75-rpc | only version | public RPC | 0 | 467348926 | 4 | 15,001 | landed | [2ZAHfb4Y…DkquaE](https://solscan.io/tx/2ZAHfb4YepdurhWzFXPGCJEwJuRNkasCRNcGde9muxNhdJ4cQZogUHt8NJuQr9NjSdgZ6MG5kdLZGw2pH3DkquaE) |
| 76-rpc | only version | public RPC | 0 | 467348945 | 3 | 15,001 | landed | [XtYSn8eY…iZJXQJ](https://solscan.io/tx/XtYSn8eY9JaHCZ6EdrbKMG2hq6z76X35JUvWX8VeBmJTpjaQHMgH5pzSAvMLbHfYVYX5ktd3nhQ7XVAPiiZJXQJ) |
| 77-rpc | only version | public RPC | 0 | 467348960 | 4 | 15,001 | landed | [46zG7jwz…LLT7RV](https://solscan.io/tx/46zG7jwzwfK84jmfsbZEqvjqG3U7ZZQbw2zHdi5xLeggX4kezJ3x6vW4bh4q5DpKfdLDF3oge68NFmRUaVLLT7RV) |
| 78-rpc | only version | public RPC | 0 | 467348989 | 2 | 15,001 | landed | [5sn9KNMx…GL4q5V](https://solscan.io/tx/5sn9KNMxNpXmgqV3sRoxC93cUYEDSRjU9w6QRGmNBKfTWfxjazk21mumztExr2i3fB6k3RcnZG6dFtpT2gGL4q5V) |
| 79-rpc | only version | public RPC | 0 | 467349017 | 2 | 15,001 | landed | [3Qihc9VR…EqLBDD](https://solscan.io/tx/3Qihc9VR4w69q5jGMMVKTrQxdVnHDGvwiUjCyx1n2pfRusWyWenkPMxsVQrk5R64EPKFCLFsQyWoJ6T44JEqLBDD) |
| 80-rpc | only version | public RPC | 0 | 467349061 | 3 | 15,001 | landed | [4AaabuGg…JB9Kfd](https://solscan.io/tx/4AaabuGgbDjSnLd9ZgQTmFst234hpB3rMCtPeMJqYiFxzN49WX3sRKvzFzjH3yMqWhsfEhv1yK8WEcz5kYJB9Kfd) |
| 81-rpc | only version | public RPC | 0 | 467349101 | 3 | 15,001 | landed | [66PT93Do…9Y2bpA](https://solscan.io/tx/66PT93DoMcggeoZ57fa8obgpJDfaHVKUNW3BUKvtiWbQP1duVwV6PFGKrvkF5QhqXNJ4su6DA4Muy4ZwoP9Y2bpA) |
| 82-rpc | only version | public RPC | 0 | 467349130 | 4 | 15,001 | landed | [J2as2uzH…4YVQzu](https://solscan.io/tx/J2as2uzHtfnCphRJPx26AbiHyw7gBGz1DesMmYQJPLuTeozbvznvAxrExwhGSQRzzWmwzPNQnPhC9pqN94YVQzu) |
| 83-rpc | only version | public RPC | 0 | 467349161 | 3 | 15,001 | landed | [3mNawCNR…P683cp](https://solscan.io/tx/3mNawCNRoKDLMNs6m7VksWs9kWW9JrMA5HsPV28qFWp9HUmpwUo2HdjNPZiTjKfKp2mJh5tUA4VrCX3CPsP683cp) |
| 84-rpc | only version | public RPC | 0 | 467349162 | 2 | 15,001 | landed | [58EGnCwx…QTadUk](https://solscan.io/tx/58EGnCwxWVaZxEesQaN4gfzUWJehXYN2acwzu8hQd2FWJd8ZHNQRUUkVJtBgHZnswPDH7ixFrMkMhfafywQTadUk) |
| 85-rpc | only version | public RPC | 0 | 467349212 | 9 | 15,001 | landed | [5K1mhGuS…joiAJb](https://solscan.io/tx/5K1mhGuSja2rGinQYYGGgU1dPHB8WN3MMeE3oZn1wdgKvqb3yWqvjiompTjSMBZFmCLxUGojQ1dHAvJcfnjoiAJb) |
| 86-rpc | only version | public RPC | 0 | 467349216 | 2 | 15,001 | landed | [67JK7cfV…SDsUDR](https://solscan.io/tx/67JK7cfVyunP3T4X3Z7wbqDP2nRyMwpd8YvWethdZBfAxxzXr6pYyWYZ3hhdy37JWFKJKKUEfG39VSaTqSSDsUDR) |
| 87-rpc | only version | public RPC | 0 | 467349240 | 2 | 15,001 | landed | [BFLjFjXS…PuZdSH](https://solscan.io/tx/BFLjFjXSjxSKrRJKRH5H2SVR9FuZftoxUQgFp5koJE7jzw4UgKQTzU5xAFj9fh6UibKjRvgxeUSye7NApPuZdSH) |
| 88-rpc | only version | public RPC | 0 | 467349288 | 3 | 15,001 | landed | [3Agi3Y4L…Cr2T7n](https://solscan.io/tx/3Agi3Y4LV1ggWc1QJBfTtQJMipsBBBcnpjLG6QC8Ja9mGjBGP7bSSrfuQHwCHHcC9cu6252VpjQT36eExACr2T7n) |
| 89-rpc | only version | public RPC | 0 | 467349312 | 2 | 15,001 | landed | [p9w76F14…cMkFfa](https://solscan.io/tx/p9w76F14nEVxzRecNHdzqc2K6mpoTSeQBYbjKSRzWFaQyuQG7kZx8fkTj6yA9BFNraYLwbrk9VaQNRv6HcMkFfa) |
| 90-rpc | only version | public RPC | 0 | 467349316 | 3 | 15,001 | landed | [2pYwEgE7…gsvhLB](https://solscan.io/tx/2pYwEgE7dYrFAaM8HQXDsSFiENUKRJwvvjwLTXsaFHQfXRqqq6ZzS8uKZ6zzG6orDDgueWEF31CVp7dSREgsvhLB) |
| 91-rpc | only version | public RPC | 0 | 467349349 | 2 | 15,001 | landed | [3hkrSPJu…6TbZPz](https://solscan.io/tx/3hkrSPJuGHHpkHPE46JiTNbpht2FSpyTZDCHB4zzcRotWKQnNW3Dv3YCRVThCntdo9dKPqEfCC5ohu6xEG6TbZPz) |
| 92-rpc | only version | public RPC | 0 | 467349391 | 2 | 15,001 | landed | [2Td956iL…SkPiu1](https://solscan.io/tx/2Td956iLsHvnFAjK4xXBgxBo9mo5B7mX8x2Lc6JJW58pmHWSyGWL6MrWU89C2rMnksbVamjvroENN9kbgASkPiu1) |
| 93-rpc | only version | public RPC | 0 | 467349426 | 3 | 15,001 | landed | [2EDoPFmh…mBvhoT](https://solscan.io/tx/2EDoPFmhQ7T3zgFnum8n1XyRvdErUssqdeWeozikyp5g1tV8oXWfSKVTVdY3S5LeSw43r18WkdEetvv7hFmBvhoT) |
| 94-rpc | only version | public RPC | 0 | 467349432 | 3 | 15,001 | landed | [37LdEwMi…zZvVTA](https://solscan.io/tx/37LdEwMiupzQC7c7c6b9z81vpzDWeQPYciubAcK51BkjWpfErCBKMhK5e3AGzqfgTnLKbezLYERjG3zpNUzZvVTA) |
| 95-rpc | only version | public RPC | 0 | 467349467 | 3 | 15,001 | landed | [24kR9CUi…7HxxXb](https://solscan.io/tx/24kR9CUi5SLSh4YnqMjnborq4ac2ucZxy1AjzCJriUuPjLpsYtA9U7hXpUq5G6cY1oAjUsYSyzWv7E9iZ97HxxXb) |
| 96-rpc | only version | public RPC | 0 | 467349493 | 2 | 15,001 | landed | [4jhBpzqg…2F81as](https://solscan.io/tx/4jhBpzqgynUcLv4CUq6mhch9CAKPYkU2xm2Kdd2NJh891RqynvA7HUn2Wxv2vzfdkhy5UyaLek5ZoH1mRg2F81as) |
| 97-rpc | only version | public RPC | 0 | 467349532 | 3 | 15,001 | landed | [23mUepVc…E3sAVW](https://solscan.io/tx/23mUepVc98XXNjbnLf8y59eWMeLxgfRPGx2EGaTWdK76beFT1NDBMiVjJTJSoLRD4RpVJ97aN1jddv25BnE3sAVW) |
| 98-rpc | only version | public RPC | 0 | 467349555 | 4 | 15,001 | landed | [BtHuHFX9…faiHi4](https://solscan.io/tx/BtHuHFX9i818SPRGFGY8cLbKV3CHKRvHoAcdu6M23PLJUNkwaygWmjLjwsJbizj5yrZh66vAFmxkaTn64faiHi4) |
| 99-rpc | only version | public RPC | 0 | 467349596 | 2 | 15,001 | landed | [2c89UD6e…3jZjC8](https://solscan.io/tx/2c89UD6euxxc71C8RLRfhyAB4uTh4JqeTabxoMzFGvdgiNChZZJQEpAHrVxy4fUzyz61sW9bSYqrLH4mNa3jZjC8) |

</details>

<details>
<summary><code>swqos</code>: 100 operations, 100 transactions</summary>

Helius Sender with `?swqos_only=true`: a single stake-weighted (SWQOS) path. Tip 5,000 lamports (0.000005 SOL), the tier's minimum.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-swqos | only version | Sender SWQOS-only | 5,000 | 467346815 | 2 | 20,001 | landed | [58Y2dMg9…5rLPtT](https://solscan.io/tx/58Y2dMg95DS1m4UdxFAYyjAuLW7bc6KYuJymiUrgAQ255yzzWvaPcedUTtLAtqMTo1EXr14CZTcoBKG5sY5rLPtT) |
| 1-swqos | only version | Sender SWQOS-only | 5,000 | 467346841 | 2 | 20,001 | landed | [sRGLHq7n…7tKRq9](https://solscan.io/tx/sRGLHq7nYcH318k5vqRhqEgVNxNbvpBFXQZd8DuDPQTwR5cQooKWK62z6CsuTm96e1k84n8vtXrAURbjd7tKRq9) |
| 2-swqos | only version | Sender SWQOS-only | 5,000 | 467346862 | 3 | 20,001 | landed | [5aGzhw3i…HYNvsB](https://solscan.io/tx/5aGzhw3idNEQNRzMXgXXVNpSgexhDtjYWmt4cmtLb2KLv1w8wCHjqcTLhoRRzT7UaAQ3DNqhNyyNWdyJZdHYNvsB) |
| 3-swqos | only version | Sender SWQOS-only | 5,000 | 467346878 | 2 | 20,001 | landed | [43dSM5vk…dMXK2H](https://solscan.io/tx/43dSM5vkHUygxhmXBh85DvYa2554UJVmhKj8TuTYGPS6t6V5u9TVu72v4kKGfTdP5N1XstxmBMa5SwpsKCdMXK2H) |
| 4-swqos | only version | Sender SWQOS-only | 5,000 | 467346911 | 11 | 20,001 | landed | [4wmDniqF…LQBd3i](https://solscan.io/tx/4wmDniqFRKYexgWB6Y9VNegTtXBAmBBUta32q8Kr4AYr66zDMe3WSVSXogfZsNGZdyWxdbLhpTZ9ZG7DeRLQBd3i) |
| 5-swqos | only version | Sender SWQOS-only | 5,000 | 467346944 | 2 | 20,001 | landed | [2ehnWo2p…KcuX4F](https://solscan.io/tx/2ehnWo2p4ZjLDCsKB1LDBtXQ3NFj7M9JmgtSuQj9YrYS42tEJ1uWnv5Vomp583xFgnAje8ovTWRzxZQMVjKcuX4F) |
| 6-swqos | only version | Sender SWQOS-only | 5,000 | 467346975 | 5 | 20,001 | landed | [3PZTKwsB…b1mB18](https://solscan.io/tx/3PZTKwsBFBWqDYint7Gj4QZMgVVDczdUHsbh9jSm4TRayGoMEDryZ2DHShbTwQCfi8LHzHee4ghrPTik9b1mB18) |
| 7-swqos | only version | Sender SWQOS-only | 5,000 | 467347006 | 3 | 20,001 | landed | [45CV3Fo7…4fywxv](https://solscan.io/tx/45CV3Fo7t8DJARjstdEECBxBfnmv64sHKZX1XbEEGKWeLB7vRWEqDjUdUeRbkz3d9TBEMeDbgUQWsAS2Zk4fywxv) |
| 8-swqos | only version | Sender SWQOS-only | 5,000 | 467347042 | 2 | 20,001 | landed | [JjTnvjpv…Czaukg](https://solscan.io/tx/JjTnvjpvPxSLVZZpbcEBZX1Z1Ayt6dMopcHE7dWSykAC28FJuWXcRAYxueyGeeSZfRmZN1PBSFJsvoyHACzaukg) |
| 9-swqos | only version | Sender SWQOS-only | 5,000 | 467347063 | 4 | 20,001 | landed | [5R4ptHAH…ofgYPu](https://solscan.io/tx/5R4ptHAHsLK39LoUp6J4djQv2wvUwwLpW9Xc8oVnqDkgAxKynvs4c4Fi518M8RTcrdMjx6xwD9x1At3K8xofgYPu) |
| 10-swqos | only version | Sender SWQOS-only | 5,000 | 467347095 | 2 | 20,001 | landed | [3TLdpAtF…MenZAh](https://solscan.io/tx/3TLdpAtFa7fLE2HvYNBvp8VaKF8CAkg5b7Cywpqi9fej1EBvoLSkGiNeP2z3Jiy5QHckrqDyAGj1iwFoMBMenZAh) |
| 11-swqos | only version | Sender SWQOS-only | 5,000 | 467347116 | 3 | 20,001 | landed | [3hcDPzba…6Xgrt2](https://solscan.io/tx/3hcDPzbaYjiLLJHz5BKDPM8f3gDfnH4pNW3tDnENKfQWoNp3jHM3QBMrAwrTPe6G8AVEB7ugf86nrL45P36Xgrt2) |
| 12-swqos | only version | Sender SWQOS-only | 5,000 | 467347158 | 2 | 20,001 | landed | [gZ4bgjFr…6y4zgH](https://solscan.io/tx/gZ4bgjFrDsoibRjfvpSbdjoNe72Z7Kd59J385E3mKkgPW49P3CNvJ4J8kDf3tSNtyyMRAUdYHSbdDRWAK6y4zgH) |
| 13-swqos | only version | Sender SWQOS-only | 5,000 | 467347191 | 4 | 20,001 | landed | [3BZ9RDu1…GSg7iR](https://solscan.io/tx/3BZ9RDu1PXkDRWM6kYiuk4SVRxrmuqLkbUv28DhuF8nTBEsJ9DHdcZEn9MgfcGVa5gHhrhc19cN2ry2Te6GSg7iR) |
| 14-swqos | only version | Sender SWQOS-only | 5,000 | 467347218 | 2 | 20,001 | landed | [xyn9WXDi…W1FjM9](https://solscan.io/tx/xyn9WXDiZDrQdHBP7fgsszqstyzaw6yQ1fzZRHtTvDznzPWfxXpea9BQrCGFAsgVHNB8WMHWGHqfZSZYpW1FjM9) |
| 15-swqos | only version | Sender SWQOS-only | 5,000 | 467347228 | 6 | 20,001 | landed | [64BHNsAc…5vQEpa](https://solscan.io/tx/64BHNsAcfRQ6NY1TLtiE2q8NMLr9D1JXZpUXNbQ1HgPbkszY2dtHoUeupFAxbeJKhUFbWhJK3Cbnosft9R5vQEpa) |
| 16-swqos | only version | Sender SWQOS-only | 5,000 | 467347260 | 2 | 20,001 | landed | [2f7Yx99Q…Ei8pXW](https://solscan.io/tx/2f7Yx99Qbbjz2miFE1XeGUmDVsfHuAAbqUTGFh6yRoTWDoqvh6UkB3odzcKCZQ7n4Zz7cPPqtm5u3a7kSnEi8pXW) |
| 17-swqos | only version | Sender SWQOS-only | 5,000 | 467347302 | 3 | 20,001 | landed | [xj8GkRuh…rTWEF7](https://solscan.io/tx/xj8GkRuht356jNU45VwPRRYXgDrVXbS8vB9HPs61ds2FdbsaoUtNWjoC8diatxDvUtwNQrMwdmQcyNinGrTWEF7) |
| 18-swqos | only version | Sender SWQOS-only | 5,000 | 467347313 | 2 | 20,001 | landed | [Q3JEQVJu…75VUjY](https://solscan.io/tx/Q3JEQVJu4uyTJqn4KbV3xfN8EmH3AVQ1wM4cT6usZErmWXi9YrDYDcNdiGLbT97y1SyULagsnAGnKWxpg75VUjY) |
| 19-swqos | only version | Sender SWQOS-only | 5,000 | 467347350 | 3 | 20,001 | landed | [52osDZ3a…EgU6Sc](https://solscan.io/tx/52osDZ3arvvSZTBABt6ACh7tnf6s6V1V9pgdxGCWpTewMRaDToXghFrdvFr6nxpfXHZzqZkVMF5eu7cm5tEgU6Sc) |
| 20-swqos | only version | Sender SWQOS-only | 5,000 | 467347385 | 2 | 20,001 | landed | [4MaDcP5v…G2A2RT](https://solscan.io/tx/4MaDcP5vfSrMYp5kmoCBXMXVXoNkGws8j3GMqNHhD2bSpSJdfkG19G1ndngd4rRhJudv8xmfJTKECVREqXG2A2RT) |
| 21-swqos | only version | Sender SWQOS-only | 5,000 | 467347413 | 4 | 20,001 | landed | [2XnwNEha…MxkXWW](https://solscan.io/tx/2XnwNEhafmaQqfknoEaxaEHrYDXGAsmHjKBtWTeYcD4spm1r8Hz8sfBzmVPvAQbkHnSKSe9HZUytda9j1wMxkXWW) |
| 22-swqos | only version | Sender SWQOS-only | 5,000 | 467347443 | 3 | 20,001 | landed | [Y1UJ4KmB…n85py8](https://solscan.io/tx/Y1UJ4KmBb5jRbHHWRjfhbkofRmnAcNeAE1Ky5rZBbNsVqwm9QhgEiq1fGxFZ9t1fDDhyNAJadLf2nJdghn85py8) |
| 23-swqos | only version | Sender SWQOS-only | 5,000 | 467347468 | 7 | 20,001 | landed | [i514k9pv…G3dZQt](https://solscan.io/tx/i514k9pvipPUsvpMoZm6exZuqXaLRuv2y25qeSVwTFPhuCJYPaUQPzXeRzu9qgWmo5R4khDXQN9gfhsZHG3dZQt) |
| 24-swqos | only version | Sender SWQOS-only | 5,000 | 467347496 | 2 | 20,001 | landed | [3ActC6cR…xQFRNX](https://solscan.io/tx/3ActC6cRDwbHg6gnaSD2beqmRPwtaoXzmi26CfTFjGBKF5Txr2ZfgrYmqtfEDrP498392gaK9Bh33eLw22xQFRNX) |
| 25-swqos | only version | Sender SWQOS-only | 5,000 | 467347518 | 3 | 20,001 | landed | [4dyS62qw…bmanaB](https://solscan.io/tx/4dyS62qwrie3CESfkZTELsgH3ZvFCrn8uHadzXBBhSis747qnTV9igA2JV5bRRLWAPWu4PgY8QFZg2ofRMbmanaB) |
| 26-swqos | only version | Sender SWQOS-only | 5,000 | 467347548 | 2 | 20,001 | landed | [3ZVLCaho…GG2VWH](https://solscan.io/tx/3ZVLCahovnGKMcq1w528a2CgeVnrc4Uu5TFc1fRGqKQPeWrkUdo7SBW7en1VWERt6jKi1uTrPb5rPZwJAXGG2VWH) |
| 27-swqos | only version | Sender SWQOS-only | 5,000 | 467347606 | 3 | 20,001 | landed | [2HfaCm4r…SgH6Ha](https://solscan.io/tx/2HfaCm4rAKmCeAwVZh3aGX2a6TS7LAQzJDsbWuQSTBXK5wD1ewnPF62Y7D4gcbdKdMCP6oGFnrxLQWjDWPSgH6Ha) |
| 28-swqos | only version | Sender SWQOS-only | 5,000 | 467347611 | 4 | 20,001 | landed | [55g4WDm4…Df1Bw1](https://solscan.io/tx/55g4WDm4Pw1CSUvbHGxEQ1xNKGhjkipxuQn4veEL2QBkmwjz7Q5YqsY2vRjSm7hT9ioMouMmHMpavThGyXDf1Bw1) |
| 29-swqos | only version | Sender SWQOS-only | 5,000 | 467347643 | 3 | 20,001 | landed | [3xkiLE1H…9bFfWD](https://solscan.io/tx/3xkiLE1HGqnpV857u7QbtGuyTHGcojw7kxerPbSBnjnXqVRniTvtWt2yDMqdgsXvc58vZ6nKaYtViVvQ2r9bFfWD) |
| 30-swqos | only version | Sender SWQOS-only | 5,000 | 467347667 | 3 | 20,001 | landed | [z1KJYGzj…YSkizt](https://solscan.io/tx/z1KJYGzjYpTu4xJ6Rzyf8yxuLuBqd6Bs9bYr6KtyUKqpJUJ15pgUhg6KLWikJgaWx1RADfR5sw9vTKRsKYSkizt) |
| 31-swqos | only version | Sender SWQOS-only | 5,000 | 467347697 | 2 | 20,001 | landed | [4xJAJjh7…4U3a5c](https://solscan.io/tx/4xJAJjh7ArZq5eUUfkuMHeYakja8LPbUXvEkzZeZoxyP96BmQjaxpN115apoBikR7TqQB1XqsSUR2tuc454U3a5c) |
| 32-swqos | only version | Sender SWQOS-only | 5,000 | 467347742 | 3 | 20,001 | landed | [25jDzHXX…ji8qxp](https://solscan.io/tx/25jDzHXXNB6CymYezqkQeRJXidy2LCWCH9xSLeCZEzVGWe8bo9uFWfCbJdrny4KUE7uDaPZmoU9pe7Dn5Yji8qxp) |
| 33-swqos | only version | Sender SWQOS-only | 5,000 | 467347769 | 2 | 20,001 | landed | [5kXAFWSs…ffgNMN](https://solscan.io/tx/5kXAFWSskCoGxShTwEzXEw76qMRJQML3iSbPYiFVkDyNwSfz3qqfvQTzWRMxQAAR92wqZmNu1vEci6JWmAffgNMN) |
| 34-swqos | only version | Sender SWQOS-only | 5,000 | 467347795 | 4 | 20,001 | landed | [4kawSvoo…UmJS1u](https://solscan.io/tx/4kawSvooKiGYxncf8MgcXgqCAVwnZj3Usqqex4yKmRnTHL6be5fcDRv2FAkWony2u1117qtc3X5KeQzEfHUmJS1u) |
| 35-swqos | only version | Sender SWQOS-only | 5,000 | 467347826 | 4 | 20,001 | landed | [2mbYFQWp…buxFTM](https://solscan.io/tx/2mbYFQWprbEgagmGLacXgx2qfMB2czXessNQkSshWYhzLZ3auACHwECKiBC8gbY3ZmfqJT1EVPcqNhUjLBbuxFTM) |
| 36-swqos | only version | Sender SWQOS-only | 5,000 | 467347842 | 4 | 20,001 | landed | [2ZYUPdgT…8CPf2x](https://solscan.io/tx/2ZYUPdgTNZ5R9BFTtSLf5AMGVUWyqc8Xc6YQjwVamxTfDQZMYUkLVZ1hVfafdfuWsLGhJTTBBDN5pmSLfp8CPf2x) |
| 37-swqos | only version | Sender SWQOS-only | 5,000 | 467347858 | 3 | 20,001 | landed | [3sxEmQGb…rhNzkR](https://solscan.io/tx/3sxEmQGba1b2tqrVTLdkzy425j5DZH91ZgWrRNbtyxEToH2aC8BbCoJv3c495eRYByVuYiyAj5ZTQLqpyCrhNzkR) |
| 38-swqos | only version | Sender SWQOS-only | 5,000 | 467347891 | 3 | 20,001 | landed | [33CQeRUV…gG46v7](https://solscan.io/tx/33CQeRUV2QjjRL9wq9t9KHQbM7Gd3W6xPiq1pF2NNPragZW6ByrT5QTaQ6xbZWMDapctnP5MkSbTfwcchwgG46v7) |
| 39-swqos | only version | Sender SWQOS-only | 5,000 | 467347916 | 2 | 20,001 | landed | [62NP3qPs…h51YJM](https://solscan.io/tx/62NP3qPsmEjLNoCaWkcaQya7QjomackHxLX4vXAtbZvhPEwsHopyMiixmc8KhJ297eCZYEvs5t8LscCg2Zh51YJM) |
| 40-swqos | only version | Sender SWQOS-only | 5,000 | 467347965 | 2 | 20,001 | landed | [3Wxzt1wy…QawjRD](https://solscan.io/tx/3Wxzt1wyFwbv3AqGaTWMyGvffGb2Kgbzyb6JUQr5AAmXcTTiNJvpk8rJvtjjmwhntbnmoHRsVu4YeaB4qcQawjRD) |
| 41-swqos | only version | Sender SWQOS-only | 5,000 | 467347991 | 3 | 20,001 | landed | [3nNFVect…wY4x1i](https://solscan.io/tx/3nNFVect7beJoW49584R48BiXgXnnQAqhdQrJHsuApzM9upQZLYb2XYirYrSTNwHSGDdjCfZcf2tNC4MuqwY4x1i) |
| 42-swqos | only version | Sender SWQOS-only | 5,000 | 467348028 | 2 | 20,001 | landed | [2PVA97Za…8AaDpT](https://solscan.io/tx/2PVA97ZaPHjiaiXPap4k8aKNkEQFPAq7LbhBHUrG54UxheNMwSpCgxhpaXFbk3CsL6ZCrRhZC2opfZiCAu8AaDpT) |
| 43-swqos | only version | Sender SWQOS-only | 5,000 | 467348039 | 7 | 20,001 | landed | [3rFQrrzN…p31GPp](https://solscan.io/tx/3rFQrrzNC4gPHK6Aq5khGqRnatQDfK2dTawZ37TftGnccbM1qQ8Fs6J9MwYTFCvAQr23a6TUS4L1F24ExQp31GPp) |
| 44-swqos | only version | Sender SWQOS-only | 5,000 | 467348064 | 3 | 20,001 | landed | [2KFxkdUp…8RC6qY](https://solscan.io/tx/2KFxkdUpJTqcDnaWmi3FYWzxwH8ZbJhjbcZVh9mnyhDemraoeSymcpbtrCBLFXpqHik7S5xVRmdteN9czJ8RC6qY) |
| 45-swqos | only version | Sender SWQOS-only | 5,000 | 467348120 | 4 | 20,001 | landed | [4QksU7Ps…u18S7E](https://solscan.io/tx/4QksU7PsnKkhY6ibaRYdQiW6gT4C9qUvNwAKJpkiBPHRek4xgD3vggKMbaFRvaUUQNVLHUVHWeu2aSogtRu18S7E) |
| 46-swqos | only version | Sender SWQOS-only | 5,000 | 467348131 | 2 | 20,001 | landed | [3NoCbTag…UjK9jH](https://solscan.io/tx/3NoCbTagn4Qd8qccbwxs34oNMdf84skJCR7WtF3iDB55wNELPh82zh5FqrPHRAYmtQmPenBRqMzXvH4pfhUjK9jH) |
| 47-swqos | only version | Sender SWQOS-only | 5,000 | 467348168 | 5 | 20,001 | landed | [3rkaF7HR…yyV47T](https://solscan.io/tx/3rkaF7HRoXQr27YZFw2WPQkBZLzLXGG9YdfSNEQ6ZfToJMXrJwoueCMFiESjgPJpC1JMJZj1tt5yfBiMapyyV47T) |
| 48-swqos | only version | Sender SWQOS-only | 5,000 | 467348204 | 3 | 20,001 | landed | [4u1pkKCU…CcZAVc](https://solscan.io/tx/4u1pkKCUEuMwQUBsoWa5P9XxB6oUtqMQSDeqacarVsNp2EXrsAYB8mV9NuQNtvDPVxLcw1Grn69GB7gTh6CcZAVc) |
| 49-swqos | only version | Sender SWQOS-only | 5,000 | 467348209 | 4 | 20,001 | landed | [67YKJfzA…dCT9bz](https://solscan.io/tx/67YKJfzAkpDqBxniAnZCmMW5q6yTEFVDgQum5qGBg8z4Stt3RG2574Na2Ggvh1XRzvtFLPxxMMtzspzzUJdCT9bz) |
| 50-swqos | only version | Sender SWQOS-only | 5,000 | 467348258 | 3 | 20,001 | landed | [33iPBDcG…Ec1avS](https://solscan.io/tx/33iPBDcGuWNSgcxp4yUC7XHWq9ZhdoJJutgAAym6Z99Db2Gpib4UfFqzuZF4pT3nNReWNikJ1CFFRbYzB9Ec1avS) |
| 51-swqos | only version | Sender SWQOS-only | 5,000 | 467348269 | 4 | 20,001 | landed | [5A84uhez…mygLC8](https://solscan.io/tx/5A84uhezDtfpuyFqMjiitwNWnDCWCpJ49hGwnAtVMBDGusmEBZRNza3LuUa1Y8daMV9agrFXnTjiryb8qtmygLC8) |
| 52-swqos | only version | Sender SWQOS-only | 5,000 | 467348310 | 11 | 20,001 | landed | [2ermNjqZ…XaEmC6](https://solscan.io/tx/2ermNjqZytjX2bpsx8vxQ7kzCepXFPm3rtJiirTzJux4tZQEGbXp7jzuE3sANEpSQhggQayKqzGxcuHkufXaEmC6) |
| 53-swqos | only version | Sender SWQOS-only | 5,000 | 467348336 | 5 | 20,001 | landed | [5LDr7uAX…h1BqqM](https://solscan.io/tx/5LDr7uAX8Xuen41AfvjCtsXiF2vruEkeQpUxYCKtJW8i8sbEQqrVqsjNpKDRc7Q3Y4M9otEXh1apFrP83Yh1BqqM) |
| 54-swqos | only version | Sender SWQOS-only | 5,000 | 467348351 | 4 | 20,001 | landed | [4Rexf36v…L9wWmf](https://solscan.io/tx/4Rexf36v3e16C1guGFD9fzyY8UBD3agHMEEDikG7wneWvSpJCJmr6CoxHo1QB6yUpY3gFiMtagVTGup6a7L9wWmf) |
| 55-swqos | only version | Sender SWQOS-only | 5,000 | 467348398 | 4 | 20,001 | landed | [5EGnoGVV…365MZG](https://solscan.io/tx/5EGnoGVVGsY2RFgEPB9KBFkJ45YFmCsWyiJdib7GZAW7X1oW3omLdpiukJdisGzkA2eWY49SocopXpYZA2365MZG) |
| 56-swqos | only version | Sender SWQOS-only | 5,000 | 467348433 | 6 | 20,001 | landed | [58izCJtJ…wQ7EAC](https://solscan.io/tx/58izCJtJTJTrsqfej3AR6jh1F2ZYGygzxeND9bATKzgaQ7LmN9mzv4Fr1wWCby2bnHKJ2XCKffeS1egXZZwQ7EAC) |
| 57-swqos | only version | Sender SWQOS-only | 5,000 | 467348452 | 2 | 20,001 | landed | [2q45tHNN…rxGuX7](https://solscan.io/tx/2q45tHNNtcpdiGARRaNww6kV3pNvjaJx2PaeBY6sFjfiikbuNc5vM12u6vxMBAGKtH14viwkMRG7vh4AfsrxGuX7) |
| 58-swqos | only version | Sender SWQOS-only | 5,000 | 467348474 | 3 | 20,001 | landed | [3SEJuYwj…NCaE36](https://solscan.io/tx/3SEJuYwjSviK1tj164xhcYNH94uB9Y4u6VEJM5pva6aPBgiJraEMD8F7qZmedpDwXQo9QsJxSPYz25CpWiNCaE36) |
| 59-swqos | only version | Sender SWQOS-only | 5,000 | 467348493 | 3 | 20,001 | landed | [61yh9voK…WsAMoe](https://solscan.io/tx/61yh9voKskPRQJFRxZFLZJNGV8Y3AbShenmCWCt4VRQCAZmYGszYcDibZrcxFU8YtnGVNvuoWzVykxsxkBWsAMoe) |
| 60-swqos | only version | Sender SWQOS-only | 5,000 | 467348540 | 6 | 20,001 | landed | [2sXsoxra…1cL7Jo](https://solscan.io/tx/2sXsoxraRiKTKem2nNnRVrEDywG3i3L4taeEziRh7xeTXXpZVmqRTUKa5VwsUJyTxeP8GYESF8UiiNJx591cL7Jo) |
| 61-swqos | only version | Sender SWQOS-only | 5,000 | 467348563 | 3 | 20,001 | landed | [dYAkEExo…Fo8F2X](https://solscan.io/tx/dYAkEExo5JVG8vpfxFvBGzZ7r9YguSzkuVzAfM9RYg6Qd3KoAPH7fWg5dJ827S5qxokkwDF5b1JQnsMvFFo8F2X) |
| 62-swqos | only version | Sender SWQOS-only | 5,000 | 467348594 | 4 | 20,001 | landed | [4VCQ9NqE…rb4GNx](https://solscan.io/tx/4VCQ9NqEUqUEdWn2hEtqo3Ti1CGszbh6HDX253CrbvYFLite7eU9Kzjje2bYBjdpWZTxhFAARPXiwFaRqtrb4GNx) |
| 63-swqos | only version | Sender SWQOS-only | 5,000 | 467348631 | 3 | 20,001 | landed | [psaGrtg4…1Lstnr](https://solscan.io/tx/psaGrtg45C6fBpDZAZQ6qsmwGCtmo7qCxrTeeVdjnfcGncRSgTzuW6zU2ADqPmBjt3VEDsWCyfN4M91Lm1Lstnr) |
| 64-swqos | only version | Sender SWQOS-only | 5,000 | 467348646 | 2 | 20,001 | landed | [5ctz9rc9…vrUKoe](https://solscan.io/tx/5ctz9rc96JGiFhWWinkFT2Yv2CMWAGZXX9E4heVPvvURAAH5FNa8oZJzbrqE45GXtL2qTc7BVmhhgLXvBBvrUKoe) |
| 65-swqos | only version | Sender SWQOS-only | 5,000 | 467348666 | 3 | 20,001 | landed | [2sycyWpd…K6nxtk](https://solscan.io/tx/2sycyWpdPySWPyVTRVB3mhCNBbTobhT6iUHYfpDN62ktbeWofxqG31erneJEp2VsYH4jcF8Rgjyexouqr7K6nxtk) |
| 66-swqos | only version | Sender SWQOS-only | 5,000 | 467348711 | 3 | 20,001 | landed | [4chmVeuU…qa8Ln8](https://solscan.io/tx/4chmVeuU2DTpFeDvmHuKcUgafh5FBUF4gRcnJmrAdDt7PhNpqdJEKBv9eN5sbMhFtbbwvkTDmDzJyUMy6Xqa8Ln8) |
| 67-swqos | only version | Sender SWQOS-only | 5,000 | 467348727 | 3 | 20,001 | landed | [jVS1yeGB…KpLkiD](https://solscan.io/tx/jVS1yeGBr15xsXiWp5ioNa6yEH4T2hmK1nGmfD3JLuLjguRdDYZ3GSdMdnzsujNvg6dyknHZos8XPVFFsKpLkiD) |
| 68-swqos | only version | Sender SWQOS-only | 5,000 | 467348773 | 3 | 20,001 | landed | [5bSG7rzj…ZEXY9P](https://solscan.io/tx/5bSG7rzjRfSyQ1Lxz9LH8Laq5Cw2He1AGq9VR4GMirag5zsHvtAqJYWxQEewuHeZukVvKDWXAWCPXheS1NZEXY9P) |
| 69-swqos | only version | Sender SWQOS-only | 5,000 | 467348779 | 3 | 20,001 | landed | [2xDme41F…oZvc2N](https://solscan.io/tx/2xDme41Fq1kFaATiFUvod668TyNdeuQuNrrVj1BMKsyFRwW8FD3V4WmvrFMQzfWBTHZ1upasgGBXJocnP8oZvc2N) |
| 70-swqos | only version | Sender SWQOS-only | 5,000 | 467348817 | 2 | 20,001 | landed | [5z7Fpcr2…H9vLcZ](https://solscan.io/tx/5z7Fpcr2gVTN1VZbqzQ9LykH3yeTmwbFL53jfYCyy8yiEKJEn7HsrfzXprDrbGUzjVu1yFj9BLcn2c9BffH9vLcZ) |
| 71-swqos | only version | Sender SWQOS-only | 5,000 | 467348849 | 3 | 20,001 | landed | [4ZjwJYR5…HcTutm](https://solscan.io/tx/4ZjwJYR5i3S8N6sngwtj1XVXBTEjKakg1kEYwHarMXMULkT47XqyXUtNzVAL5ktANU6hcreWrxsskQ9RznHcTutm) |
| 72-swqos | only version | Sender SWQOS-only | 5,000 | 467348865 | 9 | 20,001 | landed | [5pj6v2VX…NPnP3s](https://solscan.io/tx/5pj6v2VXhVFL7vsHQrABNCfLEMDjGKWdt2aetBSaJsvx9dJbQx97dS8fF4uaEojvDMYtwSA7S52DS8mUWaNPnP3s) |
| 73-swqos | only version | Sender SWQOS-only | 5,000 | 467348899 | 2 | 20,001 | landed | [2R8QLbrT…Xhid3W](https://solscan.io/tx/2R8QLbrTcyz1zgu2Xo3m1qzBmULqWe5GcYCxJHL5yNTpMeBrxGrAY76wRBE1aphmuh3gv1dBEommPnac3YXhid3W) |
| 74-swqos | only version | Sender SWQOS-only | 5,000 | 467348918 | 14 | 20,001 | landed | [ddDXyKTp…diYSBY](https://solscan.io/tx/ddDXyKTpJFb8QoN8ZQUNnZvDVGLwJFEoeu2qJhsmeyDD4QpG85bsH3a1L6HcCQmj84Tq8LaujyqUP9thndiYSBY) |
| 75-swqos | only version | Sender SWQOS-only | 5,000 | 467348950 | 3 | 20,001 | landed | [G4hwW2Fi…YmtfmV](https://solscan.io/tx/G4hwW2FiksgH1X6Ka31VCyV33pg1Dq11752kF4AaF1ExLNYmnMTY2Wz83LB7FwUkiC4VYMBRAWAQ7DhtDYmtfmV) |
| 76-swqos | only version | Sender SWQOS-only | 5,000 | 467348995 | 3 | 20,001 | landed | [5DFhREp3…e1gTzx](https://solscan.io/tx/5DFhREp3C6QF8CzgkBNdzDNzyBiBUBXsANEME7XLx6S8apgimiGgJoeVe3XrsPnGiL5dY5mT959XvCj5Mhe1gTzx) |
| 77-swqos | only version | Sender SWQOS-only | 5,000 | 467349006 | 8 | 20,001 | landed | [5xMhY2gv…VWEqdD](https://solscan.io/tx/5xMhY2gvRUogjkZ3xbrhY215DayxHLYHngx7SVNkioY9uYSHa5Hr6A5ZmEfz1JmWK483GF3D99NnGQxB38VWEqdD) |
| 78-swqos | only version | Sender SWQOS-only | 5,000 | 467349035 | 2 | 20,001 | landed | [37htTiBj…rsCACL](https://solscan.io/tx/37htTiBjCzApEavXCVAHGK613wtnCEtAPJsTZbXaAvFRw1ur2ZZh4T2KNGiHwhVcxR9K9sii3mQe6ksUiErsCACL) |
| 79-swqos | only version | Sender SWQOS-only | 5,000 | 467349056 | 2 | 20,001 | landed | [2tuB5YJ2…bn9hW1](https://solscan.io/tx/2tuB5YJ2MfYEVHt7BtopWhVAeosTgqDom1PBePqn9FKCkjKdYNwk1EgkJfLNLM9mi5RxrkRaFoGGHJ5Sa1bn9hW1) |
| 80-swqos | only version | Sender SWQOS-only | 5,000 | 467349102 | 4 | 20,001 | landed | [5N9iZRak…8X5iXS](https://solscan.io/tx/5N9iZRaks6aZRKiyggrBB5BBXARun4Pg3Sriub4mRfdSCMC56Cq7PywA13PTvB44GcU1YUd1X8MqD582CZ8X5iXS) |
| 81-swqos | only version | Sender SWQOS-only | 5,000 | 467349124 | 6 | 20,001 | landed | [dRzNWKdP…JFA6gG](https://solscan.io/tx/dRzNWKdPfhyzTMYwHf8T7jgAXjkYpgZSu98dVZJoNGn9AobLCz7Cfy1ctBZ3shLAmUSv36emmc2f15PNRJFA6gG) |
| 82-swqos | only version | Sender SWQOS-only | 5,000 | 467349151 | 3 | 20,001 | landed | [4MevgDXH…hppYQu](https://solscan.io/tx/4MevgDXHcex4QnBDR5xhbdZBvawNY3FH5tVTxAgaKyEXn4paKKNo66PmuTVPz4P28RdA5wKWvUKBqH51WfhppYQu) |
| 83-swqos | only version | Sender SWQOS-only | 5,000 | 467349194 | 2 | 20,001 | landed | [52oQqLN1…Wyqf4T](https://solscan.io/tx/52oQqLN1n8FFNnFmxeqxXwohrPZfGFWWCht5yQJPZe645aLXp4D8grtkiVGSFLxQRhc65Nias5AM6DifHLWyqf4T) |
| 84-swqos | only version | Sender SWQOS-only | 5,000 | 467349204 | 3 | 20,001 | landed | [4NNUBeeP…6RMPYp](https://solscan.io/tx/4NNUBeePd7pMPSPsZPo7QdVMUZXmVp9mzQ5eCsDYmgE2rtuNJg6PHrkLKqBQwBTfZ6rhyc2VJziqJSvUaB6RMPYp) |
| 85-swqos | only version | Sender SWQOS-only | 5,000 | 467349233 | 8 | 20,001 | landed | [5RQywGKh…RhzAAP](https://solscan.io/tx/5RQywGKhx9k4tCprSLDvzZmuLVTAggC1rNn3eDdbbyE3T47HtAPPtfurGLL1bbVW8pYiYpdK6vQVZ2VYWURhzAAP) |
| 86-swqos | only version | Sender SWQOS-only | 5,000 | 467349270 | 2 | 20,001 | landed | [4HU68n3j…4SR7Jc](https://solscan.io/tx/4HU68n3jvcHw8DcVfb6wrqr5Svbws1kzvC5AqwFb7FiVJfDe93rWk7oxRhwmbCeFUyHUG3hoSuD2ZkVwAP4SR7Jc) |
| 87-swqos | only version | Sender SWQOS-only | 5,000 | 467349283 | 6 | 20,001 | landed | [2MbwYy8W…2ZikVa](https://solscan.io/tx/2MbwYy8WgH3WWenE9jsVPQotoCqG6JLj2Tr2XfLtGWq6x6YVE5FyARURPEHcGNoxRAgTGa323D8bSf5BC52ZikVa) |
| 88-swqos | only version | Sender SWQOS-only | 5,000 | 467349320 | 3 | 20,001 | landed | [3Gwp6vWk…1iwMiv](https://solscan.io/tx/3Gwp6vWknmCsgeECi7wj3gRgQ81aRNpeSgbAfiAqn5LjY2XPRq1Y1Xd89YNTEiVn5FHdSUrk7QaRn3U7re1iwMiv) |
| 89-swqos | only version | Sender SWQOS-only | 5,000 | 467349329 | 6 | 20,001 | landed | [3XfM651P…4YmadC](https://solscan.io/tx/3XfM651PR5GcCf1ZrpbNaxkgh1vsKkhq3daGZQxQch4XudFpzTRHCe63xnCvWiXiTVr4xyB9eb7wi8EVeu4YmadC) |
| 90-swqos | only version | Sender SWQOS-only | 5,000 | 467349381 | 3 | 20,001 | landed | [63H27iCw…YxKkPd](https://solscan.io/tx/63H27iCw2pqtEFXUDSwhFeoAJGcEdBq3NvXVCzJ6qCVfd9Ghjypj3F43zzYGRBK14x36SwVhjTbfucbzexYxKkPd) |
| 91-swqos | only version | Sender SWQOS-only | 5,000 | 467349415 | 6 | 20,001 | landed | [4mQA7FaK…MFNzmb](https://solscan.io/tx/4mQA7FaKdsigbg1B5hPm5w48aJ63sctBUxR3NZhmq6KWz8WzrtsewEbC2U3WCNaLFgJWZM9txoU2ZQY77zMFNzmb) |
| 92-swqos | only version | Sender SWQOS-only | 5,000 | 467349420 | 3 | 20,001 | landed | [4aXtEKBQ…Ky6qE7](https://solscan.io/tx/4aXtEKBQQmMnadvBYPLKNehZDPN47mZfYdmNQNFKWaWZH7LzB2SMkhBdqyMd5TweySqwcW4g3iQQptyhrWKy6qE7) |
| 93-swqos | only version | Sender SWQOS-only | 5,000 | 467349444 | 5 | 20,001 | landed | [5BnheXnM…LT3RV2](https://solscan.io/tx/5BnheXnM3LHqt4DXxEA1NTtTTq46wieXr2k4yJaG9XzpPkAcQWQGtDSVijfrNGEyccuRCeioPVa9PGMVnMLT3RV2) |
| 94-swqos | only version | Sender SWQOS-only | 5,000 | 467349496 | 3 | 20,001 | landed | [5ce6gEYD…Swsm4K](https://solscan.io/tx/5ce6gEYDN1fg55AsbpbXjeUVS5E9JAFsSeAAnRAEA8ZMDJSRRkSqUmBMcSab4Fcov5i1JTXzoEkgjShreYSwsm4K) |
| 95-swqos | only version | Sender SWQOS-only | 5,000 | 467349511 | 10 | 20,001 | landed | [WVUd11Rw…wjgXGn](https://solscan.io/tx/WVUd11RwzNDamPBo3ibQomQkCoTuBYbK9bWVBc9UBrrn1gyHk21Etg5hReWkDbXEMeYNhqACHQjjxHTYWwjgXGn) |
| 96-swqos | only version | Sender SWQOS-only | 5,000 | 467349542 | 3 | 20,001 | landed | [NXQWU9Bo…vgehsw](https://solscan.io/tx/NXQWU9Boxx86UQaWDea6drVdzpi7eeRvHkSEjF5wjPr23GVvAm63TJ1issZQnRLotjePgncAz4Qhc1agVvgehsw) |
| 97-swqos | only version | Sender SWQOS-only | 5,000 | 467349574 | 6 | 20,001 | landed | [Z6oryYFH…EZ5DFs](https://solscan.io/tx/Z6oryYFH8Pji6Quyn1aVLXHPHjamTnu4CHuFRHYT9ekEhbzUghcd5bhssBTFRqWtmvGJkg2zkKQB3CaKEEZ5DFs) |
| 98-swqos | only version | Sender SWQOS-only | 5,000 | 467349601 | 6 | 20,001 | landed | [4eHUDPzK…41QnzQ](https://solscan.io/tx/4eHUDPzKQANQezDjWVvsg1fMhSa8cy6rTXEn4RYgswVWsvxytWTaMGv9fXwo93f4CpTMnN28TpM5VfhREG41QnzQ) |
| 99-swqos | only version | Sender SWQOS-only | 5,000 | 467349617 | 2 | 20,001 | landed | [25V5MN9x…GesHzR](https://solscan.io/tx/25V5MN9x3uwdC9woiwqhpK4EaP3UDF37RdCN69T8BWpvZjs8PiLKRM3eLwzuPujNfsmvquwmKX8KaExGFrGesHzR) |

</details>

<details>
<summary><code>sender-mid</code>: 100 operations, 100 transactions</summary>

Helius Sender with a 200,000-lamport tip (0.0002 SOL), between the two tiers: accepted, but sent best-effort through fewer paths and without the priority tip buffer.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-sender-mid | only version | Sender | 200,000 | 467346821 | 4 | 215,001 | landed | [HFLrr3Wp…GRQYXj](https://solscan.io/tx/HFLrr3WpyJaekrNzhurZi2hQm5YZpFXqTig2WGV5pgFruPcLopBVw3s8euJJtYqEJ4DXXidwNnDjvkGMWGRQYXj) |
| 1-sender-mid | only version | Sender | 200,000 | 467346831 | 4 | 215,001 | landed | [CFnjGh1K…1VDUxk](https://solscan.io/tx/CFnjGh1K288KcbWpHDC7fz6Z2by9XeGfWE9tLD8Wikg2Y1zRFfH51GathtNxD4U4oMGATPkMWYHZF9TWX1VDUxk) |
| 2-sender-mid | only version | Sender | 200,000 | 467346851 | 7 | 215,001 | landed | [3Ahq7jY2…yHdYUu](https://solscan.io/tx/3Ahq7jY2a5tE6EGvUn6NwwvG4aQTyQ5nGD7zKEmFsZAWcbw3xSvET81gsGxwSY3nBkgvH5KeXL9Dnup3UzyHdYUu) |
| 3-sender-mid | only version | Sender | 200,000 | 467346893 | 3 | 215,001 | landed | [5nBktzre…PPpvpz](https://solscan.io/tx/5nBktzretybggDWBFauWGTpFE76aJdcoHKrRoSJjGBCzqC8zuj28zb6SyWBGpuXiGNRqxc3x4RBYVsh6ZWPPpvpz) |
| 4-sender-mid | only version | Sender | 200,000 | 467346924 | 3 | 215,001 | landed | [4YWEr8Ya…Kdhg4c](https://solscan.io/tx/4YWEr8YaDQmYATKsd44Fu97Cps8e1sSgwbk276fy4uzN9kFWH36eCAwuTT5W77vuTn1GhS4zXitp2ZJ6JsKdhg4c) |
| 5-sender-mid | only version | Sender | 200,000 | 467346961 | 3 | 215,001 | landed | [2qdGFY3N…YH2gJf](https://solscan.io/tx/2qdGFY3N1TZFJ8NuUVpMspAwt5QCM131Hhgry6sb85HqnxMioQoPMvDWc9abFBHotbHJ44ggs8hLC49U9uYH2gJf) |
| 6-sender-mid | only version | Sender | 200,000 | 467346980 | 2 | 215,001 | landed | [4MxmyyQw…ux3yf7](https://solscan.io/tx/4MxmyyQwLWgswvX9fE1xjfjZLYoUP9eKTnaDv89YcnLeNH1SVvNQLn4M3m2X5QA4sfVpk23z6kBgnEn5u6ux3yf7) |
| 7-sender-mid | only version | Sender | 200,000 | 467346996 | 2 | 215,001 | landed | [5AP7U6mG…FrwLBK](https://solscan.io/tx/5AP7U6mGTNzdQjGNrxPLrqL5FXuWfwcrVQiSy1cKUzToi4unTzNdC24PJHWjxdi6KwZcTdLWjZVRDnThKtFrwLBK) |
| 8-sender-mid | only version | Sender | 200,000 | 467347048 | 6 | 215,001 | landed | [AYbNegAN…YoyXuD](https://solscan.io/tx/AYbNegANPxF9dtPGLRX9HymqiA8mbSUkfkEbJ9QvxyQr2dVcBsTTMpDXmet1enshL79KnoxUPBC1suBXmYoyXuD) |
| 9-sender-mid | only version | Sender | 200,000 | 467347053 | 3 | 215,001 | landed | [3Haa5Jpq…VYbVZQ](https://solscan.io/tx/3Haa5JpqoF5a1YKPqU7cp9rtCDbFChDJ5r6PNwHwKkZCfJJ8icvgn14RS2NixWRE1j9gvfEktWUr2j57abVYbVZQ) |
| 10-sender-mid | only version | Sender | 200,000 | 467347105 | 3 | 215,001 | landed | [5n4Vre7c…xE8KzF](https://solscan.io/tx/5n4Vre7cUw75pNMj2Uc8yQSBoaoLfi72eoWD3eoyJSxhpsLi4WEVRPwjR1efS98CdTyKbvZLjrb6djoQNQxE8KzF) |
| 11-sender-mid | only version | Sender | 200,000 | 467347121 | 4 | 215,001 | landed | [33k5khRp…HsFqBo](https://solscan.io/tx/33k5khRpPS5r2MfayX8KroiK6DzCMnwddAQV8pxPc9g5YcaPwvAHmK4CxpbmxwJdBz3gKDkkPHnwQMfWSZHsFqBo) |
| 12-sender-mid | only version | Sender | 200,000 | 467347153 | 2 | 215,001 | landed | [Bi2Ba5a6…S9Zsp1](https://solscan.io/tx/Bi2Ba5a6MZ3bdYUg9gKJkg2wi9fUxiHz4E4fCLZaHE1M8YC4qB9PhPcyHAuqb3kU9HUA8mNZgFaYQnwipS9Zsp1) |
| 13-sender-mid | only version | Sender | 200,000 | 467347180 | 3 | 215,001 | landed | [5iRmrdpQ…rVvRm3](https://solscan.io/tx/5iRmrdpQy3JCEmTu6nJVF85zdHRGBbxuFv3gQLXMkbGers5ZsYgE9ZVeQKmZrR63LGFViugwgpX6dpedsqrVvRm3) |
| 14-sender-mid | only version | Sender | 200,000 | 467347223 | 3 | 215,001 | landed | [3FpyVzM7…nyiPJ7](https://solscan.io/tx/3FpyVzM72RPVE6nghVs3ZDZ5qJk2qeaoBgdEimvpbMuHKgDdgw6rXmbCAkNFSup13mK5sFBZ3dqVCJZgG7nyiPJ7) |
| 15-sender-mid | only version | Sender | 200,000 | 467347239 | 3 | 215,001 | landed | [2tBACY2s…L71mAH](https://solscan.io/tx/2tBACY2sQc7mXRzhn4dkC7jbxVjkqNgKz2Dq1ucKDeNQHCRZ8vp7LHzoWVChGdhqRCPSVNQwPM1xFcDMyKL71mAH) |
| 16-sender-mid | only version | Sender | 200,000 | 467347255 | 8 | 215,001 | landed | [5VCWMBqX…yVWbGN](https://solscan.io/tx/5VCWMBqXr3toMjsY44EoPr7ZdLqfRQYA7PNijXFjYwkuTNLFAC2dDwt2E5oQFriJ99GEoK7MH8E6hhLckRyVWbGN) |
| 17-sender-mid | only version | Sender | 200,000 | 467347297 | 2 | 215,001 | landed | [4kgw8DzV…8MVJJ8](https://solscan.io/tx/4kgw8DzVL4aKH2ji8J7hx2GWfNXfY9LZLTGcVLVf9hVBPKG2Cc5rVEZn4Eowi1YQKrMX27oA7EBtBaDqki8MVJJ8) |
| 18-sender-mid | only version | Sender | 200,000 | 467347334 | 4 | 215,001 | landed | [5bhCNRP8…VkXF6A](https://solscan.io/tx/5bhCNRP8Edfhvwr1xYe24UuUm8WyZRXEkN2p23JkqW6HHWFV4p3y9swRtEtWvGsw2LQqMCvYAKQBN11HoZVkXF6A) |
| 19-sender-mid | only version | Sender | 200,000 | 467347356 | 3 | 215,001 | landed | [3ZCzZF6G…RbSUrR](https://solscan.io/tx/3ZCzZF6Ga6n7BZiBWmshCBdxJX8turkS4rtPkGxAeysARV4eLwnWpJXFgZSzz3grQZhWxivaoPGhpQWtfHRbSUrR) |
| 20-sender-mid | only version | Sender | 200,000 | 467347381 | 6 | 215,001 | landed | [Wp77po8b…4TgUWD](https://solscan.io/tx/Wp77po8b4QJ4DWugjV8gNNXMYNbpNC8JCKCVB6Qq6XA6FtqSoWSCKW5c81v8dPV8e4vTavmSwU6HQVim14TgUWD) |
| 21-sender-mid | only version | Sender | 200,000 | 467347418 | 3 | 215,001 | landed | [3mfYsLJm…pt3XBg](https://solscan.io/tx/3mfYsLJmWgFFUtt9zE7qwtsR62wAFmoKsNcCcJNSJKkcd4MnWTqxzLQhXzNpGrSVoZ5ALEg93qxgKGZT45pt3XBg) |
| 22-sender-mid | only version | Sender | 200,000 | 467347433 | 5 | 215,001 | landed | [2ismSkeC…xo5B4M](https://solscan.io/tx/2ismSkeCfrS1siPnk9aJndGKYrq6TQiHV3wYAHpT9GMNWyavSWkecQheTxSJb46FTfRoADuYJHDZSpCQWBxo5B4M) |
| 23-sender-mid | only version | Sender | 200,000 | 467347459 | 3 | 215,001 | landed | [64Aa71HL…SfxExk](https://solscan.io/tx/64Aa71HLorKmBzoPXbKyuZTPHQoD9JVd66wqgCgKYkJ3EQC2aZLyxNe4x2YfFqHLUFjRB7Sa5i3uoUaNuqSfxExk) |
| 24-sender-mid | only version | Sender | 200,000 | 467347479 | 5 | 215,001 | landed | [wfnnVwWa…wrwKeX](https://solscan.io/tx/wfnnVwWaDKNDg8wLyoa62PVFWgADps2XoMNa5aTPwAxhYbNdGfjHoTKYGZz9HAzeNjLtja4wJYxos6txSwrwKeX) |
| 25-sender-mid | only version | Sender | 200,000 | 467347533 | 9 | 215,001 | landed | [3MYHnsCc…v8JL2n](https://solscan.io/tx/3MYHnsCc99dcxZFawPMPkm6g2M3rmtcEoMe1j2hjhHiNzkub9WxYo8QvhJLf8qvJGC1tAAQfTeprr4yefUv8JL2n) |
| 26-sender-mid | only version | Sender | 200,000 | 467347573 | 2 | 215,001 | landed | [44BMTozc…EbQsEs](https://solscan.io/tx/44BMTozcFPmhUVdHt1fK6o9Ecw8j9iMZfYBGDhU9bEyHrZyezKXWySBDLMbx2aq2mwwRFmzYwYKV9136MZEbQsEs) |
| 27-sender-mid | only version | Sender | 200,000 | 467347601 | 3 | 215,001 | landed | [5LaoDiNz…Bu8vWh](https://solscan.io/tx/5LaoDiNzHga9A2vwrCDiqDVcvpLHpxyTx82LcwkwsUhWKKiMwYEatcPsmWMQi1AWVGpAxUvrx162XFJBVeBu8vWh) |
| 28-sender-mid | only version | Sender | 200,000 | 467347617 | 3 | 215,001 | landed | [3NmHkRBv…k6WYsd](https://solscan.io/tx/3NmHkRBvC45GseZm8UDx9oXTtoUm6Hr371XV1QVC6q9w5oFrJEndm3LeDr6AdKQzsqUbG3TN4Sp8KLVH7Kk6WYsd) |
| 29-sender-mid | only version | Sender | 200,000 | 467347648 | 3 | 215,001 | landed | [5bHqQwp4…3beod7](https://solscan.io/tx/5bHqQwp4SZ81gJS3hS5uKseYnkiCvi3qufRoZE8ZeiPWTe1yaLZuBU83ype1SZH7K36HQY6xRrbDdvYd163beod7) |
| 30-sender-mid | only version | Sender | 200,000 | 467347687 | 3 | 215,001 | landed | [s1WNLuea…JEN5TM](https://solscan.io/tx/s1WNLuea1JgyahmN8yzqTtfPDiY4QJBD6Qu4ohLqeC1dRCjhjH4Wc5bJp5g4gJNRKBwCRH1aGFUrDXA7pJEN5TM) |
| 31-sender-mid | only version | Sender | 200,000 | 467347702 | 3 | 215,001 | landed | [5WuZe2px…RdSkNF](https://solscan.io/tx/5WuZe2px8FsXumnsTXjg9bEasT2imm1La3wQvUYtuQ2G5GyEf22JTVttY9QTURqXf3rJLmqiCmVmDYm6YBRdSkNF) |
| 32-sender-mid | only version | Sender | 200,000 | 467347718 | 12 | 215,001 | landed | [3G8uEEzB…sF9FR8](https://solscan.io/tx/3G8uEEzBKtyYafePqeRg5dCoASDMHacoNAaxBziERQWvhNpa1wtXpiV43VxAcza1uLqm8axYjcdq1rHXWUsF9FR8) |
| 33-sender-mid | only version | Sender | 200,000 | 467347758 | 6 | 215,001 | landed | [2EcCdGzQ…vZ7kav](https://solscan.io/tx/2EcCdGzQkzz7f2Wnx3fLHt6x9UMLnkAfF6MDJdBLMojaBcerWdu13AxtNbFL24N6JVsBRgntAZzgwwcp84vZ7kav) |
| 34-sender-mid | only version | Sender | 200,000 | 467347774 | 3 | 215,001 | landed | [31rqkpez…5jKziC](https://solscan.io/tx/31rqkpezSa7FTMV2E3jXm2KrfNFWJ16EeDn1Ko5SYQdiNjoGeSXC1THvvwZevJhkCyhPrnwxp2T6N15TmG5jKziC) |
| 35-sender-mid | only version | Sender | 200,000 | 467347821 | 4 | 215,001 | landed | [jYUtcc7J…5HWq5X](https://solscan.io/tx/jYUtcc7JJgZkL8vJuCgECudKUCrxuvvpfT5BHHKnK3GPGB5MAk8Xdf5WwsC5vKaPhjQWwmrqBZqEbgA9S5HWq5X) |
| 36-sender-mid | only version | Sender | 200,000 | 467347852 | 6 | 215,001 | landed | [28BgXenx…CscTvX](https://solscan.io/tx/28BgXenxjCdm8PK7nmCwkeSivqaU22XwVbzYe8KhUWNaBDydEEJW6dfUMwyaC5475YowiZKPsaQvKB4XBgCscTvX) |
| 37-sender-mid | only version | Sender | 200,000 | 467347879 | 6 | 215,001 | landed | [4X5oR1FV…wb53ee](https://solscan.io/tx/4X5oR1FVSysvmNDZWV8d6hBTA1CXZbtJ7dmJniD7ZzXzWLkdR6qAJdGtvzHDWFX46QHV2ni4Ej3XvVL3uLwb53ee) |
| 38-sender-mid | only version | Sender | 200,000 | 467347906 | 5 | 215,001 | landed | [31ABXYum…rQ6gSA](https://solscan.io/tx/31ABXYumQAnu73Ab6T6YdzuQaXBHdH4rCeTnSzWp4cVsJP8wb7vKjA165gH2KgS8h19afy8cZZzo72DkYsrQ6gSA) |
| 39-sender-mid | only version | Sender | 200,000 | 467347912 | 4 | 215,001 | landed | [5XGveY95…hDYzhX](https://solscan.io/tx/5XGveY95kzH4sXKh3nG4ugjhM9YwJrr3yDS9Asc1t1sSRqSYovxWfRRL7bDxnXtExwnA12SVDqai4sbXPJhDYzhX) |
| 40-sender-mid | only version | Sender | 200,000 | 467347970 | 4 | 215,001 | landed | [gBmq8YEZ…na5AAo](https://solscan.io/tx/gBmq8YEZuxKPWuMfaSBJkivy8QGawb4AuUVL2Tkg9iCDTrTbf139gk1jLDFTx2iBn9QUsGz9rt2a9c1u4na5AAo) |
| 41-sender-mid | only version | Sender | 200,000 | 467347996 | 3 | 215,001 | landed | [37HZcLCv…cDbtkt](https://solscan.io/tx/37HZcLCvmSUqGS5RVCoWybUcsjQWMLNDwwJQUhVLhbdbVC4shCFUYZJqkkijHcTN9nXxSqHQmF4c2yqRrscDbtkt) |
| 42-sender-mid | only version | Sender | 200,000 | 467348033 | 3 | 215,001 | landed | [Aqq2zmGv…KZzX2m](https://solscan.io/tx/Aqq2zmGvbKkpibQLLHyBdMqiNiCCfjhnzNMXsLxy1uTpZgsVNMZgxNah1EA7amG2shZu3gcpGqMXXR1CYKZzX2m) |
| 43-sender-mid | only version | Sender | 200,000 | 467348048 | 4 | 215,001 | landed | [66TkKvHK…HMGYSn](https://solscan.io/tx/66TkKvHKCoKZVYBKPymgkSwmyWN9DibXRoAZ7f32g6vdCiJUvjYFSAoZSQh6mfuJkcj2x49LEJggqrXCBaHMGYSn) |
| 44-sender-mid | only version | Sender | 200,000 | 467348074 | 5 | 215,001 | landed | [3LAqPS7U…TXJZMv](https://solscan.io/tx/3LAqPS7UmREts9QtomB6jYzwvxMstohRr9jM5aUVqKjPaYtA89RSSHAy62kUwqMQGHJKu143n8BKg1VYZmTXJZMv) |
| 45-sender-mid | only version | Sender | 200,000 | 467348105 | 3 | 215,001 | landed | [21nLXiPQ…x2y3er](https://solscan.io/tx/21nLXiPQNsokfdzWowFfAfbC3qgjBfndSi32kib7LR7vV5EgEHwkvJiPnm9ySHckmYnbDjXjVsDxyU9PeXx2y3er) |
| 46-sender-mid | only version | Sender | 200,000 | 467348125 | 3 | 215,001 | landed | [L9RwAeeh…jiZD28](https://solscan.io/tx/L9RwAeehiy9kmswFseyr7fvMsxADKsYL4w6ELUTXDFnY5K3iYQfjy7ZYgx5Lz28tK13EJkrakvXySY3fSjiZD28) |
| 47-sender-mid | only version | Sender | 200,000 | 467348179 | 5 | 215,001 | landed | [4pNZpwEf…3NPwSA](https://solscan.io/tx/4pNZpwEfpJUaRFmmfVtnazm3kcvXVznxKKSKfGF6vqV21bc8F2GtyYGoxtXzhm45K4pMDSZRPwdnE6uUMg3NPwSA) |
| 48-sender-mid | only version | Sender | 200,000 | 467348194 | 3 | 215,001 | landed | [3Fm9HLMU…8ygjPg](https://solscan.io/tx/3Fm9HLMUzH6UKvFLL6MMYhd9rvvm11djCfc21q5RpFDSocELbLytU3guj1n4hxNBgiVi3752HPVuuSEGb8ygjPg) |
| 49-sender-mid | only version | Sender | 200,000 | 467348220 | 3 | 215,001 | landed | [UnombVNz…BGdgWf](https://solscan.io/tx/UnombVNzhbwTbmEasQtk1EiqeB3fNouMMqPG8LSEPm9VhS8EkWt7o2yP4jn7haEshB1k31zhXBcaApAgPBGdgWf) |
| 50-sender-mid | only version | Sender | 200,000 | 467348247 | 2 | 215,001 | landed | [SbbQsek1…QyKFSx](https://solscan.io/tx/SbbQsek18YMkkP7HCEqkRHHoe8VGGA1ndq8GQeUcVSeaxyrm5KY9ArjgapCiMxxdU24L7pAebxEqLt4YZQyKFSx) |
| 51-sender-mid | only version | Sender | 200,000 | 467348264 | 3 | 215,001 | landed | [4q4ipuv5…R3u2ki](https://solscan.io/tx/4q4ipuv5Vc7ajHEKeTHEzxJV3ZtKZvikgtkbU6LfsExzwZhxQhiMniuVXaupwJmSh5kiZJ1hS9WZYTbmAAR3u2ki) |
| 52-sender-mid | only version | Sender | 200,000 | 467348294 | 3 | 215,001 | landed | [4e74CUQK…qDYfco](https://solscan.io/tx/4e74CUQKwDh136ykf2pqubRQQuAuHNkuhBLpfHBSpcV3e3MCgiMN1FK1giiQeytkW59VQsDoSAatVtTAQBqDYfco) |
| 53-sender-mid | only version | Sender | 200,000 | 467348346 | 2 | 215,001 | landed | [TFChbxDz…JwXfgh](https://solscan.io/tx/TFChbxDzXBVYzVxRjVPbKo5rJkKRv9zN5xmBSiDnkYDMidD5Cb1J6dYiuCofEkrw23do5yrMYp8wyxD31JwXfgh) |
| 54-sender-mid | only version | Sender | 200,000 | 467348372 | 3 | 215,001 | landed | [61P8jR34…1nLHBz](https://solscan.io/tx/61P8jR34JhzymXtdUvPR5bQ6gU23TktUSq3FoCiCWfE1YwPFPjcZMMKPp1WQtXSASc77Q91Lfinmxnm73o1nLHBz) |
| 55-sender-mid | only version | Sender | 200,000 | 467348403 | 3 | 215,001 | landed | [2ymQhTRP…ggVeAR](https://solscan.io/tx/2ymQhTRPo6sNvDRKBB2bpE1R2Tn3HfGEiWZkqZYmqxEmsMJQif6KA2tv6fD2g5BYto5BEPAmq2Coi9XgwwggVeAR) |
| 56-sender-mid | only version | Sender | 200,000 | 467348422 | 2 | 215,001 | landed | [4zp83HsP…xwdiuN](https://solscan.io/tx/4zp83HsPFoC7absW8yJHHjd1Gx7Dk4f2KPsZMguzSmKnaBCmxXZ4HqamC6egmnZ2K2SXUmTNMTKVA7LQLFxwdiuN) |
| 57-sender-mid | only version | Sender | 200,000 | 467348442 | 2 | 215,001 | landed | [2hm27i7c…dPG4wj](https://solscan.io/tx/2hm27i7cBtDtRN8ujZewRaijGi2PvaT5YNPBsb7vmBYw2uqvSjoASPPaAZ31sCVV9DXi8hcwR4N8af3j3ZdPG4wj) |
| 58-sender-mid | only version | Sender | 200,000 | 467348488 | 8 | 215,001 | landed | [5TiL226R…VPv82b](https://solscan.io/tx/5TiL226RJ9JBNtSPfyzz7TQrngSSncNiS9kcYrrnmsqAVTWUqHeQ5do89S5CdYVSQm4ejrjvEFUVHdi1HXVPv82b) |
| 59-sender-mid | only version | Sender | 200,000 | 467348514 | 3 | 215,001 | landed | [1KMwdb23…wWHRcb](https://solscan.io/tx/1KMwdb238KD6zRyfqzDT4pWHPXFJvRjFEJ41Hg66pQxT4ePYMynaudD2FAP6bmGWeHDnKb7jEDeHnutMwwWHRcb) |
| 60-sender-mid | only version | Sender | 200,000 | 467348546 | 12 | 215,001 | landed | [3EvmoUkb…FLYxAt](https://solscan.io/tx/3EvmoUkbXo2JJ1VHf6iXjMQV1drDQrF7dQVZvFwmL1YvqMVE5qhCNHhcNFkP1ECB46nDbMzwh5opfRSE3rFLYxAt) |
| 61-sender-mid | only version | Sender | 200,000 | 467348573 | 5 | 215,001 | landed | [5Z6mAPJw…YxAP5F](https://solscan.io/tx/5Z6mAPJwECojpthaFofy1SvGQNusoHiGKcbJTXiVB8SDVQZ8wqwyURS8ctBVqZpGmPqn3Yacao72QwrZ8aYxAP5F) |
| 62-sender-mid | only version | Sender | 200,000 | 467348599 | 3 | 215,001 | landed | [49F57tTz…5rwes2](https://solscan.io/tx/49F57tTzM3PYHd6RnsH99UhPsLrprQYWPZjR4XEZTeJ24YaR87CRbSKXe4E55687sRkLYQaXX1YtLHAPGD5rwes2) |
| 63-sender-mid | only version | Sender | 200,000 | 467348610 | 3 | 215,001 | landed | [61imjfQ1…FxRSBA](https://solscan.io/tx/61imjfQ1tfso7FNDiGwLw7Sr52ocGA1tFjxwbh6fmBC9CMRYWYn4p8r2ruksiwKkAY2DgJm8m7UwTK3t1AFxRSBA) |
| 64-sender-mid | only version | Sender | 200,000 | 467348661 | 4 | 215,001 | landed | [3wDBunxY…246tCC](https://solscan.io/tx/3wDBunxYGjis7xuKCu7jWWGYTuKw2b9jdmVoEh3EjQcNzghevY4zYNdvcBc5PZatAcgC2xi6GCUcUY6haN246tCC) |
| 65-sender-mid | only version | Sender | 200,000 | 467348691 | 5 | 215,001 | landed | [52KZhwv9…QoRbTT](https://solscan.io/tx/52KZhwv9RHDRLY37MBAoJbxa87TqfWpgxnxNv4MLLJeRLCcd7oLpngJQ2BNzMxAstEuiKxzPJHSDpifqfSQoRbTT) |
| 66-sender-mid | only version | Sender | 200,000 | 467348716 | 2 | 215,001 | landed | [5CdJ48vP…CWBNEb](https://solscan.io/tx/5CdJ48vPaGU4csHxcSxgbAeGy6dgRWX65MaMrK4R25trXQ8cMGB6bbv6Jnv1d9n6Z6fvs9SpQGkyrKBqSACWBNEb) |
| 67-sender-mid | only version | Sender | 200,000 | 467348748 | 3 | 215,001 | landed | [2fTcTopE…vNQY9U](https://solscan.io/tx/2fTcTopEtQHHVnJP2r9Foa3vYG7SR8wT9X5C5D1qcuvezJVba4gnLYudtNCocn5KeJfhs6hZivfV6VZwEvvNQY9U) |
| 68-sender-mid | only version | Sender | 200,000 | 467348752 | 2 | 215,001 | landed | [3BCDhRjp…fxMWQv](https://solscan.io/tx/3BCDhRjpkAnyv7hnReNAtuNquG7tbZu7qfNxKLxmufx3yxfiUhC749bszbWx67aEyi7PaewwkG2CtB8fj2fxMWQv) |
| 69-sender-mid | only version | Sender | 200,000 | 467348789 | 5 | 215,001 | landed | [YHDqXZ7s…7Skjxi](https://solscan.io/tx/YHDqXZ7sjGCr254VtT9mQjprpmYmk18KPkYf9kQPo4sXXBtn2ijMje5Sya4ZzTDmZDiWAABoH439LHHW97Skjxi) |
| 70-sender-mid | only version | Sender | 200,000 | 467348802 | 3 | 215,001 | landed | [3tbdeWSC…GTVf2S](https://solscan.io/tx/3tbdeWSCyxJfvxMApt8Q7i9H72NySeEej3wZtWn5KcbPuzoKCqtgbLQ6FaiJRkkCqgCMSJ3HDSKJt2RqzwGTVf2S) |
| 71-sender-mid | only version | Sender | 200,000 | 467348828 | 3 | 215,001 | landed | [5prs8iB9…MVRGc2](https://solscan.io/tx/5prs8iB92EiEvJmsjEibNYbH14AwfC84VcWjkt4pK1x3gjijXFERqDNY3CLAhwuEgBS1oUHJwQj6rEaxfmMVRGc2) |
| 72-sender-mid | only version | Sender | 200,000 | 467348859 | 3 | 215,001 | landed | [JpPujbyE…mf4PEY](https://solscan.io/tx/JpPujbyEF4ce9o5NskQXawCi4pKbRLPTYSCC5VJQcXymbaxJgzAnr2PTL7NRW35nu6egAHe3FYX3ue5kumf4PEY) |
| 73-sender-mid | only version | Sender | 200,000 | 467348894 | 2 | 215,001 | landed | [2aw9gMKg…V3CVTU](https://solscan.io/tx/2aw9gMKgADXDrac3Y5rSFoNXa2Kovsdgapu56eM2ZcFkjVgCt5XjVkEMh4JUQ1DURPAWfqr1nsdu7TnsskV3CVTU) |
| 74-sender-mid | only version | Sender | 200,000 | 467348940 | 5 | 215,001 | landed | [4VuSc2PF…zZZVE6](https://solscan.io/tx/4VuSc2PF5mvQcU9nTawNSRdZNwfcCghC4fgYcvzM2uYZ9MUmicQ6tUqSpc78ZS4DUTFwHWtKf3x7DFG9wfzZZVE6) |
| 75-sender-mid | only version | Sender | 200,000 | 467348955 | 2 | 215,001 | landed | [4WrckG5d…j331yZ](https://solscan.io/tx/4WrckG5dW1jGSaZij94U2Ke5bXe4K6tKrcYcmbSvBU3afvZtGMfNyBh5oPQ9dfQEw1CqdCZBNENZ5pQ3eZj331yZ) |
| 76-sender-mid | only version | Sender | 200,000 | 467348971 | 7 | 215,001 | landed | [2vq6gfbi…MM5LD5](https://solscan.io/tx/2vq6gfbidHCY9cSxAXrRQiRcwKXTjJ8dSKkQ1E7BUMPuXrDrLupqr7mR7jAtUmSpNfqSgkeX28HF6JN3RnMM5LD5) |
| 77-sender-mid | only version | Sender | 200,000 | 467349026 | 3 | 215,001 | landed | [4aYSiuDi…sfiLvD](https://solscan.io/tx/4aYSiuDiQ1CziujgfsaAjYWuz4uGSZkPXsNdYU8eaWmZzViVXXe6XphGfHC9D8zki4in4iDLNuXuJAXQKJsfiLvD) |
| 78-sender-mid | only version | Sender | 200,000 | 467349051 | 3 | 215,001 | landed | [4dPsA3dr…Uxeaqi](https://solscan.io/tx/4dPsA3drkodNMT9ZtGPTpUUJFqFSo71gjsB5yUA6EfQCJt33iVpmVi7Pjx9gfjK8whK67jqFdwXMN9NPPnUxeaqi) |
| 79-sender-mid | only version | Sender | 200,000 | 467349062 | 4 | 215,001 | landed | [3YTxZFb8…5QyfxF](https://solscan.io/tx/3YTxZFb8DzL8iHAap7kVBvfXece3dj4K5g61AUHWbq1kacsqqREGtBn7s9PdhUUaujESj6WQrYkdwZyAnq5QyfxF) |
| 80-sender-mid | only version | Sender | 200,000 | 467349091 | 8 | 215,001 | landed | [568wkPwo…VNgm58](https://solscan.io/tx/568wkPwoyUtVqEBSSo9h88kJbk4bKriRAgRyYK7Wnu3eMAhQU8gxWb5E4tmef58igvfbJzqDDdzo2fM6QFVNgm58) |
| 81-sender-mid | only version | Sender | 200,000 | 467349118 | 3 | 215,001 | landed | [539nY9ui…YH5R1g](https://solscan.io/tx/539nY9uipDyE6DEh7ZBvF9bT75QPdCNGVr4tETkg2QAoaZ4tcw5TXXzybRhmF9aM5StWGpswCDozjPxZ2RYH5R1g) |
| 82-sender-mid | only version | Sender | 200,000 | 467349156 | 6 | 215,001 | landed | [5PSVTNQQ…qekK8V](https://solscan.io/tx/5PSVTNQQmrwNgUmLKJBfiBuMVVnWMHFTKy6LzAExasxQNs3qfPV4h65N4EdW6ktY4Bsgz4rh424h87NtxvqekK8V) |
| 83-sender-mid | only version | Sender | 200,000 | 467349183 | 7 | 215,001 | landed | [fLUbUipS…CUKYEL](https://solscan.io/tx/fLUbUipSzMrM7FnvQzmnqYShwsdmrLkyLMvPKDMLeLMX5duDsPXkZnQoPtSDaVUc3iWG9Pa83b1veDyNLCUKYEL) |
| 84-sender-mid | only version | Sender | 200,000 | 467349209 | 6 | 215,001 | landed | [4DkGZkRe…cewJQC](https://solscan.io/tx/4DkGZkReneneXbRSDKUEfJYA9r1yKFjQMURKYCkYYX1mGdLBe9fuaHuQ47dPqctBM7q7TSwXSDusUUb1qCcewJQC) |
| 85-sender-mid | only version | Sender | 200,000 | 467349228 | 3 | 215,001 | landed | [438tgdwP…WRQxMJ](https://solscan.io/tx/438tgdwPX3qYDiT7feRGTnnpfppKuxyCobnA1i7wwad4nHpRUVVcv5x3WvfS1J6G2yGWque3MJPmYKtmMfWRQxMJ) |
| 86-sender-mid | only version | Sender | 200,000 | 467349255 | 4 | 215,001 | landed | [3bSfP8Sr…NajYjk](https://solscan.io/tx/3bSfP8SrgPzmk2t9KbeTDX1Aj3SQWp2Wo3ieUNbNoMRwmKT8uJq8nneuK1yyyzG4AK3HdNbWwHS1PUcyBNNajYjk) |
| 87-sender-mid | only version | Sender | 200,000 | 467349285 | 2 | 215,001 | landed | [3kwLPtaX…r7iKwM](https://solscan.io/tx/3kwLPtaXVWEY6hKoCJaUnWxHbuXeHFNjtuV6XqXwKTRe61Ff8fKWyLWPYWGUbJ9oEfs8uHEqd42R72xJ9gr7iKwM) |
| 88-sender-mid | only version | Sender | 200,000 | 467349305 | 5 | 215,001 | landed | [3QhqP8q9…SLAmFv](https://solscan.io/tx/3QhqP8q9x13wi9cEVFKypheezPSpdsH4FbkvVW1jutTg5Ag5Fy8Swj54zFCjFaqcw9TPnxjjSr9ABUvvQGSLAmFv) |
| 89-sender-mid | only version | Sender | 200,000 | 467349355 | 8 | 215,001 | landed | [5gNSXvNS…M3RzwZ](https://solscan.io/tx/5gNSXvNSFEknbaHHjxRtf7wmQ2xbfL3oKcv7p65a82cppKANiRDMaMGGcj1xZgwWsQnjFvP6RQ5YEJPEkLM3RzwZ) |
| 90-sender-mid | only version | Sender | 200,000 | 467349361 | 2 | 215,001 | landed | [4ECZQBEb…8X6Cx4](https://solscan.io/tx/4ECZQBEbwFBtmqSXhSBFSFpqraLEPKgEe1izskcLdx6JWN5PVcr3wjJJzNqVJCvLm17g3RxviKfa3t9PQP8X6Cx4) |
| 91-sender-mid | only version | Sender | 200,000 | 467349387 | 2 | 215,001 | landed | [4t3CFzjt…rF1Xh1](https://solscan.io/tx/4t3CFzjteRWpxk7hsPjkGhfKA2Sdgg6dUYZemHziox8wJEdsqJEcamFXj1wF4wFCqPGScbnXZHWFBP14wErF1Xh1) |
| 92-sender-mid | only version | Sender | 200,000 | 467349434 | 3 | 215,001 | landed | [56GgmFph…dNUaHy](https://solscan.io/tx/56GgmFphZ9dir21b7pa8Yka5dz8JvCbqurb6c2C6KwNSDv5KHf1fpvpj9WMCM9TZhE3JRYf8jJpnpaR7cVdNUaHy) |
| 93-sender-mid | only version | Sender | 200,000 | 467349449 | 4 | 215,001 | landed | [Xzj4X3is…2CCuF6](https://solscan.io/tx/Xzj4X3isCWFDhohZdUVPhzPmbRCCRiVvrg68uqZcCRHKRmAUWevJBzNxFfq5ZZsKxLvMeMc6EqM5sVKjP2CCuF6) |
| 94-sender-mid | only version | Sender | 200,000 | 467349480 | 2 | 215,001 | landed | [b6JbU84e…iBMw4e](https://solscan.io/tx/b6JbU84eYANTUULBYP4NBnUvo9bAVaEKybrXqryfrmz4ku7dqp8ccg7W6ueSc3BoQxxNaCQ88MdQhGvvgiBMw4e) |
| 95-sender-mid | only version | Sender | 200,000 | 467349507 | 6 | 215,001 | landed | [5odnevrS…FHepRm](https://solscan.io/tx/5odnevrSNhsy71oshGhTXdyiRHLJ2t149YQ4c2868goYgpEdwMyMt3qeZUovsiT4A2RepAG1LqMdVkzWQCFHepRm) |
| 96-sender-mid | only version | Sender | 200,000 | 467349553 | 2 | 215,001 | landed | [28Bp5HTV…arCund](https://solscan.io/tx/28Bp5HTVfo86XDKpQiNHLDzcEBv93ShYptxrjesWg6KQbuW41NhdxKFawnYRSpczoP5DVK61zhLumHN2TharCund) |
| 97-sender-mid | only version | Sender | 200,000 | 467349569 | 3 | 215,001 | landed | [2THz1T1c…m7hrRE](https://solscan.io/tx/2THz1T1c4dRBt96sTySdAGiCTrp3ukhgsrc55N8dHECLCq8XrJAEtaWS6u2wtuhVhhU67qP7YJ3qBpjrc5m7hrRE) |
| 98-sender-mid | only version | Sender | 200,000 | 467349612 | 2 | 215,001 | landed | [34YDkXac…1VJiEk](https://solscan.io/tx/34YDkXacfm3NZYeJNWXpnEvbEnPHSvGhcVDnKHnR11AAgZcdhAe91iuMPjTXPWj6fbcjDysVBQo2Lmr8EJ1VJiEk) |
| 99-sender-mid | only version | Sender | 200,000 | 467349627 | 4 | 215,001 | landed | [3i6YRNqZ…G5R1ys](https://solscan.io/tx/3i6YRNqZTLF9nacubfzWCBdHszkAtoDaoCVaA4wahKKJBFGUB8x1L7ks7RjGwEMaR4yJLDNWfaXvCjVD4WG5R1ys) |

</details>

<details>
<summary><code>sender-max</code>: 100 operations, 100 transactions</summary>

Helius Sender Max: tip 1,000,000 lamports (0.001 SOL), the tier's minimum. Every path plus the priority tip buffer.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-sender-max | only version | Sender | 1,000,000 | 467346794 | 3 | 1,015,001 | landed | [4pJaScfq…xVeMza](https://solscan.io/tx/4pJaScfqHr3GYBzXXJUuvF1bH7SyiGEyLAWm1EAv6tuBZN2uu5JZz8m2qCbqUqUvekCcxpsSZwZTwXVjGQxVeMza) |
| 1-sender-max | only version | Sender | 1,000,000 | 467346836 | 2 | 1,015,001 | landed | [3XxYyL57…CWfYUu](https://solscan.io/tx/3XxYyL57tNQj6Fq7HtPt4XWgTm9p2pR36RUM1Stgc9PQDzgPhRXq4rWkd3cNLFxVd9nmgt97fzZfsg6JXtCWfYUu) |
| 2-sender-max | only version | Sender | 1,000,000 | 467346857 | 2 | 1,015,001 | landed | [5me4HHN7…kagWkj](https://solscan.io/tx/5me4HHN7psj3wu1pkH1QpzAyDhacfEAut5tB66Mi8MC6XpLBSssX9kWpwm5FVwK54pfE2y6muewddCrVAXkagWkj) |
| 3-sender-max | only version | Sender | 1,000,000 | 467346898 | 5 | 1,015,001 | landed | [QSyxqTnH…f1E7KR](https://solscan.io/tx/QSyxqTnHp4wK9NsEPgTcyWzcyQDFrCMxmSHSFT8GKEL8V2fyKBTyUGTGRPSsm7XcPv1hYs67Z4b6pzTzYf1E7KR) |
| 4-sender-max | only version | Sender | 1,000,000 | 467346928 | 3 | 1,015,001 | landed | [4Gn2pBH4…jNbqkb](https://solscan.io/tx/4Gn2pBH4cySsnnjTsrfBRXUtknpoGrt4Ms4TTWhpXRpc7NEMor9d5u2vKHxcRzsCH9etURyCY3dsE1EEiMjNbqkb) |
| 5-sender-max | only version | Sender | 1,000,000 | 467346950 | 2 | 1,015,001 | landed | [3fK9Q4cU…S6wuTz](https://solscan.io/tx/3fK9Q4cUphu5AzMQCr6ZFidpxPDVF8jg9rHBTz6KM4SdynkYDZiWFF8c3qoTdW4YuUmtEFPSHWabGtBW4kS6wuTz) |
| 6-sender-max | only version | Sender | 1,000,000 | 467346991 | 3 | 1,015,001 | landed | [9N4qXd5w…GKHZcR](https://solscan.io/tx/9N4qXd5wvNBmW7cv3KACiAGebjaFTG8pkRUwEPGJbzM3dDqdmVn82z5WEwwLfk4giA4ABDWmADTYfhsghGKHZcR) |
| 7-sender-max | only version | Sender | 1,000,000 | 467347016 | 5 | 1,015,001 | landed | [4g3RVA8W…4syU9i](https://solscan.io/tx/4g3RVA8WZxAgA3B2qJR59cJrqMf7ZYxZwmPyZ5BLYwRoiuZ4mKpSgJTxJ7M6r4MuPsZ9h2TbmhhuiofghB4syU9i) |
| 8-sender-max | only version | Sender | 1,000,000 | 467347032 | 9 | 1,015,001 | landed | [2CqC5bGA…7YdyJ5](https://solscan.io/tx/2CqC5bGAakFHyaCN99KZdpNb18YqZT8rNJvsEYh69JCVrFu4zSDqzaSYqaqtJFSk5Jh1wd4gYC5m1dGHTR7YdyJ5) |
| 9-sender-max | only version | Sender | 1,000,000 | 467347058 | 3 | 1,015,001 | landed | [3n5dTKpT…m5jxqZ](https://solscan.io/tx/3n5dTKpTXkh16kwdc2mrs8PFUno6nSNamxfRY2TBJKyV9qj4yFwnKU7fNLPkNDToEdQosyB8dksFjK8bmhm5jxqZ) |
| 10-sender-max | only version | Sender | 1,000,000 | 467347089 | 3 | 1,015,001 | landed | [2Ly91xH5…oTmtmW](https://solscan.io/tx/2Ly91xH5cieCGZahsaLjjikLMSe7mp5kX2MdVrbcJi4Atb8eqd7c9xzUUTmH54E1byUznkaxxpM7DHqgehoTmtmW) |
| 11-sender-max | only version | Sender | 1,000,000 | 467347111 | 4 | 1,015,001 | landed | [2jUVwZVg…C2Rsu9](https://solscan.io/tx/2jUVwZVghamGK2TR5UQnt7R5NScwpnfBtMbVpQ73APRm5QxQi5QGwQv1KptP6Q49aHnGZFJTd29ekjTxSDC2Rsu9) |
| 12-sender-max | only version | Sender | 1,000,000 | 467347164 | 3 | 1,015,001 | landed | [FMbGW2pH…HJzzFf](https://solscan.io/tx/FMbGW2pHQakK4TdR2j6erhDq6MTgDNQQsbRYJHb3rxixp3CiupZWVn5qUNzovqTNReJprAdKLoMTVLSAiHJzzFf) |
| 13-sender-max | only version | Sender | 1,000,000 | 467347169 | 2 | 1,015,001 | landed | [55nwh81r…9trACo](https://solscan.io/tx/55nwh81rPQ3TEpLVYNVdSVkQmk69pZkNk8ibTpswvDCN5J6Kks2nw6FbfDHGdYYcj78Frf5ttCEqCYC9un9trACo) |
| 14-sender-max | only version | Sender | 1,000,000 | 467347196 | 3 | 1,015,001 | landed | [4BWic1AX…wgNeme](https://solscan.io/tx/4BWic1AXdCuTAtQbdP5Seyt4JYHci3qijqdL61eA8qZNtgFAYWsvD9UMsdtkwUTmYBL6C4rDkSvpCLa6bzwgNeme) |
| 15-sender-max | only version | Sender | 1,000,000 | 467347249 | 2 | 1,015,001 | landed | [oMTq2Mmc…5VTRu9](https://solscan.io/tx/oMTq2Mmc8dGyhiHfDgHLxsVQQmVk4DsxTkewfJFC1GSvucHzJVXxgyqFZoHMhWRDUH95mmSXMBoiMaCx15VTRu9) |
| 16-sender-max | only version | Sender | 1,000,000 | 467347270 | 2 | 1,015,001 | landed | [5Bj838oX…7vPgyW](https://solscan.io/tx/5Bj838oXYQRAF4JhSfSkS6bFBy1dHdbD1fJzZirRQ5ZuBcTLYMd3UQsafwqKhogCEijqTKiWmVsExnYWYk7vPgyW) |
| 17-sender-max | only version | Sender | 1,000,000 | 467347292 | 2 | 1,015,001 | landed | [3sHjbcks…7mvHqe](https://solscan.io/tx/3sHjbcksTas6y9BLStsds4cer49uufpue83W9uJZtfiCrqjeukvFNYyYfXsvbEseMkR6sgyGiD5BYSzAgo7mvHqe) |
| 18-sender-max | only version | Sender | 1,000,000 | 467347308 | 9 | 1,015,001 | landed | [5qYuc2uc…YH2kfY](https://solscan.io/tx/5qYuc2ucdz5QKpvGJBiG1vPbrqzqiS9vZpsjUiA5ngAeLTCZSnGL41BLznj7Us8sAgQSVM6Rpvprd5et9kYH2kfY) |
| 19-sender-max | only version | Sender | 1,000,000 | 467347361 | 4 | 1,015,001 | landed | [SZwzLvxx…CTzcXm](https://solscan.io/tx/SZwzLvxxEGg2o7YAZ7yeoFTPt1aHUvHA259rjvjSztDjUP3b5gq2agKFzARjHndoWSCZQSNS19xyo5pLWCTzcXm) |
| 20-sender-max | only version | Sender | 1,000,000 | 467347371 | 3 | 1,015,001 | landed | [516Rggt8…c3HhpA](https://solscan.io/tx/516Rggt8hWHqqkTb63e97wxhmBsUhwdsFUjNxue3hjXkjkRFtZ4H7B9pynKHzhu7eskSyAUkPgS5UYpLK2c3HhpA) |
| 21-sender-max | only version | Sender | 1,000,000 | 467347396 | 2 | 1,015,001 | landed | [3PdW21nN…uJcyYS](https://solscan.io/tx/3PdW21nNnrHnxfpotFsGv9Pi7eKUnonKhhZ1bi2vhECxkk3BxoxhiJkG9W71RJDyJ11sNyxw2KHKF7UTxFuJcyYS) |
| 22-sender-max | only version | Sender | 1,000,000 | 467347424 | 2 | 1,015,001 | landed | [4i9c9NV1…JvMZ37](https://solscan.io/tx/4i9c9NV1MFCPPKFUGu5gRdhTWkznx6y7JJeR1GSLmcRk5TSbU7GGZyzMUDY2fu9nkiZpfUb2Kf76p4e9UbJvMZ37) |
| 23-sender-max | only version | Sender | 1,000,000 | 467347453 | 3 | 1,015,001 | landed | [2NCtXvWf…QJvxma](https://solscan.io/tx/2NCtXvWfSdvr6kg6mkkymqk4E99gaUihJ1B9xCzKqERTffrpLjoGkBQQPanzYjTVQk53m3V9kDDVdsSFx5QJvxma) |
| 24-sender-max | only version | Sender | 1,000,000 | 467347501 | 2 | 1,015,001 | landed | [3i9mo8Dn…HyetDV](https://solscan.io/tx/3i9mo8DnFanS3ucmYHf9TbDPeh6FJY6ZiwWGqntQBcgqvmTNGbzbRXfesCWXoNsQgcDuApC73czadaKq4HyetDV) |
| 25-sender-max | only version | Sender | 1,000,000 | 467347522 | 3 | 1,015,001 | landed | [484vpCzh…snBRu7](https://solscan.io/tx/484vpCzhbsj4kmahhEYsQBPReEjaEeJnoDpnKpbN1XWtXCEMStksUTQYj2qWuiimzJGufEt34YRGeBvjmJsnBRu7) |
| 26-sender-max | only version | Sender | 1,000,000 | 467347553 | 3 | 1,015,001 | landed | [2BHeNP2Z…4LqYXF](https://solscan.io/tx/2BHeNP2Z9HuRnJ7TCPxGr7m6poqo1AbySzpUAp9yCktT53Q1mA8Lm6PDmahRaa5HPXiiUAZsLJvZTK5aKS4LqYXF) |
| 27-sender-max | only version | Sender | 1,000,000 | 467347595 | 4 | 1,015,001 | landed | [D8Q7sQjY…48JZZF](https://solscan.io/tx/D8Q7sQjY5VFN2AsT95F6j3gb1uD2PC1J5UJHMdqcGg1AqrFmpfXLSJsPrMpHW2tSYht5VuogPpxgQrvE448JZZF) |
| 28-sender-max | only version | Sender | 1,000,000 | 467347627 | 3 | 1,015,001 | landed | [LvreYipg…FX9YjA](https://solscan.io/tx/LvreYipgrFEgb6aHn1ELbRJ5n6yyut1ZGL3eC7T9JGwLRvvPPGvK7EYqqVpkvgZHYHouYcEUCMNHHxCiGFX9YjA) |
| 29-sender-max | only version | Sender | 1,000,000 | 467347652 | 3 | 1,015,001 | landed | [34N8ZXGT…P6ENb4](https://solscan.io/tx/34N8ZXGTk3N2jUkiYtwskm4WsXtnTjeEDWbbSFfnJwPocbtre5b3fkAddESZCmkLccEGAfUzqujxxwNUoeP6ENb4) |
| 30-sender-max | only version | Sender | 1,000,000 | 467347678 | 4 | 1,015,001 | landed | [5XBhnAck…UJid4y](https://solscan.io/tx/5XBhnAckgSMQuUiEpdMkcFJ4toBes1W3kRe55ReYdPM6qc9hBg6Msk1WBqdkjdtCJyDn2f9oZQaxnqtfaNUJid4y) |
| 31-sender-max | only version | Sender | 1,000,000 | 467347713 | 7 | 1,015,001 | landed | [54n8XzGa…RM4ewS](https://solscan.io/tx/54n8XzGaREFtoFyTsxj6Pd8ySQvfatr4yHKMjFcE8hGsiqGiRYEhY7vHq1chGQiRrb3aRA7jg5QN1a764ARM4ewS) |
| 32-sender-max | only version | Sender | 1,000,000 | 467347737 | 4 | 1,015,001 | landed | [57kYdRQo…UGoDiN](https://solscan.io/tx/57kYdRQoTeDEHLtDi1hUhhmU8MWHtN1Pk1HW6zNUytb6pHZEWgv3DpcrJ6CnmMVUouAetCpRWN69nbXus1UGoDiN) |
| 33-sender-max | only version | Sender | 1,000,000 | 467347763 | 3 | 1,015,001 | landed | [5CUrX8BD…1MwUUv](https://solscan.io/tx/5CUrX8BD1SrHnZP6VhKnooQ598m7kFawMa2Si8DpkP6tqix4pMcjzau43m6n8MikjWkrwBXBfAwrxUemNL1MwUUv) |
| 34-sender-max | only version | Sender | 1,000,000 | 467347785 | 5 | 1,015,001 | landed | [5h9J7ZSy…EiGHsp](https://solscan.io/tx/5h9J7ZSy3R4C9NWpxW1fay3jW3XqwM6Hp2ef2EmEjwdfMjDMZqSFKaXaYEbgMm3wYdEmDx7XJuFuYqpBMWEiGHsp) |
| 35-sender-max | only version | Sender | 1,000,000 | 467347805 | 2 | 1,015,001 | landed | [yXqaXzY4…akfwd8](https://solscan.io/tx/yXqaXzY48swb16K5BN3vf11HbFtCcyjXKpnsYwmS6rFGXRG4h8Rawq91LZp1wknNCjy88TYzVTFBUV1jyakfwd8) |
| 36-sender-max | only version | Sender | 1,000,000 | 467347847 | 3 | 1,015,001 | landed | [21hgQaeJ…Y4WvzS](https://solscan.io/tx/21hgQaeJXv7Gz1kAvQ19wFdsHVKL5KAtM1wnMaxWp4VbyY1uVgPq48YiuUGrhK2bNtUkkpJ66KZ6sJFLMfY4WvzS) |
| 37-sender-max | only version | Sender | 1,000,000 | 467347874 | 3 | 1,015,001 | landed | [5cBC4hhZ…1a7bzT](https://solscan.io/tx/5cBC4hhZswYuCkLoBVcvHjrCSxrbtUqoMHcFMf4bKWFuSkoCL9Md38wqHEXZetwPQ3Sdx6Dm3uzS8A725r1a7bzT) |
| 38-sender-max | only version | Sender | 1,000,000 | 467347885 | 3 | 1,015,001 | landed | [4qMgUkr3…Jn24P6](https://solscan.io/tx/4qMgUkr3YnSPFJfZSW1dSH4XraFKWjAUD1R3mGCcWUkvM812aJFD8PPNRPaNRiNXBqhQiSXn7TwbWvaAkjJn24P6) |
| 39-sender-max | only version | Sender | 1,000,000 | 467347927 | 2 | 1,015,001 | landed | [2qA5ZahD…aY3RoY](https://solscan.io/tx/2qA5ZahDJHT71VeS8hZ3X3WscExnURPUfBXwup8LkHZiNkfzoZNmamMS4zEz1JvKSffr9xJLVJW6mt8cfWaY3RoY) |
| 40-sender-max | only version | Sender | 1,000,000 | 467347944 | 4 | 1,015,001 | landed | [5JC51QF5…ZyqYhU](https://solscan.io/tx/5JC51QF5Qj3J1ba7U6TVpvw1F7uE22yce1JwTkps9587ctiVaSWvKmurSLxWd5anLga2RDsG3SezGP51k1ZyqYhU) |
| 41-sender-max | only version | Sender | 1,000,000 | 467348001 | 3 | 1,015,001 | landed | [4Xs3XPS4…8yxLSz](https://solscan.io/tx/4Xs3XPS4DrxBTigiT5xknGvj8Feb9oZUq86PibyHmwQ5Z6Sdcv9Qkx6c45fkuVKUeQTtS7G7HM2uVwY4Wo8yxLSz) |
| 42-sender-max | only version | Sender | 1,000,000 | 467348023 | 3 | 1,015,001 | landed | [5CjeVtTh…imf3Cn](https://solscan.io/tx/5CjeVtThKcDJ5r1Ln6rN4sd1L1VPF8SeGcQtLdf1UcjmAx9vLNk1xLDG9wMDzqUV7nUT8c3zawgTEqSw6iimf3Cn) |
| 43-sender-max | only version | Sender | 1,000,000 | 467348044 | 4 | 1,015,001 | landed | [3Ny84SHA…A4M4vg](https://solscan.io/tx/3Ny84SHA7etJGEFFgoG1gpQJKYkgB8acnbvyUMcWz5WnpksTwAiAJLrfpzg5TtwmsdwTV7zCxjgU1deyv1A4M4vg) |
| 44-sender-max | only version | Sender | 1,000,000 | 467348085 | 9 | 1,015,001 | landed | [5n5JrxqX…rbNJng](https://solscan.io/tx/5n5JrxqXZYqSpY4xrHgjEwGCXErSUsHHzY8JKzijD1UMbqTUzemvZrsR3WoZG2jshYrZbbJEvzLWbWtDeUrbNJng) |
| 45-sender-max | only version | Sender | 1,000,000 | 467348094 | 2 | 1,015,001 | landed | [3s7EKMVs…QppdA1](https://solscan.io/tx/3s7EKMVst1YVBG2bCxsuynTpYTeL31zHs73ZHcsbZmbkdbVyi1jAfXforfAygVgmndmtEbRWQ4DaHRmzc8QppdA1) |
| 46-sender-max | only version | Sender | 1,000,000 | 467348147 | 8 | 1,015,001 | landed | [25721Q2p…5fU6EF](https://solscan.io/tx/25721Q2peNCQE6QHHEAeZWUctKyRSnKdL3mWWeabFZREjKX1MMYCUSBwGqP96Pc3YqEcM7Fd29ErfPnzT25fU6EF) |
| 47-sender-max | only version | Sender | 1,000,000 | 467348152 | 2 | 1,015,001 | landed | [3UZ2SGuY…XFJUZz](https://solscan.io/tx/3UZ2SGuYx4Gq7JdnAbQgPqicqzQFZg8LZZXgARpt77GZCri9LsKBKbXFJLiyx9y7sVoK3dFShrepPv6SDbXFJUZz) |
| 48-sender-max | only version | Sender | 1,000,000 | 467348199 | 8 | 1,015,001 | landed | [3VGT1hvR…5xrRVv](https://solscan.io/tx/3VGT1hvRMxVA7qYN6SX9kUEc26VCbkh5QAW61VRQG7Ls7qaDT1EP1feAHcypdRvpFGNoEZYDCENsPUVj215xrRVv) |
| 49-sender-max | only version | Sender | 1,000,000 | 467348214 | 3 | 1,015,001 | landed | [3ydjDTf1…uYRuDQ](https://solscan.io/tx/3ydjDTf1XaRif9fGBrbKKrwCsUAd2EErUWfvrcp8xmuq5MtKaZT9pqoNFzErsDFzttJAUfPaGCRgRr3zE2uYRuDQ) |
| 50-sender-max | only version | Sender | 1,000,000 | 467348236 | 2 | 1,015,001 | landed | [3aFE83rC…ZNsQwk](https://solscan.io/tx/3aFE83rC64kqA2NcRGBvTRKyG6AEVj8ZLKCoBZxWQMQZdk42PSVkmrSTWJ1asrRMXcG4QGdAggAe57kVaYZNsQwk) |
| 51-sender-max | only version | Sender | 1,000,000 | 467348274 | 2 | 1,015,001 | landed | [i3fFpouC…1VDRJo](https://solscan.io/tx/i3fFpouCfrTkmHWARvQ8wCp1taYHVawD1vaXUY2SfEgEGm1MT1dxgEPgHGEDSgfYYYL3tngZ9VXHSGNRR1VDRJo) |
| 52-sender-max | only version | Sender | 1,000,000 | 467348315 | 2 | 1,015,001 | landed | [2aBt74n6…EuRhQK](https://solscan.io/tx/2aBt74n6KL6AoW3ux3vyRuCbDVSofG1AB8xxBbNsXzvCFKzksX1Xh2ubo4gKiqyE6jAfA1wn23f4ffazBhEuRhQK) |
| 53-sender-max | only version | Sender | 1,000,000 | 467348341 | 2 | 1,015,001 | landed | [2rfjkZN7…RdXqMQ](https://solscan.io/tx/2rfjkZN77oZrfqewHvf5VZC9arYG36yuFF7fhMohNtTRFjXE9bBz2G8fjrt97ibfqEysJpZysTnK4nMbmLRdXqMQ) |
| 54-sender-max | only version | Sender | 1,000,000 | 467348367 | 3 | 1,015,001 | landed | [2oFCAFZN…UrUhsr](https://solscan.io/tx/2oFCAFZN5mp9cominPcaGzJ34dVVpLsNLyhFkegREL9tgaNK89irekW5dmWxSkJBTp93y9y4L9qFLWkZYUrUhsr) |
| 55-sender-max | only version | Sender | 1,000,000 | 467348408 | 4 | 1,015,001 | landed | [9Y6iStKH…vTKzQ4](https://solscan.io/tx/9Y6iStKHMpppxWCqKPGrAazWxsrEz6pFX9ayW17sFp6JvYNXZ41R1sVpsYPyLRVPBVQZJDwsaFZuLbXDWvTKzQ4) |
| 56-sender-max | only version | Sender | 1,000,000 | 467348428 | 3 | 1,015,001 | landed | [4EnaqtW4…RJ4edY](https://solscan.io/tx/4EnaqtW4DtLKFaL7suRdWKbdzjCRn1yU8ExoYp1sE4iMr46BYYM8rif2QQvvyDeFCHePWaGTd59dJwwkxBRJ4edY) |
| 57-sender-max | only version | Sender | 1,000,000 | 467348437 | 3 | 1,015,001 | landed | [2hMuV5et…1g66Tv](https://solscan.io/tx/2hMuV5etjd2e8NAeUPv6xnTqjUCohdYd7zT2J8KbNFK3JUgdMTV1kesNHbUZuH7PFs9EfCFCExBdaZaBaf1g66Tv) |
| 58-sender-max | only version | Sender | 1,000,000 | 467348484 | 4 | 1,015,001 | landed | [46SbvaM4…WoiuZK](https://solscan.io/tx/46SbvaM4wiWYPfnhEdhMb2cXVTJLvuah3Y9bUWxz4siw9mGv38vNuugFfEy4To59N5LjE5Z7tWAa8dFPJ3WoiuZK) |
| 59-sender-max | only version | Sender | 1,000,000 | 467348504 | 4 | 1,015,001 | landed | [2R44CZWZ…EWVbVV](https://solscan.io/tx/2R44CZWZoGG7isVuDqzp4KfaSWZdKbNP1u7JKc5xeXfgTFicnhhEPFDJ7HEKybR7bYGADvmh7SNrkgmqzmEWVbVV) |
| 60-sender-max | only version | Sender | 1,000,000 | 467348519 | 2 | 1,015,001 | landed | [5AtzpLkV…z11p6c](https://solscan.io/tx/5AtzpLkV9jbqXWcW2AX7bK8nGF1LnyvXL5r7yNmTt3kdAh8FwmWrPDEWtYmDUEQt3AmEjKnhQnkhd6MXtHz11p6c) |
| 61-sender-max | only version | Sender | 1,000,000 | 467348578 | 4 | 1,015,001 | landed | [2MujYPxt…GRb9sX](https://solscan.io/tx/2MujYPxtKoUbPiGN5Ee7vPgJEbSQhMEUuSVhwMiJM91wzrcQoEppuwgY7XdhZooCLNjdvZKrVKE9PfHFbrGRb9sX) |
| 62-sender-max | only version | Sender | 1,000,000 | 467348605 | 3 | 1,015,001 | landed | [2yjmrGJK…w3Yf9k](https://solscan.io/tx/2yjmrGJK2yESNgJHpq41QBBeYSYoaC2pHFj1RVFynoLAbbzJ3thbgSAP7Mhfx6FnkAUWGAjagATHqznW7uw3Yf9k) |
| 63-sender-max | only version | Sender | 1,000,000 | 467348621 | 5 | 1,015,001 | landed | [3yhePWdN…em9bcr](https://solscan.io/tx/3yhePWdNSnBm8G7LHMQ3XyFyBxTvtCu6z83J4cHhtA7F6WYox4CcBeMiBDT2cKL6PBv93uvEEcUkb6fmRqem9bcr) |
| 64-sender-max | only version | Sender | 1,000,000 | 467348636 | 2 | 1,015,001 | landed | [an4Fmbqk…6hynvK](https://solscan.io/tx/an4FmbqkbigVZNyGiHetkn7qxsUWag3FrqBk3qe3V7A5eL6bbXk6i7qWwYQr7Pemkr5rZp5HggxcbbUuS6hynvK) |
| 65-sender-max | only version | Sender | 1,000,000 | 467348686 | 6 | 1,015,001 | landed | [4LkPcKac…LTz5ya](https://solscan.io/tx/4LkPcKacnVvsTm7mAseqjhRFzDYBo98pmsuW95Cmpwoh5vr9PGHTtJ79joC7Te5BBeWpuSuKMFMCHdBFViLTz5ya) |
| 66-sender-max | only version | Sender | 1,000,000 | 467348721 | 7 | 1,015,001 | landed | [3gizMgyL…i6Np1p](https://solscan.io/tx/3gizMgyLL3peMt1u81wwWukkLwzXqypZCfsdt42XZuU41j4P7YkLN5NyuCM1pnheMRaNW3xF2MtSf8gqkTi6Np1p) |
| 67-sender-max | only version | Sender | 1,000,000 | 467348743 | 4 | 1,015,001 | landed | [3M4Tgswa…KvpHBP](https://solscan.io/tx/3M4TgswaxUaiof6EvmQcBQ9onA8RczwdUyzD7Aw1R9w8YMqVSx2932itJo5bfDwo2rbWShaTHumh1yNBVTKvpHBP) |
| 68-sender-max | only version | Sender | 1,000,000 | 467348762 | 2 | 1,015,001 | landed | [4cYQP1P2…eAkyx4](https://solscan.io/tx/4cYQP1P2nXrGKNK8bXwXFNVc8KznTU1nx4SkWhUfQj8UkqkSe29Lf71eJEn3ZNwtRzPqYxGRuFh4F2YeUUeAkyx4) |
| 69-sender-max | only version | Sender | 1,000,000 | 467348793 | 2 | 1,015,001 | landed | [3Xj6RS3j…A1Chch](https://solscan.io/tx/3Xj6RS3jDWxpj3R5sykssNxqNTtFD75tQkwK1gDRkpXW9fvDSXwyV9mpn2CR7QWSVgPFuF5FVSUy9T51MVA1Chch) |
| 70-sender-max | only version | Sender | 1,000,000 | 467348823 | 2 | 1,015,001 | landed | [3XgdTFtm…zNfFdB](https://solscan.io/tx/3XgdTFtmgaH3kb6As8CUNPiX4U2qbRCprGLSyeVc8v6uoY8zGfBVWFBQVqBQvY6bMQyX2AmoQVwQam4SmhzNfFdB) |
| 71-sender-max | only version | Sender | 1,000,000 | 467348833 | 3 | 1,015,001 | landed | [3k3K6nbL…Y6VUgV](https://solscan.io/tx/3k3K6nbLKHsyqLq6HzsznXzhu1XKhbtbSCEbLciExjSiSTzQMs9TTGTBfv2jKEWF8M4VHbnwHUHTsxiDGGY6VUgV) |
| 72-sender-max | only version | Sender | 1,000,000 | 467348870 | 2 | 1,015,001 | landed | [4E9Fo3fN…ayrBry](https://solscan.io/tx/4E9Fo3fNPnnPeURwXnLQdi4DckaF5smr444SgVuZuaDnqeQJ541Cuz1w9L1tRkx6o9hk5E3oFeFaXgP4r9ayrBry) |
| 73-sender-max | only version | Sender | 1,000,000 | 467348904 | 2 | 1,015,001 | landed | [55aYEGbK…bqrAZT](https://solscan.io/tx/55aYEGbKUS2dgmEejAZzGpNeUhKyY63cZhxUZRXf74ZJBAmvmG8cZw5U2b3b42yjuxRdTBirZZdqHiYFNVbqrAZT) |
| 74-sender-max | only version | Sender | 1,000,000 | 467348929 | 4 | 1,015,001 | landed | [2jxzYRwN…hXYLcx](https://solscan.io/tx/2jxzYRwN1s14YhXi2Yr3QX731PThxkhsBiGnbKqxFSH18xGmt9cXTAiAYBW8sSJo4bbpc3mk1GGXnNqAKbhXYLcx) |
| 75-sender-max | only version | Sender | 1,000,000 | 467348961 | 5 | 1,015,001 | landed | [4BpiQhgn…tNPMs3](https://solscan.io/tx/4BpiQhgnxZQBn4qZ6i879sq73WTmZmpswqFN2M4AQ2MPhbJvkaZ2Bowu2CZeGnx6VuSFaTHmYHdLHsVXjStNPMs3) |
| 76-sender-max | only version | Sender | 1,000,000 | 467349001 | 3 | 1,015,001 | landed | [3wesbZwz…SD46oN](https://solscan.io/tx/3wesbZwz2d1AdYvPK8fP453qyK181baCiJ6KVVnxQP8M6uBdDn98ydz5Sj2SYqxuu6kH43QewB7nToiyQPSD46oN) |
| 77-sender-max | only version | Sender | 1,000,000 | 467349016 | 3 | 1,015,001 | landed | [3nq3Ye9G…uLV1KZ](https://solscan.io/tx/3nq3Ye9Gxd8Pqh5AaSVFkQCQexA3jPwvGM4PSSpVBy7raJV7TupdQhV7TTHEs1isoFSvaPr8Bj2YMMmCxnuLV1KZ) |
| 78-sender-max | only version | Sender | 1,000,000 | 467349031 | 8 | 1,015,001 | landed | [2YhNjTeB…pN5uqG](https://solscan.io/tx/2YhNjTeBAJxuNHK244XzbLWsGzRZHG3U4hKrnRAAV5keh6pTGiYhg1AjMi2eBbd7RDCEJGeZhGZQcA133opN5uqG) |
| 79-sender-max | only version | Sender | 1,000,000 | 467349071 | 2 | 1,015,001 | landed | [67N5dto4…373TsZ](https://solscan.io/tx/67N5dto4Qo9dK1VD9hvD6R2AmdC3tgyHUjH8PQKLhRfQ4pJn8a1AUsFRKsLANFYNErwnqn9svyV4gGmELP373TsZ) |
| 80-sender-max | only version | Sender | 1,000,000 | 467349107 | 2 | 1,015,001 | landed | [2esLeQXE…orcGbp](https://solscan.io/tx/2esLeQXEN3bAuFg5Dt5LcjoNiYW2gmrShz86t2KVBtoyuGNR2TmzgAUNPTCf6V1v4E5A8j7hcAdgMSoeVxorcGbp) |
| 81-sender-max | only version | Sender | 1,000,000 | 467349145 | 2 | 1,015,001 | landed | [4zvzkpuX…CvEuzW](https://solscan.io/tx/4zvzkpuXY2DwAL2Dwa8jVKkA5eGGkYbwtnn9uoTrxqTLKRUG8Xuna3R6aqL6uB6LfMBgHbGi2tEMeV8VW1CvEuzW) |
| 82-sender-max | only version | Sender | 1,000,000 | 467349167 | 2 | 1,015,001 | landed | [5JEWXba8…Wi7kYN](https://solscan.io/tx/5JEWXba88xPfz6bkax1uv8zKHW6VNV5QMfGkZBTRrX253MRED1xjMpWsvfpXDbg94LqpAwW8PxdW4Fff88Wi7kYN) |
| 83-sender-max | only version | Sender | 1,000,000 | 467349178 | 2 | 1,015,001 | landed | [2b79j9XN…CPiqXH](https://solscan.io/tx/2b79j9XNULLLcP4tpi1i5xoMAjVrD6MgnRDToWN53Je7n1VwXnT7D5Mk3XvYSDFrrgKeB3U6hPYu1qS99pCPiqXH) |
| 84-sender-max | only version | Sender | 1,000,000 | 467349214 | 3 | 1,015,001 | landed | [2QeA7yzR…pLHzdH](https://solscan.io/tx/2QeA7yzRzjiQk129ahWpQGrrtKsUZQA19Q21NG6kPyicptM7mP4LAt9DVvgaxGzXQ9YAb1g1YXGNoYCrnepLHzdH) |
| 85-sender-max | only version | Sender | 1,000,000 | 467349239 | 3 | 1,015,001 | landed | [3ayxRWLR…MxNdpS](https://solscan.io/tx/3ayxRWLRfHyAh4vwYbDKkLUFUgrbmaHhvjDYFMvBDW8t6A2mc8GLZNufTAXgKRkkhRwWG9Q1W2RioeXkDhMxNdpS) |
| 86-sender-max | only version | Sender | 1,000,000 | 467349265 | 2 | 1,015,001 | landed | [5K3azMZx…XyhAP7](https://solscan.io/tx/5K3azMZxXtC1k6HYAgHqrkZCEYpmBHZqrsY25bKSnYW9u15FKRsdKmYzgkeT2oixq4nnnaDXXJJm6kmPRJXyhAP7) |
| 87-sender-max | only version | Sender | 1,000,000 | 467349290 | 5 | 1,015,001 | landed | [3FY5Asrw…rmZu3i](https://solscan.io/tx/3FY5AsrwSMPgmU9b17Ym6Nvct6npdYjkTdSdGvMBqSNBdF62bCbUN1fPEGbvafsiDMyyjB6kj1neDjphwCrmZu3i) |
| 88-sender-max | only version | Sender | 1,000,000 | 467349314 | 3 | 1,015,001 | landed | [4RbgHiu9…1HU6J4](https://solscan.io/tx/4RbgHiu93XMA5x8bWUZgzxVE8hfT7rawsez7j116SLW6cGA51oFwfTVJzwndt6WNh1PmxXQaS1meezLKLY1HU6J4) |
| 89-sender-max | only version | Sender | 1,000,000 | 467349334 | 3 | 1,015,001 | landed | [2e2nt3Kp…ytb6bg](https://solscan.io/tx/2e2nt3KpaUy4X5oAHRKKCnuBjg28TfswyzpPno8PDsEY6Hx7kbXduU3UhhDUgMeGyP9rSRwUo2JQnVsYY3ytb6bg) |
| 90-sender-max | only version | Sender | 1,000,000 | 467349376 | 6 | 1,015,001 | landed | [5zjmjYXx…Y9LVjw](https://solscan.io/tx/5zjmjYXxGjFKRTFgou2LRtr1wawTW4VAPBFaBuoBEXaBFtRzzFq2vDkcH2Nodeo4DsmN7cfSvDb2ogSk1PY9LVjw) |
| 91-sender-max | only version | Sender | 1,000,000 | 467349391 | 2 | 1,015,001 | landed | [2QpV4UCC…M9UprK](https://solscan.io/tx/2QpV4UCCaZYJapAyQQYVinV12QkixA8qS1yQGQzHmwoELfwA2z1pVLe2CeG9MWR5Dn8eK6yTeT1VRzLHNfM9UprK) |
| 92-sender-max | only version | Sender | 1,000,000 | 467349439 | 3 | 1,015,001 | landed | [2wjh1xSu…1BZDYv](https://solscan.io/tx/2wjh1xSutgZzuCP8eLFvosLqn9fizC61s98qmvo3vc2BzMW8RSbE4CU2Pp7st7yh8fkogn1mWUkm6CPvys1BZDYv) |
| 93-sender-max | only version | Sender | 1,000,000 | 467349455 | 10 | 1,015,001 | landed | [5rFHLPqr…nqaa96](https://solscan.io/tx/5rFHLPqrtU1WYmB4L5qtv3iDfT5jwJxskKLxiSE53fh4DfmTyx6hUNBzWKwynzfR4bftPjgcxDvixMw4sanqaa96) |
| 94-sender-max | only version | Sender | 1,000,000 | 467349476 | 3 | 1,015,001 | landed | [37q4pZeJ…gkcsEA](https://solscan.io/tx/37q4pZeJNrBTcr19YD4tY7wufpwhZdB8huEjs7QBTU4f6GfztfLBeSoah3WkenC1bKwnX9i7hHppQDCYtygkcsEA) |
| 95-sender-max | only version | Sender | 1,000,000 | 467349532 | 3 | 1,015,001 | landed | [2NBtCqED…87YBWz](https://solscan.io/tx/2NBtCqED963wcVTie3qPdDuvsUuZ8mciAqoD2HuzMWHUB6ZaYeCKd5aE6foFzkP1mQ52RAamyJjZKt2fvC87YBWz) |
| 96-sender-max | only version | Sender | 1,000,000 | 467349537 | 2 | 1,015,001 | landed | [4B5RRdYe…WdAoeX](https://solscan.io/tx/4B5RRdYera5tR7u3fvpgqHhofanT8ZN431CwyTKZZMcUz9tczLTma6pgEfWnXQHQPnGksAXeQhVWnnXYAYWdAoeX) |
| 97-sender-max | only version | Sender | 1,000,000 | 467349564 | 3 | 1,015,001 | landed | [nNC5Yv9z…RrheA1](https://solscan.io/tx/nNC5Yv9zPabzN2f9nW8b28MwbmT1rad3BXUzbLMuJerqzsGSQBmZYdT6HhEnS4Z2sMpRajvctGUYPAyTXRrheA1) |
| 98-sender-max | only version | Sender | 1,000,000 | 467349596 | 5 | 1,015,001 | landed | [5HtUX8UC…BvxNBc](https://solscan.io/tx/5HtUX8UCM327qBUUt8svrkhpAqpM8ZCpsHkZ4SgU6EhfFmhCayVzfMUJTjMxjUwYJ2ofNHVR9M7nKW4Wc5BvxNBc) |
| 99-sender-max | only version | Sender | 1,000,000 | 467349632 | 3 | 1,015,001 | landed | [2aW6qvWZ…Qd2wJH](https://solscan.io/tx/2aW6qvWZ5oneGLYuYGLUUfTdqpFN5Fb1LeVjpFs6a6s6fV5cUMAWcYRfBUfZfbjjv2nV16UXrknrHXFzNSQd2wJH) |

</details>

<details>
<summary><code>jito</code>: 100 operations, 100 transactions</summary>

Jito block engine, `sendTransaction?bundleOnly=true`: a single-transaction bundle with revert protection. Tip 10,000 lamports to a Jito tip account.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-jito | only version | Jito | 10,000 | 467346794 | 3 | 25,001 | landed | [4zEYN8yZ…C4Tthi](https://solscan.io/tx/4zEYN8yZv3RihK7DfmiQ8LgBPLfsAk8EqNbV9ZvhTBRWeXXGMgCPJEpTo4a16xKrdoMcf8KyfKVLmgHmLZC4Tthi) |
| 1-jito | only version | Jito | 10,000 | 467346810 | 4 | 25,001 | landed | [5uMGnHPH…C9Ewzd](https://solscan.io/tx/5uMGnHPHz6LLSe3MFodnyRncjSjF5mMvWf5VmSaSdZV4Gu99VH1jEyFEGx9GKqB9P4hd8uwnNMUT1XispFC9Ewzd) |
| 2-jito | only version | Jito | 10,000 | 467346816 | 3 | 25,001 | landed | [5sRQeEiK…KGq8jK](https://solscan.io/tx/5sRQeEiKhWusoyPrGYvuCCHrsrwt65YLx5SYomaMdTpumkgJVCDseMQ8R5z3WdUpyqpoC3Q7rgKc5qMVKLKGq8jK) |
| 3-jito | only version | Jito | 10,000 | 467346854 | 4 | 25,001 | landed | [36v32dy4…txqfPj](https://solscan.io/tx/36v32dy4smvuD6fHut1MWDnSH8jfwMaFA94cPuD8Jc7GogCRAeK7U1SxfBs9D2VvtLjUydbodS1s2wGMZttxqfPj) |
| 4-jito | only version | Jito | 10,000 | 467346882 | 2 | 25,001 | landed | [2vofj6Zb…c4ZQ35](https://solscan.io/tx/2vofj6ZbEor7VyGQMU688bwmrTX5BKXLdpG3ES5Go6xf7WaFCiciUB2w31cNyu74C3ANeuAAqCAiyYtH8Gc4ZQ35) |
| 5-jito | only version | Jito | 10,000 | 467346913 | 13 | 25,001 | landed | [38eGWymp…aokt8B](https://solscan.io/tx/38eGWymp7yRwpg7ii6e5ZqgdvcfvPtmxSahvGtouTivnGY37Wq7rwJGiYpTMcBpbxu46Nm4FMtwdi7Mfoyaokt8B) |
| 6-jito | only version | Jito | 10,000 | 467346928 | 3 | 25,001 | landed | [p4pBvFrR…KjV78W](https://solscan.io/tx/p4pBvFrR5VHKRBAf4ebqZBHwvjUAm5HmpFkikx4cWYCn2g65jAy9CU4J8SrqTPULPtpZHK5vnLDLsMxa4KjV78W) |
| 7-jito | only version | Jito | 10,000 | 467346972 | 2 | 25,001 | landed | [4yrNChBU…HEjcju](https://solscan.io/tx/4yrNChBUAsPEMVPiiesXzj6rnyMe8GA2tAfS7LUaKK9kLKmdi79krYLMxon1iyMd7dxv6Bv4FjssfFvtY3HEjcju) |
| 8-jito | only version | Jito | 10,000 | 467346985 | 2 | 25,001 | landed | [4W9gvwaw…49DcLC](https://solscan.io/tx/4W9gvwaw2Ntpd54VTCvqTAoqJvY5dbkNixpTgoMe4GxKXgjS7TtWwVvnFJ7Etkv7NHgVfvFfnWBPGkN78549DcLC) |
| 9-jito | only version | Jito | 10,000 | 467347036 | 13 | 25,001 | landed | [4aCQNqMN…CcVZA7](https://solscan.io/tx/4aCQNqMNF7Ni5yj23vaFvVHSBhFCuomhdVFzmFeuethGHJaAoVk5DrKqPCY8ZRgDw5okeuRT3H4Kovi8NFCcVZA7) |
| 10-jito | only version | Jito | 10,000 | 467347048 | 6 | 25,001 | landed | [iBmfaYt6…jewScV](https://solscan.io/tx/iBmfaYt6Svuxnqcc1f7fe2JkgnvEsqEdDrSLQ4YT119fVCLb1Y7R8Hp9ZXKuNofEoLFcjQLjfA3ajEUqfjewScV) |
| 11-jito | only version | Jito | 10,000 | 467347066 | 3 | 25,001 | landed | [61bni7ph…2DSs9k](https://solscan.io/tx/61bni7phk6Ge6jrsNN9a4aGkLbeR3FfuanZoPH8PGZNTwydsRuDB6ZV31ed5Ukpozd8QXANBDyAW3paiup2DSs9k) |
| 12-jito | only version | Jito | 10,000 | 467347114 | 2 | 25,001 | landed | [3JoAMs2G…cUduoM](https://solscan.io/tx/3JoAMs2G2Y2USYiP3ri2d9PWaGKnLDy17gHqiyFMYEYRg8o5EnULvDaDahvmQhUqHB2x9okXsMa3GAeBLjcUduoM) |
| 13-jito | only version | Jito | 10,000 | 467347119 | 2 | 25,001 | landed | [4x7XreBL…RG8HyG](https://solscan.io/tx/4x7XreBLma7EHonJ2MACnrtXVyxAPkKYvykwpt2swAFqwZhqmK2yUokd926XQKcytWW2MaVsdf2Au1Gc8bRG8HyG) |
| 14-jito | only version | Jito | 10,000 | 467347168 | 3 | 25,001 | landed | [F3Buj2tW…cUfnZx](https://solscan.io/tx/F3Buj2tWmYCKGVBXTBLHLDEadMmJSSvEAMgKrBgrnu3YX8a5RZhNC58VqhgG3VKBRuwFmQsuVt4NZmkKCcUfnZx) |
| 15-jito | only version | Jito | 10,000 | 467347180 | 3 | 25,001 | landed | [5E8hyNSJ…LUCYNY](https://solscan.io/tx/5E8hyNSJqAY6oABf8Pxzjs47RPM1mxktnzPSGGui8F2x5sLm5ThehzmrJsz5EgNbci9ND3jgopkR6SfjyXLUCYNY) |
| 16-jito | only version | Jito | 10,000 | 467347231 | 3 | 25,001 | landed | [21hyZcuc…qyrtVQ](https://solscan.io/tx/21hyZcucHgvZZA95bfY9wfWrUVFtptKnQ4QcX1p8EGRPBRtFrq7DV4CQrgwBYJuvzRno1Aa5M6L3qRjLPWqyrtVQ) |
| 17-jito | only version | Jito | 10,000 | 467347245 | 3 | 25,001 | landed | [4D2LtpFF…H7iihg](https://solscan.io/tx/4D2LtpFFSG3vJ85BMswenPdWMAVCWBy3q9vv48LkpGvrPaYZjtdfLgTLezPAbfW8yr6BG7Fyq7y3FJaGrLH7iihg) |
| 18-jito | only version | Jito | 10,000 | 467347275 | 4 | 25,001 | landed | [46owTeF9…XYDEKJ](https://solscan.io/tx/46owTeF9nXeqxooPhEEoqY38au76F3emfqe2q1xTbPFWPkZ8X9PFjKvuSvsKeP9aEQAgb4Pj2rG53DTTUDXYDEKJ) |
| 19-jito | only version | Jito | 10,000 | 467347296 | 3 | 25,001 | landed | [2cFoEs2g…6jL1aT](https://solscan.io/tx/2cFoEs2gSzYCCSsiptzqETaVK7sCS5zht1pZiJCUqq78JtwnUGj4SPFRoERKWAze4igLp3q1kynDLLrJhx6jL1aT) |
| 20-jito | only version | Jito | 10,000 | 467347316 | 3 | 25,001 | landed | [3JLY2D8n…6scdhn](https://solscan.io/tx/3JLY2D8nZxRwx57pzrk3dj2rrcM2kuUtRUddBJtqeYm4wS19yBfdkwfrjSFeseRLTqqXbGr5KeRJWbyMB56scdhn) |
| 21-jito | only version | Jito | 10,000 | 467347355 | 4 | 25,001 | landed | [2n7TCGdq…NC5WdY](https://solscan.io/tx/2n7TCGdqgXUHCsrpvhWYXLaDpXJi2auyrDPLJPNpxBb34Vo3rnwJYA67yT4YwdMeDdRiAdEAn2HZ5V11FiNC5WdY) |
| 22-jito | only version | Jito | 10,000 | 467347386 | 3 | 25,001 | landed | [58gyiTC3…njrP3F](https://solscan.io/tx/58gyiTC3jQA9fTvfPuAgZgSmuQ3VJKX6UHCkKzgQJDdd2EHkMH5Egdat1aF91ijCW5vG8jkXReX3ju67FdnjrP3F) |
| 23-jito | only version | Jito | 10,000 | 467347413 | 4 | 25,001 | landed | [52UB1XSM…Qj1P2p](https://solscan.io/tx/52UB1XSM9Y51vm47fwqfjBzKK8gBAS6skNmp75oe5ba6D6sj3f6v4sym6JyfqcoVGkxt2raNFThnC6RkzyQj1P2p) |
| 24-jito | only version | Jito | 10,000 | 467347436 | 3 | 25,001 | landed | [2YeK66cz…CdhT7V](https://solscan.io/tx/2YeK66czmcgFiLzM7N1MNVfa8hinT1wo65PQz1kicUxHJFp3csH7WUz7dYVTDG7wSNB6ujm7kt9Vgm3DFKCdhT7V) |
| 25-jito | only version | Jito | 10,000 | 467347485 | 3 | 25,001 | landed | [guhBJ6iQ…D9qCsc](https://solscan.io/tx/guhBJ6iQKv5KBQS2EbzjwfDLLK11xffKXbd5eKwFLi6ASkrV3vu4JwvofQguAdfqP4mwmS7CiPemNCxhsD9qCsc) |
| 26-jito | only version | Jito | 10,000 | 467347490 | 3 | 25,001 | landed | [639ARzfi…bxEWBw](https://solscan.io/tx/639ARzfionjoqd9izNxeYMhvDuYebJyoDGi74CokYwsGtvNVczxXEDr4kH74ffzwFZY2M9k26w6KJBmUPCbxEWBw) |
| 27-jito | only version | Jito | 10,000 | 467347543 | 2 | 25,001 | landed | [3pGoFHC2…uj92Wn](https://solscan.io/tx/3pGoFHC2fxKwYcxEhUaKKisMC74t3xrC8eFkFpmakw67UGb8GtBbW6ujvinutaJkN8JtPJrTc3MmfXs6sUuj92Wn) |
| 28-jito | only version | Jito | 10,000 | 467347572 | 2 | 25,001 | landed | [2BKZhTyT…j8q8md](https://solscan.io/tx/2BKZhTyTX7joyTpPXxP8Wvja7t3pPAmBES8VGJgayDGePbHb3KU4AhLfry1FMbS638yJcZiiybEqXiuBE6j8q8md) |
| 29-jito | only version | Jito | 10,000 | 467347598 | 2 | 25,001 | landed | [3UGrQV3m…4UwiaA](https://solscan.io/tx/3UGrQV3mgxx3YhwJKqQMdcFxnj6JJbWMQcFaRtbU7pzrkVe785eD9BUucWMZxpyyXX1AYRuANzLSqpGv8a4UwiaA) |
| 30-jito | only version | Jito | 10,000 | 467347638 | 3 | 25,001 | landed | [2Tf41PJf…ouB5ZZ](https://solscan.io/tx/2Tf41PJf6MdfBq9VYXo3WM6vNgP4KtHh4KSFzMWjEtshqWewCnNxhrVuVLfvHXoLtQGobfAgboDtRQKXnZouB5ZZ) |
| 31-jito | only version | Jito | 10,000 | 467347648 | 3 | 25,001 | landed | [Je1vYG1C…GRUAKN](https://solscan.io/tx/Je1vYG1C94J1rYeHnfDYKMxA9vXtA1wT6J8E1eRPNvsNn8SHjDQymNBXcjgX8oJeem2TR9kDmpkdjebmsGRUAKN) |
| 32-jito | only version | Jito | 10,000 | 467347688 | 4 | 25,001 | landed | [3ihhogFq…c33aEa](https://solscan.io/tx/3ihhogFqGdBgXfj9Rj3NYFJEAQERUziJv2bTkbTYbyLsQZYkdfy3Bb9Z5Nn4roZYE4uRpKWPFJ1pDNHr8jc33aEa) |
| 33-jito | only version | Jito | 10,000 | 467347726 | 20 | 25,001 | landed | [5b6cfFhp…R7fNFU](https://solscan.io/tx/5b6cfFhpTHLjCabUDZ1KXSjC8rZG1Q5vpbjyB8cCu8NNiKkdc64otkeF3dAR3riw8dKWR3C7SJQhe1oQdwR7fNFU) |
| 34-jito | only version | Jito | 10,000 | 467347747 | 2 | 25,001 | landed | [5V8UDjXF…CF9CzH](https://solscan.io/tx/5V8UDjXFQbVowu73Fna2MzNLmp9CoWRr3NUnRkEYS1VDMYtDsK1YAXzSYC6wtpqNU1nVuP8fXrqNxuK1SDCF9CzH) |
| 35-jito | only version | Jito | 10,000 | 467347778 | 2 | 25,001 | landed | [5PR64GgZ…d5wHyg](https://solscan.io/tx/5PR64GgZmbChQMcYLok7io7aSxFGPrWxt6Z2wDA9k855eMeVbJfRT8knmwtTuDmiRQnXFCSHswW5qvnfSed5wHyg) |
| 36-jito | only version | Jito | 10,000 | 467347800 | 2 | 25,001 | landed | [1GJUiJNW…jhoznc](https://solscan.io/tx/1GJUiJNWdErZbXyKyDTTjkvqQEaQUTrHuNBF54p5qX1RnKx33DcpDzuJaveHnQ2dT38nK8NqNkAQETAEnjhoznc) |
| 37-jito | only version | Jito | 10,000 | 467347813 | 2 | 25,001 | landed | [52RX2CFu…vPTUCk](https://solscan.io/tx/52RX2CFuyWhZGLU6Qux2kviNWU1hxaZt7TuyzajTgf7xLbP8KB2L1NMgdGTrbhdzNHHVpxsrN115Nb7XxsvPTUCk) |
| 38-jito | only version | Jito | 10,000 | 467347859 | 2 | 25,001 | landed | [3KUcz3QE…jJ4JtK](https://solscan.io/tx/3KUcz3QEQpr3Ynx9yaJoWs8h9G1vo26jcKnXV8LpfH1aBw632D4dNnb9zkg3e2rDJzPaoMY6yWdHdjJWAUjJ4JtK) |
| 39-jito | only version | Jito | 10,000 | 467347885 | 3 | 25,001 | landed | [4CqDssv2…1ggwiQ](https://solscan.io/tx/4CqDssv2kz1KMEiMwFHX8vVbzjcveSzYXM9bd2UrsLhTtdUHuZFFAUBEmRAMhh8cLYVaxFLv42r1JfqvEq1ggwiQ) |
| 40-jito | only version | Jito | 10,000 | 467347927 | 2 | 25,001 | landed | [2o9qNfwW…tSxvaG](https://solscan.io/tx/2o9qNfwWBwcRcwA1T3qjRR9o5kpgNVnZ9qaJVQpMbY3XLHK4B99Pq2MT2VzjC7F9BDvKtCwRgiDfZHNYuHtSxvaG) |
| 41-jito | only version | Jito | 10,000 | 467347947 | 3 | 25,001 | landed | [2w7LVpWr…jURAYH](https://solscan.io/tx/2w7LVpWremgWLosdHpBWEMqt4YuyqJM22hnUaENCGHGCH35uFnnrxcRduTeF6E8Dk6pavKQnMLR5fYcUj5jURAYH) |
| 42-jito | only version | Jito | 10,000 | 467347962 | 2 | 25,001 | landed | [49NmkgTg…7ZQcD6](https://solscan.io/tx/49NmkgTgB65ugEJKmQ57kuj2PSNUQbo72Rx49yzdd4osmNj2y7PZqsgNrtvPVUx52qeS8dbvxYjY5nobBH7ZQcD6) |
| 43-jito | only version | Jito | 10,000 | 467347996 | 3 | 25,001 | landed | [53UcNjGB…NDLiPx](https://solscan.io/tx/53UcNjGBJ6UKyc9Vj2nRkrQb1h4LLRkyMCPTAv9a68PCJQsVTrBV5C4Fe3LwCUm3GLL1kViLdPYPVWZAG4NDLiPx) |
| 44-jito | only version | Jito | 10,000 | 467348022 | 2 | 25,001 | landed | [26t1Nwju…fpeQ93](https://solscan.io/tx/26t1NwjundLLXZmfnqjbaFz6P2YLYbkZDFMpNirgNNhzJdfsfV42bH2b7wG7iBjHQs9r3J2Ef93mUPE3G9fpeQ93) |
| 45-jito | only version | Jito | 10,000 | 467348064 | 3 | 25,001 | landed | [3HrYXyQT…aD17Z9](https://solscan.io/tx/3HrYXyQTVPYj5nBqCriyyNEwW95Y31zYE54n95572wCPAV2CKZX9eS4w9FrooonQEmHoCGdrtykASrddKwaD17Z9) |
| 46-jito | only version | Jito | 10,000 | 467348069 | 4 | 25,001 | landed | [57nDr4si…t5ssGb](https://solscan.io/tx/57nDr4sibft6YNWSdwpE3vaboQUXaBbWy48KNYCrCDYZkbng3TtAA8CFq97jAJgS9JFmueRztywo35FU2Dt5ssGb) |
| 47-jito | only version | Jito | 10,000 | 467348124 | 4 | 25,001 | landed | [2C7reWMM…vx37gx](https://solscan.io/tx/2C7reWMMXBb28kBtMRUbDwDUUo2V36jJY6PgiFEWp3BTAY2kH7saLwiuyWo4JpLKhKpvuF3CK3SHYvpcMavx37gx) |
| 48-jito | only version | Jito | 10,000 | 467348158 | 2 | 25,001 | landed | [2Z2Hag4n…xdWyFN](https://solscan.io/tx/2Z2Hag4nBrXUNkuxaztkK41mPgAXMkGaoPkr1ZEgEbPDxHEAsEhWffPHU2Xw7d5AQzLCSubnEV1mamp8fUxdWyFN) |
| 49-jito | only version | Jito | 10,000 | 467348184 | 3 | 25,001 | landed | [nposoTUP…vZSDep](https://solscan.io/tx/nposoTUPwPWJJCbwH5Bb5UFpSP5DHsZzmFbGdHXndjxpTMQXSiZNjkpZF2srQZyT35f8teUNbm4kJpi2EvZSDep) |
| 50-jito | only version | Jito | 10,000 | 467348202 | 3 | 25,001 | landed | [4dmYZKn8…eYkqsq](https://solscan.io/tx/4dmYZKn8FxEtzZqQsJo62WLKi8rLUrvjSW9RhTEyFe42umxz4wP9r8gDdPDAkE9LTBegB2229x542Bry3ZeYkqsq) |
| 51-jito | only version | Jito | 10,000 | 467348219 | 4 | 25,001 | landed | [3eutwaZv…AhAzWm](https://solscan.io/tx/3eutwaZvmBR35BUtiJPveystRnnupVKzAtKwJeeDXjGdwSy5sG3BtgZ4iyYcg2pVcyiVtYoTCa5YgSrc2JAhAzWm) |
| 52-jito | only version | Jito | 10,000 | 467348268 | 3 | 25,001 | landed | [4wjGXmtG…bY388w](https://solscan.io/tx/4wjGXmtGMcNFfJZBALTCwPEwG78vvf66F2j7QhhF5Xc5KyP6sXcUL8hTr9rwqeLZQd14TCFVLogUHK8jmCbY388w) |
| 53-jito | only version | Jito | 10,000 | 467348292 | 2 | 25,001 | landed | [RxCuzB7Y…bdqtXP](https://solscan.io/tx/RxCuzB7YjyPqVBHd6ZQXtcK5ZDd3Ta6gMhPmit8RZK4HSwR2bSf5qXMWzJiFQKHuk3aRdf5G6HqM4RmefbdqtXP) |
| 54-jito | only version | Jito | 10,000 | 467348314 | 3 | 25,001 | landed | [3WsTYg9K…Fk6cov](https://solscan.io/tx/3WsTYg9KHZHRGRQ6qGYHJCpt8cvzRYZtwgtn9eSVi2QxXFT7tuPQqQGjxL4nLNT3XFpgWvqhHcuaAQwMQ4Fk6cov) |
| 55-jito | only version | Jito | 10,000 | 467348345 | 2 | 25,001 | landed | [GJyrSr25…8kzhkw](https://solscan.io/tx/GJyrSr25hRHbkwYugiGFA8pZnaYJ9TnPtNhn5UGbvfcy14AruwgijWgwumTvdHk3ZxfGTXqvYjGrqrii58kzhkw) |
| 56-jito | only version | Jito | 10,000 | 467348387 | 7 | 25,001 | landed | [634Cyp9z…H2QK2S](https://solscan.io/tx/634Cyp9zwg19YGmpWEX34kDXQPEjsMzgTACusoVJLKW58a3r7TsjFSkM9uK1kigURF8NQBBahUQKhEwdsoH2QK2S) |
| 57-jito | only version | Jito | 10,000 | 467348403 | 3 | 25,001 | landed | [4XTzokgk…xr6YCy](https://solscan.io/tx/4XTzokgkzXfu9gG9HstHYM6RWhh6QB4dhaXyqMJV3bcY9q6m21nqwonagAGGzSpd1zHDHsPiEuavjQQj7gxr6YCy) |
| 58-jito | only version | Jito | 10,000 | 467348435 | 2 | 25,001 | landed | [2DxAToQ4…53BSNS](https://solscan.io/tx/2DxAToQ4JfcrLnaY4r3zq52TKLMFjJTogcTMTfigXR2TUwww2eNqoLZAVNdTtsFpyqfNyrk6FQRWsUNSjo53BSNS) |
| 59-jito | only version | Jito | 10,000 | 467348441 | 3 | 25,001 | landed | [2zqtPNRV…yUF6oC](https://solscan.io/tx/2zqtPNRVjXSDnnxfa4Ne9dahKN6886nTx24dk7jofKxe9DjXdqJxJBasrjU4vPhGqhGayYsjswBXEhLQPdyUF6oC) |
| 60-jito | only version | Jito | 10,000 | 467348484 | 4 | 25,001 | landed | [2J53B6EG…agdyC2](https://solscan.io/tx/2J53B6EGSYXTuGnuCgq6JA2Ja3KfiBDucKX3FAEsrp4umP5oqrqQXJAceTazcfG5ECrXS7V9UnSwtpfXXuagdyC2) |
| 61-jito | only version | Jito | 10,000 | 467348522 | 3 | 25,001 | landed | [2s4uZk3w…J7Wjdv](https://solscan.io/tx/2s4uZk3wTpt4ioCy9sqT23CacQqh8xg9FigkhJu8AkAHVqqwBh7gREvuu4Xh2HZQHGvaRTjYaR2rvPKgUYJ7Wjdv) |
| 62-jito | only version | Jito | 10,000 | 467348528 | 3 | 25,001 | landed | [3TyHCUDH…fXVYFy](https://solscan.io/tx/3TyHCUDHMcn7si1UsPGu1rRc18pPHV5AS5SQvorBAkWS1HNeUAhB7k8GbAQjMp7qNbw3WJxMzwwjerkAwNfXVYFy) |
| 63-jito | only version | Jito | 10,000 | 467348576 | 3 | 25,001 | landed | [4JPYvS65…ZXkVb7](https://solscan.io/tx/4JPYvS65v5pSXBuTaDfRb9D4afAd8ZeYA7dYFLr8xxW5dEA33V3P8NWGawKc5L5SUP8B2ZQ6Hp6f4CKji6ZXkVb7) |
| 64-jito | only version | Jito | 10,000 | 467348604 | 2 | 25,001 | landed | [Q9kVbqLK…REMnDA](https://solscan.io/tx/Q9kVbqLKbdGUHW6imncJ83Apvb3K6BKdBP1hdPN8kAc3y4AWqEHe9zYPvykhvjs6jViK2UtAYwZetbomdREMnDA) |
| 65-jito | only version | Jito | 10,000 | 467348631 | 3 | 25,001 | landed | [4Z6jXSUv…ULhSVb](https://solscan.io/tx/4Z6jXSUvz5pf6iAk1QMhQTC2aHmj2yDAi8Ra8WbdEVTXZ936ArifFNxunS3F2LcwyqYDXSZ6ZcNpVqEWYzULhSVb) |
| 66-jito | only version | Jito | 10,000 | 467348646 | 2 | 25,001 | landed | [CHwQdA9B…o5ZEzH](https://solscan.io/tx/CHwQdA9B2x26etvZtXxssaQW4aeJzUw7HSA36QN2N6wXny54tKofGLosL6bHDpBrAx7jELqDj7tkL7ck4o5ZEzH) |
| 67-jito | only version | Jito | 10,000 | 467348677 | 3 | 25,001 | landed | [2tPrUfPG…pUhSga](https://solscan.io/tx/2tPrUfPGp779ufct8SXBiVFqg5cdet9QFcqFf42ZpVxMLdxFHaXmuD9wxsKaft34Bja3oo3wHwF74j8PMepUhSga) |
| 68-jito | only version | Jito | 10,000 | 467348711 | 3 | 25,001 | landed | [htJgDQP8…7XH1ua](https://solscan.io/tx/htJgDQP8WZ1bb7aMTqkBiYtbDJvVQVoK7qK4FLBXTtwyqUM8uMgVeRjAN2KqZPUEW8UNVuaemAcwcxJBH7XH1ua) |
| 69-jito | only version | Jito | 10,000 | 467348735 | 4 | 25,001 | landed | [2eKrbqGu…ydj4rp](https://solscan.io/tx/2eKrbqGuXVXJUnNGSWV5Dfr6WYhpemLG4QKpxpQFZRZUSGLDKusMdHHz96XnyUGLc8a1bAE1BxNejog9kMydj4rp) |
| 70-jito | only version | Jito | 10,000 | 467348755 | 2 | 25,001 | landed | [1293WE5n…Prwcwa](https://solscan.io/tx/1293WE5nN2PW6vkXKDRWixMWSwXSQ2Hvp7o7Hv5UV7ha8m8AGpZKvGLiZngaPaSKSWn34QABw1pjFVqnbFPrwcwa) |
| 71-jito | only version | Jito | 10,000 | 467348807 | 3 | 25,001 | landed | [5Kh9GhmM…3JzX9B](https://solscan.io/tx/5Kh9GhmMg2e4eDDoh4cGdpWmKRjceg9vKBsYp5eHtvLdCFinY6UJJFVew2KUUfhXXW9Kaj2dGf4khahdW63JzX9B) |
| 72-jito | only version | Jito | 10,000 | 467348819 | 3 | 25,001 | landed | [4KwYXZha…GDfMPj](https://solscan.io/tx/4KwYXZhaosGcxBUTMFKWaAZ22GtEQs9PmNvsdaR4KgdWkXzPnN3QEJGyp5rwRHAh3ww7na8ptq7tNqynpBGDfMPj) |
| 73-jito | only version | Jito | 10,000 | 467348845 | 3 | 25,001 | landed | [5e5vbNPg…3wLndo](https://solscan.io/tx/5e5vbNPgswdu9VEphUDb8w6TENhQESzpmrcRtczgkbo7C6rnBgH9apBiNnkdgZ9eZXR6oKYEGwvPiAqzaN3wLndo) |
| 74-jito | only version | Jito | 10,000 | 467348884 | 5 | 25,001 | landed | [eEHexMhZ…mVrJQB](https://solscan.io/tx/eEHexMhZkdDnFoSA7idyB8qecg1D4yrssfQQuT7sSq4wgJN1o5X7Ls7g6Qy7AwzqyNbvr4XGoAKYMPPzqmVrJQB) |
| 75-jito | only version | Jito | 10,000 | 467348928 | 3 | 25,001 | landed | [2qfe7Qan…QXWX5V](https://solscan.io/tx/2qfe7QanSy4eQAYbcuk8RQq58ybGo23vsc4ESniQojE9y6HaHkAs796Zum4TV4Mai4uenzAL8PDUNWZ7ksQXWX5V) |
| 76-jito | only version | Jito | 10,000 | 467348940 | 5 | 25,001 | landed | [57He5bkE…UDH5wT](https://solscan.io/tx/57He5bkE7EXqYPDoxnkMQ1FFJpiqXfj6WNy893VeoBNJcR1ThvGvuQL77hhmZtbwTMAEuwvboTr4tb49L3UDH5wT) |
| 77-jito | only version | Jito | 10,000 | 467348965 | 3 | 25,001 | landed | [4NGAy8ZG…iKZZro](https://solscan.io/tx/4NGAy8ZGrfhmbjHspLfUmWDFK9oM3psRNceBfhdHS3sp7fj8R9dMp7U5KaxqHcvB2dpM3i4ac3xMEaXjgDiKZZro) |
| 78-jito | only version | Jito | 10,000 | 467348996 | 4 | 25,001 | landed | [2qQPFBZc…V1fZet](https://solscan.io/tx/2qQPFBZcURFk9ttDMnKa43hBboiXwgUbDGaoLJeKAoi3BTFNKfdFGby5tKoZvtypdgehZRYmFgVbaxr22DV1fZet) |
| 79-jito | only version | Jito | 10,000 | 467349033 | 3 | 25,001 | landed | [3BXYAWPy…gGpumU](https://solscan.io/tx/3BXYAWPyGwp7HC69xCTvg4MKLJsWqYRBwawA2brj44GEnRUVz9VPyN4EgLRkgV7hzuRLVmkHGHpb3jyg9ZgGpumU) |
| 80-jito | only version | Jito | 10,000 | 467349057 | 3 | 25,001 | landed | [g2aMWazq…wwu15T](https://solscan.io/tx/g2aMWazqRdm5ThmD3DdK4QL3FrVM5yaWLF6C33X6XJbJrpBuKiDtfKGj834Hg5S3iTaNskzdbW1zvJJGnwwu15T) |
| 81-jito | only version | Jito | 10,000 | 467349071 | 2 | 25,001 | landed | [3ZCvtDZR…VHwnux](https://solscan.io/tx/3ZCvtDZRCAwAxXTLwkfuzNqtdv3DtTMWWtHzkhQAW5haUSegX2DPKp7qxnZDkePwQibeB7XePcJQxxPHVkVHwnux) |
| 82-jito | only version | Jito | 10,000 | 467349119 | 4 | 25,001 | landed | [57Bsy8E6…oMgXcF](https://solscan.io/tx/57Bsy8E6NPcNCpf8T8H57mTqNAoKuyZuqXDTGY4kLhrrQ6XAaok9H1pEE5hbf7rK5L256Ydjb6r3mom3wUoMgXcF) |
| 83-jito | only version | Jito | 10,000 | 467349149 | 3 | 25,001 | landed | [4tY3mR1V…XTMQHp](https://solscan.io/tx/4tY3mR1V4C7aJQ2eMWTaWbNjnCFmQ82SokEewYgH1EPpHUKmTX4X24nBSr9P4JLcoKcDwwxxqAM3tPiywXXTMQHp) |
| 84-jito | only version | Jito | 10,000 | 467349168 | 3 | 25,001 | landed | [29Q2M7fx…EZrTBS](https://solscan.io/tx/29Q2M7fxZfCRvARiiD7GebdZwDcmvanfNrjEEMkxdYdNzdZQETHBAZotvracc3VNktmQ9qt9b3Jj6f2SiLEZrTBS) |
| 85-jito | only version | Jito | 10,000 | 467349217 | 3 | 25,001 | landed | [5CeQGpn9…At9REh](https://solscan.io/tx/5CeQGpn9wYYCERkokmUMVmpV6xZNFygbN1uC8GGCw5becMrHt54diiZL8xxT3UkzXVDMsHmeYetFTMrDS1At9REh) |
| 86-jito | only version | Jito | 10,000 | 467349241 | 3 | 25,001 | landed | [4bv9MphL…17tdDm](https://solscan.io/tx/4bv9MphLkJzwoh3xdR2DN7stmYobCaQDJ4NSLhnU381tTwkjPcSwpn4e3CxJJxz2WZoz6QXzSYKQL5rZGN17tdDm) |
| 87-jito | only version | Jito | 10,000 | 467349261 | 3 | 25,001 | landed | [3nJ52axk…JbhDhF](https://solscan.io/tx/3nJ52axkjyAMP9JguBPjju5afHmQdmkJiJntxwqfH4GEv7eVPXNxD1BL1UfjP79kC6GvaH2NCBhHNKBKntJbhDhF) |
| 88-jito | only version | Jito | 10,000 | 467349271 | 2 | 25,001 | landed | [ME1QWEdM…ERbTVR](https://solscan.io/tx/ME1QWEdMfL8ZzMGWvDpfFEEYd6iS4i9VeoTHgrmBW27jXeCpRA1s6rXwWX7rH4RkLeUzgq5MdC8SqEwgoERbTVR) |
| 89-jito | only version | Jito | 10,000 | 467349292 | 2 | 25,001 | landed | [2R8W9svy…tdiDTq](https://solscan.io/tx/2R8W9svyPZrcPUaTZ6CMfWmtLTpWa7okNbCymhwR3KcrXnERoHxzvskSaSeapnu4K6NVuh8moX8qyYWH2AtdiDTq) |
| 90-jito | only version | Jito | 10,000 | 467349336 | 2 | 25,001 | landed | [42uLrk75…AtwG54](https://solscan.io/tx/42uLrk75dQ8gAmfnEUuvWVtSTHhbSCDibHjTdaFDpnxQq8WA79axRkJiwqxhAEVTfPUb4bBgj6KGzzZucnAtwG54) |
| 91-jito | only version | Jito | 10,000 | 467349345 | 4 | 25,001 | landed | [5Q4VwxzK…1QvucR](https://solscan.io/tx/5Q4VwxzKuCN8VRfL9bVDBQFHtoxD9wXqRrwaiaANdz6F77o6Z44rdtMtyDEP8NDAhEebsvjub1X7daPBYs1QvucR) |
| 92-jito | only version | Jito | 10,000 | 467349388 | 2 | 25,001 | landed | [4AzjXDfP…hho9D4](https://solscan.io/tx/4AzjXDfPwjiU8aUYVze8PoAp2FznRcdivB1eUaZYjsY9qXrmam5DLbQWne9VGas2ENPa4e9L6T7sWT3YqPhho9D4) |
| 93-jito | only version | Jito | 10,000 | 467349408 | 3 | 25,001 | landed | [3e4PL2eV…125XwX](https://solscan.io/tx/3e4PL2eV9UFpC1kqc3Ks5eJGEES7GscQj4KBvb1WJZzN11yM8GLa3n96tg7FWSdZeCWERQw1EZN2eDkpcv125XwX) |
| 94-jito | only version | Jito | 10,000 | 467349436 | 2 | 25,001 | landed | [4URrv42V…AkgD2q](https://solscan.io/tx/4URrv42V7tYtqK9NS2X6vPQxmNzCdRP21FyvHJEgvNPhuk2XwSkf8R2EZbzchXygLjaw2tehRY7Q56x3EmAkgD2q) |
| 95-jito | only version | Jito | 10,000 | 467349465 | 3 | 25,001 | landed | [5u65W1pk…4AsVPU](https://solscan.io/tx/5u65W1pkYwWzeoGno2fUDhUFp8dyhqt9yG5VUKosczyi7Sx392pvBqc3TCMbZbjkNyR7pBpSUCjMsth9ia4AsVPU) |
| 96-jito | only version | Jito | 10,000 | 467349480 | 3 | 25,001 | landed | [3maHTueP…LLPfwr](https://solscan.io/tx/3maHTuePpNqnjfMiKLx468ve4pdh6JAdPzKPGRpP6n35jBaqsidMUQwfwo8VshCRFToSVWEktJmFJhroCJLLPfwr) |
| 97-jito | only version | Jito | 10,000 | 467349535 | 3 | 25,001 | landed | [3NDwnehV…FyDVAu](https://solscan.io/tx/3NDwnehVtgfdFFvh3Kmct9eMk5tzeNsB8eBTAQkYYo4otuxjyCBcPoi35Bmw4QTRHAz5hqBkuFx1PmeYmCFyDVAu) |
| 98-jito | only version | Jito | 10,000 | 467349545 | 2 | 25,001 | landed | [3uxPGDXM…EiAJh4](https://solscan.io/tx/3uxPGDXM9A2j6nkr2KsH5zPgMdpEt4kuJ5jZuLczHidEt8f9DVXnxvDrW9NdoreXGCGDGhMBNmcS1RE6ZFEiAJh4) |
| 99-jito | only version | Jito | 10,000 | 467349586 | 4 | 25,001 | landed | [LQqevBuY…CXHUAy](https://solscan.io/tx/LQqevBuYZxBJik7sFK88Tif2mPuuryDrQnxJtE5CAiH7hj9b4Smv4UAAYizTXzrsU6E2ZeBAaArrFzefgCXHUAy) |

</details>

<details>
<summary><code>ladder</code>: 100 operations, 113 transactions</summary>

Durable-nonce family. Version 1 goes to Sender SWQOS-only (tip 5,000 lamports). If it isn't seen within 4 slots, version 2 goes to Sender Max (tip 1,000,000 lamports), signed against the **same nonce**, so at most one of them can execute.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346799 | 5 | 20,001 | landed | [3SwYdwYv…9KRtvz](https://solscan.io/tx/3SwYdwYvuLQNtrucyeS89jWjZKw89jD9Y8RaWJhC2mRBauv4f5GU3vn4hFt1UBQAtEw7xmEkwD7aqCZKG29KRtvz) |
| 0-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `5iQr4g1xZkYteuyHVJbrBGACYjR3jT1tstwMWiacwvZRhypdxwc58YvjTFCVUCEBCmdrbvJFr95nZj51qKZySbV6` |
| 1-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346846 | 2 | 20,001 | landed | [4kPU1J9h…i5Tnx8](https://solscan.io/tx/4kPU1J9husYpyKBjZQc6x6Vvu6fhgKgWH4yiViWHesFnRs4aSWodJRsDzsp1ce4NzH291MneDJeuCwweJ4i5Tnx8) |
| 2-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346872 | 3 | 20,001 | landed | [3Ghe8Xad…d1VMMN](https://solscan.io/tx/3Ghe8XadxtbwxX72hAm5XGjJJ4GNp2NxMMTEjXrCMwBht6nNd2bJNkDyqr7Kssb8aYwfnSRVqPYLXyex9Yd1VMMN) |
| 3-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346888 | 3 | 20,001 | landed | [4hXuWkGr…UzEDCh](https://solscan.io/tx/4hXuWkGrKBzqrAxuNZRSyMFtKzT6MifcwfoAxhzeVSeoufEC3yKJT5t7dUEwYgJ6Ah6TcPsoidmBdzRif6UzEDCh) |
| 4-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346913 | 2 | 20,001 | landed | [cfPKrbYb…4e46d7](https://solscan.io/tx/cfPKrbYbzscjgBZpP6RASRqsTUJ8mXXVdqujQC9gJZL1Gxivjr3V2VE9ybKweK6cWr34gEEt6TLLwAixm4e46d7) |
| 5-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346934 | 5 | 20,001 | landed | [47Dnmx23…FtqSmQ](https://solscan.io/tx/47Dnmx23WRL2KsFR4WVyo5Sg93LYcHGN15iJ1A7qoqzoSupHXqquFo9RcL4pEQDwAWnsdP8A1qTfriPgLjFtqSmQ) |
| 6-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346966 | 5 | 20,001 | landed | [5eRDzXRB…PanDcL](https://solscan.io/tx/5eRDzXRBcK5RJySi8VbHE2Hh7CbGVNXarkm4BySxxyyoetv8iymKoX3FkfKJ2nAULhZpvJAyexxvWnoSDKPanDcL) |
| 7-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347011 | 2 | 20,001 | landed | [2MWz3fB7…HvzgRg](https://solscan.io/tx/2MWz3fB7Mt9gTxt8KontXfU5V4kqqvDHY9RVje7iWcYE8pNC3UifD8AeRpNDmwKcPnsKq3opocgN1DaJzAHvzgRg) |
| 8-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347021 | 4 | 20,001 | landed | [2yvLgijM…UWYpmj](https://solscan.io/tx/2yvLgijMW6pYxHJzciaXA39GTnduDNQJztXCPUkhBt3JCDtV2RZt3Vfxs3qFMsrFzAQt5JVcUtbiuYm4hQUWYpmj) |
| 8-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `5Crt7K8cpFpc2HZfLUrbxphF1cXSJ8ZkQt3nThrg1RKJsfR7gQ9kMNePZBuhPfYM4yLHZZibuKysEEkEswxNjk1z` |
| 9-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347070 | 5 | 20,001 | landed | [61nQ7cAh…iDsrNv](https://solscan.io/tx/61nQ7cAhqypGyfJmUFHHpMFUNDLUK2Sz4U7UHv6drqo8V7P35FV3dBDCnyYCq8GjWfmRwa3u3ztFt6HMWsiDsrNv) |
| 9-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `45cjznxoCSFYjRCSapoTQ354DkBzGR2bUCQ5e4SZ23scqaszyQ5BQy2igdKkX3VDkaz1prkiFxibivEaamvG2r2y` |
| 10-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347084 | 2 | 20,001 | landed | [syRtmyKT…KnRr3T](https://solscan.io/tx/syRtmyKTUdtLEqhkxtRBsA7y2Sr4MxJB7ZTjf1jXe4Q38C2fvtfs1gA8jXM6UBPLRq58biyGHhc7KH3R8KnRr3T) |
| 11-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347133 | 4 | 20,001 | landed | [3hR2jRZ3…xpJwpM](https://solscan.io/tx/3hR2jRZ391g9CmnAh8nZmPcZsjXHZcQTmuDMkactxbCF151ET59jxxvg5sRRtY4znicFSwj9CJC29Q6ePLxpJwpM) |
| 12-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347143 | 3 | 20,001 | landed | [2N17qEVM…EpQsGr](https://solscan.io/tx/2N17qEVMkut5MFXGZT9VqiY5D8cnSNH84y4NZ6Chsv3ddDkRJCqN6Xbk12wfig7VYgWNSuDec9oNJAJDqGEpQsGr) |
| 13-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347186 | 3 | 20,001 | landed | [4aFXU5fE…mE96zN](https://solscan.io/tx/4aFXU5fEZLDxKALqS91SiX9uj5wpJ7cx5xb7gDiE3k31xKnTnNKav6AZeqxNfTdWRzVwMA96VmXo6qTcGrmE96zN) |
| 14-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347207 | 4 | 20,001 | landed | [21WLMHJK…5PBseg](https://solscan.io/tx/21WLMHJKxGZYPqX9i4L8Y7e2weHRccBB8UGCUPKLeB4QaAvr5ZRpyGnTdXXDQr7K1vXRNrMPsskCEhPpf95PBseg) |
| 15-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347244 | 2 | 20,001 | landed | [Ratmmqa3…2CpikR](https://solscan.io/tx/Ratmmqa3ML3zLenhmRKbsEUTLPvMG2bRQzxhCERehUFjpJRiXa59aFuGj6Jxp6rmi79wj2tUUGBAKbzLa2CpikR) |
| 16-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347265 | 3 | 20,001 | landed | [3fkfsqyp…iXnfYX](https://solscan.io/tx/3fkfsqypUrRbw3XLENMkTj4tujAUhiNjyLts56xAnypJ9Ndzu8yhASLVzgMbuotpSBzQH9biwBwWDKCmGTiXnfYX) |
| 17-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347287 | 3 | 20,001 | landed | [2jNoLmyE…iE3SzT](https://solscan.io/tx/2jNoLmyE1bhmCA4P43xyz2anQBuR4RLc7nNhcGwFo9jTwTLY1XpKrb1HfY4FGJiT9JHnn1QXrqsU7LYFociE3SzT) |
| 18-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347319 | 4 | 20,001 | landed | [2JM4Bk5f…izHkPG](https://solscan.io/tx/2JM4Bk5fpomMifrE19aBQhm9qYaj6TV7bqYK3DEXP2pSjr1fptQ3X2EhSpeiBCqEnT7oEAViAxoatJzDdnizHkPG) |
| 19-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347339 | 9 | 20,001 | landed | [5s1Z84bW…G4edcq](https://solscan.io/tx/5s1Z84bWbcgri9ydEPeibqygAC5yyKxgNHsxwnh6iVNu8EzL7YkFV3a6mn8qwXh7nQGygYHnmRJS74xVoXG4edcq) |
| 20-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347376 | 2 | 20,001 | landed | [2zjamUP2…KZ3wZX](https://solscan.io/tx/2zjamUP2nnNSvwCPjRQ46Um31PnHpqb31jicEfdMVBuuzPeTTzWfNC2ji3x6FM1ifZJPB7i6ghQ3ZQMzN1KZ3wZX) |
| 21-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347407 | 2 | 20,001 | landed | [4eGYANSE…UDseKJ](https://solscan.io/tx/4eGYANSEtfdaYej7rSbgqzFydwkXwNN2CEhd5dBLdz8k3tdYN9cN9mrD8kCN2umGepd7X5oLRvFZUh1Ny6UDseKJ) |
| 22-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347429 | 4 | 20,001 | landed | [fvp1H3hL…uWZrck](https://solscan.io/tx/fvp1H3hLuJ9oSCDhLLFnaAUYQouEm3bmUzu3YKixFcCmnGB6PHmBTmvE8yxqHhSxmHhva27nrR9GmCbGiuWZrck) |
| 23-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347474 | 3 | 20,001 | landed | [6dvvJTCn…H8oQEt](https://solscan.io/tx/6dvvJTCnykx4m4FdKvaZSEx5RActe4LhbdrRA1yQhUG5QUg5s9AVzzoSUyj6rt9rHFG4FoYL3T6aPoWjdH8oQEt) |
| 24-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347507 | 4 | 20,001 | landed | [3m359feh…YUoWGL](https://solscan.io/tx/3m359fehM11UizrDotLSvBJQ5NquHK17nh38FvpuwHqBxVwBr8cf3GKcKQHAVs2YduG5Pne4HrathoWJKSYUoWGL) |
| 25-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347539 | 15 | 20,001 | landed | [2r1pJJGa…MdeJ5s](https://solscan.io/tx/2r1pJJGazKdyytyPk7XUgDBuM6B9oAjPis63s2FiCBtcfrhEFRUBgWdj1wfd2S78drKv5VrfJzDzVh1DS7MdeJ5s) |
| 26-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347563 | 8 | 20,001 | landed | [42PJ4JKV…rPMjJg](https://solscan.io/tx/42PJ4JKVpdV16Q4XwnqVRRN8XpEerzraaU78j3P3SKJhDQxqMkPwka4Yd5Hj3vDbEiM98TX4ZaGG9CNeRhrPMjJg) |
| 26-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `2nQKA7tqrUoB4P9kXR8KuTUffn1MqDysgu7zBGGoaS1p61ZbsN28TprYwS8XJEXKADgJttHNU5LuBiCpq7CTkQvJ` |
| 27-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347579 | 3 | 20,001 | landed | [4AxKNkT8…QD9gRx](https://solscan.io/tx/4AxKNkT8LSvcNrouHvWgud9hmB6e5x62SBehzHkSXPdzmfTvmBypc9CTeV6S3TPyHaog6nJrMDMAdy4EZjQD9gRx) |
| 28-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347622 | 3 | 20,001 | landed | [2JS87fWy…2FJjx2](https://solscan.io/tx/2JS87fWygmv7BnwHGoaQKVe66dgqVvWcxSULiwCinEqorApCst1961avq6HnpJprSHAkwq8WZmcjdKLFQH2FJjx2) |
| 29-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347657 | 5 | 20,001 | landed | [2Gp3NYQN…JkpYWj](https://solscan.io/tx/2Gp3NYQNUMtUYMfD1yyW96keZnVJkM1uryNg6voqDy4UYixfMwbtdgjBNLVhhKJdRRT4UC2tLQzPeKLRxkJkpYWj) |
| 30-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347672 | 2 | 20,001 | landed | [414gDByP…DtXo8Z](https://solscan.io/tx/414gDByPANMdLmgDoc842Bh27t7sCpuGuKcchtujnC3McLrfnKnuhfhakMBwkMRpwvuqzGHofMdpsSqXQ1DtXo8Z) |
| 31-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347707 | 3 | 20,001 | landed | [3JSSFre3…8fWG8G](https://solscan.io/tx/3JSSFre3vKps7MPzUPf2vAaKfuyPLpfSBb2eYSjXMXU2gcxzmX5ANw592W31i41kD226wwwbvKSwrisY358fWG8G) |
| 32-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347724 | 18 | 20,001 | landed | [2buCciJr…gpnAZg](https://solscan.io/tx/2buCciJrzdDBgNPFA5pjpaHftw38dqoZvUcN4TVmrg2Mzv23puoagAcXwoP7JL7VT6jwWHe89gdZGaX2QBgpnAZg) |
| 33-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347747 | 3 | 20,001 | landed | [4ZBALFrm…MeG6hN](https://solscan.io/tx/4ZBALFrmqKySBW9zr4brLfL5EmkSc1ToqrwKAMiRJwP9Xa1VpK84oXQGk5qniCYVhBKDzs6peszvvHQaBmMeG6hN) |
| 34-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347780 | 4 | 20,001 | landed | [yvvtLDy9…dLPWNK](https://solscan.io/tx/yvvtLDy9w9iknWEP2J6tzNV3heJ2VE2qcGCEb1kcKtaDvEVQHzCgGCyMfewNhE3E4r8GP3QBJMy3WCQ2bdLPWNK) |
| 35-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347811 | 6 | 20,001 | landed | [3XkHhk4e…hEQ6gG](https://solscan.io/tx/3XkHhk4ebGgf9DPpkn4BLXtPZ1KgemcxhY4CdEua6uXEk9VHM3ccHAqUM1Tkxpb7XpJWYBPzRJwsbqv49qhEQ6gG) |
| 36-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347832 | 3 | 20,001 | landed | [zAUmHKDJ…vNHDqF](https://solscan.io/tx/zAUmHKDJqg8KafsTQDFx775CH5ptV5igzM5TNQWbNkRv2wULfbSuc92aYajnHN49oWVGmWBLUcjUaK89PvNHDqF) |
| 37-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347863 | 2 | 20,001 | landed | [3ki4XJKS…3DSQ64](https://solscan.io/tx/3ki4XJKSz1KfVyz7m6nKoZ8ouvZp1hsggdTaxEuRrKEmAh5aeBx5smKz1VbuYKQq2uKQmCv4jDD7G2cdPk3DSQ64) |
| 38-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347901 | 3 | 20,001 | landed | [41868cBQ…8brfiz](https://solscan.io/tx/41868cBQy6BUuay2nFySrAcQNAWUHyzK29oATYyYg6d6npszpppPTq1J9D1iEYvHd7gC5aqR5aqTh7VTZ98brfiz) |
| 39-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347933 | 5 | 20,001 | landed | [eqt6YAed…QUz3wH](https://solscan.io/tx/eqt6YAedQNiP7qDEr3zLTyaqdtEiSJUJSmmLbVCWpfgnv9GBaP3TB2kYdwSduK38xWuhQGqbcZ6ph6GdFQUz3wH) |
| 40-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347954 | 6 | 20,001 | landed | [5p9g9XhC…i19Jk1](https://solscan.io/tx/5p9g9XhCQn7Q8u3RdSR2Y7MRTH3LwL1FeLYgAu7g92Zn4fqM5hSzSVJjUVT2373ipwLXPkjB3nHr7ucheoi19Jk1) |
| 41-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467347980 | 9 | 20,001 | landed | [3VZZdiHM…R5nmFV](https://solscan.io/tx/3VZZdiHMokrA8j1kBZYp1b5wgJ2MQczUH7GpEhDqbGGBMRruLrnHZZU4hpZJYmJ2Vijn6C85gSTuSYT55SR5nmFV) |
| 42-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348013 | 4 | 20,001 | landed | [3DwWZKou…cy62zK](https://solscan.io/tx/3DwWZKouWAtaiYXthKrcptLnf3Lavxacwasxtj5Jbq7uZj4zGACGbq1gqoSUech25eMZFRUadxJeBAkz38cy62zK) |
| 43-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348053 | 2 | 20,001 | landed | [HgUuBjBv…tyw8eR](https://solscan.io/tx/HgUuBjBvtFhxixx242GFuTsv9grP8mFZ9zh4pE23hdkrsBJ8qM6hVzdNfjbSBUECfB48SMteyEp4GG91Utyw8eR) |
| 44-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348084 | 8 | 20,001 | landed | [r4QJCy4Y…2hTNZd](https://solscan.io/tx/r4QJCy4YtyU9rjJYETT1k4Uwobdnec41uNyre14hwpckQbARScyU3JrxTmLbW47JwHrRSX9QWqAuCEwYV2hTNZd) |
| 45-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348110 | 6 | 20,001 | landed | [4fc9AfJB…wMT4wK](https://solscan.io/tx/4fc9AfJBTPzcraB4NwmuFpZJzEF2gfZqA9FgUfYLEFD9X3kgXUGPvtAHaJjBfV25ZvRPPYdTyfyL5N4MeYwMT4wK) |
| 46-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348141 | 2 | 20,001 | landed | [2429PSmi…DWFyDh](https://solscan.io/tx/2429PSmis2pw29X4zDJNp68tKGGGMdovVE3z7hHhBeb8VNMPRx2NVA1Q5FuWxaKwmmtNF4bFYmtiGRQN4aDWFyDh) |
| 47-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348163 | 3 | 20,001 | landed | [ZTALWjPk…SbaYpa](https://solscan.io/tx/ZTALWjPkrxzF1hnVcM79p6osS4ebhW84irD4igp1UfU1jwxX9cUqosCNuvNbzDDZmqgxSRsewYT9wMFNjSbaYpa) |
| 48-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348189 | 3 | 20,001 | landed | [gsNrYHFX…BxhzuE](https://solscan.io/tx/gsNrYHFX7BmJhEpJ6ryNUuwponk2zzcvS3EnXS6TkqEYstsKB88UW6GxA6p4RAEY6ppuxAj8RauGfjUFSBxhzuE) |
| 49-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348231 | 3 | 20,001 | landed | [5oAcdx5v…3MaMqt](https://solscan.io/tx/5oAcdx5vBshFLHVDEC3EAMnn6Z1NnbhY42PTCcZQsHPwmehfeRwejXZoaTCfRDTGTMTnfQ89XzddL8FmK33MaMqt) |
| 50-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348242 | 3 | 20,001 | landed | [12A21fr6…Zc2Hn1](https://solscan.io/tx/12A21fr6obhtNy6Ky6CGJ3yCbZU67nmfgjVSpL99iHrS9CtFic9rhHt4Z8RnJifFgj6dSKWFm3rbaENnZAZc2Hn1) |
| 51-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348288 | 7 | 20,001 | landed | [3QvnYKpK…mNVQGu](https://solscan.io/tx/3QvnYKpK7gGxpn3pyXoXexVkcAhubYoxY31DYHphMswdPQmD3Cvaaq34i86qL5cNQeaX2EY2vHXYoedEhZmNVQGu) |
| 51-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `3TJZ6T6bzXn9k3odD9SatMDj7XZbXeAjJsBZtoyb6mRuJDXdQ9sN7zVGVTRz5GyivDJnMGuxqCky6HpAdy7gzwdv` |
| 52-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348299 | 6 | 20,001 | landed | [5HH8FWry…UqtJN7](https://solscan.io/tx/5HH8FWrySyEoLXC8raqPy81TBykNU3inmktBVgbiZJbtueMqxmK8Mzrbk2U7iwocnbv95HeYyGjyDWFyZqUqtJN7) |
| 52-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `5Z5MUapcu8B63vgVowYxCA3cSEsJ4Qyuv66qJmzBKFfhNcBqLLuYWRUc71ijZSSpMQtNNFagjW6yvfjRFWzz1wNz` |
| 53-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348331 | 3 | 20,001 | landed | [39984gar…ZXpvuU](https://solscan.io/tx/39984garq6mcdRdr5z25fThXCMRcTsEvRYuK3ZjNpaDfzfGn6BV2QJBcWSwEiJws3fEiAEWafgxshQoMfZXpvuU) |
| 54-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348357 | 4 | 20,001 | landed | [3GRSZCmo…X72n1f](https://solscan.io/tx/3GRSZCmoQ3CAmoYaXyDxu8ZFXrnqZ7HYt3u2pZf5R2heTgddvQ6GQyrUoSdKvs4QJcpM4pXvvLAgF19atcX72n1f) |
| 54-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `4qgkKPXBbiA9J1RMpvVYg3k8RB9tvNmg1vgQqpVmKrSm7ms9yjdrnNsim9Tw53BRbcwfQu6q8zw84on8tcN8DdFV` |
| 55-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348387 | 7 | 20,001 | landed | [5HK831QV…83rZf4](https://solscan.io/tx/5HK831QVzUzUUjiMvkocE9WZNaxXxuakiM1NygSe9iZFdtFaMXy6x3cKnrqyAXFPfASQb2WLPDSVpRonMQ83rZf4) |
| 56-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348413 | 3 | 20,001 | landed | [3PytrEZd…FHRkWj](https://solscan.io/tx/3PytrEZdMEuCFva4p2vCEoMtSKdrPG1m6eR2596Yra3UimuxygT6VrFVXLaPEs1MNdd3hs8yZxKyEEzxRYFHRkWj) |
| 57-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348457 | 7 | 20,001 | landed | [3GLQUNiR…Y3vQRF](https://solscan.io/tx/3GLQUNiRPwk6UQT2xA5GaSB4g5cUyqvixW1Mgx9vBMZMNSxhKdKWdn39yAuAPSYpvqnu7wEiiNQcC76HMsY3vQRF) |
| 57-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `2nS6uD3NBiQbQYLCYHQZ2VtBuzpVa1ur1tRqkbraDmMZKRbmAxCZ38XnLmXDQqcFSWUhNCgUNz1C4C3CMdPNi6pt` |
| 58-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348468 | 3 | 20,001 | landed | [4NEDr4Bi…kHkEbZ](https://solscan.io/tx/4NEDr4BiXb8g6KdXbTut5i6FuJGTtaiCaWyWZL9mPSuvRgrCuhc5BAv7zj8aPDB1FBFp9AbxNmvKeQrsM8kHkEbZ) |
| 59-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348499 | 3 | 20,001 | landed | [4HDG8Yva…eDLt18](https://solscan.io/tx/4HDG8Yvafim4Y4qcNNMGvdDafbKW8ydVFNpnskYANtD7Edet1uqVYC6DH4r85LHCxHEE9ofvsuTZq3tG9DeDLt18) |
| 60-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348525 | 4 | 20,001 | landed | [XKiLD2G6…LqRnM7](https://solscan.io/tx/XKiLD2G6JSvAd8jzesDz6doaYt1g8NjNEgPmVM4EiTXb8UXLQFA1spK487sus4JnNXDL2ztmqdUeLb2WdLqRnM7) |
| 61-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348552 | 5 | 20,001 | landed | [XfkYoduJ…PAGXKT](https://solscan.io/tx/XfkYoduJfgGmNgzjMURAStRJYEUx2YXjYhqCvrV4gCvBbn5ecCrLQH43BajzE1iNAABj8742Mo2wyK98wPAGXKT) |
| 62-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348589 | 3 | 20,001 | landed | [SEMdRpny…HBeFd1](https://solscan.io/tx/SEMdRpnyqg8q9siwJweGqR7ykYAbgjqwwQziC4nvqUPcFFQvkTMtPevZ1cuPo4ZLAU7vdw3BLw8WUMxgVHBeFd1) |
| 63-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348615 | 2 | 20,001 | landed | [53h1b4Yv…8JL5Ku](https://solscan.io/tx/53h1b4Yv2vMCNWqXUaF15SrWgYDRituzyorteSWYMoiJm9bAFbQzzqwoUssfsv7EBqnhJBuYvwvMtcMv3Y8JL5Ku) |
| 64-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348651 | 5 | 20,001 | landed | [eDM7QSYk…HZawpd](https://solscan.io/tx/eDM7QSYkNoVVfdmnEXjMmFX62xvtFcjt7tH9WeVmwouaHHR13Xz6cZHLHEKBDBBDRkADrqypLMyfFhnHTHZawpd) |
| 65-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348671 | 4 | 20,001 | landed | [5iBUxg29…ttsLFG](https://solscan.io/tx/5iBUxg29Dn7gA7pzGFcMu1hPuHgZv5f1dY3qKXXXMzyoicgFiZkPXzQXKYJjr44z8Di9mf898h6L55MPUpttsLFG) |
| 66-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348696 | 10 | 20,001 | landed | [484Bewrb…P84md4](https://solscan.io/tx/484Bewrbv4sTmJrwzSi3sdwZ5qAcjkrAmWsQstoU8eYMyGbrrGQ8HDBGvFk8wLtZcUaQn8G6x3Dd6SLYJ3P84md4) |
| 67-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348732 | 3 | 20,001 | landed | [gRZe99sC…MscUtU](https://solscan.io/tx/gRZe99sCF7jQHhUdZP9Q6iZaqMGxuA9wdpk9G27ABwnxvrqJcNi3KaPyqQdBdPYnSDn75Yb5d6rAJfoyFMscUtU) |
| 68-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348756 | 3 | 20,001 | landed | [X2uSc9Fn…JTrcJS](https://solscan.io/tx/X2uSc9FnCZ9bacSjfkghVArvfNvCsHgNaQ4xjaARPJ3rRofvDFN391Ud6eH5pXJsetCwYD2pFVbhNT9TrJTrcJS) |
| 69-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348783 | 3 | 20,001 | landed | [2KFYWLaf…hjHHzz](https://solscan.io/tx/2KFYWLafa3KSpnJuQECxc4P84VAcYJSU9fvF4DuAVsP4kYbJbRdTn4FuLzpvps2vS7WSyL81AsigaxSyVBhjHHzz) |
| 70-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348807 | 3 | 20,001 | landed | [37UjDAPM…RPJFhq](https://solscan.io/tx/37UjDAPMCmWGoVGjj2voLtATJdAZuBajypT6uyj9jpkFr4GxaQjpK6i8xFXuddxSw7drDQGNXzcVic8WDCRPJFhq) |
| 71-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348838 | 6 | 20,001 | landed | [HnchynST…DRa2Ny](https://solscan.io/tx/HnchynSTXi9Ay9dW8DTSS4yLZFh8zC9aTHfV2pPh9NJ5Syx2JofoMVR8eEKFJtf2bSokmw4KYZ6gSWY2SDRa2Ny) |
| 72-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348875 | 3 | 20,001 | landed | [Y8DT7tp2…aAN8zi](https://solscan.io/tx/Y8DT7tp2Xrkx3hF2VbKfvVe4qFBYJYQL6PZk3hGKAZeaFFkGVtCAxhnDQnuKcjXjNX1sHygL7DBxCJL1baAN8zi) |
| 73-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348884 | 5 | 20,001 | landed | [5hBBpbaY…ZRcDxq](https://solscan.io/tx/5hBBpbaYMbn43TWCGrxY9d24SEu7unHPBL4wS5q2K65SAb62MKAbEiRCUKdJVf61cP2FkTjnDSukhm555pZRcDxq) |
| 73-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `2eUqpTBsafisRnNjYFNWR5axm1gFSZMo4qPJADq9rxDf3tLRxps617yJUr37eAfXUpBEm2qmLK4fLJR8waSKcCP2` |
| 74-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348914 | 10 | 20,001 | landed | [3QDkiqKR…Z68xxg](https://solscan.io/tx/3QDkiqKR1XtdKcUm2CjzZZk4q51W86LKFbYtHhbuZ7g9cTdiD6XTcaybJaGo9ynEAvXENhcm6Maz7iuL6pZ68xxg) |
| 75-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348967 | 5 | 20,001 | landed | [3nsXLd1E…ti6MNw](https://solscan.io/tx/3nsXLd1E8f68S3AsWW7bj3RtxHKTq2g5VAP2KGRH7NZSNsPgFNiPYYFpds2g74H5D7LLqTFmBGH34Afaiwti6MNw) |
| 75-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `2TtncnDMnHNuxMhkPY7q2L3BKaZ6E21sQXy3RdWT7gAPonYDvHWWyPgMPvLxzri57P7agWZcAsdfdkgSWR11eMNg` |
| 76-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467348980 | 10 | 20,001 | landed | [4aYpapzA…9Ecuc7](https://solscan.io/tx/4aYpapzATM59wdsVy6fueGSyG7byVPScb3DCUGJXtLFFLeEv5o9MRePzDuD5sZFa5qZMUDeHxrtfSnJSGR9Ecuc7) |
| 77-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349011 | 2 | 20,001 | landed | [5y6SZfQa…nLvjXw](https://solscan.io/tx/5y6SZfQa2N6ai2wevXZ6av2j1j79GtskpE2jvDjG1Tga6NLNiMgn9qwQPUJR15eVPzfNrCb9aBjfq2MQbbnLvjXw) |
| 78-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349046 | 3 | 20,001 | landed | [3xV4w1Tt…Bog99U](https://solscan.io/tx/3xV4w1TtQwevFgNRBF4acCQnP41M4XYvG5KxZ9PJQvUc5W4CN2k5XfdVUS2nvNsMfqQBZhJxzLYtLkn4jQBog99U) |
| 79-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349077 | 4 | 20,001 | landed | [89oEpcL8…H7DzM1](https://solscan.io/tx/89oEpcL8kz621BPjVZecKpPQuj6JyL4aGv4dmuxBwykJUHWiXBqJ2xHCV4oBEnbWJpeEYFxWoVGBB2gYLH7DzM1) |
| 79-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `2jYPnNhKHu9Zf8aDrbFXsJ3xxpjTH1sCwtjyyZ478po5ErzZDtgc6icS2L8BDJ64Lv5q5Q1fuLferYRdqSmDhQA8` |
| 80-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349087 | 4 | 20,001 | landed | [3tnZiPXw…J5tFDz](https://solscan.io/tx/3tnZiPXwhEBeSq4dWhgkGSj9yQahfHUBzXVbHH1jVXwDDNfqEN8JQQ4ayhZ3GCwHaU4BdM7cmfkPDAekhWJ5tFDz) |
| 81-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349135 | 4 | 20,001 | landed | [265RqtxL…Xq3sy7](https://solscan.io/tx/265RqtxLGkamAGTrF7GbRvF5yBcWmhJqwwMqZ2aNVBULeky1jNKB2DnS1KzAGPWfF7crmKKi7AazfFGCBrXq3sy7) |
| 82-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349172 | 2 | 20,001 | landed | [31zotz9L…SPpze7](https://solscan.io/tx/31zotz9L1BLdLug3LhVAT7D3EYXMWGkdxTvN4UbMe9NTdcyD6iS11PLJ6H7avMzv1irEb6j73Y6LNJd2rcSPpze7) |
| 83-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349200 | 3 | 20,001 | landed | [5ztknn8w…L6tr6a](https://solscan.io/tx/5ztknn8wuUXzJZVP7mkTja7AoPYi1rHFUPE6Xauxrw33dpmVRtF1vaakSPA5FSVpEdch4Gvn6GeaWrAcDGL6tr6a) |
| 84-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349224 | 4 | 20,001 | landed | [3gJ1nExK…MpWJWQ](https://solscan.io/tx/3gJ1nExK5v7kfBejQXQoAR4K8VTWQY3UbCN4SsC9cryp9vEZVUFG6C3ioyXyLZ51E9uYEpoonap41KbLPhMpWJWQ) |
| 85-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349244 | 3 | 20,001 | landed | [sBHj3Z1p…1hHACC](https://solscan.io/tx/sBHj3Z1pSEqte3z1NgQLA5jfwuGBdKrRjANHMBiFHrCYKeWu5BHxJ174hU6H4sFhcZme4hgTzbN3V5gvG1hHACC) |
| 86-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349261 | 3 | 20,001 | landed | [Yuo2LfYT…K1mecD](https://solscan.io/tx/Yuo2LfYTqUXXd7GmH8oZ74o2BeKSDWKjfw83vZErXve4WvY9tjcANE7fnwRExtdsZ38USdNXY6qRnRdPUK1mecD) |
| 87-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349294 | 2 | 20,001 | landed | [5aLtHsa4…ihrPje](https://solscan.io/tx/5aLtHsa4w9gp68mKFpcKycge8mXd2GscmuASk52uKyiR6mq55FbfnNyV7ufPm9S3mFWWWE4uXasrejZjXoihrPje) |
| 88-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349309 | 2 | 20,001 | landed | [2uia25nU…n7rU4j](https://solscan.io/tx/2uia25nUE9x2ixKaHrNz8PRahPjjjB1zf5cEwq2EnhBDTXBfE3dtpyia7zU6qRp4RGxBqoCwcr1UwHquE4n7rU4j) |
| 89-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349345 | 4 | 20,001 | landed | [rucyeKr9…agkfQs](https://solscan.io/tx/rucyeKr9ByKagJ8BuNPnZMUg4FDDsocn1A9yLTrW9112Qfj8Ac7TJ3d5FmoWZWBvwgFYjoscNBX6p6J3wagkfQs) |
| 90-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349366 | 3 | 20,001 | landed | [5jkT37XA…zgAbj5](https://solscan.io/tx/5jkT37XAUdhHbvWbd12FNXc8QsFEgNpr9yQf7NL6s2zCfVZs8oqmbtbxp16mJi2ahNgyZM9rB7tRYH1Q4GzgAbj5) |
| 91-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349402 | 6 | 20,001 | landed | [5DiBnH8y…WENuRB](https://solscan.io/tx/5DiBnH8yKhy8bZBoCWZAfUwdTEF3WGXAbJXQvEjE4JF5xbH86aUKHtQTCDX5uUugu9TJqdf613M4aa6YqHWENuRB) |
| 91-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `57rEqb5dgaoSzxpT4E6TREyxJrAKACQhMJcixLTGNbbzV2YznpmBpSZfvDS17YAHfZJ7LFrbZfWxkfDVfzGFjVPK` |
| 92-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349419 | 5 | 20,001 | landed | [4HNZjL5s…JxiHQM](https://solscan.io/tx/4HNZjL5sjus7jrp42pZA5WcEc5Ff8mGz9UevnetK8D3UefXoP57Q49TGmbgCuxBxPdLsW7oBmieWQEX6sRJxiHQM) |
| 92-ladder | v2 step-up | Sender | 1,000,000 | – | – | 0 | never landed: another version used the nonce | `4qArXGXJozHmqEXeFei46eN6CwYWwSLvrMMdmhYmjsLMLoedRG6CqEbcc6vyjKiUMF2k9nYaozUhxGPrPwLjiCYB` |
| 93-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349466 | 4 | 20,001 | landed | [3qtaDFbB…QCsQF2](https://solscan.io/tx/3qtaDFbB9Auf5fGow6YoN5ewb7As8QF6DmiwqmsKejCyx89dzGVGC8zUcZfbWKF3P4Wpy2stukrzKSmJmpQCsQF2) |
| 94-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349486 | 6 | 20,001 | landed | [322kqw56…5Fq4ea](https://solscan.io/tx/322kqw56zbfhCnY99mnGeSSo1qnyvehcfwnh3u9do6oh4EANDvYC3tSXdTpTmfBGLaN7hNpq4SJDCt2PQp5Fq4ea) |
| 95-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349522 | 6 | 20,001 | landed | [3pEqZZ8Z…SBxcZ2](https://solscan.io/tx/3pEqZZ8ZZo5fHh6vxc8tADLP9WwuXYuwKiQYJQfEBNcrhBanmwY8pkr6dQousEyNe8D2oGy5k6kADhW9G3SBxcZ2) |
| 96-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349559 | 3 | 20,001 | landed | [4if9rtfH…f2Mt2k](https://solscan.io/tx/4if9rtfHPbGLURtpcHDucjs5w11kBjB5iC4yWaCAvJyFn5jxQ7ogjQsFp9zodbKz7Pj6RzU2ArCkC2xYEVf2Mt2k) |
| 97-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349585 | 3 | 20,001 | landed | [62CMQMs4…b6jUbe](https://solscan.io/tx/62CMQMs4qKDfVNGTsYW9gSANUGnoF2DhHjsgZmDMLeT2YKivYWyfw7dHWt89yZx3M3XoyAgdi4qkiQJuGkb6jUbe) |
| 98-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349590 | 3 | 20,001 | landed | [5DXksKZ9…uckbyh](https://solscan.io/tx/5DXksKZ95MWYNWK2rrcJFy4Q2AhqdACQspWDJD8Bt834fauCNDqfCsTiGoG3QzFYd6S1GVbYzwygNWJUNXuckbyh) |
| 99-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467349636 | 1 | 20,001 | landed | [4nWSzSFY…B2yD5g](https://solscan.io/tx/4nWSzSFYa8kvw1nQDnXuLYAy9G7PPVQeAmZWKGikLmpvjRqLH8ePqKrMGcVdJaZzEwQf7qnpX4Ad8YMNFJB2yD5g) |

</details>

<details>
<summary><code>race</code>: 100 operations, 300 transactions</summary>

Durable-nonce family. Three versions fired at the same moment against the **same nonce**: public RPC (no tip), Sender SWQOS-only (tip 5,000) and Jito (tip 10,000). Exactly one can land, and the winner shows which path was fastest.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-race | racer | public RPC | 0 | 467346810 | 4 | 15,001 | landed | [3LHrwzbh…4nYQXs](https://solscan.io/tx/3LHrwzbhgxX7Hq8k9NK8gCcTgdn199UAGnEqrTw1XWTMb2VTsZyNMCkSLNiirvHFzHL7prmcUCMg3ybtgC4nYQXs) |
| 0-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `475zYhzWkcEnj3mCWXHbtVXcxRUyF37PTpP6tB9ATCtWEDimiWL1MPSuupvgw16L7F2vvEBMb8jhahF6BG7RKvyH` |
| 0-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `3mbV9PbehKGBbBJfZqJQmmKgLXqY572KJdndMiuTgsW5cQDVB3aqaZm3TJaCF6qykAAQcmGAyT2wZxmEhFxtNJZB` |
| 1-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `2NbjRRUNFQbcii2GzLS6n75fkVxTWPMoiBKmFw72pRsUo2CSTXSPZdesaMM2yoc6VfASqHHbNKh69Rc8ELY8yNFU` |
| 1-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5Qbo1SNvxfYWhoLVqpWpZBbJBKdAiegdzCapQhBRjgNKex9fA9vNsFHy8AWwN2k2rLwg6Mt5YM6zHJ4U7BMBT91y` |
| 1-race | racer | Jito | 10,000 | 467346826 | 5 | 25,001 | landed | [5sCjFRcx…pBud97](https://solscan.io/tx/5sCjFRcx1k96WUEtVNnGFtAoCeSfobopMdxanjo7fXF86D3XU3MqqHmky2SKJaYiqo3vAPSuJBkna8X6ohpBud97) |
| 2-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4rk1nfepFHvMh227BtMzBeU5nhaQz4LVJvU25coqMBHHhfDAdA1cEiF8qXhKyzNticU3zHx2QhWdyugeEKxE4Azy` |
| 2-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3TZYQQMfm9mq9EgnBd3sm6xqXzuaaxT3kvU9CLhC9xy5yohp8uuUkzkS7ZoELZSCPc1LdRTJQcDTfYjLomjD1tkR` |
| 2-race | racer | Jito | 10,000 | 467346867 | 2 | 25,001 | landed | [3yamrxqH…Z3HLHY](https://solscan.io/tx/3yamrxqHtpLLURttXu6cVsA6dS8EojhnRsipKn8kU3cSGAk6tNaRS717CCsk1xmh12MGchhCUEZZ56r1mZ3HLHY) |
| 3-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3XhQ3NNXRepLzMo3FkLgTTsMVknD3oMEv7ySg87LnAzuEVmiwo7Z42e9SxGeGCthHDLd9rC73quzbtBQBTx3YnNX` |
| 3-race | racer | Sender SWQOS-only | 5,000 | 467346903 | 3 | 20,001 | landed | [49PMDyZX…Dx9qhB](https://solscan.io/tx/49PMDyZXwBk3NEahWSSjU5BUpZmMHFJ6VCSSe4s3aXPkQWAXGABbmkWvzWPEER6LNRscK6Hvbag19QbKeXDx9qhB) |
| 3-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `36aUtYopTKdoMrjLuSP8RPBmsSMFbs6mEJc5HbcbiTY4SpT9R6KMpdumHJ9qwDrWmgANieh9Qg8ybBLGjXFaKxvg` |
| 4-race | racer | public RPC | 0 | 467346919 | 3 | 15,001 | landed | [3ufwuMg2…XyfGR6](https://solscan.io/tx/3ufwuMg2r3rSvL6caLk9eRc4BJPjiU86oSXQcruXKBRY1NhcrPDteCFmqcen821n7ReiMuUMVwAzo91woAXyfGR6) |
| 4-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4j6p6cmRuQj4nWAyVt77siPdL7jhpfAYVgpnU8fc5dUGd1u7y6cDb7TcCRrYwd1Gso2vAewPdqapM8EQk91Ms9wW` |
| 4-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `359aX3B3b8P1oXjYX5GauDZLoYMYJXiEBJG9aL6n1nrWJpsPiZtYvS8w3gYJp4Kw8MUhNMiDeQxmBstBWYx2Pi66` |
| 5-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `oHqE3BirHsiKDrcGpixBdTq12qp195MeXmzYx3Avjik95ngNxSzkQxhaYXvMS1uHj1MqKHuhSdQDrDSit5uq5qS` |
| 5-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3bB4YURgYTgaS2iAmXC3qgjbbZeeYSttrq8q4JLBsFYE65MHFD4KcWwMju9fWrgkbCyoqDgypr6PBKWuPMCEUQNZ` |
| 5-race | racer | Jito | 10,000 | 467346955 | 3 | 25,001 | landed | [qV5wRrvq…Ho6z82](https://solscan.io/tx/qV5wRrvqCxGEabrVueQ3bJ588eaZnfHKmR1qB7ZsqbEnVY95WzSuDdmKV98uqdC1vZemHu3AtjuxfMVRpHo6z82) |
| 6-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4fiAGmSwqh1viRvT2ebJMs4tE1ASr5jZcTEEgnPp6Q3u4BkrWZ8eP4xK8qZfHXQD44kA5u8CwnxVPdttanJTRznD` |
| 6-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5eEzbzY8ZNb6vNGtNBaaU5nbYGYyQZHoCsYbHiiZXZ9CLB4MTvxQyFBkeToJ2BkDNS9jf6WAo5csAeSch2X9SE4X` |
| 6-race | racer | Jito | 10,000 | 467346986 | 3 | 25,001 | landed | [5y5jeYEy…6tsoXZ](https://solscan.io/tx/5y5jeYEy3rFFvmtRpuAfEUg9rzttGawXRUouE8ia9UgtYLvx9tpfyzHt1CVDquGrCxWcjjSMLFvX8tq9eM6tsoXZ) |
| 7-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `28byFdGZ4PCU1eXqH4Xu9E7N2iEMZu8UFcYTPPD9Qe4uE153gigEhxp7fPzrqG7E3pdVKUVKyFUuQWeSTy7yBTVw` |
| 7-race | racer | Sender SWQOS-only | 5,000 | 467347000 | 4 | 20,001 | landed | [GxeLDxkJ…VgPwt9](https://solscan.io/tx/GxeLDxkJJyBEH8STqk4zshREyzBxUYUcvqfp7UWZe8UnMRxgN1s4kmASKB8YBUvfEdHj2m3bF7FYQNLDFVgPwt9) |
| 7-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `3Zyhj813gmgMUC8tfuZVGqV5DEijodDLg8kn2pFCk4eY444C7MtedVGQfANezdf6ERpG8Qmeene2CRGaPtf9bRiF` |
| 8-race | racer | public RPC | 0 | 467347037 | 2 | 15,001 | landed | [61Sqtt6k…Qthknv](https://solscan.io/tx/61Sqtt6kksZet3rRG4RSYVMGVqdeiahVbPzzPvgyTyPiZRVdSHQX1gAdjSWrHeL34bQqYUjB2rUxBueTeSQthknv) |
| 8-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2pRmVrjh4BHw3HcA4EpgsVcHapKJinx69bGnDzjUTcTAS1Uiqwak47bnA5ha5MCrxM3gMaK7Wi9JQcyqTxJ1SZKt` |
| 8-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `2q9qsNm15rJtEqCWTeVhhPDcShJ1Wt5poep7mVV3UANTUMSUWuAXBS3fT8oUcgU5XbQaRNXoooqNkdVpCLn7FfHW` |
| 9-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3mi7Sf5DXePenCpAKmEhXV5ieL2PDhtAaLLggLMAKFcZV5EHbeq2xMYBYghpHoRZeEQB9qX857PH24GxUfQyaebR` |
| 9-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2xTHGiSmkFnopwjteK9ZUs2WMLMkqe2rrQ8BeXeJRcGp62u79cgcMRimjVbE54UECtksNXFEvDxSs7oSfDomRstj` |
| 9-race | racer | Jito | 10,000 | 467347079 | 3 | 25,001 | landed | [4N7mkj2S…rLpg1k](https://solscan.io/tx/4N7mkj2S98nrRkLVbtGXREquQi9HRfgADLkBqevbpXHyDMkBk3izGgnsQDNk5Hy7t1hV6m9sopjKUv8n7ErLpg1k) |
| 10-race | racer | public RPC | 0 | 467347100 | 7 | 15,001 | landed | [4cSXDmJj…ttLoxM](https://solscan.io/tx/4cSXDmJjsHJY8uugjtXxrKTy768MTWs7PqPbeythfXjjPgewm2c4meuNQrbJJGw4N7EjPpwf8gnyaNjrWBttLoxM) |
| 10-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2DJ838KcbT9bLqpj4Qt4ESmVpynC7RZZVELP67gCfXs23Hbj3qShu2kguTy3yFHkuK53UbNpySGQCNHrGajGQLps` |
| 10-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5JhLuXTiQsShrTNUi9SaEjhAyDWPP3SpfDkFrkGszpmSQKrhTh112BmFuavbNjWwbJLGfeu3hotCcbTwETKpcwWo` |
| 11-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4z1hdpxj2YYvZ4BnYthQW8HYgc1C96sofQYYg6UUwenum3SLGfcjHsEjDCuHfUye6oE6zyd6CzcsWs7wdSE6n26F` |
| 11-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4J4WuUrKSrychF8W8ATrMHit4Q5UgqSh7g3AA8reTMvLSXR6416Uc18EfvwdRFQY4mroYXh4j4jCCoYDtdbbprJJ` |
| 11-race | racer | Jito | 10,000 | 467347127 | 3 | 25,001 | landed | [5r2RLFW7…xjwcEu](https://solscan.io/tx/5r2RLFW7Ho66i2Kjoq9EGtoicW7xPx8yPJ4EDjMzWMD2iqwvwwMLyNypizyuiWVxNZi5qFX8262kmKUKiuxjwcEu) |
| 12-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3HozPRQ6wBouiWT1eA3pMppd2abQS7bgecVMQpXkjmsJiPAs3iV4qAYXKFbKyrEX2PLTdAbLrVu8aFJCRGQ3ijZq` |
| 12-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `aSV7jQahbtsR8uD33w4ngHDi3oGrny5unpfUTWyWmGgVrNQ8VUq67WCDXg95L2tKcaoYk5LKrMxw8Jcgvupjjnf` |
| 12-race | racer | Jito | 10,000 | 467347149 | 5 | 25,001 | landed | [Utoz8xC2…ZQnvyp](https://solscan.io/tx/Utoz8xC2HoTmhFqhqPZwT8WwxbVy2aaHqzTnjYWnUpVzcEc65iipPgt9En64aMJr7Vq7f8LTF1tbqiqKaZQnvyp) |
| 13-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `LVonccb4up7dCVi1YFuFwSzTUVuZUAREEHM7qF3xMzQd43k2FTJh1K13nh5tibsZScqKqubyG9ZFDiipKw8zbr7` |
| 13-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `Ux3VYgkHYpk1sKMTkBgTBUSEEEpFG7gwLjVnN9Pmpe8kWRbrCxePKP4yStJTQp7gq9WuALVJLKcfzpmCk9KP2AD` |
| 13-race | racer | Jito | 10,000 | 467347175 | 4 | 25,001 | landed | [5Gpz76eZ…QHARuV](https://solscan.io/tx/5Gpz76eZeJGLDqBhJjczWiWsZVozJ163D2fKpqv9DAfbSYidcVNn2MRbBzubatg5zQXxKokCCTWYoEAEgTQHARuV) |
| 14-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `41fWBXpK7AFbDvEa4ij3BjLAiFbKFgfwZaEXPcRJpBbiHsdMaF1uAmGdS2iEx54m7twkQVMydxQarRCVfX6HKWLz` |
| 14-race | racer | Sender SWQOS-only | 5,000 | 467347201 | 6 | 20,001 | landed | [26BVa23h…KzRD6Y](https://solscan.io/tx/26BVa23hedA2GB5qdWoRnqhSfUsmVd63zjDq3eDtTMfA2jid9QLxcj9uooJonW4Gg8jTHUwW9FYRP492iRKzRD6Y) |
| 14-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4hDHr1KirT7zg62zpFuQzV9JHK9se9otXhPsDbBhjZWoF2cTkxYs4NhoY8xN7ZcWwxXfreR44xV8TDJZCM2FBPwX` |
| 15-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5eP1bLYasviT43B6geVzQUhLerNxfJwsCf5DHjaNd2j9EwZoGQwMFqHSqWQtqM6J3d1jbgFXViv9SndNhtcraYHu` |
| 15-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4tUDqfwHn2tGAWhfeEiPkWXn94zCtnmoSS6GJg5xdHnscyEt61AwuEGUUMo2JYCcYsBaf2zJNhx98FBw1P13duLo` |
| 15-race | racer | Jito | 10,000 | 467347233 | 3 | 25,001 | landed | [U8phdZz5…oDD5nc](https://solscan.io/tx/U8phdZz5NrnB4r5SYPsAuwWLDfPMB2cXwoDMw6BqVA3rYvndTmyGcG6QwE4g4xpYeYvoXWMAD5PUE7SU6oDD5nc) |
| 16-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `2fvYQKgsjocsGEahwxNGAdTu6p2pVbtcCgHUSfoNYZpWeLSf6P4SWa7mffR8HKJquN5SpJ5teBwnfqgdaG37RCDh` |
| 16-race | racer | Sender SWQOS-only | 5,000 | 467347276 | 3 | 20,001 | landed | [wFyPqup5…kvRS9A](https://solscan.io/tx/wFyPqup58mnCmoxBGvDkb8YtMUuNE2dzuYkPBEbgiE3HefNg6PKhoBfmfDeNpHzegzdJyw2ap8i6vKmQnkvRS9A) |
| 16-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5DYw7AdDx3prEket3A4PEck2cYK7A7FVhAPugG8TC26NChgh6mzvuddwgCGryb2SHuBxDB7B4cR3hZyUAvQEC2vv` |
| 17-race | racer | public RPC | 0 | 467347281 | 8 | 15,001 | landed | [3pBZf3ey…N6U5cT](https://solscan.io/tx/3pBZf3eyt9DbWQzi9YSZ43amZeB8Z44HKDStADAhBCCq181iJUvZfYTbEpv2R4shu4gLG4UneXz4wHoPmgN6U5cT) |
| 17-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2jn5pVBnZiQbHJFHFfdxLpqR1actdqdZus5Kigp48nrt2o1ddXXPHZ5R8UcVQjMkgV9iFbHYEtoYYt6L5LBmy6Hs` |
| 17-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4Lw3qgYRfM6Mtb91VymzY4HAxb3GWAKed8zHbdcvejMUZkib8yCyMdfSrkHwBWvLRfp2hGYh9sCUaDCht3zMhLUR` |
| 18-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4zacQyRisNPhd2LmLNG8NXA54ebcfLsJ53Gn7YmKjVF4ZhVSohJA32Cs5w4JBTr6rtUTmm2YLaozSoPypRkBvBnk` |
| 18-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3WUEdreWA7e8tF45Rug6aoM8qnrkEWhjbj6FyoaAD498ZLbBkdNhgVe7YNZuG1hGsqf2w7oPxWCLg83WfeRCtP9z` |
| 18-race | racer | Jito | 10,000 | 467347329 | 3 | 25,001 | landed | [3zkFxJiH…mPDN8x](https://solscan.io/tx/3zkFxJiHVi8uGtcrdPd5bBXnYzBojEbA2YwPGDfgThRA2pv2mZS2xbMdCQ3WCMccz6uQZqp39irujThWYZmPDN8x) |
| 19-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3a2Np1VN5u2vCEPavJVvyp6wsctfa2ftPwmrZg2B6eghC8BQGb8khZidRc8HaGH7LcTztFjpUPj5F7fpsa168Tb8` |
| 19-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3Bk53zoZdLhnfVo12Yb9WgPqWFQfKB3ctMxDYNk5U46vbz395tHGsb6SHYeJaPAE72xQ5JmwCJrFjyAdPeE5nVwq` |
| 19-race | racer | Jito | 10,000 | 467347366 | 3 | 25,001 | landed | [2ZWzcFGq…a4JxL8](https://solscan.io/tx/2ZWzcFGqT8CKQzyVf4MCzkUi4YA9uvr9UiaMmcZn88Fd9R4qSgnnERV2JbsqMrax2ZqkEt5ht1NQSEM3Hoa4JxL8) |
| 20-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4QVzkFNmQPmojUdUpsusn7PRyYuZ7jkMbLkRjBX5fC26TJYeHr7GKT49PYYZUEB8PyrmVvAt7Wi9hEDx5ojATztP` |
| 20-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3M4vzhuUpqGn9RQcjBSd3rjpwtYU9vnK9CEBDW7NUyQKwFJMisH9jYUpptRtzRJgBZL9axutMU56xupzi3cj5Uh5` |
| 20-race | racer | Jito | 10,000 | 467347391 | 4 | 25,001 | landed | [5SA9AmQa…ifetdn](https://solscan.io/tx/5SA9AmQaiShx9twgPtqGqhgeSQjVCAqJFvYSAjsjMmRVZnCGXtwfShSoMsra1oZZhhUB8inLXZWtEjxeNJifetdn) |
| 21-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3BZXfTuPbEHkvULeNuCNEMUJe1EJ5P2jz45isCHz2aiTVoXjjgKuAitUNrLDC4zVMXjvTVsmS9kDzfrKDBv3hHSd` |
| 21-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `31LfLfj2E6Wfx9g4BdzGJo5baoAia97ABkFeeGBqa25zcbNiHaRTv1ziAg77wAzwm2wgrVBp82ZbtouCDcqMZbw6` |
| 21-race | racer | Jito | 10,000 | 467347402 | 4 | 25,001 | landed | [5Zpyuzd6…Bw2C2z](https://solscan.io/tx/5Zpyuzd6WW16Ckgs1z6QCJ3HVU6KZFMDxgPLpfHyvpbwtxDirCqu84xaH2tkrmEDYgBQgnWeAhqncBxBsWBw2C2z) |
| 22-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `43tpxJ7kSCaCP3Kcwruk9fZrvXbN4uNY4DKqq5G12LXq1fe3DTYJfjwNtA4FmJPSycfQqbHt5CtfFXd7PbTwNtsU` |
| 22-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4Df2dohf2q35e5UcagD3h7fq67Bcgh1otTZd5uUXqkvjAcJF9nbj8PXgFdMj41wUami4UjtUa3T6FiCPVztgaYc8` |
| 22-race | racer | Jito | 10,000 | 467347448 | 2 | 25,001 | landed | [4HzrqsJM…mdKnQf](https://solscan.io/tx/4HzrqsJMjD6pvYiPpZYqCvQdbCbNWSRVBbELPoVFfLGGkxxiD8yxrSayMqC3LZrE4mmbwgrff6mWfS8zgJmdKnQf) |
| 23-race | racer | public RPC | 0 | 467347469 | 3 | 15,001 | landed | [66bWfdzM…xMD7Zk](https://solscan.io/tx/66bWfdzMNJFN9mJqYRZrsykAyANnDJU7E7VEC7Ku9ADyFbcN7gdiiJfg8Gymv3VtaXbw92uq1rdoaUz528xMD7Zk) |
| 23-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4kVVBxLTjMrbiN5RiJC6BNJUjptb4qoqukkKPjfnnyn6D8NYSoy9EqLBmWnJLGAWnr63FC8Pf8A7zsKomsGRt4QA` |
| 23-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5VV3EKV7g8yGUvUyhi7awifwzUVoszUZaNg8ybY5hEKH7kygM3KbU6zgcYffA2DPcobCnL3Qtoj1WpUyfGrNnJc5` |
| 24-race | racer | public RPC | 0 | 467347490 | 3 | 15,001 | landed | [zv7m1FiK…te5dxr](https://solscan.io/tx/zv7m1FiKKbjbEoKs6paA1YrGHSdXcQSNT2y3t8QM4dQAQTN9tQRrEe29qUCfvZmHoYeWU3cyUG3kUXAD7te5dxr) |
| 24-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `42HU6GETnUJgiDrsvg343ZsUwjSBTthGP4DRJ7NwL5qtroMpZW2WFLictJbQoEz8PeG3WoCWB6BcMUxP7pKVUASi` |
| 24-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `2M4kNVBTr74pfnQYkQtbkLFC4NwUMgKNLJrEHQ56uUviw9qsxzvTMeerhYL1aawYbzXyotJbVHhnyxHHL9RoPhjP` |
| 25-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `53MzripGEMVkjkAW5qbRnjpbhrMeFjdiEDev2PMMY1YanuiRKiuRCQRvsTorQuGL1savB3U8PejBjfRmUqqG2nPV` |
| 25-race | racer | Sender SWQOS-only | 5,000 | 467347527 | 3 | 20,001 | landed | [VhLPbGWG…6CdJBh](https://solscan.io/tx/VhLPbGWGdaVG8aXp1CDY3sHWcDy4k9uZkuC4bzwjUes5tbnJBoVX7ymsAe3dwdLMsx6SEUjvpCwYcR1wQ6CdJBh) |
| 25-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `KfwdMDrLLK7e95msksMhCt7nScbDqw2cBzqCuk1s1o7in5ALe6bSJgBCjAp7eudncwJgExuKxjUCsn2XnNSN3xH` |
| 26-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4M2ujVyvgiZB1FhgtVPVQAbiiGXYB1WwrFG8Bir3nQFThnrmMuH83DgmMeR4wKk2F6h7NG8yJYzoXP1WpcPa8osS` |
| 26-race | racer | Sender SWQOS-only | 5,000 | 467347558 | 3 | 20,001 | landed | [589W9xc5…9g6D1X](https://solscan.io/tx/589W9xc5p3dvAYwseZitNbxrTbk3zfcJWtLXh8yLDVdRyBYG2QDHwGRWvxyyQDJtXrPjuyCxQqkudgno559g6D1X) |
| 26-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `37rSyo85YLEArHdmP2icN2RsK6Dgi96tucjAR9cyMkaHVhQYL6U61KvcBDVw7jgXF1cEs5GTxeb45hJQpGSfX7FN` |
| 27-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `cVRtzRjJdSActBppdkMg4yafzmyyFMgJGXVNfEKrzMCaRmNFH19YEF2aAsmJpW4QKy9Z4oaviw6BGTKA9M5v8Lt` |
| 27-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5maRDaZk5xN34VWrUg5Z9mJVB9Nj5iigL3GXoyQXMmyPUMzKFbPy5fvofg8PLBfQarMS15LR6Rfzk4tqGzVBBAQZ` |
| 27-race | racer | Jito | 10,000 | 467347584 | 8 | 25,001 | landed | [2W35oTZk…Chz4Fg](https://solscan.io/tx/2W35oTZksrtWYiy6G68m5zArLbWtdBPvbsAdLYcyGYUUKnzACXyLBu9Ntbaz6tU5MA7JEjpCd8NDNnpQHVChz4Fg) |
| 28-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4UA19EHZg8f8SVLSyb9392nn65afohe52Q3DnQNByHDbPJB6adaDMPH36WLv2DGmRyebUNR6MhFuMxzU2oMwsRm5` |
| 28-race | racer | Sender SWQOS-only | 5,000 | 467347632 | 6 | 20,001 | landed | [qXwL21Ph…9cZjfP](https://solscan.io/tx/qXwL21PhUBJxZjhhSBizhvYgxwx3W5Dgazrx3g8ALtFcko1MEifnzNYA1EbLSkEkse7BCerhzeptZ3TqN9cZjfP) |
| 28-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4pL2cdxPjNUBRrmYe3qrHe7zvfqwAbPGETZ2pXvDENFqwwspnXTxh62vTo4R3dPnYrSzqfFYPfu8YatZDNqyFAuD` |
| 29-race | racer | public RPC | 0 | 467347638 | 3 | 15,001 | landed | [5uMWS4oD…Fs4oUU](https://solscan.io/tx/5uMWS4oDWL6868SoP57uL59c4NX4X5AgjdivCFeadQ4ahkELtrV5kvfG7ZdCugNwj39mCoVUGHbshJhg2KFs4oUU) |
| 29-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5zYTvp2RVBc5h1YDaQvShpzdH7SJZkDbo84yYxK4tCtHWiYECbJctyUEHMXrLNqNRDhRheLM9wCBVo9yhz1gvoRo` |
| 29-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5FpqPrJVtz81cZWbztdSBuPyzfHBgM8Kk2wi8YL5ScNzhv94wtbJyTaNVPPdcrVcA6tMF8T5w8HTeR7HhgKXpJBh` |
| 30-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3kLruTfBAFjzVUPwyv4uRnzmKNe66G8qGhxipQFmeYCtWnUKkinefgWe9oJkwrz7fujE8p8usk8bZhoKDtehuwz4` |
| 30-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `33n8TwV3is6E7dZv6DrQjDNCZ92f6TchsZz3PpAPccr8qYV6ZdVnPWiEBzLsUjZt59aZQSL3Ep5jnGwL1xek9Qga` |
| 30-race | racer | Jito | 10,000 | 467347683 | 5 | 25,001 | landed | [Zq3hRTTA…pE41De](https://solscan.io/tx/Zq3hRTTAaQ32XC8vxjPtgGKUV5gbGGKN4RMVVD1Sf81iPGRNu9PPq81SmSLpLsGBRw1zrPHCCedMZ3VihpE41De) |
| 31-race | racer | public RPC | 0 | 467347692 | 6 | 15,001 | landed | [3XNHiS6E…kMcfDS](https://solscan.io/tx/3XNHiS6EuGx1n1ZspRxJM9M23zRPGRsS22xqccCtJqhGxefd4oiGPH4Dbu5MZVgCZJsiwLKBJNhRe1uoXAkMcfDS) |
| 31-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2X3DjfAtPECPAvExrb1WVF8NmGi7uDx8qJ38HiJewMVNmqPzsxSRwp5FVQeunkSsocwTKiLY1mNx9USX4LZfWty4` |
| 31-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5i8p9imK2ixvP7uJrqXVPPgqumvBFkLMPArHQx6KEvJghXvwPj1KSctCbQHhVsT4GZSnaP7p8G6xCUxetLdUNxGn` |
| 32-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `2QJqaPjv5FoHKyScCGoynqNa8ZKAatqpAJYc8eXVtB4Vg2QpXci9PwemYKJQAKkWtsk9xm3n2qER2nArtFzEw2zZ` |
| 32-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4keMKEnYfGh9fsZyktWS4LScke5fMEkRekcxWcQuDBnRqQeXJkBF4tb83Epj8MZTWhtsiwXPwDWxLA9WjbyJK1H3` |
| 32-race | racer | Jito | 10,000 | 467347728 | 22 | 25,001 | landed | [41Ma62re…jBsqU1](https://solscan.io/tx/41Ma62reuAEfoDodNhJGoD3r5fbV9ro4nLzrr5gTfsMNnKYG7guT91JE834S6dVNysvCbMby3mMGh1tBvHjBsqU1) |
| 33-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `B5WBPEwJ72sogW1LEzZzh4Unxy1RFAEy83DeJdzAPoHASpobY8rbSQNbujrfm9WtYuJaAqDxrVysNrBrJ9NrgSo` |
| 33-race | racer | Sender SWQOS-only | 5,000 | 467347753 | 3 | 20,001 | landed | [r9PR1JjF…hMs6EN](https://solscan.io/tx/r9PR1JjFJSd7VcCHXqFMAWY35HuyRi49yFkgqp8WQi7Zj7CRBnYTY6KoJNoT9evZLc6Z9XeUEJXAhPexQhMs6EN) |
| 33-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4eCVcsuQvvcbfns8X1r7PUoPuAnWToAxPVY6NcyJmbKH3g56erEfM6KwV9uH27D4poe199SFXmGZjpstVYqdyxVx` |
| 34-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `LDBaG3tVbfgfbubjZKD5fCvFfVQh2TbJPVnuX2Rd2da1kPs6uXFKo84YHx8zXyf7PAiuGjJBFouVvmCLapaJqR7` |
| 34-race | racer | Sender SWQOS-only | 5,000 | 467347790 | 3 | 20,001 | landed | [2S7hWZVw…MvghoT](https://solscan.io/tx/2S7hWZVwgQ18oge4LbRK37jYPHmTpEJtTdmNXPjZ4GNyTjm5TwUNFt2rt2zR4SRCzbfTHAvXcvMd2RWnkoMvghoT) |
| 34-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `26kCmUKMLbAxhPxLwyvdRRLoyR23bozu7M7ZYnfX2b3w1QubNCrAmtukcgYLzN3R8g3F7jVFTQ2xb6wsa9YXTZtg` |
| 35-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3u7cydpMGYB1f8GRLBE8zh3aES3UkBishUXo89pu2s1AQVWqRyDapY427xha9rn1FjghMtk9GcgfeQtmGLWy9fRe` |
| 35-race | racer | Sender SWQOS-only | 5,000 | 467347800 | 2 | 20,001 | landed | [3GwQtEDr…XJpQKL](https://solscan.io/tx/3GwQtEDrxYHg4a5JDCGVyf6AqVcr6ykibk3qvb75xhXPfCoo7kWvAs5GLmXVoLH8xs5ZMVqyzq6CvNvS69XJpQKL) |
| 35-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4RJc5WtFvrfv1Y6Aew9gto3EdtEWeCrDEMMz2Ww8HJ5QzvvEN1ux4TMXH5AKKezbAKyU3uSLfBWgCS8VZxzRFbAY` |
| 36-race | racer | public RPC | 0 | 467347837 | 2 | 15,001 | landed | [3CzdVSGE…W6nvys](https://solscan.io/tx/3CzdVSGET5nZJSJSZcRc3N5daPv45taJsWn1iiGkgFHc71SPfDjgPk4xzJ1peWpkwuFQ3o8eiVDhCXGc4gW6nvys) |
| 36-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `uQr57cR5t4AzSYZbQBsfhBkoHw4GYdpPCpc4HNLDPe73joLbt9C977xgP8SGyw7yoSSAoJScZuQ1gEdxMtEXKfB` |
| 36-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4V9cTdmrd9cmbfBpcNT2nvL3vrzPReE6cWGqqw8DXbgAwPZkLcnsjNAiqEeLs7GDCC4FSEY7wLv8MANK3MaScnET` |
| 37-race | racer | public RPC | 0 | 467347869 | 3 | 15,001 | landed | [3HpbbSkU…tawhdR](https://solscan.io/tx/3HpbbSkUoE4uzaHoC8PU13okL19rwvU35GYYkBH2JFz2hEzBtfw2CV5KYX4QhsDcRSNaxQCKFmASTBBj7LtawhdR) |
| 37-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2r9CiG9Vo7P31eh7XvgfWosvaxDAowLU8wKJFCyL7471LT29RgkxGBEiP8Y7NjU9om4C5rq3P1yPHH3BG9ZcdjSi` |
| 37-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `3hsyTzgurStzWwqDYyS2UcWD73pSZFfSDBZn19P1D8rXX35Ha54XnnfnzxhiY71VurbEpjkYeURizJPvMZtZaxKh` |
| 38-race | racer | public RPC | 0 | 467347896 | 2 | 15,001 | landed | [DJ92KEzo…wGUpzS](https://solscan.io/tx/DJ92KEzowM7Q12365dHYooNi3fgMpEAdxPqvXgpyCqFB1ho7jSPqR9Jt13BKTapu2fmKjcmFrzEpg5QbwwGUpzS) |
| 38-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5URj92ecQGBe8SK1hjAtghcz5AC9t3vP9yEHpx6Fpmso57zMQQhjhEPuutMYeREpSF6aS7mHmW8AVFKX3fUMiCVc` |
| 38-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `nu8aUgC7bPhqHoD8DWQbLZ87xxM4fd114tzXzEu1P9EQ3j6iNdLdWz176XZ1YqZyc2MFSNivPLrh8a4CwEtivuH` |
| 39-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5T7FkunumLtAerTaz1fZRPqnAZ4eeaQFMr6GywnAKZMXsciP4fmr4BK2Tcjntf4K2dA3yicBGbSQc4UtYrDqVDyA` |
| 39-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2T2Pdc4aTwcs2Rr7Gi2SZKA6g6VFVroEqzJwerUk83BdmEHSnkQg9gad8WnJHvuyueZvKyEgnRyuk8ox84UomU2a` |
| 39-race | racer | Jito | 10,000 | 467347921 | 5 | 25,001 | landed | [5mJZHuJG…xKXjSD](https://solscan.io/tx/5mJZHuJGMkoC9oHHtWYqjUhagtMbDdUt3hFoL7rZhBxgrmaS7pFcTsYRZBfih835GLNgngMR3tJsYTu9B2xKXjSD) |
| 40-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3cNPWSc7VVn7gRKoGd39venBYdRfG6XG9aEh61eShyA2yiX5EXZ6d4C1KRSgZLN8fXMCGnYvcYMFhkFXTdeUCyGu` |
| 40-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4djQXLfp7dbzarWF9FssCDLoR1Ep7Hz5CezejckMsMnHy64V3sE3eqcq7rdMQBZoXFFZGqLWVeCrppyM87Zk8jrx` |
| 40-race | racer | Jito | 10,000 | 467347949 | 3 | 25,001 | landed | [5xd7xBZV…65rmsv](https://solscan.io/tx/5xd7xBZVHgooY6kMnScnXaHYgWbgre1AQyzUcihzBMthkDTvsatG7Q1Byc5aTMoT3q6iGBFKc45qSMQL2c65rmsv) |
| 41-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4aYmCA7nj9PqDwtuGcqJ3oAnAFWneatWWNHc1KTrcYPdZwGjddkYMboxMian21GBmRskzY5AL5mgWu2KtbmrbAyv` |
| 41-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5L5NdjKGVQguyhSBefiUimvntpheM9cgaqTcHjScoBihLLnYavvF7uV7q1DdxK4kcQtxA8Z44YENjsCGnmE78HMj` |
| 41-race | racer | Jito | 10,000 | 467347974 | 3 | 25,001 | landed | [FqD3QkW5…VcEiqp](https://solscan.io/tx/FqD3QkW5FzuQTNFvu1Nfnq4QZGFgH37qLQpXY9mxgYaK4Gveaoh4e91YUA8gyZZzoBwQuA1zo7pNcipGVVcEiqp) |
| 42-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5JK9yfAEWdZ8uX1hW6ToW6Vp6bdxkoJZjY5hYzy7f4s9LAf6tFBRKdKSRMjAzv1nJYxVeqYHnYeqxwUGFXd7p6CZ` |
| 42-race | racer | Sender SWQOS-only | 5,000 | 467348007 | 5 | 20,001 | landed | [3rSwZWLc…DufJTG](https://solscan.io/tx/3rSwZWLcB6GKt9whSaQDqKWrhiSijTyCNd2F3F9Kq6CYD6NxT2itfB5Ad7n9XbmhUfqto7bXqy6YHjjfRRDufJTG) |
| 42-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4TKTdzi53XqnhiJTDmUrafGNghjVUagUQt1mjHpUdAm5Yrhan7VPPtcrV3dP4zpdrPphkMgBW2A94g4uW39Hsdd8` |
| 43-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4UkVDhX95hfQYqTjBVG19PMaV2dqFEAGN5jPbHVastCULxXNYrqz39UBWUNTH2FECKrwbcuCkkVbzCdULA36rDiW` |
| 43-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `42UNMfNoQumnTGrQaUAXbPVqf1x6EEvuL66WRbBzhnt93ejcAF2CjUgCGdVESNUevWL21kmcyyCzLFqwVdVk2YnY` |
| 43-race | racer | Jito | 10,000 | 467348058 | 2 | 25,001 | landed | [5R3qwcsv…drJxyd](https://solscan.io/tx/5R3qwcsvsGXsEoZzF4dSxuCEumAk2nsGy9DUJBJKdthpyYXsWF7mzzJoKrqgH9HRRE3b9YGNxRY7dmB7W4drJxyd) |
| 44-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4Fu3HEi9g93xuUZq4SVm993zXzavWWNPqvtYypY3o4fDPVs1uqZrkL7DW7agQVDkXWuV3WoUTSbM5DmzWzLtDh8c` |
| 44-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3eazCjEiP2PNWjENi6qPTcNSj22rkzTvXWhcAPVMG3gWgsNyvZzmShKRucqp12pSh2XwSbhD6nWSdPAsjSUdFXnD` |
| 44-race | racer | Jito | 10,000 | 467348069 | 4 | 25,001 | landed | [2XchPh6e…HJG2nG](https://solscan.io/tx/2XchPh6ecLwn8kD5SuwAVHDz96QW9oH46wgrU4RshSGCoDVsoKi8d3CP3KRGJmokh4FqRvhC9rk5173NHSHJG2nG) |
| 45-race | racer | public RPC | 0 | 467348100 | 3 | 15,001 | landed | [5b5xNna1…Cy8E24](https://solscan.io/tx/5b5xNna1F4gdfDb2NWbSvpQ1wrsg2cyZPUJrprAN8nFYjJ9VqCEecxNWrPnjr5zbnQCFTigTDZ6CZ7CseVCy8E24) |
| 45-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `222ZbnRtXsjZLZeQ27bjtiNTeW6nK2UB5EjnLuzLXLMLzXUwg6H4mEAk4WgFBuyY73APEfqPxexmHtfjSEv3nGpy` |
| 45-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `Xwha4VLF1APkj2pt7KzsLL6aa3Qw3u52usP5mHrBPWdH9y25qvE6WadkoaTPfmSo3bsv8x6U4hbDTNWAv8wfPGP` |
| 46-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `r5mwXQBDbTYQdCt7yF6obaPU3foT1VTmGL5uMjCNwY9uQXGXyPRatMqYKemu7zWdWCSdWJvREENv6Yh4jH4XFmy` |
| 46-race | racer | Sender SWQOS-only | 5,000 | 467348136 | 4 | 20,001 | landed | [7GmABfdV…iqZLC3](https://solscan.io/tx/7GmABfdVgsVw6zTLMSXCSuF2wFcArZjLJa3chUGkTEZPUzermdGi2N97bZWg4hyqs7L2R9jctWGBMADKiiqZLC3) |
| 46-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4GGUyg8EP19WsRitT9U4aaGKNwNsndY2CYJ7GNsG6vB9cCYbFqgm6yTF9tr5QweBwgjFtJkbtuYpvVNxKr7oSnNg` |
| 47-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3LuDacMb4sDLKqg5N32S29C4Ahmjz5CzLg9CoUDddmqzc4hi5jmrzcHwKmzV9vGzT6r6RpVoCqRxZzHKxhTop4ad` |
| 47-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3xGjqRLhQAbva3o5AdzQUmLGbY37jKeqzA73GLsPQr2pHhuTzHdyuSSrbWPAYWZdsGade8QfQ9bxcJBEgm3aNR3Y` |
| 47-race | racer | Jito | 10,000 | 467348173 | 5 | 25,001 | landed | [3MnrDBHa…QwUFci](https://solscan.io/tx/3MnrDBHaDWL3DExj8PNiszKDTrc3uCQVMWUhVdukg3iVE38dBCXyyixLRd5Utvo2qG5yXrEfP8PzuSEwZQwUFci) |
| 48-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4m7TdRfGRkkfasjDmqQ3cFg7GBMn1FxwyArqcd3MLcGLK16qoiq4nPzYxX48bsTVvMhqeyMgvR1rK11n5roNRoLn` |
| 48-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `gzgAkQiD5mCZgJcz6opyr4VJbBLdyJGWzr4gFU7jXa7zNik7gGsyQzJnRkDBX21DfVarLKth7axgjc9KJZ49jGF` |
| 48-race | racer | Jito | 10,000 | 467348185 | 4 | 25,001 | landed | [ujpnsGVh…YJE4KB](https://solscan.io/tx/ujpnsGVhatiKzUbZysgNiRv3i7Kr8kGGcZRhyJa8pL5rtwj7hhXvHnJkARujkuLcUMy6VNUdjUtyCg3GbYJE4KB) |
| 49-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3jk1JL1UuR42to1RV6rjorPHJs6RJCbsDEPpyFzg7sYkRYNSXf5M8nVQKiEXU1QcJMBJ9B5MQU2p2ew2KmBcbbec` |
| 49-race | racer | Sender SWQOS-only | 5,000 | 467348225 | 6 | 20,001 | landed | [pXTrdUDT…XFSno8](https://solscan.io/tx/pXTrdUDTH1PXZadzQMSpDFDExNFeC7nFQK23ZZcft2Ud4G9UTTFANn5p6HVQrnZsEQh7QF4y1s4heBmQNXFSno8) |
| 49-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `ruHPVEcwgmRQiHJ8hhBzboYaPsBiPTiQNBA2PtmByQp4g8UyJ8MDUqvkQadNqBSwfKdgw1BqX8NQ6uGxqX8RbbU` |
| 50-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5GHfnMxVDQmxTSFLWLBnTQf7apb8dwwiyfKa9ehqPzsRhoCPnYdEZBPSSd4SVrpkDGSiebB1uSUTN6HFjpVsdzPD` |
| 50-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `cALH3Vwd6GbRGM6sUDo7yyQSLehqQqF2ZFktvBTjQxK2DP1g6Kqehyy4TWbEmVBtBp5stEn85gts8JnPaawzzyf` |
| 50-race | racer | Jito | 10,000 | 467348253 | 6 | 25,001 | landed | [57SjQkK9…ZH8oAn](https://solscan.io/tx/57SjQkK9omigGpgsnm3CeGJ6rm2kkTYzMuikcCKQiEdnGohPWEibK7Q3TM8vEbFzY67QFTXiFYXusU21jNZH8oAn) |
| 51-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3wN8GGvCfTjecGAAzmP9QrD8Ume46eTcA3Kwtc9QCzuB7wat1HbSCiw82WKhkrV7ywHUQHkxcwqVnFazoe5ftYCG` |
| 51-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4byZazwTYvGxGwx1JDC1i8EN8x4HvkUasYkVRYyxepPERDmZkpZ1kDsoiwJ6JsYgbK2Utk7DzHiAmpiX6YcbQPU2` |
| 51-race | racer | Jito | 10,000 | 467348279 | 6 | 25,001 | landed | [3HoCCcXK…Jxkjad](https://solscan.io/tx/3HoCCcXKs99aMx2nmLsvyVBpJPVWf17iYSTyegAoGogp3GMZ9nosEC6K6K3QwNThzVCPt5KGR8k4cppPaiJxkjad) |
| 52-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `26LtngrAJ4yLXpGpb9uoagNWRWBjnNw5JMa3o4XqV1zXS3EKGgxKXykMjVR4BEtKST4ANRUdQ6fYWka1Pou4JCag` |
| 52-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3YWcLasmHH729miguN6SCGNwjeJy2hpZgmcRYorXUJLKmSmN6aEcWouCXDJHT2NdQ9UFeGpZNGqXUWKrWqHAN93Q` |
| 52-race | racer | Jito | 10,000 | 467348320 | 3 | 25,001 | landed | [5gcYM5ab…1KQS5d](https://solscan.io/tx/5gcYM5abR4HLYNbfhCmCPJLF2F1ecuKwDHsVKRN9afbjNeiU5k8MJiVt6AoFtWiw9539VUDXjExbGrgzeE1KQS5d) |
| 53-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3zNDU4gfh7kM1aJXVEitdTQ29f1aEvpzNZhqFvrd6oUjnQsgffo2YdSQopryjbQ3HeqQGaQqdRkLhtX8LxAFoNU9` |
| 53-race | racer | Sender SWQOS-only | 5,000 | 467348326 | 3 | 20,001 | landed | [o2UQYkyJ…mjmRF1](https://solscan.io/tx/o2UQYkyJMH8M4JzM7X8fUT1oZrGi6hy8SKLAAVVZD7nqwYiRU2Kmua2ocX9Sa6rS5YgtsocpVBqhMVS7wmjmRF1) |
| 53-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `t5BMVmCVy1aBaZwrRefSHem8cpFV5ifHe6aWLG55vBLZzMpStZEnpsWabzGbg3uN64sYxu7bShbuxME9pDq4X5k` |
| 54-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `2qHZUxb6eiCdvvcwL2wMrLwdBWqh1AUT7QsAMXz7YTGmGgQue791SW8Z1hswNnejGo3ScKi9UJNyxdppgvGywyA8` |
| 54-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3t8ZyGby6AzpM8KQ4N39Yz2Di3Mh984JYk7HtEZq4uhjXs2BTwvJyjAjHNuMxjPubpFZfdHgp86RXujbZZUmTLtW` |
| 54-race | racer | Jito | 10,000 | 467348377 | 2 | 25,001 | landed | [3wRVrEKA…cMh9ST](https://solscan.io/tx/3wRVrEKAoP1ShW7mYg1zByQoqYPAte7N4RuFpc4Z1JmbUoNds5Cch4N9byZC2peD2UWcj6QoMKYhx7fKYzcMh9ST) |
| 55-race | racer | public RPC | 0 | 467348382 | 2 | 15,001 | landed | [3JfCmYWX…dxmPtF](https://solscan.io/tx/3JfCmYWXnTYGC7QenTCDB9H7eUZfcSXpkAbn68xdfotEhFr72WoXxEvDhcPhdVdzYsvP4j5m75FYJftrU1dxmPtF) |
| 55-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2e2jkjr7j1bht5Uc1zVZE9wDPhaiSSNyzy88ySmqQkTsSjQq7eEf55Doz9XuoSHyG2V4VZkJm8ArH7DRpqX5vJ9E` |
| 55-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `2qmrrTJpFvWCDhwsPz8dFzg855ycSmZufLZDCeHv2vEN5xphgBDktBxMgnWLeeLUAbcczTD49wVhbjGvyRybZmfS` |
| 56-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3YmY74VYJodwsDqPKAqvuweyD8Ghky9pJksCoVHkHY9bwcWSy1XGPu8Nzhd6QpcutfWwkynTcjK6D76Nb4HzoWwv` |
| 56-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5vkM3PsDYunD6vB71p6oZPiPeJ3rKaWFtKWKz2rfCfNsJ2nQruJXtY9o8HBugL4q8KiRZxARzyq75gYhToj7mjU9` |
| 56-race | racer | Jito | 10,000 | 467348419 | 3 | 25,001 | landed | [2TPNKpYv…jZuFYd](https://solscan.io/tx/2TPNKpYvzCKjw7gygTxUd8rkt7giWqPSe51Cqcqv1oMTg3LJWLHdT3QtBNcWbJkYbJbtxecMDnuJvmPMtqjZuFYd) |
| 57-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5qWQ4TPz32oqdA3X3U2SbjyAgGBXqUwTjtH5VRbNmqnxZoGgmxcqXMMcqvBqiaZsGLk8Qk8mzCPj5ucQjenBW9s8` |
| 57-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4Hv2T8tSsaCd3PGPmpcTRmy4BgXTRcvWs4CzMxqRgBZ18f2EoPqnugGoBt25TZAZMFCKMhzzFiy6JRZiA7NRQGS5` |
| 57-race | racer | Jito | 10,000 | 467348447 | 4 | 25,001 | landed | [3EzS9Rgv…hVWc9C](https://solscan.io/tx/3EzS9Rgv2KvSoKxvuxrkXtoHjZaRb3QTjAXGyjxsuvhTSY6JCg9jDZ5KBB2onzndMAqMpY3fRQeyw3ZzB1hVWc9C) |
| 58-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5bZPt4ViTRz2EuMvFXntwDQHo22GeE249Earuw2EdVxdaV3JyqVv2YC1GtkAZTKMdoCJ6VPy4Esxd72w6qcnDL2K` |
| 58-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `64dV3aLnjbaeHQ2JczHEYUdvJQep319BJV5Gs3NegtG72SYKGH7Ff15uS7deWgJP2F4dqKtieUq1rfiKGxWdueAF` |
| 58-race | racer | Jito | 10,000 | 467348479 | 2 | 25,001 | landed | [2AWe82Vf…zrUgaq](https://solscan.io/tx/2AWe82VfPyoCx69KEXTZnCNJ5TZFXwmaV15Q8Jtp1KS1K9jJU8vG7Xukdo4QB4wiJQcKquXpgUHmeWoKgjzrUgaq) |
| 59-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4x4M8Nfv6z86Q6CGavGQA69pETRMd3BC1uSkY3dDmyWHSFtNoBXa8uSJoMudKmxFRV3Jimq2uED48BRZ7FkJVVQN` |
| 59-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3idmrCbx263AiDic8jaJjtVKvQswEJYaToXfMrCfYBAc4eBEafyQB9pY5HPXMo3egJGS6SbCAfMdwNBd5zzgeDFM` |
| 59-race | racer | Jito | 10,000 | 467348509 | 4 | 25,001 | landed | [2iJxfkbP…t66UnH](https://solscan.io/tx/2iJxfkbPhsVFpqJwHdPNQP6BNYYFg1qMttNaJpzhbJNY3PBuzDg8jgqe3zDUZLyzy3ihGk6g9toziPPV7Dt66UnH) |
| 60-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3cEFa6pgWhXrujm14vrNrvaX9HRjsgcCQeKo4HsvkvsazMDLuEDYyvWrKCLExqhpqRnjVWG71qXaH9fix33HUQL7` |
| 60-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5WGADEGQuA4NoKUAjGAeaBGc27ZUVgvUFr8E1KydY7u3BsbEGm4gBE3o8Dfuzr8fR3L7GUekr8kxzkwM6p8LCJYN` |
| 60-race | racer | Jito | 10,000 | 467348535 | 8 | 25,001 | landed | [5FSzitXj…Beb7qs](https://solscan.io/tx/5FSzitXjk894o23XAQTxJuf6VtF3rYCD6dMda4xQ7X3N65k1P1hREi18hoNq6TVCWsuLbMMFLaPu9GdBH6Beb7qs) |
| 61-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5h5aAovcvDYFSMkrS86Lts4nXbk4YbSWYbgSjAMz1gH8N42AarCcmabXnuWABjaCXkXHmdmdqmr7GT9D36uuGLqf` |
| 61-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2viA15RYMLoxVsMUh9XErtLFUroBwEN9y1QAKV6eRwnZ7Rqb4Lfp2vPRKBf8MQrKU2UJS8eJrYk2ayN8F671hyqD` |
| 61-race | racer | Jito | 10,000 | 467348569 | 4 | 25,001 | landed | [3zvnzEDA…NnxH8q](https://solscan.io/tx/3zvnzEDAqBAuAwKaWwroQNb6PFMMMNzzsTXy9kLphFGMqenNaiXi7Qs1EYFNxWREvCGGVnj41RRmpfZsnqNnxH8q) |
| 62-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3vZb9uE9vCUTxVQUwahrw5uni1qQJ69qRvkWimZevdsPfFyRkrbauS99W5Xi4yk4TEUhu3SHPKkheeUAx2n5ztya` |
| 62-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5HnQrdkHS2NJDpwYZbbeqENeKPdPYf6mfBpkboFY6Yu798V5DBw7uZbPcr7u3G2MRkET8D1QYCVhuCjVkhSdP63E` |
| 62-race | racer | Jito | 10,000 | 467348584 | 2 | 25,001 | landed | [64NMbthF…qDVdfv](https://solscan.io/tx/64NMbthFjWbxjkr4yT7Cp3EM89HvJFgPB9pMm6dL2AC4pnuQkTRcNx5XmLbqWdQdbxB7yqLGqM9hg7fvvoqDVdfv) |
| 63-race | racer | public RPC | 0 | 467348626 | 3 | 15,001 | landed | [56abBD34…brcBW8](https://solscan.io/tx/56abBD34uSAmQ56twsnNR97F4HqiBvYbh169dJkBEY5T9oxoxdRjWadQTG6CamQ2SoQfMj1uXFimTadPfAbrcBW8) |
| 63-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4mvihg9Cftmsd9ndSNunEUtGTFLE56KYDJ36nJoQVto8Ytxkh3EnSzCA3nMRUNgw1jVKPJUaH2qzhPZKEheapVJs` |
| 63-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `b27UZzag6KC6vGHJAdDiN3inKVrZttUS2GfCiC7XDPL5FZzpYLtuN9Fn17SfPTvMGECaT77pzyDb1dS4EyxKgM5` |
| 64-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `38hz6iKFuxnPGMD1UXqYiTH9uN2tYgrWSfTjagNCqUy7N3Dq9QF5tDyKkyx4xZWoruQbdvpmTxGLAYtxk3aYYpJd` |
| 64-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3nQjHfeJZ7aidDP5nV27FDF7ut39qcmRksYnNzm2mj86r57un4ULgqAvSqgUjZw1pxLg73RpfFXcMekHk62bXJ2w` |
| 64-race | racer | Jito | 10,000 | 467348642 | 2 | 25,001 | landed | [4z5tHnM3…fgw5Qh](https://solscan.io/tx/4z5tHnM37E6mxBVGHA4D2BCj3YD23HjhoBQRMEuwZmXr9MwxNnPBbSJ9ZQ4HoAV4jQrNVMj3DXHkwJCNf3fgw5Qh) |
| 65-race | racer | public RPC | 0 | 467348680 | 3 | 15,001 | landed | [2V7KGcgB…Xz8B7c](https://solscan.io/tx/2V7KGcgBSAVJDrg6AVQrxt3kPg8QriB3NaLtxUuAZxZMtoBX6fbttRwv45W7Md6wQe79Khe2RG1TPRWn9GXz8B7c) |
| 65-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2vrRq1qZpK8DpJXSyvPjUXLKVwcE76M14N68Adq5Qw63HxdD79At9qxaEKzZbpe3EXUidCwD7TX4Vb9esi8Gt3n1` |
| 65-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `3ygnuRCnXyjfsLP71GCeEaHQgYQc1smPgfZtdJeedTgM9ChwytZegvCx2613jMgmVwvArXtv2i7gmw8AaHhkaM4x` |
| 66-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `552LBUdjRggpjx7ajed4HcBzU6ZMakFYBJ688pwPJwQUkftp6Ba682UMSJ9UhbbGRuiWvYz3CuNZib9H5WtceHy8` |
| 66-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `54kYPdkQ3CqHU4Fex3d6vgD5S6MaDkGxBKpJcKgwKWqWYsSCboUhQofiVNvDvck1mB1QrACMogdxgQQAxHnQvYQe` |
| 66-race | racer | Jito | 10,000 | 467348706 | 3 | 25,001 | landed | [5FrApGeB…dbDk36](https://solscan.io/tx/5FrApGeBuY8z5hFzhv832FqVTLTVjhZHCB7suNy9DpxVWPeWPGub1gj8TvxLYXkm9R5SZZowvaQkBjjdnKdbDk36) |
| 67-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5FZ9SYXGguWTzscZbJpMFfUWQsUpLXQufmXbBtiKJxuXKsRTAMJper8kQru6PrJNH1pPEBr8CBv871pNkxTMgQXi` |
| 67-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2s466J3nHe9H3ZxnBkRw1GEgADHRxdTzcn2jeDkFcuzLYj9h8etHfDrdtrS9XDZ9gX6Q6QHFRrGGgVVa6CkENoV3` |
| 67-race | racer | Jito | 10,000 | 467348737 | 4 | 25,001 | landed | [665esYG9…pRmYmn](https://solscan.io/tx/665esYG9CNTNnVZU2PHrw3eKyE5vGoRog1VWZa4Tu3xhfLCxgaXwQesmqGPnuL4JxmrA1u36FSBpRZGSA2pRmYmn) |
| 68-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `uDV8oSUCWZWnzNJjFLByWpRrLLvXcLicgHikxYQbEdwuSyid9b2t4E3UewEwdDYtrNeo9btr5L8xXoZwMsSsfY5` |
| 68-race | racer | Sender SWQOS-only | 5,000 | 467348767 | 7 | 20,001 | landed | [3oNLgXDn…JEEpmx](https://solscan.io/tx/3oNLgXDn2DPx1jx9tZSREXbvFJm2kk3qAXAT4ngZdnKeeW6MuqBiY166KPvrCQuTt1tCZaG2GdYt2N1mTGJEEpmx) |
| 68-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `423qdioqSZdTaP3uietTzHZdh1Zq2GpzQ5RjaYGD1w15HMar38Cjozqw1NjDXq44yaGaHz2erqNYkBMGmmtMCrwA` |
| 69-race | racer | public RPC | 0 | 467348797 | 2 | 15,001 | landed | [8JwBo6YE…AonMdC](https://solscan.io/tx/8JwBo6YEFpeSeFQX1X5fHna6117Dh4etBL5GngJy8GVoCnPzcMagbyRL3eWpS1BBqhZEnz2HpyANwuwv5AonMdC) |
| 69-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2oKKxabSRgPW7bAqun46SsBazyLmFBSSDtTdcCvbMLLZCWWGWyRuoatpMgJXv5fBNyUMmAimdxTY5me4Z4mqHpy3` |
| 69-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5CfK3T8adg1LiHQt1b7bmaYR8Vhk2NzHoh7Q4k942APmbwotpY4xK879s8M46cDT6kryYpZy1GBREgfyxscyTPxB` |
| 70-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `btGWsQrKPH1ne7Zs3ueVqbSTWJtvfHRQXqZQTtAK9xp78Ra3uEWk46myCHCG72LmMRF5ntECjtCPEe7s2kWJdiV` |
| 70-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `qoKXhxYSnZMLwrHQrf5N7PJQBMUXf6bc7B2Rhi9GPrYyzjJWL9xgFU28r4esCjeEmZc6JwU66CW2ZVB9vJ5JK8a` |
| 70-race | racer | Jito | 10,000 | 467348812 | 4 | 25,001 | landed | [3hZLLQqi…3pJoeV](https://solscan.io/tx/3hZLLQqiuSQpBH7MzjBEB7cEHiMz61DPfAskpjt6dqTkL9dXdkepEtULjtbDKWPjo8TzbSMhWF5MhpXMTi3pJoeV) |
| 71-race | racer | public RPC | 0 | 467348854 | 3 | 15,001 | landed | [4nvAMm9c…vHdyub](https://solscan.io/tx/4nvAMm9c9feMMcX3ooavpu7N6H8TS8jJXDDV3zqRtNFsZnBoHqR8uKfamiZphjmsQM16hydC6oZeNmUvrMvHdyub) |
| 71-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4FFA6kr4Ee5Ba1Tqkkk9BvS8TRBe5duS8RBZfe4dzet5UubJoohhhayzGWqibGCQr6Fm8h5f9bbADSft4aGBa1mo` |
| 71-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5kvH5uUpeejV7qJhAXLUsKE9huzqW6Sd7fgQorFd99yumsrqBmhou2y6vjixncUoptLLoNr2JVdhbFErwSQywB5m` |
| 72-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `2oAo9xtodxBHVsnpGQVevbT3fasmo2Ef7Eym1RTqpsiq15VmJzRH363ZAQXLKRKmi3KXW5QBsqKfUgN2jBocrd4m` |
| 72-race | racer | Sender SWQOS-only | 5,000 | 467348879 | 2 | 20,001 | landed | [55G8j4Si…ySCBQc](https://solscan.io/tx/55G8j4SigorHrnPJrEk1b2nTxocFWpaoKrLUa7A5jMKZNaE6LTBi1zzh4tALPQaDbB9iY6EbxAEzA6pufVySCBQc) |
| 72-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `2tGms8SoJQkw6R3BDs2jCDpdoHwwdGV3ToQCmTj4CBCN9dkD92UdW4ENgg9i447cghCcF1oRpe3G6pBCTuEjaG9u` |
| 73-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `NHVRyCJttErL7dySzALPDaz1GJfLnSEoAsGNYi2ADQdXEMhyguHxmgcLSe1ihjnbt1MiM2ShsmRQpqg1HHtrX5K` |
| 73-race | racer | Sender SWQOS-only | 5,000 | 467348909 | 5 | 20,001 | landed | [GRMfs3E4…LoatS3](https://solscan.io/tx/GRMfs3E4X7rT4bmrZFbj3f64m12hkDaydKY2zqU4kBT6u7J5Q9EsFaoteG4ybDXgFBb1cQR6qbABsfhFWLoatS3) |
| 73-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4ZWkSQ11PwVRhwmnC1iZiHt6jUFAHfmYf1Jk9WHNanu2nnXfGCJriJ9gP1iZthFgcdfVzhthykVDiBzz9uEGz9gK` |
| 74-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `2b83v5vmrs3jsEeAVg2tohD9DicD5fhM2iBoRig2G1Ah2KZFLxygdcFvGfmYRiWMspxon3BBQ4a9wGKBXnQwVctm` |
| 74-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5C48yUgBEBRAzX4KVBqdHS4Vguz2nqbqtAZfnbchewk3VB72ntGd5uJHgAYPqYTVBU3A5T77sxaykZ7HXp3pSLsn` |
| 74-race | racer | Jito | 10,000 | 467348934 | 7 | 25,001 | landed | [2m2m1som…oXY3P6](https://solscan.io/tx/2m2m1somxTguTC4joZtVh3ey4wxGcTMEMcKdpp8GcPeLMHsQNEL9RjLNqxSDuusFKxDurgTCsywTYdJJapoXY3P6) |
| 75-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4Rauwe26Q6ehMaLY9tABbpJaq3XMp8T48H5V4aJdgFahNqNbR8fZ24HurxAi54qZ8icSbb9niQXAUGdH1jzkFZxL` |
| 75-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2ih8DzX6q6xGxfq1J5hfqUkLzciUh9iAQThPHB2GDvmp1HUuP4LJD56KmERPAn9xN2ig13EQmCjuaTaeDeb2e7uB` |
| 75-race | racer | Jito | 10,000 | 467348944 | 2 | 25,001 | landed | [4pJyUNsx…rcnB5f](https://solscan.io/tx/4pJyUNsxpRmxqDpcxdcVJAonzJ6WnWRr5bspE7VHc3MLKfEabQ14cs1QZzh42paEJ8DDfFvLpVL7yDrJdGrcnB5f) |
| 76-race | racer | public RPC | 0 | 467348990 | 2 | 15,001 | landed | [3y4kFxED…favMhD](https://solscan.io/tx/3y4kFxEDaeNu3NyMawLt7Rph3yRtBWZqq6B3xZiehNhgyKBmnzdbTcRZABgtPM8wZe62PsFjiszahF49LwfavMhD) |
| 76-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5uwUvGsKWQR5PYHEAjCbjektMFfmXqHQZddTdogXPVbZcR5Nc2r8rtbns7ZgeYxw8D9auBt1i3kxtgcJJAn9xD2c` |
| 76-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `42mCtRYSSp3WHqk95Dodf3m9A85RibgEbv8WngsGgxKqTQHjxFcTqLH7rSY78ta2esSfPEzYJj1a3J2FJ7SyeYtv` |
| 77-race | racer | public RPC | 0 | 467349021 | 3 | 15,001 | landed | [TXSZL6Ex…UpSAgy](https://solscan.io/tx/TXSZL6ExMkde7wdRVc7v8kBXk8AFk3wnt9hoAfnotqPGMAbmEzzcFrb9pgNAQNL2b1CXF71JjnVminhewUpSAgy) |
| 77-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5vQ7Kyn1Df4DCTPmmTYhQXsfC8jUBN9S3M8Wdri5tfeVpFK6KhBZZbWAWcQyHELNyzjNoErjeBSiMyhjfYHHsRmg` |
| 77-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4w1fn9wXg4pVCHhMMGoWJmftoo24GqmDLwFaynPqwH4tHdTQjoUWWTqSY12LG25cdvAsrzeu6jAiuhsEsbVLiFC2` |
| 78-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5imjG2dkiXrtPXJY9X6ihbA6UcSPZ6fsWPUek4KfpVQoyR3bL6whe9VbZ8uL5f6jBBKqGd1nLANDoEvbUXLKTtu9` |
| 78-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `cSbNrp6vrzNtoiRKJ4AKzj4nU7kDSHCjUQPNDi15pnABwQYRq4tFDYD3va6TmGjGroGuD5j7siEyL4QxQKQtkYM` |
| 78-race | racer | Jito | 10,000 | 467349041 | 2 | 25,001 | landed | [66chMjA9…JXVnNL](https://solscan.io/tx/66chMjA9zACDyGbzNCDn24PDCfXhwMJvHgzy5QJvGgbHHuTbMvk99k375bM1sjC22Zhj4gVRRoTrSMuRrjJXVnNL) |
| 79-race | racer | public RPC | 0 | 467349066 | 2 | 15,001 | landed | [2TFF7ALR…cdudtp](https://solscan.io/tx/2TFF7ALRLAW4qyNfcUeGZV2kqgDkZ4Unt97y6eTxvTXvek5KdSZyzmTUutAGFcdq84ZkP3C4YxsheqLapbcdudtp) |
| 79-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `8btssbiATQXLwNTcRtbSTEmPwYeRujvYrhhP9KMz9EpiSFdqswSb1BHrYu7SxhM6r6LBYaJT1LJRbT2Um8RiSb2` |
| 79-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `RMGDhFkxxMBq2oEMDPaYi77A4LAt94EM54zqJRbnaEh71q2mt83ddhCxvph9m7RSWapjiM7Q7kr4hytE1vctWrJ` |
| 80-race | racer | public RPC | 0 | 467349113 | 2 | 15,001 | landed | [3GG1savv…9eARdF](https://solscan.io/tx/3GG1savvTRZebw9c7Hs4TJSeHa7tTagmxDqGdjbftmakSX2y3WSPyyYiQG9mHWMGhsyv6FtDhzrANxv9AE9eARdF) |
| 80-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `e3ndFRvQzoxHCRV2DYAEhTPJdeYgSQLtYKErquq5eWThefDbo3WP1aeEF1zBJRKsxSJyTzfBmjb1tR9j3VvJxne` |
| 80-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `Twzf7JMGrE5RwagwcsCKBQRrTP1mKvYRQbyr8m8HDbv2jPHJMdrQkFkEE2K8qygMwDBCGHBSH7dNLRaqtLLcGtW` |
| 81-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5K9XRQMVZ4UM5xWyRHLdGGWe7KDmfoWWWb2PET8MKm9wkeWQMMpw6H93uBJ5taPGbsdd7mNbE6Ah7rJYoa7grBa8` |
| 81-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2q5f7qn2cg6zoMtmHS4ExdAShyPWJmw6PyYnKxXF2bC8HNh4B2ZxT9RNFhJAE6s94zvGnqwGvdDvoqf5iFYmbsog` |
| 81-race | racer | Jito | 10,000 | 467349130 | 4 | 25,001 | landed | [2eM85fVv…Lw8xF4](https://solscan.io/tx/2eM85fVvnGffe4xJk83GZQQ3HnbrHqbuhfPvfH7WARKd4NwZ8XBJLqwKs4egY8LNztF5bS7JbwjTd9Y9ivLw8xF4) |
| 82-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4jyXPmK5UURRuWTZoZ4HUeeAZJ2Uni3ze44XiBMbao4duYvViTs7JHm1hCUMtQn35zka111EiHzqg3A7FcKxaPBE` |
| 82-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5b5SRZn1w5aWR7gSyFPRuX3wqRFT3bJuAapv9PsYb9y1hPESPsWsb5Y8cwiucZjrNjRE5MuZwoXFgGvixNJuaByo` |
| 82-race | racer | Jito | 10,000 | 467349161 | 3 | 25,001 | landed | [394Rvk1X…q9njjG](https://solscan.io/tx/394Rvk1Xx5wrfaonSSL5oQTwUPQHn41Q7J2wygiRyynFSGuZeXYyVJXJR9rKykQSxg1x6S5FfagusLDLb1q9njjG) |
| 83-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `2TJ7HzuvBAN7gaeuatmPNBenLgGo6FwRE8MQ81XGZVdhokvpguGcYYCvnBaudD9aU3K8mxAPATWFmMhFHQmyykiv` |
| 83-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `x5eNtV4qFzKCSwv4ozkE8iYC9YoZwZrDSgUerdggKCWYnDDngP2ZvBimFwgVQt2bCe1vj3Dhf4zVjMt5RDXjaRA` |
| 83-race | racer | Jito | 10,000 | 467349189 | 4 | 25,001 | landed | [4RPnDtd7…koonnJ](https://solscan.io/tx/4RPnDtd7vtZCDfooxUCTCxUQWh2J2xvPiW7TpUpRuSmyWmafcXYR4CQoAM5i919ZWirNtaSM5kpxqukgtukoonnJ) |
| 84-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `5YSmJo95Uy76y2q1y337YHBiJtjQx3NPnkL7De6Kg4cSW4dPxmUuwExQDJDUixJuTKzc585xCsGCZyxTzssdnLpm` |
| 84-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2xA4mdW2zzV9ZmufnGQRJ3Y4vtmmDk41uEaFaP1vcXbFxphr2g4SmiWeoQFJSSJB9FfDWCX7q8qKPbtXd5KDZqi3` |
| 84-race | racer | Jito | 10,000 | 467349219 | 2 | 25,001 | landed | [j8bAd5UJ…8wj2Ho](https://solscan.io/tx/j8bAd5UJ3jaFwSNvW6jrEk9Vp3G9aHn79Khb8hfVMdyR6nG7VtuUCKAJsWYvp4tAc2iEZo4ecWthtJcVG8wj2Ho) |
| 85-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `YavDaESYkp2tarw2hUr2Pqm8oopdkvMdZxr1jhqrkfmqebKSSHezVE33rRtru2w2FN6pv9aWR1B2AkD6r5QqYoF` |
| 85-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4A1MFjvfVTb543CYv2k4TX8GAnqXm3Sszbxdy6TrYY4tXDXhtGeKjuPdTNs4higN2FeNStzG2WQZhYyCjhpeg7VE` |
| 85-race | racer | Jito | 10,000 | 467349250 | 3 | 25,001 | landed | [4mXvhSai…AZMnvm](https://solscan.io/tx/4mXvhSaiWvLQfCd4YZANwWRwtu3rdoFs7GEdNLvAU5TKp9Dwvb2g8LFYiPdM3Nxgnsa6PtWMv8qxjyP3FGAZMnvm) |
| 86-race | racer | public RPC | 0 | 467349276 | 3 | 15,001 | landed | [2xZHA2wk…uJje8a](https://solscan.io/tx/2xZHA2wkvktGK4vEqUMMWHggNsrtPDXg3ZxGfjnHeijwGegXTDpJ4BUoeCg6Hphq87JFsdto8hbgg1MAcPuJje8a) |
| 86-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2icUCdY1xXijc8SHaK6xUsvEpB6F38x1rx5k9JztHD22UfWfSzEJMJTfjAYYZRHJHYfaqFL9FjHBdbLw59xUgB7c` |
| 86-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `4GhFa6JxaPZk2BUGkbeMkPYZ7JPAhZjiLW9wp13VwXwGtGZRaVGirtSeVh5LxV9VSYxMJLkP8JHU8PtCLB6yDuYq` |
| 87-race | racer | public RPC | 0 | 467349300 | 3 | 15,001 | landed | [4D6djQPo…FThi3s](https://solscan.io/tx/4D6djQPogx6GZXVvKcSrdyvNNqym8cXL3Ub4vLtZt29Qs4cbTY2pRi13GtP31KgsaK44LTCWCLkWAzEptFFThi3s) |
| 87-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `nVkcpNJZyxUi1mJmVxA2AJ9GhC9nQRpazRpTgesvodg1GwNDJFUmAGyMMUEcTBiqf64jJCXTZGGcBm1dw4L7zed` |
| 87-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5db7cz92X1jHutN879NqbQBdB56yet92wgqdskaKj3B2aWxP5qzR1ZUe2oRa7u35Rguy26pmDX9utfGZRrXtQsdB` |
| 88-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4pJCBLkG74ziQ8ACdYwnew8htyMi6GePAJ4ZsqZL6fSfRp3aBaLvoq3MP6bk1B1SaWtvKWHupNm3qsQsoHVC5n9U` |
| 88-race | racer | Sender SWQOS-only | 5,000 | 467349324 | 2 | 20,001 | landed | [29fgsGVm…5njfpe](https://solscan.io/tx/29fgsGVmy7yFLPjfLXtqHUvK3JAVuhZEtyvUgggyC6zV1TdvKFPBq3pWefbLn8zjE58X5SLHRtBNJAxYfd5njfpe) |
| 88-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `2hGKC92nzukHtqNJLfNptRRrqtGfRZjsfFZar8sqGxbtcW3F6QG17KtkoDZCGaWMNkhnKUp1oKXqhR5wuJcWgjck` |
| 89-race | racer | public RPC | 0 | 467349339 | 4 | 15,001 | landed | [ssZSpaAA…HkGMd9](https://solscan.io/tx/ssZSpaAAK1tkWWQFMqVzWn9LJPqm7E8vxbVZZSDVEzuuPbzr1mtfWZqkfuk2wA7WYtRjuE9AsFFhGdYWwHkGMd9) |
| 89-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `54jmFRKnJSkpkPeUPTA73VCErncNusCBdnZEFv4ixZ2F1DfLWeZHEVKUhxnhmW8Buvt5TJVSCCiBpBi6EwYnwWds` |
| 89-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `5YuCYUf5wQLi5m26uJ5vZBHB81TfR7p9Szf41w2CP5UF2DGbG6oDownEujVX5knUfL66iiwpjEzHHipuQTSTZ9K` |
| 90-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `xwR7q9P8VJ3UYYfxdTrYMMPegCLABoZxb6L2TtZ69aeVo7du6s48tfUzhDxgxYJZrukk8oWPD89k2CyTQN6jFwK` |
| 90-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2FjExwZCncMzktMFxeic7qNq2jecPPYCernYihjjEUJfJFeFd9JL6GtFSv8YUtm2ymHayNGvcdsQCAZte8BJ896X` |
| 90-race | racer | Jito | 10,000 | 467349371 | 4 | 25,001 | landed | [37qcQkdk…AmxzQK](https://solscan.io/tx/37qcQkdkekcjEKALgXPPQYiLHgouKVGt5rBEmkS6DntnqR1c7tEKF7kQ8edGwwHoe993SopNREQfeJUJxnAmxzQK) |
| 91-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `rLF51k1vTMjgVKTzTxRitDmFrFya2zzwoMFJEojAj4HjAB85GQxAYGG6FgxNYLUJrmogXzyoEiM7d3XoqPyKhwc` |
| 91-race | racer | Sender SWQOS-only | 5,000 | 467349396 | 1 | 20,001 | landed | [5YuGJE4m…3sWTJU](https://solscan.io/tx/5YuGJE4mddnJnsrKBc8xKwwte3TPCJ5DMQTeCgvBJ1GJf9axtXfsnD5xjGNZQi81U4DkaksfCJYQkSbakh3sWTJU) |
| 91-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `3TH1qu7aAK2HCbeMmqJWHrsN2MsBGvyj8uciLZH322DS7LLzQrA9o7v9k483ixDgxZVKR14x6tY2FmM32avRmr52` |
| 92-race | racer | public RPC | 0 | 467349428 | 2 | 15,001 | landed | [5CHrKADn…2C1XrZ](https://solscan.io/tx/5CHrKADnvUz8hhDs75Spk3JjB7BPhFoaQ6VymA8rMtJSL5UBoiR8oPJifkUbkdG7ADtNYM552bNTdMBRC42C1XrZ) |
| 92-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5QDARazHSTp8oebHnR8fbdP7gECzEijguabw1hUCH4tbExi7RzHuxWV4Y8ysTccAwJj37dEtRFBohnJBny3yLgiH` |
| 92-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `57CwfYXdWXSrH8fq5QoPfybnxgDxVqQEVwrwbxnPMT3wmGNDD6EzSzYKTP55yho6enm9h4m9DS5EKq99Kt14Tcmf` |
| 93-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `41xpeFFde23g8RN68vrNHy8MzJ6CETKBiG2wdgPwkc4eraJz37baycyhACDXTdHPGqWZZVvjW6FtJLp11iDjZ9M6` |
| 93-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `dWooX8N1u2Q6AGdznwLaG26bxyn1emmB3Jb9bYgiXis86TKfAPjpxGkkSkf2trNuHPjCakkCTrhtxhuz3Nq9pA1` |
| 93-race | racer | Jito | 10,000 | 467349460 | 3 | 25,001 | landed | [4f2H9dQS…qTsGKk](https://solscan.io/tx/4f2H9dQSdNf5jpLQwWmLkd9htWvGZVAJtKywaRfbRgqHWFRca7u9GmSnc7rB5z6X5ptgyphbkjGUJbG88QqTsGKk) |
| 94-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4iWnmxUVPaERXn1pQ7XoEbnad7utMPoNLGBVJhMPitocZ5dMpfcETEFBYZ1oS1DZzPVjvvuQjm5X1NWytvVbZWCK` |
| 94-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4dZzB9ebU5W4kjPguDZPNGeoQMSFMbKqwyDEsthWCV3Wn17bvHbPtpCVMb9vAYDtEjUZVwwgFafGd39gJy7vrHVt` |
| 94-race | racer | Jito | 10,000 | 467349502 | 7 | 25,001 | landed | [2dvU5Yat…NsYXqT](https://solscan.io/tx/2dvU5Yat23MkSMzDPCxtZekyvJBgiw3uafHXRZ3gcCiFdvfVYrpLzfphEU6VuJUAyMjSPfdR8z2MdFE33tNsYXqT) |
| 95-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `3Gd1K8oEfAGHNUVadxWURsvJMLeyfq4Lu6qfpNYfwATePRwS7HWHoRqdL6jvvkFESLdGsnhwTQsYUne8MqJGyfVD` |
| 95-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3i5nzXokbfR89uFhy9cjVauejLKrTUCJGeuF4zxcFxz7kXDQJXopwEFymJRnroAuB19ESvF6tzDCrxAJCHV6bguW` |
| 95-race | racer | Jito | 10,000 | 467349517 | 4 | 25,001 | landed | [5xWJ4XqA…Q2cUHm](https://solscan.io/tx/5xWJ4XqAtBh3uoLHDf55Lhg8vaMjn7Yi7t3dmo1XHhgjd56ZuyqJaUvyvqyonpxAsf4P55UbX5NeMbePCZQ2cUHm) |
| 96-race | racer | public RPC | 0 | 467349548 | 5 | 15,001 | landed | [2K2f5Ujw…ueAYjt](https://solscan.io/tx/2K2f5UjwtfRCtf4Aa4KWyNLXpePnGDVTJsXhtzHEvX1d88FJRTJsDu8uX23ZwyPkPDgYvR6mEceJaeaDdCueAYjt) |
| 96-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4NbfEf78XhCZPHVuezP3aGZZyYPxQRUYKfKWuYrzPDkDn9KbjP6r6zeuTf9VPEfgVEtdnoPT7Q2Yf32QAxqLrMPk` |
| 96-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `3ffoNuRusR1WWbd6auiVvQjwjWDxfpps6v8Fn4WMKC3HdyBNDxXg1n4McQ41jk6zPCx6WjnhraZKr9zvhjBCZx4r` |
| 97-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `2LKW315cECvf7zqNtqSTZ5RoGmvHjYCFByhGT4AptrE2k5pdE3418RViVnfkLFURmTCaJDoou4jERAXN9Rs22hzA` |
| 97-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2vUTaoW4nXhgSt7hWe4zsbx5s8aM4332r8YZXdKjvvwLShZWuZ6RpHrJPTmbrioAciCEWXNqyrBAtRyFuJDRhsa3` |
| 97-race | racer | Jito | 10,000 | 467349580 | 3 | 25,001 | landed | [5hySr49W…ujfPEp](https://solscan.io/tx/5hySr49WnPCmmiJ1J2yY4d2btkNgYgHU4cu59DNdAiogWbP6LxbeprDwiYN97ZGKu7DRgvWRzViroTFw7gujfPEp) |
| 98-race | racer | public RPC | 0 | 467349606 | 3 | 15,001 | landed | [mmhUSevz…9y1TG2](https://solscan.io/tx/mmhUSevzbJzioXpJNDrm2fFwNoMiTw7k2t3fUhE9UjJYDDBmdgzVkP1EMMCBTHPawbmjeiiW7y7sRxr899y1TG2) |
| 98-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `3kt1VoGurvfnN14hT3Ky2iJ4ne3qLBVLQ9vDEhDHCWxzNPpdrVybfU7di4pXbZ8GYmzzsapqiiwL9hq45S1SXfUF` |
| 98-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `2a1UX2nHLLrcryMJ2LWQskxGqtyva6BF1PEy2gNf9zojaScJ9tbrtvQ9WD5Q7PL9JG4zxPpW5UajE7dfxSKvxPXv` |
| 99-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `4cUEnvBxfk1eSTzKNz2PQRWpXwyC37Fm7JKX5smWdF2YHF46CkSGkJMFLmjsraZsBcWycgow91bzRKcZQKhuPkwK` |
| 99-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `2RYZyxKhnR4stWjy29qpWbyBXrXSo4GTa1RrLaNLCuNpHUDJLLmqFw9T89d92piFdezqZ1YRc4JUxTziEDH9RBNT` |
| 99-race | racer | Jito | 10,000 | 467349622 | 2 | 25,001 | landed | [5WrLBF9r…zoHHDA](https://solscan.io/tx/5WrLBF9rW6itf1G5Zz6Pb21gMjmsApyP7fkSHETruBHaJD7z21tkK1TrM8kDxDSSV5GzAiG42RbsLHXoXuzoHHDA) |

</details>

### Smoke run (14:10 UTC, 14 operations)

<details>
<summary><code>rpc</code>: 2 operations, 2 transactions</summary>

Plain `sendTransaction` to the public mainnet RPC (`api.mainnet-beta.solana.com`). No tip; the RPC node rebroadcasts on its own.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-rpc | only version | public RPC | 0 | 467346227 | 3 | 15,001 | landed | [3t81zp8J…t6diTG](https://solscan.io/tx/3t81zp8JvsCJ4EHWhU7PDqHasEPDpd8dXCARRi2xui3BRm1Xu1YNfNcctsC1FDXxaMQBHdDKWuRMy57TqBt6diTG) |
| 1-rpc | only version | public RPC | 0 | 467346232 | 3 | 15,001 | landed | [SB6edcqk…cog46U](https://solscan.io/tx/SB6edcqk5iAhfRD8gHMyKN1GLCeuATPRDviN6RUb1T1EqemLwqzcDZ2ftP7itxkQbaMmjQqrpW3zDm893cog46U) |

</details>

<details>
<summary><code>swqos</code>: 2 operations, 2 transactions</summary>

Helius Sender with `?swqos_only=true`: a single stake-weighted (SWQOS) path. Tip 5,000 lamports (0.000005 SOL), the tier's minimum.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-swqos | only version | Sender SWQOS-only | 5,000 | – | – | 0 | refused by the provider (HTTP 429), not forwarded | `2sjNd9oT9y1tb8zQaQM67nvVyEGqwa4RCv92vE96iUcg5azNzHBv2uBrjeW4hstQN5kJPPaGxkJWhKxZ6zEu7utL` |
| 1-swqos | only version | Sender SWQOS-only | 5,000 | 467346271 | 6 | 20,001 | landed | [2UpKpFcG…EWpsoJ](https://solscan.io/tx/2UpKpFcGr4zFM6UejQzgJ6ibK7W4QPyPMPmLT1NbZwpjiZ3iN5oAFutEZ5ZPXaAWRzDCp6XMjnW5TkZN4YEWpsoJ) |

</details>

<details>
<summary><code>sender-mid</code>: 2 operations, 2 transactions</summary>

Helius Sender with a 200,000-lamport tip (0.0002 SOL), between the two tiers: accepted, but sent best-effort through fewer paths and without the priority tip buffer.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-sender-mid | only version | Sender | 200,000 | 467346245 | 3 | 215,001 | landed | [3M8VFnte…oVD24M](https://solscan.io/tx/3M8VFntey7gRV7K2PqeMUK2FMQ7aLHu3NV2eMykvB9tJzv5TpMwFzPKDiKUVRs5TwfyZ51vzFKYHYrxECzoVD24M) |
| 1-sender-mid | only version | Sender | 200,000 | 467346267 | 4 | 215,001 | landed | [4yYaTPJ4…Kr1vPB](https://solscan.io/tx/4yYaTPJ4YXX24kWyWU3pxZTUUWGSURvppmpVX8Tz5t4SoGE7vdk9jsJHqHiiTEmtrwYPqsBPfyByPz8hBeKr1vPB) |

</details>

<details>
<summary><code>sender-max</code>: 2 operations, 2 transactions</summary>

Helius Sender Max: tip 1,000,000 lamports (0.001 SOL), the tier's minimum. Every path plus the priority tip buffer.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-sender-max | only version | Sender | 1,000,000 | 467346240 | 3 | 1,015,001 | landed | [5KrJccY1…fmcAv8](https://solscan.io/tx/5KrJccY18Dnqxr4aJFnQgww3ab2JtJUxfaJTrMDy7vE9JPt9xnAWug3bTT397XLtDDaqWqDbNjfnVC65vnfmcAv8) |
| 1-sender-max | only version | Sender | 1,000,000 | 467346251 | 4 | 1,015,001 | landed | [4dQkDvxh…qR8EH4](https://solscan.io/tx/4dQkDvxhKLsJKmVcyPysJJen11Mt1rmKsuhCo4ix9dmDLu9Aqi291JFogVAPW2KfSdhm6bEaQwfWk5ZiTdqR8EH4) |

</details>

<details>
<summary><code>jito</code>: 2 operations, 2 transactions</summary>

Jito block engine, `sendTransaction?bundleOnly=true`: a single-transaction bundle with revert protection. Tip 10,000 lamports to a Jito tip account.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-jito | only version | Jito | 10,000 | 467346230 | 3 | 25,001 | landed | [5EXokvq3…zgxJHP](https://solscan.io/tx/5EXokvq36XpBLk2zAugFWQdfhFNHKpqSkbB3BtPk4gyEV7RvX89ykLNvDPHgzEGbiFkVpzw3ve3auyESDNzgxJHP) |
| 1-jito | only version | Jito | 10,000 | 467346235 | 3 | 25,001 | landed | [4JX11Dqj…EY7JjX](https://solscan.io/tx/4JX11DqjPRnf3zfmaQv3Ba7ygqEyw6Wnezr69J9hvj3XxHgmShwatLsUtRHh6uQYU4NQJ26ozoL7mHhxQ7EY7JjX) |

</details>

<details>
<summary><code>ladder</code>: 2 operations, 2 transactions</summary>

Durable-nonce family. Version 1 goes to Sender SWQOS-only (tip 5,000 lamports). If it isn't seen within 4 slots, version 2 goes to Sender Max (tip 1,000,000 lamports), signed against the **same nonce**, so at most one of them can execute.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346235 | 3 | 20,001 | landed | [2jP79wne…QorYaF](https://solscan.io/tx/2jP79wnewHK2Q6oAUyUSAxSPTbzeguE9iKTqu2q3jJc9SmvG8a5q9Hx8rkmrhzn2LewVKcgA6VQfJbkyicQorYaF) |
| 1-ladder | v1 cheap | Sender SWQOS-only | 5,000 | 467346261 | 2 | 20,001 | landed | [5AwrC31p…ztoTG1](https://solscan.io/tx/5AwrC31pPVUzVzBnqi51VnLa22ZFQqzPRE7JbtR4BFpks42b7WSNvtWwTUdV5MJuk636yZSBga9aUzAQKMztoTG1) |

</details>

<details>
<summary><code>race</code>: 2 operations, 6 transactions</summary>

Durable-nonce family. Three versions fired at the same moment against the **same nonce**: public RPC (no tip), Sender SWQOS-only (tip 5,000) and Jito (tip 10,000). Exactly one can land, and the winner shows which path was fastest.

| Op | Version | Path | Tip (lamports) | Landed slot | Slots after send | Paid (lamports) | Result | Transaction |
|---|---|---|---:|---:|---:|---:|---|---|
| 0-race | racer | public RPC | 0 | 467346226 | 2 | 15,001 | landed | [4xxZ2yxG…9a6FLd](https://solscan.io/tx/4xxZ2yxGS5xhZW5TFqVgkPYPDinUuqX7ohKUEsUcRzXUiD9q66Ft57Wnn7ECUzmxHUjPoF7HyWEfeqt6i9a6FLd) |
| 0-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `4FwXXPaWyCgS3iEn1ZnpAJdCXzUKQZxrf6Bofji4e2tDQvfDK5Bcd4KGiZsLhb8RKGMggky6qmY1PoG9mua5ieaM` |
| 0-race | racer | Jito | 10,000 | – | – | 0 | never landed: another version used the nonce | `2hUzHayVLHreEbdkUXdgfdUtSdbNvnKMUuAomVQJ2W8yLHN4tzeeDYs6hWX7fEUqEL4i22zbW76RdNQrbTjyCqUs` |
| 1-race | racer | public RPC | 0 | – | – | 0 | never landed: another version used the nonce | `arvEJ7hHJLDKvmp6mJzjXH8tRgWDRhzfbKmbotE6ZG1Dw8LvaGntE8NCxYQzGUf1MeuqmnmC1VseKXtipWuTRgT` |
| 1-race | racer | Sender SWQOS-only | 5,000 | – | – | 0 | never landed: another version used the nonce | `5B1wTXwWkx6JYuYMPjw4ZjPEh7ikK4gZok6BqaLWX1Kwxp2JyuiXBbW6ThAQyhZHi1M4tiYGrTY9DYJprbmsSAdQ` |
| 1-race | racer | Jito | 10,000 | 467346256 | 3 | 25,001 | landed | [4Wu3JZSo…ZMfe4w](https://solscan.io/tx/4Wu3JZSoX2qdZ3Lp1vjCNgooQd1Abaa1hc27kFAGz7tYw77hXM8wuHQG5c4vqs9ffFU2yzGhWcaubrP14zZMfe4w) |

</details>

