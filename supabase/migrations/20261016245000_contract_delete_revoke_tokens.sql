-- Withdraw a sent contract by deleting it, and invalidate its signing link.
-- NOT APPLIED to the live project iobsolszrmigdmdydfbe by this change.
--
-- authenticated cannot update contract_access_tokens or contract_otp.
-- A BEFORE DELETE trigger that is not security definer would roll the
-- contract delete back. This trigger runs as its owner and only marks
-- the link revoked and unused codes consumed. contract_events stays;
-- deleting an event raises "contract_events er append-only".

create or replace function public.revoke_contract_access_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contract_access_tokens
  set revoked_at = coalesce(revoked_at, now())
  where contract_id = old.id;

  update public.contract_otp
  set consumed_at = coalesce(consumed_at, now())
  where contract_id = old.id
    and consumed_at is null;

  return old;
end;
$$;

revoke all on function public.revoke_contract_access_on_delete() from public, anon, authenticated;

drop trigger if exists revoke_contract_access_on_delete on public.contracts;
create trigger revoke_contract_access_on_delete
  before delete on public.contracts
  for each row execute function public.revoke_contract_access_on_delete();
