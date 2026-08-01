const { createClient } = require("@supabase/supabase-js");
const { config } = require("./farm-api");

let cachedClient = null;
let cachedKey = "";

function supabaseAdmin() {
  const { url, serviceKey } = config();
  const cacheKey = `${url}:${serviceKey.slice(-12)}`;
  if (!cachedClient || cachedKey !== cacheKey) {
    cachedClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { "X-Client-Info": "palmoil-est-hr-server" } },
    });
    cachedKey = cacheKey;
  }
  return cachedClient;
}

module.exports = { supabaseAdmin };
