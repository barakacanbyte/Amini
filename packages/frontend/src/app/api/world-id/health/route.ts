export const runtime = "nodejs";

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_WORLDCOIN_APP_ID",
  "NEXT_PUBLIC_WORLDCOIN_ACTION",
  "WORLDCOIN_ACTION",
  "WORLDCOIN_RP_ID",
  "WORLDCOIN_RP_SIGNING_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export async function GET() {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = process.env[key];
    return !value || String(value).trim() === "";
  });

  return Response.json({
    ok: missing.length === 0,
    missing,
  });
}
