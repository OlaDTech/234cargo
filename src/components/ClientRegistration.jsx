import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ClientRegistration({ onBack }) {
  const [form, setForm] = useState({ full_name: '', phone: '', country: 'Nigeria', state: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await supabase.functions.invoke('client-register', { body: form })
      if (result.error) {
        let text = 'Could not send your request. Please try again.'
        try { text = (await result.error.context.clone().json()).error || text } catch { /* Network error */ }
        throw new Error(text)
      }
      setMessage(result.data.message)
      setForm({ full_name: '', phone: '', country: 'Nigeria', state: '', password: '' })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <main className="login-bg"><section className="login-card" style={{ width: '100%', maxWidth: 480, margin: '24px auto' }}>
    <button className="login-back" onClick={onBack}>Back to client login</button>
    <img className="login-wordmark" src="/234cargo-logo.svg" alt="234Cargo" />
    <h1 className="login-heading">Create your client account</h1>
    <p className="login-copy">Our team will review your request. After approval, sign in to download your shipping label. No SMS verification is required.</p>
    {message ? <div role="status"><h2>Request received</h2><p>{message}</p><button className="btn btn-primary btn-full" onClick={onBack}>Go to client login</button></div> : <form onSubmit={submit}>
      {[
        ['full_name','Full name','text',120,'name'],
        ['phone','Phone number with country code','tel',16,'tel'],
        ['country','Destination country','text',80,'country-name'],
        ['state','Destination city / state','text',100,'address-level1'],
        ['password','Password (at least 10 characters)','password',72,'new-password'],
      ].map(([key,label,type,maxLength,autoComplete]) => <div className="input-group" key={key}>
        <label className="input-label" htmlFor={`register-${key}`}>{label}</label>
        <input className="input-field" id={`register-${key}`} type={type} required maxLength={maxLength} minLength={key==='password'?10:key==='phone'?9:2} pattern={key==='phone'?'\\+[1-9][0-9]{7,14}':undefined} placeholder={key==='phone'?'+2348012345678':undefined} autoComplete={autoComplete} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} disabled={busy}/>
      </div>)}
      {error && <p className="banner banner-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-full" disabled={busy}>{busy?'Submitting…':'Submit for approval'}</button>
      <p className="login-copy">Already have goods or a shipping mark with us? Contact the team to access your existing account instead of registering again.</p>
    </form>}
  </section></main>
}
