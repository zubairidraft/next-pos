// Next POS Cloud address and public (anon) key. Both are public by design:
// every request still needs a login or a shop key, and the server checks
// permissions on every row. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, when
// set at build time, take priority (e.g. a separate test server).
export const CLOUD_URL = "https://xpkjujhhjwhuhmvlqpys.supabase.co";
export const CLOUD_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwa2p1amhoandodWhtdmxxcHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMjYyMTIsImV4cCI6MjEwOTgwMjIxMn0.B5eKWW-q-j_w8JFs4bAg3--CsMCAZSBP4h47eY6uM1s";
