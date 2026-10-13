export function validateSubscription(value: any) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) throw new Error('Invalid subscription')
  const url = new URL(value.endpoint)
  // Exact provider domains only: do not let a browser supply an arbitrary HTTP target.
  const host = url.hostname
  const trusted = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')
  if (!trusted || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) throw new Error('Unsupported push provider')
  const key = value.keys?.p256dh, auth = value.keys?.auth
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{87}=?$/.test(key) ||
      typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22}(==)?$/.test(auth)) throw new Error('Invalid subscription keys')
  return { endpoint: url.href, p256dh: key, auth }
}
