"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base } from "wagmi/chains";
import { createConfig, http, WagmiProvider } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import { createCDPEmbeddedWalletConnector } from "@coinbase/cdp-wagmi";
import { CDPReactProvider } from "@coinbase/cdp-react";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { ThemeProvider } from "next-themes";
import { CdsThemeBridge } from "@/components/CdsThemeBridge";
import { getPublicLogoUrl } from "@/lib/branding";
import type { ReactNode } from "react";

const queryClient = new QueryClient();

const baseRpc =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.NEXT_PUBLIC_BASE_RPC ||
  "https://mainnet.base.org";

const cdpProjectId = (process.env.NEXT_PUBLIC_CDP_PROJECT_ID ?? "").trim();

/**
 * Wallet strategy:
 * - With `NEXT_PUBLIC_CDP_PROJECT_ID`: **CDP embedded wallet only** via `createCDPEmbeddedWalletConnector`
 *   + `CDPReactProvider` (`createOnLogin: "smart"`). No browser-extension Coinbase connector so login
 *   stays in the CDP embedded / passkey smart-wallet flow.
 * - Without project id (e.g. CI): fallback `coinbaseWallet` + smartWalletOnly so `next build` can run.
 */
type ConnectorEntry = ReturnType<typeof coinbaseWallet>;

const connectors: ConnectorEntry[] = cdpProjectId
  ? [
      createCDPEmbeddedWalletConnector({
        cdpConfig: {
          projectId: cdpProjectId,
        },
        providerConfig: {
          chains: [base],
          transports: {
            [base.id]: http(baseRpc),
          },
        },
      }) as ConnectorEntry,
    ]
  : [
      coinbaseWallet({
        appName: "Amini",
        preference: "smartWalletOnly",
      }),
    ];

const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  ssr: true,
  transports: {
    [base.id]: http(baseRpc),
  },
});

function AppOnchainProviders({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_CDP_API_KEY;
  const logoUrl = getPublicLogoUrl();

  const tree = (
    <OnchainKitProvider
      apiKey={apiKey}
      chain={base}
      projectId={cdpProjectId || undefined}
      rpcUrl={baseRpc}
      config={{
        appearance: { name: "Amini", logo: logoUrl },
        wallet: {
          // Align modal / Coinbase paths with smart wallet when multiple options exist
          preference: "smartWalletOnly",
        },
      }}
    >
      {children}
    </OnchainKitProvider>
  );

  if (!cdpProjectId) {
    return tree;
  }

  return (
    <CDPReactProvider
      config={{
        projectId: cdpProjectId,
        ethereum: { createOnLogin: "smart" },
        appName: "Amini",
        appLogoUrl: logoUrl.startsWith("http") ? logoUrl : undefined,
        showCoinbaseFooter: false,
      }}
    >
      {tree}
    </CDPReactProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <CdsThemeBridge>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <AppOnchainProviders>{children}</AppOnchainProviders>
          </QueryClientProvider>
        </WagmiProvider>
      </CdsThemeBridge>
    </ThemeProvider>
  );
}
