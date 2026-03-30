"use client";

/**
 * CDP embedded auth: `AuthButton` uses CDP's `useIsSignedIn` so the header updates as soon as
 * email/passkey sign-in completes — not only when wagmi finishes connecting the embedded connector
 * (which could lag and left "Log in" visible). Custom slots keep the same "Log in" / address UI.
 *
 * Uses `useEvmAddress` from CDP hooks to display the smart account address,
 * ensuring it matches the address shown in forms (via `useAminiSigning`).
 *
 * `WagmiProvider` must wrap `CDPReactProvider` (see `providers.tsx`).
 */
import {
  AuthButton,
  SignInModal,
  SignInModalContent,
  SignOutButton,
} from "@coinbase/cdp-react";
import { useEvmAddress } from "@coinbase/cdp-hooks";

function shortAddress(address?: string) {
  if (!address) return "Account";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function CdpEmbeddedAuth() {
  const { evmAddress } = useEvmAddress();

  return (
    <AuthButton
      className="flex min-h-10 shrink-0 items-center"
      closeOnSuccessDelay={800}
      signInModal={({ open, setIsOpen, onSuccess }) => (
        <>
          <button
            type="button"
            onClick={() => setIsOpen?.(true)}
            className="flex min-h-10 shrink-0 items-center rounded-lg px-4 text-sm font-semibold transition-colors"
          >
            Log in
          </button>
          <SignInModal
            authMethods={["email"]}
            open={open}
            setIsOpen={setIsOpen ?? (() => {})}
            onSuccess={onSuccess}
          >
            <SignInModalContent />
          </SignInModal>
        </>
      )}
      signOutButton={({ onSuccess }) => (
        <SignOutButton
          className="flex min-h-10 shrink-0 items-center"
          variant="secondary"
          onSuccess={onSuccess}
        >
          {shortAddress(evmAddress ?? undefined)}
        </SignOutButton>
      )}
    />
  );
}
