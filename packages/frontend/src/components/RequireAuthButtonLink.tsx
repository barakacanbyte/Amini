"use client";

import { Button } from "@coinbase/cds-web/buttons/Button";
import { SignInModal, SignInModalContent } from "@coinbase/cdp-react";
import { useCurrentUser } from "@coinbase/cdp-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useAminiSigning } from "@/context/AminiSigningContext";
import { getCdpWalletConfig } from "@/lib/cdpWalletConfig";

export function RequireAuthButtonLink(props: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  compact?: boolean;
}) {
  const { href, children, variant, className, compact } = props;
  const router = useRouter();
  const cdpConfigured = Boolean(getCdpWalletConfig());
  const { isConnected } = useAminiSigning();
  const { currentUser } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const isAuthed = useMemo(() => {
    if (!cdpConfigured) return isConnected;
    return Boolean(currentUser);
  }, [cdpConfigured, currentUser, isConnected]);

  const onClick = (e: MouseEvent) => {
    if (isAuthed) return;
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      {isAuthed ? (
        <Button as={Link} href={href} variant={variant} className={className} compact={compact}>
          {children}
        </Button>
      ) : (
        <Button type="button" onClick={onClick} variant={variant} className={className} compact={compact}>
          {children}
        </Button>
      )}
      {cdpConfigured ? (
        <SignInModal
          authMethods={["email"]}
          open={open}
          setIsOpen={setOpen}
          onSuccess={() => {
            setOpen(false);
            router.push(href);
          }}
        >
          <SignInModalContent />
        </SignInModal>
      ) : null}
    </>
  );
}

