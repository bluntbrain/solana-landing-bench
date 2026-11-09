import fs from "node:fs";
import { Keypair, NONCE_ACCOUNT_LENGTH, NonceAccount, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { sleep } from "./http.js";
import type { Rpc } from "./rpc.js";
import type { SlotClock } from "./tracker.js";
import { sendAndConfirm } from "./chain.js";

export interface NonceSlot {
  pubkey: PublicKey;
  value: string;
  busy: boolean;
  /** Set when a family ended in an unknown state: a version might still land, so never reuse it. */
  quarantined: boolean;
  /** Don't reuse before this slot, so two advances never fall in the same slot. */
  readySlot: number;
}

export function parseNonceValue(dataBase64: string): string {
  return NonceAccount.fromAccountData(Buffer.from(dataBase64, "base64")).nonce;
}

/** A pool of durable nonce accounts, one per in-flight nonce family. The payer is the authority. */
export class NoncePool {
  slots: NonceSlot[] = [];

  constructor(
    private rpc: Rpc,
    private payer: Keypair,
    private clock: SlotClock,
    private registryFile: string,
    private quarantineFile: string,
  ) {}

  private quarantined(): Set<string> {
    return new Set(fs.existsSync(this.quarantineFile) ? JSON.parse(fs.readFileSync(this.quarantineFile, "utf8")) : []);
  }

  /** Persisted across runs: a family with an unknown outcome may still land, so the account is never reused. */
  private quarantine(slot: NonceSlot): void {
    slot.quarantined = true;
    const set = this.quarantined();
    set.add(slot.pubkey.toBase58());
    fs.writeFileSync(this.quarantineFile, JSON.stringify([...set], null, 2));
  }

  private saveRegistry(): void {
    const known = new Set<string>(fs.existsSync(this.registryFile) ? JSON.parse(fs.readFileSync(this.registryFile, "utf8")) : []);
    for (const s of this.slots) known.add(s.pubkey.toBase58());
    fs.writeFileSync(this.registryFile, JSON.stringify([...known], null, 2));
  }

  async fetchValue(pubkey: PublicKey): Promise<string | null> {
    const info = await this.rpc.getAccountInfo(pubkey.toBase58(), "confirmed");
    return info ? parseNonceValue(info.data[0]) : null;
  }

  /** Reuse nonce accounts from earlier runs, then create enough to reach `size`. */
  async ensure(size: number, priority: { cuLimit: number; cuPrice: number }): Promise<{ createdLamports: number }> {
    const previous: string[] = fs.existsSync(this.registryFile) ? JSON.parse(fs.readFileSync(this.registryFile, "utf8")) : [];
    const skip = this.quarantined();
    for (const addr of previous) {
      if (this.slots.length >= size) break;
      if (skip.has(addr)) continue;
      const pubkey = new PublicKey(addr);
      const value = await this.fetchValue(pubkey);
      if (value) this.slots.push({ pubkey, value, busy: false, quarantined: false, readySlot: 0 });
    }
    let createdLamports = 0;
    const rent = await this.rpc.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
    while (this.slots.length < size) {
      const nonceKp = Keypair.generate();
      const tx: Transaction = SystemProgram.createNonceAccount({
        fromPubkey: this.payer.publicKey,
        noncePubkey: nonceKp.publicKey,
        authorizedPubkey: this.payer.publicKey,
        lamports: rent,
      });
      await sendAndConfirm(this.rpc, tx, [this.payer, nonceKp], priority);
      createdLamports += rent;
      // Record it straight away so a crash never strands its rent.
      this.slots.push({ pubkey: nonceKp.publicKey, value: "", busy: true, quarantined: false, readySlot: 0 });
      this.saveRegistry();
      const value = await this.fetchValue(nonceKp.publicKey);
      if (!value) throw new Error(`nonce account ${nonceKp.publicKey.toBase58()} not visible after creation`);
      const slot = this.slots[this.slots.length - 1];
      slot.value = value;
      slot.busy = false;
      slot.readySlot = this.clock.slot + 2;
    }
    this.saveRegistry();
    return { createdLamports };
  }

  async acquire(): Promise<NonceSlot> {
    for (;;) {
      const free = this.slots.find((s) => !s.busy && !s.quarantined && this.clock.slot >= s.readySlot);
      if (free) {
        free.busy = true;
        return free;
      }
      if (this.slots.every((s) => s.quarantined)) throw new Error("every nonce account is quarantined");
      await sleep(100);
    }
  }

  /**
   * Return a slot after its family resolved. If a version or cancel landed, the stored
   * nonce has moved on: wait until the confirmed account shows the new value.
   */
  async release(slot: NonceSlot, oldValue: string, landed: boolean): Promise<void> {
    if (landed) {
      for (let i = 0; i < 60; i++) {
        const value = await this.fetchValue(slot.pubkey).catch(() => null);
        if (value && value !== oldValue) {
          slot.value = value;
          slot.readySlot = this.clock.slot + 2;
          slot.busy = false;
          return;
        }
        await sleep(250);
      }
    }
    this.quarantine(slot);
    slot.busy = false;
  }
}
