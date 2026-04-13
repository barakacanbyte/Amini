/**
 * Shared Wagmi config for the App Router: safe to import from server components
 * (e.g. `cookieToInitialState` in `layout.tsx`) and from client `providers.tsx`.
 * Uses cookie storage so SSR does not touch `localStorage` for Wagmi state.
 */
import "@/lib/ssrLocalStorageShim";
import { createCDPEmbeddedWalletConnector } from "@coinbase/cdp-wagmi";
import type { Config } from "wagmi";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import { base, baseSepolia } from "wagmi/chains";
import type { Chain } from "viem/chains";
import { getCdpWalletConfig } from "@/lib/cdpWalletConfig";

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

const chains: [Chain, ...Chain[]] = [baseSepolia, base];

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

let wagmiConfigSingleton: Config | undefined;

export function getWagmiConfig(): Config {
  if (!wagmiConfigSingleton) {
    wagmiConfigSingleton = createConfig({
      chains,
      connectors,
      ssr: true,
      storage: createStorage({ storage: cookieStorage }),
      transports: {
        [base.id]: http(baseRpc),
        [baseSepolia.id]: http(baseSepoliaRpc),
      },
    });
  }
  return wagmiConfigSingleton;
}
