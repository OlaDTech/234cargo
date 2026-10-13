// Node 22+: node --experimental-strip-types tests/push-validation.mjs
import assert from 'node:assert/strict'
import { validateSubscription } from '../supabase/functions/_shared/push-validation.ts'
const keys={p256dh:'a'.repeat(87),auth:'b'.repeat(22)}
for(const endpoint of ['https://web.push.apple.com/x','https://fcm.googleapis.com/x','https://updates.push.services.mozilla.com/x'])assert.equal(validateSubscription({endpoint,keys}).endpoint,endpoint)
for(const endpoint of ['http://web.push.apple.com/x','https://127.0.0.1/x','https://web.push.apple.com.attacker.test/x','https://user:pass@web.push.apple.com/x','https://web.push.apple.com:444/x','https://example.com/x'])assert.throws(()=>validateSubscription({endpoint,keys}))
assert.throws(()=>validateSubscription({endpoint:'https://web.push.apple.com/x',keys:{p256dh:'bad',auth:'bad'}}))
console.log('Push provider allowlist, HTTPS, credentials, port and key validation passed')
