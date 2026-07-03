import { supabase, isSupabaseConfigured } from './supabase.js'
import { VAPID_PUBLIC_KEY } from './push-public-key.js'

// Web Push opt-in for therapists. Subscribes THIS browser/device and persists
// the subscription in push_subscriptions (RLS: each therapist writes only her
// own rows). Notifications are sent server-side by netlify/lib/push.mjs.
//
// iOS: push only works from a Home-Screen-installed PWA on iOS 16.4+. In a
// plain Safari tab the APIs are absent → status 'unsupported', and the UI
// shows the install hint instead of the button.

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

// PushManager.subscribe wants the VAPID key as a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// 'unsupported' | 'denied' | 'subscribed' | 'idle'
export async function getPushStatus() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'subscribed' : 'idle'
  } catch {
    return 'idle'
  }
}

// terapeutaId null = OWNER subscription: receives ALL notifications. RLS
// rejects a NULL row from anyone who isn't the owner, so a therapist with a
// broken profile can't accidentally subscribe to everything.
export async function subscribeToPush(terapeutaId = null) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Disponible solo en la app en vivo.' }
  try {
    // iOS requires this call to happen inside a user gesture (the button tap).
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, error: 'No se concedió el permiso de notificaciones.' }
    }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
    const { keys } = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      { terapeuta_id: terapeutaId || null, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' },
    )
    if (error) throw error
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudieron activar las notificaciones.' }
  }
}

export async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      if (isSupabaseConfigured) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
      await sub.unsubscribe()
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudieron desactivar las notificaciones.' }
  }
}
