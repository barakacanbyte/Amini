"use client";

import { useAminiSigning } from "@/context/AminiSigningContext";

/**
 * Hook to get authenticated fetch function that includes wallet address
 * for admin API calls.
 */
export function useAdminAuth() {
  const { address, isConnected } = useAminiSigning();

  const adminFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    const headers = new Headers(options?.headers);
    
    if (address) {
      headers.set("x-wallet-address", address);
    }

    return fetch(url, {
      ...options,
      headers,
    });
  };

  return {
    address,
    isConnected,
    adminFetch,
  };
}
