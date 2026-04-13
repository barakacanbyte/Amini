"use client";

import "@/lib/ssrLocalStorageShim";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { baseSepolia } from "wagmi/chains";
import type { State } from "wagmi";
import { WagmiProvider } from "wagmi";
import { CDPReactProvider } from "@coinbase/cdp-react";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { CdsThemeBridge } from "@/components/CdsThemeBridge";
import { MediaQueryProvider } from "@coinbase/cds-web/system";
import { getCdpWalletConfig } from "@/lib/cdpWalletConfig";
import { getPublicLogoUrl } from "@/lib/branding";
import { getWagmiConfig } from "@/lib/wagmiAminiConfig";
import { cdpEmbeddedWalletTheme } from "@/theme/cdpEmbeddedWalletTheme";
import { AppThemeProvider } from "@/context/AppThemeContext";
import {
  AminiSigningProviderCdp,
  AminiSigningProviderWagmi,
} from "@/context/AminiSigningContext";
import type { ReactNode } from "react";

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
const wagmiConfig = getWagmiConfig();

/**
 * Wallet strategy (connectors live in `@/lib/wagmiAminiConfig`):
 * - With `NEXT_PUBLIC_CDP_PROJECT_ID`: **CDP embedded wallet only** via `createCDPEmbeddedWalletConnector`
 *   + `CDPReactProvider` (`createOnLogin: "smart"`). No browser-extension Coinbase connector so login
 *   stays in the CDP embedded / passkey smart-wallet flow.
 * - Without project id (e.g. CI): fallback `coinbaseWallet` + smartWalletOnly so `next build` can run.
 *
 * Provider order (matches working Coinbase + wagmi setups e.g. NedaPay): **`WagmiProvider` →
 * `QueryClientProvider` → `CDPReactProvider`**. CDP React + `SignInModal` expect wagmi context outside
 * the CDP tree; nesting CDP above wagmi can break the auth button / modal.
 */

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

export function Providers({
  children,
  initialState,
}: {
  children: ReactNode;
  /** From `cookieToInitialState` in `layout.tsx` — avoids SSR `localStorage` for Wagmi. */
  initialState?: State;
}) {
  return (
    <AppThemeProvider>
      <MediaQueryProvider>
        <CdsThemeBridge>
          <WagmiProvider config={wagmiConfig} initialState={initialState}>
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
