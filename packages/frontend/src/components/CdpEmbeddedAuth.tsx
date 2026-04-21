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
import { useCurrentUser, useEvmAddress } from "@coinbase/cdp-hooks";
import { useEffect, useMemo, useState } from "react";

function shortAddress(address?: string) {
  if (!address) return "Account";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

type DbProfile = { name?: string | null; profile_slug?: string | null } | null;

function getUserLabel(args: {
  currentUser: unknown;
  evmAddress?: string;
  dbProfile: DbProfile;
}) {
  const { currentUser, evmAddress, dbProfile } = args;

  const dbName = (dbProfile?.name ?? "").trim();
  if (dbName) return dbName;

  const dbUsername = (dbProfile?.profile_slug ?? "").trim();
  if (dbUsername) return dbUsername;

  const u = currentUser as
    | { name?: unknown; displayName?: unknown; email?: unknown }
    | null
    | undefined;

  const name =
    (typeof u?.displayName === "string" && u.displayName.trim()) ||
    (typeof u?.name === "string" && u.name.trim()) ||
    (typeof u?.email === "string" && u.email.trim()) ||
    "";

  return name || shortAddress(evmAddress);
}

export function CdpEmbeddedAuth() {
  const { evmAddress } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const [dbProfile, setDbProfile] = useState<DbProfile>(null);

  useEffect(() => {
    if (!evmAddress) {
      setDbProfile(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/profiles/${encodeURIComponent(evmAddress.toLowerCase())}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; profile?: DbProfile }) => {
        if (cancelled) return;
        setDbProfile(j?.ok ? (j.profile ?? null) : null);
      })
      .catch(() => {
        if (!cancelled) setDbProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [evmAddress]);

  const label = useMemo(
    () => getUserLabel({ currentUser, evmAddress: evmAddress ?? undefined, dbProfile }),
    [currentUser, dbProfile, evmAddress],
  );

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
          {label}
        </SignOutButton>
      )}
    />
  );
}
