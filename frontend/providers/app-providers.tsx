"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { ConfigProblem } from "@/components/wallet/config-problem";
import { TooltipProvider } from "@/components/ui/tooltip";
import { configResult, type AppConfig } from "@/lib/config";
import { readClient, type GenLayerClient } from "@/lib/genlayer/client";
import { wagmiConfig } from "@/lib/wallet/wagmi";
import { TxProvider } from "@/providers/tx-provider";

type MandateContext = { config: AppConfig; client: GenLayerClient };

const Ctx = createContext<MandateContext | null>(null);

export function useMandateApp(): MandateContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMandateApp outside AppProviders");
  return ctx;
}

export function AppProviders({ children }: { children: ReactNode }) {
  if (!configResult.ok) return <ConfigProblem problems={configResult.problems} />;
  return <Configured config={configResult.config}>{children}</Configured>;
}

function Configured({ config, children }: { config: AppConfig; children: ReactNode }) {
  // StudioNet rate-limits reads per IP: calm defaults, no focus refetch storms
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
  const [wagmi] = useState(() => wagmiConfig(config));
  const [value] = useState<MandateContext>(() => ({ config, client: readClient(config) }));

  return (
    <WagmiProvider config={wagmi}>
      <QueryClientProvider client={queryClient}>
        <Ctx.Provider value={value}>
          <TooltipProvider>
            <TxProvider>{children}</TxProvider>
          </TooltipProvider>
        </Ctx.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
