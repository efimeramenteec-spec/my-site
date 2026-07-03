// Server-side Web Push sender. Fire-and-forget by design: NEVER throws, so a
// push hiccup can't break the caller's contract (Twilio's 200, the booking
// response). Requires the Netlify env var VAPID_PRIVATE_KEY; the public half
// is the committed constant in src/lib/push-public-key.js.

import webpush from 'web-push'
import { VAPID_PUBLIC_KEY } from '../../src/lib/push-public-key.js'

// VAPID subject: contact for push services. A stable https URL is fine.
const VAPID_SUBJECT = 'https://efimeramente-panel.netlify.app'

// Send { title, body, url } to every device subscription of one therapist,
// PLUS every owner subscription (terapeuta_id NULL — the owner gets all
// notifications). Dead subscriptions (push service says 404/410 — e.g. the
// PWA was deleted from the Home Screen) are pruned so we stop paying for them.
// skipOwner / skipTerapeutaId exclude the ACTING user's own devices when a
// change is made in-app (notify-estado) — no push for your own tap.
export async function notifyTherapist(
  supabase,
  terapeutaId,
  { title, body, url = '/' },
  { skipOwner = false, skipTerapeutaId = null } = {},
) {
  try {
    const priv = process.env.VAPID_PRIVATE_KEY
    if (!priv) {
      console.warn('[push] VAPID_PRIVATE_KEY unset — skipping notification')
      return
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, priv)

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, terapeuta_id, endpoint, p256dh, auth')
      .or(terapeutaId ? `terapeuta_id.eq.${terapeutaId},terapeuta_id.is.null` : 'terapeuta_id.is.null')
    if (error) {
      console.warn('[push] subscriptions fetch failed:', error.message)
      return
    }
    const targets = (subs || []).filter((s) =>
      s.terapeuta_id === null ? !skipOwner : s.terapeuta_id !== skipTerapeutaId,
    )
    if (!targets.length) return

    const payload = JSON.stringify({ title, body, url })
    await Promise.all(
      targets.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          )
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', s.id)
            console.log(`[push] pruned dead subscription ${s.id}`)
          } else {
            console.warn('[push] send failed:', e?.statusCode, e?.message)
          }
        }
      }),
    )
  } catch (e) {
    console.warn('[push] notify failed (non-blocking):', e.message)
  }
}
