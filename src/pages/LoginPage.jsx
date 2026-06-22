import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { clientSignIn, supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Icons } from '../components/Icons'

export default function LoginPage() {
  const { signInStaff, signInClient } = useAuth()
  const initialRole = window.location.hash === '#/admin-login' ? 'admin' : window.location.hash === '#/staff-login' ? 'staff' : window.location.hash === '#/client-login' ? 'client' : null
  const [view, setView] = useState(initialRole ? 'login' : 'home')
  const [mode, setMode] = useState(initialRole === 'admin' || initialRole === 'staff' ? 'staff' : 'client')
  const [loginRole, setLoginRole] = useState(initialRole || 'client')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const openLogin = (role) => {
    setLoginRole(role)
    setMode(role === 'client' ? 'client' : 'staff')
    setError('')
    window.location.hash = `/${role}-login`
    setView('login')
  }

  const handleClientLogin = async () => {
    if (!identifier.trim() || !password.trim()) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      const session = await clientSignIn(identifier, password)
      signInClient(session)
      toast.success(`Welcome back, ${session.client.full_name.split(' ')[0]}!`)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleStaffLogin = async () => {
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      const profile = await signInStaff(email.trim(), password.trim())
      if (loginRole === 'admin' && profile?.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error('This account is not an administrator account.')
      }
      if (loginRole === 'staff' && !['staff', 'warehouse_manager'].includes(profile?.role)) {
        await supabase.auth.signOut()
        throw new Error('Please use the administrator login for this account.')
      }
      toast.success(`Welcome, ${profile?.full_name || 'User'}!`)
    } catch (e) { setError(e.message || 'Invalid email or password.') }
    finally { setLoading(false) }
  }

  const onKey = (event, fn) => { if (event.key === 'Enter') fn() }

  if (view === 'home') {
    return (
      <main className="public-site">
        <nav className="public-nav">
          <button className="public-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span>234</span> Cargo</button>
          <div className="public-nav-actions"><button onClick={() => openLogin('client')} className="public-link">Client Login</button></div>
        </nav>

        <section className="public-hero">
          <div className="public-hero-copy"><div className="public-eyebrow">China to Nigeria buying and shipping</div><h1>234 Cargo</h1><p>Send your product links, pay in RMB through us, and receive reliable sea or air freight delivery in Nigeria.</p><div className="public-hero-actions"><button className="btn btn-primary" onClick={() => openLogin('client')}>Track My Shipment</button><a className="btn btn-secondary" href="#services">Our Services</a></div></div>
          <div className="public-hero-image" role="img" aria-label="Cargo containers ready for shipment" />
        </section>

        <section id="services" className="public-section"><div className="public-section-heading"><div className="public-eyebrow">How we help</div><h2>Freight built for your business</h2></div><div className="service-grid">
          <article><span className="service-icon"><Icons.box size={25} /></span><h3>We Buy for You</h3><p>Send links from 1688, Taobao or Pinduoduo. We buy your items and arrange delivery.</p></article>
          <article><span className="service-icon"><Icons.ship size={25} /></span><h3>Sea and Air Freight</h3><p>Choose affordable sea freight or faster air freight from China to Nigeria.</p></article>
          <article><span className="service-icon"><Icons.plane size={25} /></span><h3>RMB Payment Help</h3><p>Pay us in Naira and we help you complete RMB payments to your Chinese supplier.</p></article>
        </div></section>

        <section className="public-section public-process"><div><div className="public-eyebrow">Simple process</div><h2>From China to your doorstep</h2></div><ol><li><strong>Send your product links</strong><span>Share 1688, Taobao or Pinduoduo links with our team for a purchase quote.</span></li><li><strong>Pay in Naira, we pay RMB</strong><span>Make your local payment and we handle the RMB payment to the Chinese seller.</span></li><li><strong>Track your shipment</strong><span>We record your goods, then you follow warehouse, transit and delivery updates online.</span></li></ol></section>

        <section className="public-cta"><div><h2>Already shipping with us?</h2><p>Sign in to view your goods, receipts and messages.</p></div><button className="btn btn-primary" onClick={() => openLogin('client')}>Client Login</button></section>
        <footer className="public-footer"><span>234 Cargo Logistics</span><span>Sea and air freight forwarding</span></footer>
      </main>
    )
  }

  const heading = mode === 'client' ? 'Client portal' : loginRole === 'admin' ? 'Administrator login' : 'Staff login'
  return (
    <div className="login-bg">
      <div className="login-shell">
        <button className="login-back" onClick={() => { window.history.replaceState(null, '', window.location.pathname); setView('home'); setError('') }}>Back to homepage</button>
        <div className="login-intro"><div className="login-logo">234</div><div><div className="login-company">234 Cargo</div><div className="login-subtitle">{heading}</div></div></div>
        <div className="login-card">
          <div className="login-heading">Welcome back</div><div className="login-copy">{mode === 'client' ? 'Sign in with your phone number or shipping mark.' : 'Sign in with your assigned work email.'}</div>
          {mode === 'client' ? <><label className="input-label">Phone Number or Shipping Mark</label><input className="input-field" placeholder="e.g. 080... or NG-001-ABC" value={identifier} onChange={e => setIdentifier(e.target.value)} onKeyDown={e => onKey(e, handleClientLogin)} autoFocus /><label className="input-label" style={{ marginTop: 14 }}>Password</label><input className="input-field" type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => onKey(e, handleClientLogin)} /></> : <><label className="input-label">Work Email Address</label><input className="input-field" type="email" placeholder="you@234cargo.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => onKey(e, handleStaffLogin)} autoFocus /><label className="input-label" style={{ marginTop: 14 }}>Password</label><input className="input-field" type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => onKey(e, handleStaffLogin)} /></>}
          {error && <div className="banner banner-error" style={{ marginTop: 14 }}>{error}</div>}
          <button className="btn btn-primary btn-full" style={{ marginTop: 18 }} onClick={mode === 'client' ? handleClientLogin : handleStaffLogin} disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          <div className="login-help">{mode === 'client' ? 'Contact 234 Cargo if you need help accessing your portal.' : 'Your administrator creates staff and admin accounts.'}</div>
        </div>
        {mode !== 'client' && <div className="login-switch"><button onClick={() => openLogin('client')}>Client login</button></div>}
      </div>
    </div>
  )
}
