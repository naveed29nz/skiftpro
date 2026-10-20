import { supabase } from '@/api/supabaseClient';

export async function upsertLoomisDeposits(orgId, rows) {
  const payload = rows.map((row) => ({
    org_id: orgId,
    innskuddnr: row.innskuddnr,
    batchnr: row.batchnr || null,
    referanse: row.referanse || null,
    kundenr: row.kundenr || null,
    registrert: row.registrert || null,
    telledato: row.telledato || null,
    bokforingsdato: row.bokforingsdato || null,
    total: row.total,
    bilagsnr: row.bilagsnr || null,
    status: row.status || null,
    team: row.team || null,
  }));
  const saved = [];
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { data, error } = await supabase
      .from('loomis_deposits')
      .upsert(chunk, { onConflict: 'org_id,innskuddnr' })
      .select();
    if (error) throw error;
    saved.push(...(data || []));
  }
  return saved;
}

export function humanInnskuddError(error) {
  const msg = error?.message || '';
  if (/matchet mot Loomis/i.test(msg)) return 'Posen er matchet mot Loomis og kan ikke endres eller slettes.';
  if (/loomis_innskudd_pose_org_unique|duplicate key/i.test(msg)) return 'Dette posenummeret er allerede registrert.';
  if (/loomis_innskudd_pose_check/i.test(msg)) return 'Posenummer må være 9 siffer.';
  if (/schema cache|does not exist|Could not find the/i.test(msg)) {
    return 'Innskudd er ikke slått på i databasen ennå. Kjør migreringen først.';
  }
  return 'Kunne ikke lagre. Prøv igjen.';
}
