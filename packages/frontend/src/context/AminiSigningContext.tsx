"use client";

/**
 * CDP `signEvmMessage` runs `withAuth` that only accepts **`evmAccount` in the EOA lists**
 * (`evmAccounts` / `evmAccountObjects`). `useEvmAddress()` returns the **smart account** first,
 * which is not in those lists → `"EVM account not found"`.
 *
 * - **EOA match** → `signEvmMessage({ evmAccount: <canonical from user object>, message })`
 * - **Smart account only** → wagmi `signMessage` on the smart account. CDP can expose `evmAddress`
 *   before wagmi has a live connector session — we `connectAsync` the embedded connector first when needed.
 *
 * CDP hooks require `CDPReactProvider`; wagmi-only builds use `useSignMessage` + `useAccount`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { baseSepolia } from "wagmi/chains";
import { useAccount, useConfig, useConnect, useSignMessage } from "wagmi";
import {
  useCurrentUser,
  useEvmAddress,
  useGetAccessToken,
  useSignEvmMessage,
} from "@coinbase/cdp-hooks";

export type AminiSigningContextValue = {
  /** Smart account (or EOA) address from CDP; wagmi address in non-CDP builds */
  address: `0x${string}` | undefined;
  isConnected: boolean;
  signMessageAsync: (args: { message: string }) => Promise<string>;
  /** CDP end-user access token for server `validateAccessToken`; null if unavailable */
  getCdpAccessToken: () => Promise<string | null>;
};

const AminiSigningContext = createContext<AminiSigningContextValue | null>(null);

function sameAddr(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function AminiSigningProviderCdp({ children }: { children: ReactNode }) {
  const { evmAddress } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { getAccessToken } = useGetAccessToken();
  const { signEvmMessage } = useSignEvmMessage();
  const config = useConfig();
  const { connectAsync } = useConnect();
  const { address: wagmiAddress, status: wagmiStatus } = useAccount();
  const { signMessageAsync: wagmiSign } = useSignMessage();

  const address = (evmAddress ?? undefined) as `0x${string}` | undefined;
  const isConnected = Boolean(evmAddress);

  const signMessageAsync = useCallback(
    async ({ message }: { message: string }) => {
      if (!evmAddress) throw new Error("No EVM account");

      const eoa = currentUser?.evmAccountObjects?.find((o) =>
        sameAddr(o.address, evmAddress)
      );
      if (eoa?.address) {
        const result = await signEvmMessage({
          evmAccount: eoa.address as `0x${string}`,
          message,
        });
        return result.signature;
      }

      const smart = currentUser?.evmSmartAccountObjects?.find((o) =>
        sameAddr(o.address, evmAddress)
      );
      const accountForWagmi =
        (wagmiAddress && sameAddr(wagmiAddress, evmAddress) && wagmiAddress) ||
        (smart?.address as `0x${string}` | undefined);
      if (accountForWagmi) {
        if (wagmiStatus !== "connected") {
          const connector = config.connectors[0];
          if (!connector) {
            throw new Error("No wallet connector available.");
          }
          await connectAsync({ connector, chainId: baseSepolia.id });
        }
        return wagmiSign({ message, account: accountForWagmi });
      }

      throw new Error(
        "Could not sign: account not ready. Try refreshing after logging in."
      );
    },
    [
      config.connectors,
      connectAsync,
      currentUser,
      evmAddress,
      signEvmMessage,
      wagmiAddress,
      wagmiSign,
      wagmiStatus,
    ]
  );

  const getCdpAccessToken = useCallback(async () => {
    try {
      return (await getAccessToken()) ?? null;
    } catch {
      return null;
    }
  }, [getAccessToken]);

  const value = useMemo(
    () => ({
      address,
      isConnected,
      signMessageAsync,
      getCdpAccessToken,
    }),
    [address, getCdpAccessToken, isConnected, signMessageAsync],
  );

  return (
    <AminiSigningContext.Provider value={value}>
      {children}
    </AminiSigningContext.Provider>
  );
}

export function AminiSigningProviderWagmi({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync: wagmiSign } = useSignMessage();

  const signMessageAsync = useCallback(
    async ({ message }: { message: string }) => {
      if (!address) throw new Error("No wallet connected");
      return wagmiSign({ message, account: address });
    },
    [address, wagmiSign]
  );

  const getCdpAccessToken = useCallback(async () => null as string | null, []);

  const value = useMemo(
    () => ({
      address: address as `0x${string}` | undefined,
      isConnected: Boolean(isConnected && address),
      signMessageAsync,
      getCdpAccessToken,
    }),
    [address, getCdpAccessToken, isConnected, signMessageAsync],
  );

  return (
    <AminiSigningContext.Provider value={value}>
      {children}
    </AminiSigningContext.Provider>
  );
}

export function useAminiSigning(): AminiSigningContextValue {
  const ctx = useContext(AminiSigningContext);
  if (!ctx) {
    throw new Error("useAminiSigning must be used within AminiSigningProviderCdp or AminiSigningProviderWagmi");
  }
  return ctx;
}
