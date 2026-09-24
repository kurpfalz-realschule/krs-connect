-- S-2 K-4/K-5/H-6 (Audit 24.09.2026) — IN PROD 24.09.2026 (Migration sec_s2_k4_k5_immutable_dm_integrity)
-- Trockenlauf + Nachtest als normale Lehrkraft: Beitrag/Nachricht verschieben 42501, fremder dm_key 42501,
-- Dringend nachtraeglich 42501, fremden Chat loeschen 0 Zeilen; Bearbeiten, Gruppe+Mitglieder, DM oeffnen ok.
-- Vorab-Pruefung: keine DM mit verletztem dm_key, keine DM mit >2 Mitgliedern (keine Ausnutzung erkennbar).
create or replace function public.krs_guard_immutable_cols()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'posts' then
    if new.channel_id is distinct from old.channel_id or new.author_id is distinct from old.author_id
       or new.parent_id is distinct from old.parent_id or new.created_at is distinct from old.created_at then
      raise exception 'Kanal/Autor/Thread eines Beitrags sind unveraenderlich.' using errcode = '42501';
    end if;
    if new.is_urgent is distinct from old.is_urgent and not coalesce(public.is_platform_owner(), false) then
      raise exception 'Dringend kann nachtraeglich nicht geaendert werden.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'messages' then
    if new.conversation_id is distinct from old.conversation_id or new.sender_id is distinct from old.sender_id
       or new.reply_to_id is distinct from old.reply_to_id or new.created_at is distinct from old.created_at then
      raise exception 'Chat/Absender einer Nachricht sind unveraenderlich.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'conversations' then
    if new.dm_key is distinct from old.dm_key or new.is_group is distinct from old.is_group
       or new.created_by is distinct from old.created_by then
      raise exception 'Chat-Typ/Schluessel/Ersteller sind unveraenderlich.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.krs_guard_immutable_cols() from public, anon, authenticated;
drop trigger if exists trg_krs_guard_immutable on public.posts;
drop trigger if exists trg_krs_guard_immutable on public.messages;
drop trigger if exists trg_krs_guard_immutable on public.conversations;
create trigger trg_krs_guard_immutable before update on public.posts for each row execute function public.krs_guard_immutable_cols();
create trigger trg_krs_guard_immutable before update on public.messages for each row execute function public.krs_guard_immutable_cols();
create trigger trg_krs_guard_immutable before update on public.conversations for each row execute function public.krs_guard_immutable_cols();
alter policy conversations_insert_auth on public.conversations
  with check (created_by = (select public.get_app_user_id()) and dm_key is null and is_group = true);
alter policy conversations_update_member on public.conversations
  with check (id in (select public.rls_my_conversation_ids()));
alter policy conversations_delete_member on public.conversations
  using (created_by = (select public.get_app_user_id()) or (select public.is_global_admin()));
create or replace function public.can_add_conversation_member(p_conversation_id bigint)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  SELECT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id AND c.is_group)
     AND (EXISTS (SELECT 1 FROM public.conversation_members m
                   WHERE m.conversation_id = p_conversation_id AND m.user_id = public.get_app_user_id())
       OR EXISTS (SELECT 1 FROM public.conversations c
                   WHERE c.id = p_conversation_id AND c.created_by = public.get_app_user_id()));
$function$;
-- UNDO: drop trigger trg_krs_guard_immutable on posts/messages/conversations; drop function krs_guard_immutable_cols();
--       Policies auf alten Stand (siehe 2026-09-23_RLS-PERF_phase2b_messages_conversations.sql).
