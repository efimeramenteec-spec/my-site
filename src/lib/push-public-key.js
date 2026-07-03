// VAPID application server key — PUBLIC half. Safe to commit: the browser hands
// it to Apple/Google's push service with every subscription anyway. The PRIVATE
// half lives ONLY in the Netlify env var VAPID_PRIVATE_KEY — never commit it.
// Single source of truth, imported by BOTH the client subscribe call
// (src/lib/push.js) and the server-side sender (netlify/lib/push.mjs).
export const VAPID_PUBLIC_KEY =
  'BD2Z2O08gsFKrFePBDJMhPCncFPGkBXSntdhvnLqb1GvZBQS8-YO-3tkAOOJW4KEtWfRrVLzF3K03G9Vn4aoyUM'
