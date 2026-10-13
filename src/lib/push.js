import { supabase } from './supabase'
export const pushSupported = () => typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export async function pushRequest(action, token, fields = {}) {
  const { data, error } = await supabase.functions.invoke('push-subscribe', {
    body: { action, ...fields },
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  })
  if (error) {
    let message = 'Could not update notifications. Please try again.'
    try { message = (await error.context.clone().json()).error || message } catch { /* Network error. */ }
    throw new Error(message)
  }
  return data
}
export async function pushRegistration() {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Notification setup timed out. Please reload.')), 12000))])
  return registration
}
export function applicationServerKey(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
export async function disablePush(token) {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager?.getSubscription()
  if (!subscription) { localStorage.removeItem('234cargo-push-owner'); return }
  // Unsubscribe locally even if the account/session has expired on the server.
  let error
  try { await pushRequest('remove', token, { endpoint: subscription.endpoint }) } catch (e) { error = e }
  const removed = await subscription.unsubscribe()
  if (!removed) throw new Error('Could not disable this device. Disable notifications in browser settings.')
  localStorage.removeItem('234cargo-push-owner')
  if (error) console.warn('Push endpoint unsubscribed locally; server cleanup will follow on expiry.')
}
