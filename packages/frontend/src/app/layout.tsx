import "@/lib/ssrLocalStorageShim";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import "@coinbase/cds-icons/fonts/web/icon-font.css";
import "@coinbase/cds-web/defaultFontStyles";
import "@coinbase/cds-web/globalStyles";
import "@coinbase/onchainkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { getWagmiConfig } from "@/lib/wagmiAminiConfig";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

/** Use ASCII punctuation only: fetch/Headers in the dev client require ISO-8859-1 header values. */
export const metadata: Metadata = {
  title: "Amini - Believe | Transparent Fund Disbursement",
  description: "Transparent, traceable, programmable fund transfers on Base",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieHeader = (await headers()).get("cookie") ?? undefined;
  const wagmiInitialState = cookieToInitialState(getWagmiConfig(), cookieHeader);

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="app-root min-h-screen font-sans">
        <Providers initialState={wagmiInitialState}>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
