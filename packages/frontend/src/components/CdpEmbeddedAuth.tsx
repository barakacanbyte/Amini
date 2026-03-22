"use client";

/**
 * NedaPay-style CDP auth: controlled `SignInModal` + `SignInModalContent` (not `AuthButton`).
 * `WagmiProvider` must wrap `CDPReactProvider` so the modal / embedded connector behave correctly.
 */
import { SignInModal, SignInModalContent, SignOutButton } from "@coinbase/cdp-react";
import { useAccount } from "wagmi";
import { useEffect, useState } from "react";

function shortAddress(address?: string) {
  if (!address) return "Account";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function CdpEmbeddedAuth() {
  const [open, setOpen] = useState(false);
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (isConnected && open) setOpen(false);
  }, [isConnected, open]);

  if (isConnected && address) {
    return (
      <SignOutButton className="flex min-h-10 shrink-0 items-center" variant="secondary">
        {shortAddress(address)}
      </SignOutButton>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-10 shrink-0 items-center rounded-lg px-4 text-sm font-semibold transition-colors"
      >
        Log in
      </button>
      <SignInModal authMethods={["email"]} open={open} setIsOpen={setOpen}>
        <SignInModalContent />
      </SignInModal>
    </>
  );
}
