export const PROD_SUPABASE_REF = 'iobsolszrmigdmdydfbe';

export function previewUsesProduction(vercelEnv, supabaseUrl) {
  return vercelEnv === 'preview'
    && String(supabaseUrl || '').includes(PROD_SUPABASE_REF);
}
