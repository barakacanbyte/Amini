import type { Config } from "@coinbase/cdp-react";
import { getPublicLogoUrl } from "@/lib/branding";

/**
 * Single CDP config for both `CDPReactProvider` and `createCDPEmbeddedWalletConnector` (must stay identical).
 * Mirrors the official embedded-wallet example: project id, smart wallet on login, email auth, app metadata.
 */
export function getCdpWalletConfig(): Config | null {
  const disabled =
    process.env.NEXT_PUBLIC_DISABLE_CDP === "1" ||
    process.env.NEXT_PUBLIC_DISABLE_CDP === "true";
  if (disabled) return null;

  const projectId = (process.env.NEXT_PUBLIC_CDP_PROJECT_ID ?? "").trim();
  if (!projectId) return null;

  const logoUrl = getPublicLogoUrl();

  return {
    projectId,
    ethereum: {
      createOnLogin: "smart",
    },
    appName: "Amini",
    appLogoUrl: logoUrl.startsWith("http") ? logoUrl : "",
    authMethods: ["email"],
    showCoinbaseFooter: true,
  };
}
