"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base, baseSepolia } from "wagmi/chains";
import { createConfig, http, WagmiProvider } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import { createCDPEmbeddedWalletConnector } from "@coinbase/cdp-wagmi";
import { CDPReactProvider } from "@coinbase/cdp-react";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { CdsThemeBridge } from "@/components/CdsThemeBridge";
import { MediaQueryProvider } from "@coinbase/cds-web/system";
import { getCdpWalletConfig } from "@/lib/cdpWalletConfig";
import { getPublicLogoUrl } from "@/lib/branding";
import { cdpEmbeddedWalletTheme } from "@/theme/cdpEmbeddedWalletTheme";
import { AppThemeProvider } from "@/context/AppThemeContext";
import { useEffect } from "react";
import {
  AminiSigningProviderCdp,
  AminiSigningProviderWagmi,
} from "@/context/AminiSigningContext";
import type { ReactNode } from "react";
import type { Chain } from "viem/chains";

const queryClient = new QueryClient();

/** Base mainnet RPC when the user switches networks in the wallet */
const baseRpc =
  process.env.NEXT_PUBLIC_BASE_RPC ||
  process.env.NEXT_PUBLIC_BASE_MAINNET_RPC ||
  "https://mainnet.base.org";

/** Default app chain: Base Sepolia (`NEXT_PUBLIC_RPC_URL` targets this). */
const baseSepoliaRpc =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC ||
  "https://sepolia.base.org";

const cdpWalletConfig = getCdpWalletConfig();

const defaultChain = baseSepolia;
const chains: [Chain, ...Chain[]] = [baseSepolia, base];

/**
 * Wallet strategy:
 * - With `NEXT_PUBLIC_CDP_PROJECT_ID`: **CDP embedded wallet only** via `createCDPEmbeddedWalletConnector`
 *   + `CDPReactProvider` (`createOnLogin: "smart"`). No browser-extension Coinbase connector so login
 *   stays in the CDP embedded / passkey smart-wallet flow.
 * - Without project id (e.g. CI): fallback `coinbaseWallet` + smartWalletOnly so `next build` can run.
 *
 * Provider order (matches working Coinbase + wagmi setups e.g. NedaPay): **`WagmiProvider` →
 * `QueryClientProvider` → `CDPReactProvider`**. CDP React + `SignInModal` expect wagmi context outside
 * the CDP tree; nesting CDP above wagmi can break the auth button / modal.
 */
type ConnectorEntry = ReturnType<typeof coinbaseWallet>;

const connectors: ConnectorEntry[] = cdpWalletConfig
  ? [
      createCDPEmbeddedWalletConnector({
        cdpConfig: cdpWalletConfig,
        providerConfig: {
          chains,
          transports: {
            [base.id]: http(baseRpc),
            [baseSepolia.id]: http(baseSepoliaRpc),
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
  chains,
  connectors,
  ssr: true,
  transports: {
    [base.id]: http(baseRpc),
    [baseSepolia.id]: http(baseSepoliaRpc),
  },
});

function OnchainKitProviders({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_CDP_API_KEY;
  const logoUrl = getPublicLogoUrl();

  const rpcForDefaultChain =
    defaultChain.id === baseSepolia.id ? baseSepoliaRpc : baseRpc;

  return (
    <OnchainKitProvider
      apiKey={apiKey}
      chain={defaultChain}
      projectId={cdpWalletConfig?.projectId || undefined}
      rpcUrl={rpcForDefaultChain}
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
}

function CdpOptionalShell({ children }: { children: ReactNode }) {
  if (!cdpWalletConfig) {
    return (
      <AminiSigningProviderWagmi>
        {children}
      </AminiSigningProviderWagmi>
    );
  }
  return (
    <CDPReactProvider config={cdpWalletConfig} theme={cdpEmbeddedWalletTheme}>
      <AminiSigningProviderCdp>{children}</AminiSigningProviderCdp>
    </CDPReactProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  // Avoid noisy React runtime warnings coming from third-party UI libraries.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const needle = "React does not recognize the `testID` prop on a DOM element";
    const originalError = console.error;
    const originalWarn = console.warn;

    const filtered = (...args: unknown[]) => {
      const first = typeof args?.[0] === "string" ? args[0] : "";
      if (first.includes(needle)) return;
      return originalError(...args);
    };

    const filteredWarn = (...args: unknown[]) => {
      const first = typeof args?.[0] === "string" ? args[0] : "";
      if (first.includes(needle)) return;
      return originalWarn(...args);
    };

    // React uses console.error for this particular warning.
    // eslint-disable-next-line no-console
    console.error = filtered;
    // eslint-disable-next-line no-console
    console.warn = filteredWarn;

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return (
    <AppThemeProvider>
      <MediaQueryProvider>
        <CdsThemeBridge>
          <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
              <CdpOptionalShell>
                <OnchainKitProviders>{children}</OnchainKitProviders>
              </CdpOptionalShell>
            </QueryClientProvider>
          </WagmiProvider>
        </CdsThemeBridge>
      </MediaQueryProvider>
    </AppThemeProvider>
  );
}
