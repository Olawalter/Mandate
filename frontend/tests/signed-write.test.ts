import { afterEach, describe, expect, it, vi } from "vitest";

import { parseConfig, type AppConfig } from "@/lib/config";
import { writeClient } from "@/lib/genlayer/client";
import { createCall, requestCall, revokeCall, updateCall, type TermsInput } from "@/lib/genlayer/mandate";

/**
 * A write is signed by the user's injected wallet, never by the app. This
 * drives the real genlayer-js client with a mock EIP-1193 wallet and a stubbed
 * RPC, and records where each request goes.
 */

const USER = "0x2222222222222222222222222222222222222222" as const;
const CONTRACT = "0x3333333333333333333333333333333333333333";
const config = (
  parseConfig({
    NEXT_PUBLIC_GENLAYER_NETWORK: "studionet",
    NEXT_PUBLIC_GENLAYER_CHAIN: "61999",
    NEXT_PUBLIC_MANDATE_CONTRACT: CONTRACT,
  }) as { ok: true; config: AppConfig }
).config;

const TX_HASH = "0x" + "ab".repeat(32);

const TERMS: TermsInput = {
  agentLabel: "Procurement Agent",
  actionType: "PURCHASE",
  target: "Northwind Compute capacity",
  maxAmount: 500_000,
  currency: "USD",
  expiresAt: 1_790_000_000,
  intendedUse: "Run AI inference workloads",
  conditions: [{ key: "intended_use_permitted", requirement: "The policy permits AI inference." }],
  sources: [{ url: "https://example.com/aup", purpose: "POLICY" }],
};

function harness() {
  const rpcMethods: string[] = [];
  const walletCalls: { method: string; params?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      const one = (m: { method: string; id: number }) => {
        rpcMethods.push(m.method);
        const result =
          m.method === "eth_getTransactionCount" ? "0x5" : m.method === "eth_estimateGas" ? "0x30d40" : m.method === "eth_gasPrice" ? "0x0" : m.method === "eth_chainId" ? "0xf22f" : "0x1";
        return { jsonrpc: "2.0", id: m.id, result };
      };
      return new Response(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)));
    }),
  );
  const provider = {
    request: vi.fn(async ({ method, params }: { method: string; params?: unknown }) => {
      walletCalls.push({ method, params });
      if (method === "eth_sendTransaction") return TX_HASH;
      if (method === "eth_chainId") return "0xf22f";
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [USER];
      throw new Error(`unexpected wallet method ${method}`);
    }),
    on: () => undefined,
    removeListener: () => undefined,
  };
  return { rpcMethods, walletCalls, provider };
}

afterEach(() => vi.unstubAllGlobals());

describe("signed writes go through the user's wallet", () => {
  it("request_authorization: the wallet is asked to send, from the agent, with no value", async () => {
    const h = harness();
    const client = writeClient(config, USER, h.provider as never);
    const hash = await client.writeContract({
      address: CONTRACT,
      ...requestCall({ mandateId: "1", version: 1, actionType: "PURCHASE", target: "Northwind Compute capacity", amount: 470_000, currency: "USD", requestKey: "req-1" }),
    });

    expect(hash).toBe(TX_HASH);
    const sends = h.walletCalls.filter((c) => c.method === "eth_sendTransaction");
    expect(sends).toHaveLength(1);
    const [tx] = sends[0].params as { from: string; to: string; value?: string; data: string }[];
    expect(tx.from.toLowerCase()).toBe(USER);
    expect(BigInt(tx.value ?? "0x0")).toBe(0n);
    expect(tx.data.length).toBeGreaterThan(10);
    // the app never signs or broadcasts itself
    expect(h.rpcMethods).not.toContain("eth_sendRawTransaction");
    expect(h.rpcMethods).not.toContain("eth_sendTransaction");
  });

  it("create, update and revoke are wallet-signed and carry zero value", async () => {
    for (const call of [createCall(USER, TERMS), updateCall("1", 1, TERMS), revokeCall("1")]) {
      const h = harness();
      const client = writeClient(config, USER, h.provider as never);
      await client.writeContract({ address: CONTRACT, ...call });
      const send = h.walletCalls.find((c) => c.method === "eth_sendTransaction");
      expect(send, call.functionName).toBeDefined();
      const [tx] = send!.params as { from: string; value?: string }[];
      expect(tx.from.toLowerCase()).toBe(USER);
      expect(BigInt(tx.value ?? "0x0"), call.functionName).toBe(0n);
    }
  });

  it("a wallet that declines leaves nothing sent", async () => {
    const h = harness();
    h.provider.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_sendTransaction") throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      if (method === "eth_chainId") return "0xf22f";
      return [USER] as never;
    });
    const client = writeClient(config, USER, h.provider as never);
    await expect(client.writeContract({ address: CONTRACT, ...revokeCall("1") })).rejects.toThrow(/rejected/);
    expect(h.rpcMethods).not.toContain("eth_sendRawTransaction");
  });

  it("call arguments follow the deployed schema's parameter order", () => {
    const c = createCall(USER, TERMS);
    expect(c.args).toEqual([USER, "Procurement Agent", "PURCHASE", "Northwind Compute capacity", 500_000, "USD", 1_790_000_000,
      "Run AI inference workloads", JSON.stringify(TERMS.conditions), JSON.stringify(TERMS.sources)]);
    expect(updateCall("7", 3, TERMS).args.slice(0, 2)).toEqual(["7", 3]);
  });
});
