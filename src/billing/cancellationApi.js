import { supabase } from '@/api/supabaseClient';
import { isCancellationStorageMissing } from '@/billing/cancellationTerms';

export async function loadCancellationState(orgId) {
  const { data, error } = await supabase
    .from('subscription_cancellations')
    .select('*')
    .eq('org_id', orgId)
    .order('requested_at', { ascending: false });
  if (error) {
    if (isCancellationStorageMissing(error)) return { missing: true, rows: [] };
    throw error;
  }
  return { missing: false, rows: data || [] };
}

export async function loadAllCancellations() {
  const { data, error } = await supabase
    .from('subscription_cancellations')
    .select('*')
    .order('data_deletion_on', { ascending: true });
  if (error) {
    if (isCancellationStorageMissing(error)) return { missing: true, rows: [] };
    throw error;
  }
  return { missing: false, rows: data || [] };
}

export async function submitCancellation({ orgId, reasonCode, reasonDetail }) {
  const { data, error } = await supabase.rpc('submit_subscription_cancellation', {
    p_org_id: orgId,
    p_reason_code: reasonCode,
    p_reason_detail: reasonDetail,
  });
  if (error) throw error;
  return data;
}

export async function withdrawCancellation(id) {
  const { data, error } = await supabase.rpc('withdraw_subscription_cancellation', {
    p_id: id,
  });
  if (error) throw error;
  return data;
}

export async function markCancellationDataDeleted(id, note) {
  const { data, error } = await supabase.rpc('mark_subscription_data_deleted', {
    p_id: id,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}
