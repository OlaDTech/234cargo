// deno run --allow-env --no-lock --node-modules-dir=none tests/push-encryption.ts
// Ephemeral test keys only; no network send or production secrets.
import webpush from 'npm:web-push@3.6.7'
import { createECDH, randomBytes } from 'node:crypto'
const vapid = webpush.generateVAPIDKeys()
webpush.setVapidDetails('https://234cargos.pages.dev', vapid.publicKey, vapid.privateKey)
const client = createECDH('prime256v1')
client.generateKeys()
const request = webpush.generateRequestDetails({
  endpoint: 'https://web.push.apple.com/test',
  keys: { p256dh: client.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
}, JSON.stringify({ title: 'Test' }))
if (!request.body.length || !request.headers.Authorization) throw new Error('Invalid encrypted request')
console.log('Deno VAPID signing and payload encryption passed (no network send)')
