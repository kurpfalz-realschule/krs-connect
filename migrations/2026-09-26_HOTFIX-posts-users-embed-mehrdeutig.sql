-- HOTFIX 26.09.2026 (LIVE eingespielt als Migration hotfix_posts_users_embed_ambiguity)
-- Symptom: Alle Beitraege in Teams/Kanaelen leer, seit 25.09. ~13:30 (Paket-D-Migration 13:28).
-- Ursache: post_acks (PK post_id,user_id) und thread_reads (PK user_id,parent_id) hatten
-- zusammengesetzte Primaerschluessel aus zwei FKs -> PostgREST erkennt sie als m2m-Verknuepfung
-- posts<->users. Damit ist author:users(...) mehrdeutig -> HTTP 300 (PGRST201) -> App zeigt nichts,
-- neue Beitraege wurden nicht gespeichert. Daten waren nie weg.
-- Fix: Muster wie post_reads — eigene id als PK, Paar als UNIQUE (ON CONFLICT (spalten) bleibt gueltig).
-- REGEL: Neue Tabellen mit FK auf users UND posts/messages NIE mit zusammengesetztem PK anlegen,
-- oder im Client den FK-Hinweis nutzen: author:users!posts_author_id_fkey(...)
alter table public.post_acks drop constraint post_acks_pkey;
alter table public.post_acks add column id bigint generated always as identity primary key;
alter table public.post_acks add constraint post_acks_post_id_user_id_key unique (post_id, user_id);

alter table public.thread_reads drop constraint thread_reads_pkey;
alter table public.thread_reads add column id bigint generated always as identity primary key;
alter table public.thread_reads add constraint thread_reads_user_id_parent_id_key unique (user_id, parent_id);

notify pgrst, 'reload schema';
