// @ts-nocheck
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import PushOptIn from '@/components/PushOptIn';
import { isMissingRelation } from '@/lib/managerAlerts';
import {
  checklistItems,
  checklistProgress,
  shouldShowChecklist,
} from '@/lib/onboardingChecklist';
import { isStandaloneDisplay } from '@/pwaStandalone';
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist';

async function countRows(table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);
  if (error) return 0;
  return count || 0;
}

export default function EmployeeChecklist({ worker, userId, orgId, highlight = '' }) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(worker?.phone || '');
  const [address, setAddress] = useState(worker?.address || '');
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [hiddenLocally, setHiddenLocally] = useState(false);

  useEffect(() => {
    setPhone(worker?.phone || '');
    setAddress(worker?.address || '');
  }, [worker?.phone, worker?.address]);

  const progressQuery = useQuery({
    queryKey: ['onboarding-progress', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_progress')
        .select('dismissed_at, notifications_done_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error)) return { available: false, row: null };
        throw error;
      }
      return { available: true, row: data };
    },
  });

  const contractsQuery = useQuery({
    queryKey: ['onboarding-contracts', orgId, worker?.id],
    enabled: Boolean(orgId && worker?.id),
    queryFn: () => base44.entities.Contract.filter({ org_id: orgId, worker_id: worker.id }),
  });

  const availabilityQuery = useQuery({
    queryKey: ['onboarding-availability', worker?.id],
    enabled: Boolean(worker?.id),
    queryFn: () => countRows('availability', 'worker_id', worker.id),
  });

  const pushQuery = useQuery({
    queryKey: ['onboarding-push', userId],
    enabled: Boolean(userId),
    queryFn: () => countRows('push_subscriptions', 'user_id', userId),
  });

  const detectedNotifications = Boolean(pushQuery.data) || isStandaloneDisplay();
  const storedNotifications = Boolean(progressQuery.data?.row?.notifications_done_at);
  const notificationsOn = storedNotifications || detectedNotifications;
  const items = checklistItems({
    worker,
    contracts: contractsQuery.data || [],
    availabilityCount: availabilityQuery.data || 0,
    notificationsOn,
  });
  const progress = checklistProgress(items);
  const dismissed = hiddenLocally || Boolean(progressQuery.data?.row?.dismissed_at);

  const saveProgress = async (patch) => {
    if (!progressQuery.data?.available) {
      if (patch.dismissed_at) setHiddenLocally(true);
      return false;
    }
    const current = progressQuery.data.row || {};
    const { error } = await supabase.from('onboarding_progress').upsert({
      org_id: orgId,
      user_id: userId,
      worker_id: worker.id,
      dismissed_at: patch.dismissed_at === undefined ? (current.dismissed_at || null) : patch.dismissed_at,
      notifications_done_at: patch.notifications_done_at === undefined
        ? (current.notifications_done_at || null)
        : patch.notifications_done_at,
    }, { onConflict: 'user_id' });
    if (error) return false;
    queryClient.invalidateQueries({ queryKey: ['onboarding-progress', userId] });
    return true;
  };

  useEffect(() => {
    if (!progressQuery.data?.available || storedNotifications || !detectedNotifications) return;
    saveProgress({ notifications_done_at: new Date().toISOString() });
    // The stored flag is the only thing that should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressQuery.data?.available, storedNotifications, detectedNotifications]);

  if (!worker || progressQuery.isPending || contractsQuery.isPending) return null;

  if (!shouldShowChecklist({ items, dismissed })) {
    if (dismissed && !progress.complete) {
      return (
        <button
          type="button"
          className="text-sm font-medium text-blue-700 hover:underline"
          onClick={() => {
            setHiddenLocally(false);
            saveProgress({ dismissed_at: null });
          }}
        >
          Vis oppstartsjekkliste
        </button>
      );
    }
    return null;
  }

  return (
    <OnboardingChecklist
      items={items}
      progress={progress}
      highlight={highlight}
      phone={phone}
      address={address}
      onPhone={setPhone}
      onAddress={setAddress}
      savingProfile={saving}
      profileError={profileError}
      pushSlot={<PushOptIn userId={userId} />}
      standalone={isStandaloneDisplay()}
      onDismiss={() => saveProgress({ dismissed_at: new Date().toISOString() })}
      onAckNotifications={() => saveProgress({ notifications_done_at: new Date().toISOString() })}
      onSaveProfile={async () => {
        setProfileError('');
        setSaving(true);
        const { error } = await supabase.rpc('save_own_contact', {
          p_phone: phone,
          p_address: address,
        });
        setSaving(false);
        if (error) {
          setProfileError(isMissingRelation(error)
            ? 'Lagring av profil krever databaseoppdateringen. Be lederen legge inn telefon og adresse.'
            : (error.message || 'Kunne ikke lagre profilen.'));
          return;
        }
        queryClient.invalidateQueries({ queryKey: ['workers'] });
      }}
    />
  );
}
