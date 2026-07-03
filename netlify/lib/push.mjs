// Server-side Web Push sender. Fire-and-forget by design: NEVER throws, so a
// push hiccup can't break the caller's contract (Twilio's 200, the booking
// response). Requires the Netlify env var VAPID_PRIVATE_KEY; the public half
// is the committed constant in src/lib/push-public-key.js.

import webpush from 'web-push'
import { VAPID_PUBLIC_KEY } from '../../src/lib/push-public-key.js'

// VAPID subject: contact for push services. A stable https URL is fine.
const VAPID_SUBJECT = 'https://efimeramente-panel.netlify.app'

// Send { title, body, url } to every device subscription of one therapist.
// Dead subscriptions (push service says 404/410 — e.g. the PWA was deleted
// from the Home Screen) are pruned so we stop paying for them.
export async function notifyTherapist(supabase, terapeutaId, { title, body, url = '/' }) {
  try {
    const priv = process.env.VAPID_PRIVATE_KEY
    if (!priv) {
      console.warn('[push] VAPID_PRIVATE_KEY unset — skipping notification')
      return
    }
    if (!terapeutaId) return
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, priv)

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('terapeuta_id', terapeutaId)
    if (error) {
      console.warn('[push] subscriptions fetch failed:', error.message)
      return
    }
    if (!subs?.length) return

    const payload = JSON.stringify({ title, body, url })
    await Promise.all(
      subs.map(async (s) => {
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
