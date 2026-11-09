import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ARMS, ENDPOINTS, type Arm } from "./config.js";
import { sweep } from "./funds.js";
import { Pacer } from "./http.js";
import type { OpRecord } from "./ops.js";
import { renderMarkdown, sol, summaryJson, type RunMeta } from "./report.js";
import { Rpc } from "./rpc.js";
import { run } from "./run.js";
import { loadOrCreateWallet } from "./wallet.js";

const [command, ...rest] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "wallet": {
      const kp = loadOrCreateWallet();
      const rpc = new Rpc(ENDPOINTS.rpc, new Pacer(150));
      console.log(`${kp.publicKey.toBase58()}  ${sol(await rpc.getBalance(kp.publicKey.toBase58()))} SOL`);
      return;
    }
    case "run": {
      const { values } = parseArgs({
        args: rest,
        options: {
          "per-arm": { type: "string", default: "100" },
          cap: { type: "string", default: "0.27" },
          arms: { type: "string", default: ARMS.join(",") },
          concurrency: { type: "string", default: "10" },
          pool: { type: "string", default: "6" },
          "wait-min": { type: "string", default: "120" },
          out: { type: "string", default: "results" },
          "dry-run": { type: "boolean", default: false },
        },
      });
      const arms = values.arms!.split(",").map((a) => a.trim()) as Arm[];
      const unknown = arms.filter((a) => !(ARMS as readonly string[]).includes(a));
      if (unknown.length) throw new Error(`unknown arm(s): ${unknown.join(", ")}`);
      await run({
        perArm: Number(values["per-arm"]),
        capSol: Number(values.cap),
        arms,
        concurrency: Number(values.concurrency),
        poolSize: Number(values.pool),
        waitMinutes: Number(values["wait-min"]),
        outRoot: values.out!,
        dryRun: values["dry-run"]!,
      });
      return;
    }
    case "report": {
      const dir = rest[0];
      if (!dir) throw new Error("usage: report <results/RUN_ID>");
      const ops: OpRecord[] = fs
        .readFileSync(path.join(dir, "ops.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      const meta: RunMeta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
      fs.writeFileSync(path.join(dir, "summary.md"), renderMarkdown(meta, ops));
      fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summaryJson(ops), null, 2));
      console.log(fs.readFileSync(path.join(dir, "summary.md"), "utf8"));
      return;
    }
    case "sweep": {
      const { values } = parseArgs({ args: rest, options: { to: { type: "string" }, yes: { type: "boolean", default: false } } });
      await sweep({ to: values.to, yes: values.yes! });
      return;
    }
    default:
      console.log("usage: tsx src/cli.ts <wallet | run [--per-arm N --cap SOL --arms a,b --dry-run] | report DIR | sweep [--to ADDR] [--yes]>");
  }
}

main()
  .then(() => {
    // Idle keep-alive sockets shouldn't hold the process open once the work is done.
    setTimeout(() => process.exit(0), 2_000).unref();
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
