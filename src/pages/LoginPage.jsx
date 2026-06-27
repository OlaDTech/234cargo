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

  const services = [
    { Icon: Icons.tag, title: 'Your shipping mark', text: 'Show suppliers one clear mark before they send goods to our China warehouse.' },
    { Icon: Icons.ship, title: 'Sea and air updates', text: 'Follow goods from warehouse receiving through transit and final delivery in Nigeria.' },
    { Icon: Icons.receipt, title: 'Receipts and wallet', text: 'View freight receipts, prepaid balance, RMB purchase quotes and payment history.' },
  ]

  const process = [
    ['01', 'Sign in securely', 'Use your phone number or shipping mark with your password. This device can stay signed in for up to 90 days.'],
    ['02', 'Share your label', 'Open your sea or air receiving address and send the label to your supplier before shipping.'],
    ['03', 'Track everything', 'See packages, receipts, wallet activity, purchase requests and messages from one client portal.'],
  ]

  if (view === 'home') {
    return (
      <main className="public-site">
        <nav className="public-nav">
          <button className="public-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="234Cargo home">
            <img src="/234cargo-logo.svg" alt="234Cargo" />
          </button>
          <div className="public-nav-actions">
            <a href="#services" className="public-link">Services</a>
            <button onClick={() => openLogin('client')} className="public-nav-cta">Client Login</button>
          </div>
        </nav>

        <section className="public-hero">
          <div className="public-hero-copy">
            <div className="public-eyebrow">China to Nigeria freight portal</div>
            <h1>234Cargo Client Portal</h1>
            <p>Track your goods, download your shipping label, message the team, review receipts and manage China purchase requests from one secure account.</p>
            <div className="public-hero-actions">
              <button className="btn btn-primary" onClick={() => openLogin('client')}>Open Client Portal</button>
              <a className="btn btn-secondary" href="#services">See What You Can Do</a>
            </div>
            <div className="public-proof-row">
              <span><strong>Sea</strong> freight</span>
              <span><strong>Air</strong> freight</span>
              <span><strong>RMB</strong> purchases</span>
            </div>
          </div>
          <div className="public-hero-visual" aria-label="234Cargo shipment dashboard preview">
            <div className="public-photo-strip" role="img" aria-label="Cargo containers in transit" />
            <div className="public-route-card">
              <div className="public-route-top">
                <span>Live shipment</span>
                <strong>GZ-LOS-024</strong>
              </div>
              <div className="public-route-line"><i /></div>
              <div className="public-route-ports"><span>Guangzhou</span><span>Lagos</span></div>
            </div>
            <div className="public-phone-card">
              <div className="public-phone-head"><span>Client Portal</span><strong>MY-001-AC</strong></div>
              <div className="public-phone-status">
                <span className="is-done">Warehouse</span>
                <span className="is-active">In transit</span>
                <span>Delivered</span>
              </div>
              <div className="public-phone-metrics">
                <b>12</b><span>packages</span><b>4.8</b><span>CBM</span>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="public-section">
          <div className="public-section-heading"><div className="public-eyebrow">Client access</div><h2>Everything a client needs after goods leave the supplier.</h2></div>
          <div className="service-grid">
            {services.map(service => (
              <article key={service.title}>
                <span className="service-icon"><service.Icon size={25} /></span>
                <h3>{service.title}</h3>
                <p>{service.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-section public-process">
          <div><div className="public-eyebrow">How it works</div><h2>A simple portal for buying, shipping and tracking.</h2></div>
          <ol>
            {process.map(([step, title, text]) => <li key={step} data-step={step}><strong>{title}</strong><span>{text}</span></li>)}
          </ol>
        </section>

        <section className="public-cta"><div><h2>Already shipping with 234Cargo?</h2><p>Sign in to view your shipping mark, goods, prepaid balance, receipts, purchase requests and messages.</p></div><button className="btn btn-primary" onClick={() => openLogin('client')}>Open Client Portal</button></section>
        <footer className="public-footer"><span>234Cargo Logistics</span><span className="public-team-links"><button onClick={() => openLogin('staff')}>Staff</button><button onClick={() => openLogin('admin')}>Admin</button></span></footer>
      </main>
    )
  }

  const heading = mode === 'client' ? 'Client portal' : loginRole === 'admin' ? 'Administrator login' : 'Staff login'
  return (
    <div className="login-bg">
      <div className="login-shell">
        <button className="login-back" onClick={() => { window.history.replaceState(null, '', window.location.pathname); setView('home'); setError('') }}>Back to homepage</button>
        <div className="login-intro"><img className="login-wordmark" src="/234cargo-logo.svg" alt="234Cargo" /><div className="login-subtitle">{heading}</div></div>
        <div className="login-card">
          <div className="login-card-kicker">{mode === 'client' ? 'Shipment access' : 'Team workspace'}</div>
          <div className="login-heading">Welcome back</div><div className="login-copy">{mode === 'client' ? 'Sign in once and this device stays connected for up to 90 days.' : 'Sign in with your assigned work email.'}</div>
          {mode === 'client' ? <><label className="input-label">Phone Number or Shipping Mark</label><input className="input-field" placeholder="e.g. 080... or MY-001-ABC" value={identifier} onChange={e => setIdentifier(e.target.value)} onKeyDown={e => onKey(e, handleClientLogin)} autoFocus /><label className="input-label" style={{ marginTop: 14 }}>Password</label><input className="input-field" type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => onKey(e, handleClientLogin)} /></> : <><label className="input-label">Work Email Address</label><input className="input-field" type="email" placeholder="you@234cargo.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => onKey(e, handleStaffLogin)} autoFocus /><label className="input-label" style={{ marginTop: 14 }}>Password</label><input className="input-field" type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => onKey(e, handleStaffLogin)} /></>}
          {error && <div className="banner banner-error" style={{ marginTop: 14 }}>{error}</div>}
          <button className="btn btn-primary btn-full" style={{ marginTop: 18 }} onClick={mode === 'client' ? handleClientLogin : handleStaffLogin} disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          <div className="login-help">{mode === 'client' ? 'Use Log out on shared phones. Contact 234Cargo if you need access help.' : 'Your administrator creates staff and admin accounts.'}</div>
        </div>
        {mode !== 'client' && <div className="login-switch"><button onClick={() => openLogin('client')}>Client login</button></div>}
      </div>
    </div>
  )
}
