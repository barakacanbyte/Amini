/**
 * Admin authorization helpers
 * 
 * Verifies that a wallet address has admin role in the profiles table.
 * For production use, add proper authentication middleware.
 */

export async function verifyAdminAccess(wallet: string): Promise<{ ok: boolean; message?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return { ok: false, message: "Supabase not configured on server." };
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?wallet=eq.${wallet.toLowerCase()}&select=wallet,role,roles&limit=1`,
      {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
      }
    );

    if (!res.ok) {
      return { ok: false, message: "Failed to verify admin access." };
    }

    const profiles = await res.json() as Array<{ wallet: string; role?: string; roles?: string[] }>;

    if (profiles.length === 0) {
      return { ok: false, message: "Profile not found." };
    }

    const profile = profiles[0];
    const hasAdminRole = profile.roles?.includes('admin') || profile.role === 'admin';

    if (!hasAdminRole) {
      return { ok: false, message: "Access denied. Admin role required." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Admin verification error:", error);
    return { ok: false, message: "Admin verification failed." };
  }
}

/**
 * Extracts wallet address from request headers for admin verification.
 * In production, use proper session management or JWT tokens.
 */
export function getWalletFromRequest(req: Request): string | null {
  // Check for wallet in custom header (set by frontend)
  const walletHeader = req.headers.get("x-wallet-address");
  if (walletHeader) {
    return walletHeader.toLowerCase();
  }

  // For development: could also check cookies or other auth mechanisms
  return null;
}

/**
 * Middleware-style helper to check admin access in API routes.
 * Returns error response if not authorized, null if authorized.
 */
export async function requireAdmin(req: Request): Promise<Response | null> {
  const wallet = getWalletFromRequest(req);

  console.log("[requireAdmin] Wallet from request:", wallet);

  if (!wallet) {
    return Response.json(
      { ok: false, message: "Authentication required. Wallet address not provided." },
      { status: 401 }
    );
  }

  const adminCheck = await verifyAdminAccess(wallet);

  console.log("[requireAdmin] Admin check result:", adminCheck);

  if (!adminCheck.ok) {
    return Response.json(
      { ok: false, message: adminCheck.message || "Access denied." },
      { status: 403 }
    );
  }

  return null;
}
