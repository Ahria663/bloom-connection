// Shared Supabase config for API routes.
// URL/anon are already public in the client; service key stays on the server when set.
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://wbtbkqczxttkntjzafgq.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidGJrcWN6eHR0a250anphZmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NTkzMTAsImV4cCI6MjA5MDIzNTMxMH0.81yC0IWVll9ktKJyciKnC-bsO9atFydvszES_zzo-4k';

function supabaseHeaders(extra) {
  return Object.assign(
    {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
    },
    extra || {}
  );
}

module.exports = { SUPABASE_URL, SUPABASE_KEY, supabaseHeaders };
