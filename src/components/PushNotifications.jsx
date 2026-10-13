import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { applicationServerKey, disablePush, pushRegistration, pushRequest, pushSupported } from '../lib/push'

export default function PushNotifications() {
  const { clientUser, clientSessionToken, profile } = useAuth()
  const owner = clientUser ? `client:${clientUser.id}` : `staff:${profile?.id}`
  const [setup,setSetup]=useState(null)
  const [enabled,setEnabled]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    let active=true
    setSetup(null);setEnabled(false);setError('')
    if(!pushSupported()) return
    ;(async()=>{
      const registration=await pushRegistration()
      let subscription=await registration.pushManager.getSubscription()
      if(subscription && localStorage.getItem('234cargo-push-owner')!==owner) {
        if(!await subscription.unsubscribe()) throw new Error('Disable notifications in browser settings before switching accounts.')
        subscription=null
      }
      const config=await pushRequest('config',clientSessionToken)
      if(subscription) await pushRequest('subscribe',clientSessionToken,{subscription:subscription.toJSON()})
      if(active) {setSetup({registration,publicKey:config.publicKey});setEnabled(!!subscription)}
    })().catch(e=>{if(active)setError(e.message)})
    return ()=>{active=false}
  },[owner,clientSessionToken,retry])
  async function toggle() {
    if(busy)return
    setBusy(true);setError('')
    try {
      if(enabled) {await disablePush(clientSessionToken);setEnabled(false);return}
      // Request permission directly from the user's tap, never automatically.
      const permission=await Notification.requestPermission()
      if(permission!=='granted') throw new Error('Notifications are blocked or were not allowed. You can change this in your device notification settings.')
      const subscription=await setup.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationServerKey(setup.publicKey)})
      try {await pushRequest('subscribe',clientSessionToken,{subscription:subscription.toJSON()})}
      catch(e) {await subscription.unsubscribe();throw e}
      localStorage.setItem('234cargo-push-owner',owner)
      setEnabled(true)
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <section className="card" aria-label="Device notifications" style={{marginTop:16}}>
    <h2 style={{fontSize:16}}>Phone notifications</h2>
    <p style={{fontSize:13,color:'var(--muted)',margin:'10px 0'}}>Get updates when 234Cargo is closed. Notifications show a brief alert, not your private details.</p>
    {!pushSupported()?<p>On iPhone (iOS 16.4 or later), add 234Cargo to your Home Screen, open it from that icon, then enable notifications here.</p>:<>
      <button className="btn btn-primary btn-sm" disabled={busy||!setup} onClick={toggle}>{busy?'Updating…':enabled?'Turn notifications off':'Enable notifications'}</button>
      {enabled && <p role="status">Notifications are on for this account on this device.</p>}
      {!setup&&!error&&<p role="status">Preparing notifications…</p>}
    </>}
    {error&&<div role="alert"><p>{error}</p><button className="btn btn-sm" disabled={busy} onClick={()=>setRetry(n=>n+1)}>Retry setup</button></div>}
  </section>
}
