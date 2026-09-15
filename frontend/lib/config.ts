import { z } from "zod";

/**
 * Public configuration, validated once. The app refuses to run against a
 * network or contract it cannot name: a missing or malformed value renders a
 * configuration page instead of a half-working interface.
 *
 *   NEXT_PUBLIC_GENLAYER_NETWORK   studionet (the only network MANDATE is deployed to)
 *   NEXT_PUBLIC_GENLAYER_CHAIN     61999, GenLayer StudioNet's chain id
 *   NEXT_PUBLIC_GENLAYER_RPC_URL   optional; defaults to genlayer-js's StudioNet RPC
 *   NEXT_PUBLIC_MANDATE_CONTRACT   the deployed MANDATE Intelligent Contract
 *   NEXT_PUBLIC_APP_ENV            development | test | staging | production
 */

export const NETWORKS = {
  studionet: {
    chainId: 61999,
    name: "GenLayer StudioNet",
    rpcUrl: "https://studio.genlayer.com/api",
    explorer: "https://explorer-studio.genlayer.com",
  },
} as const;

const schema = z
  .object({
    network: z.enum(["studionet"], { message: "NEXT_PUBLIC_GENLAYER_NETWORK must be studionet" }),
    chainId: z.coerce.number({ message: "NEXT_PUBLIC_GENLAYER_CHAIN must be a number" }).int(),
    rpcUrl: z
      .string()
      .url("NEXT_PUBLIC_GENLAYER_RPC_URL must be a URL")
      .refine((u) => u.startsWith("https://"), "NEXT_PUBLIC_GENLAYER_RPC_URL must use https")
      .optional(),
    contractAddress: z
      .string({ message: "NEXT_PUBLIC_MANDATE_CONTRACT is not set" })
      .regex(/^0x[0-9a-fA-F]{40}$/, "NEXT_PUBLIC_MANDATE_CONTRACT must be a 20-byte hex address")
      .refine((a) => !/^0x0{40}$/.test(a), "NEXT_PUBLIC_MANDATE_CONTRACT cannot be the zero address"),
    appEnv: z.enum(["development", "test", "staging", "production"]).default("development"),
  })
  .superRefine((v, ctx) => {
    const expected = NETWORKS[v.network].chainId;
    if (v.chainId !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["chainId"],
        message: `NEXT_PUBLIC_GENLAYER_CHAIN must be ${expected} for ${NETWORKS[v.network].name}`,
      });
    }
  });

export type AppConfig = {
  network: keyof typeof NETWORKS;
  networkName: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  contractAddress: `0x${string}`;
  appEnv: "development" | "test" | "staging" | "production";
};

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; problems: string[] };

export function parseConfig(env: Record<string, string | undefined>): ConfigResult {
  const parsed = schema.safeParse({
    network: env.NEXT_PUBLIC_GENLAYER_NETWORK || undefined,
    chainId: env.NEXT_PUBLIC_GENLAYER_CHAIN,
    rpcUrl: env.NEXT_PUBLIC_GENLAYER_RPC_URL || undefined,
    contractAddress: env.NEXT_PUBLIC_MANDATE_CONTRACT || undefined,
    appEnv: env.NEXT_PUBLIC_APP_ENV || undefined,
  });
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => i.message) };
  const net = NETWORKS[parsed.data.network];
  return {
    ok: true,
    config: {
      network: parsed.data.network,
      networkName: net.name,
      chainId: parsed.data.chainId,
      rpcUrl: parsed.data.rpcUrl ?? net.rpcUrl,
      explorer: net.explorer,
      contractAddress: parsed.data.contractAddress as `0x${string}`,
      appEnv: parsed.data.appEnv,
    },
  };
}

// Next inlines NEXT_PUBLIC_* only when each is referenced by its full name.
export const configResult = parseConfig({
  NEXT_PUBLIC_GENLAYER_NETWORK: process.env.NEXT_PUBLIC_GENLAYER_NETWORK,
  NEXT_PUBLIC_GENLAYER_CHAIN: process.env.NEXT_PUBLIC_GENLAYER_CHAIN,
  NEXT_PUBLIC_GENLAYER_RPC_URL: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL,
  NEXT_PUBLIC_MANDATE_CONTRACT: process.env.NEXT_PUBLIC_MANDATE_CONTRACT,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
});
