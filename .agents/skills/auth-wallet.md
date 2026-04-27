# Auth & Wallet (CDP Embedded Wallet)

This app uses **Coinbase Developer Platform (CDP) embedded wallets** for in-app login (email OTP) and a **smart account** on connect (`createOnLogin: "smart"`). Wagmi is configured with **`createCDPEmbeddedWalletConnector`**.

## Official References

| Topic | Documentation |
|--------|----------------|
| Sign in before using wagmi | [createCDPEmbeddedWalletConnector](https://docs.cdp.coinbase.com/sdks/cdp-sdks-v2/frontend/@coinbase/cdp-wagmi/Functions/createCDPEmbeddedWalletConnector#createcdpembeddedwalletconnector) |
| Wagmi + embedded wallet | [EVM features — Wagmi](https://docs.cdp.coinbase.com/embedded-wallets/evm-features/wagmi) |
| React `CDPReactProvider` / components | [React components](https://docs.cdp.coinbase.com/embedded-wallets/react-components) |
| Next.js (`use client`, providers) | [Next.js integration](https://docs.cdp.coinbase.com/embedded-wallets/nextjs) |
| Portal / domains (CORS) | [Embedded Wallet Configuration](https://portal.cdp.coinbase.com/products/embedded-wallets/cors) |

## Code Configuration

1. **Provider order**: **`WagmiProvider` → `QueryClientProvider` → `CDPReactProvider`** (same as NedaPay / typical wagmi+CDP apps). Nesting `CDPReactProvider` *above* wagmi can leave **`AuthButton`** / sign-in UI broken. One shared **`Config`** is in `src/lib/cdpWalletConfig.ts` for both **`CDPReactProvider`** and **`createCDPEmbeddedWalletConnector`**.

2. **Login UI**: **`SignInModal`** + **`SignInModalContent`** with local `open` state (NedaPay-style), not **`AuthButton`**. **Theme** overrides: `src/theme/cdpEmbeddedWalletTheme.ts` on `CDPReactProvider`. **Email only** via `authMethods: ["email"]` on the modal + config.

3. **Chains**: **Base** and **Base Sepolia** are both registered in wagmi and in the embedded connector `providerConfig` (with HTTP transports). The app's **default** chain for contract addresses follows `NEXT_PUBLIC_CHAIN_ID` (see `src/lib/contracts.ts`).

4. **Env**: `NEXT_PUBLIC_CDP_PROJECT_ID`, `NEXT_PUBLIC_CDP_API_KEY`, RPC URLs, and optional `NEXT_PUBLIC_SITE_URL` for absolute logo URLs in CDP UI.

## Portal Checklist

1. [CDP Portal](https://portal.cdp.coinbase.com/) — create/select a project; copy **Project ID** and API key.
2. **Embedded wallets — allowed origins**: add every origin you use (e.g. `http://localhost:3000`, production `https://your-domain.com`). Without this, sign-in can fail in the browser.
3. Optionally enable **email** / OTP in embedded wallet product settings if the portal exposes it (SDK still restricts to email in app via `authMethods`).

## Environment Variables

See root `.env.example`. Required:

- `NEXT_PUBLIC_CDP_PROJECT_ID` — required for embedded wallet + CDP auth UI.
- `NEXT_PUBLIC_CDP_API_KEY` — OnchainKit / CDP APIs.
- `NEXT_PUBLIC_CHAIN_ID` — `8453` (Base) or `84532` (Base Sepolia) for app contract config.
- `NEXT_PUBLIC_RPC_URL` — Base main RPC (default `https://mainnet.base.org` if unset).
- `NEXT_PUBLIC_BASE_SEPOLIA_RPC` — Base Sepolia RPC (default `https://sepolia.base.org` if unset).

Restart the dev server after changing `NEXT_PUBLIC_*` variables.
