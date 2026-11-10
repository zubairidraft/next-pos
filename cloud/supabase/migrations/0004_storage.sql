-- Private bucket for the shops' encrypted backups (Supabase only; files are
-- reached through the backup edge function, never directly).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('backups', 'backups', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800;
