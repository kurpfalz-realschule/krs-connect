-- S-2 2.6 H-3 (Audit 24.09.2026) — IN PROD 25.09.2026 (Migration sec_s2_h3_storage_read_member)
-- Vorher: jede Lehrkraft konnte alle 128 Dateien (auch fremde Chat-Anhaenge) signieren/lesen.
-- Jetzt: Uploader, Admin, Avatare, Anhaenge aus Beitraegen eigener Teams, Nachrichten eigener Chats, eigenes Feedback.
-- Trockenlauf Lehrkraft: vorher 128 / fremder DM-Anhang 1 -> nachher 23 / 0; Teambeitrag lesbar; Admin 128.
-- Nachtest alle aktiven Konten: 0 sichtbare Beitrags-/Chat-Anhaenge, deren Datei nicht lesbar ist.
-- 28 Dateien ohne Verweis sind nur noch fuer Uploader/Admin lesbar (Kandidaten fuer Loeschjob 2.8).
create or replace function public.krs_can_read_object(p_name text, p_owner text)
returns boolean language sql stable security definer set search_path = '' as $b$
  select public.get_app_user_id() is not null and (
       p_owner = (select auth.uid())::text
    or coalesce(public.is_global_admin(), false)
    or exists (select 1 from public.users u where strpos(u.avatar_url, p_name) > 0)
    or exists (select 1 from public.posts p join public.channels c on c.id = p.channel_id
               where strpos(p.image_url, p_name) > 0 and c.team_id in (select public.rls_my_team_ids()))
    or exists (select 1 from public.messages m
               where strpos(m.image_url, p_name) > 0 and m.conversation_id in (select public.rls_my_conversation_ids()))
    or exists (select 1 from public.feedback f
               where strpos(f.image_url, p_name) > 0 and f.user_id = public.get_app_user_id())
  )
$b$;
revoke execute on function public.krs_can_read_object(text, text) from public, anon;
grant execute on function public.krs_can_read_object(text, text) to authenticated;
alter policy images_select_appuser on storage.objects
  using (bucket_id = 'images' and public.krs_can_read_object(name, owner_id));
-- UNDO: alter policy images_select_appuser on storage.objects using (bucket_id = 'images' and get_app_user_id() is not null);
