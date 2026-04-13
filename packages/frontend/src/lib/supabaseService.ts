export type SupabaseServiceConfig = {
  supabaseUrl: string;
  serviceRole: string;
};

export function getSupabaseServiceConfig(): SupabaseServiceConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) return null;
  return { supabaseUrl, serviceRole };
}

export function supabaseServiceHeaders(serviceRole: string): Record<string, string> {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
  };
}
