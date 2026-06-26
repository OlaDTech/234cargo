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
    { Icon: Icons.store, title: 'China Buying Desk', text: 'Send product links from 1688, Taobao or Pinduoduo and let the team handle the RMB purchase flow.' },
    { Icon: Icons.ship, title: 'Sea and Air Freight', text: 'Move goods from China to Nigeria with package records, container progress and delivery updates in one portal.' },
    { Icon: Icons.receipt, title: 'Receipts and Wallet', text: 'Issue freight receipts, confirm cash top-ups and let clients pay shipping or purchase quotes from balance.' },
  ]

  const process = [
    ['01', 'Submit a link or shipment', 'Clients share supplier links or send goods to the China warehouse with their shipping mark.'],
    ['02', 'Team records and approves', 'Staff record packages, containers, purchases, cash top-ups and receipts from the admin workspace.'],
    ['03', 'Client tracks everything', 'The client portal shows goods, receipts, wallet activity, purchase status and messages.'],
  ]

  if (view === 'home') {
    return (
      <main className="public-site">
        <nav className="public-nav">
          <button className="public-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span>234</span> Cargo</button>
          <div className="public-nav-actions">
            <a href="#services" className="public-link">Services</a>
            <button onClick={() => openLogin('staff')} className="public-link">Staff</button>
            <button onClick={() => openLogin('client')} className="public-nav-cta">Client Login</button>
          </div>
        </nav>

        <section className="public-hero">
          <div className="public-hero-copy">
            <div className="public-eyebrow">China to Nigeria logistics command</div>
            <h1>Buying, shipping and tracking in one clean portal.</h1>
            <p>234 Cargo connects China purchases, warehouse receiving, container movement, wallet payments, receipts and client updates in a single operating system.</p>
            <div className="public-hero-actions">
              <button className="btn btn-primary" onClick={() => openLogin('client')}>Track My Shipment</button>
              <button className="btn btn-secondary" onClick={() => openLogin('admin')}>Admin Login</button>
            </div>
            <div className="public-proof-row">
              <span><strong>Sea</strong> consolidation</span>
              <span><strong>Air</strong> freight</span>
              <span><strong>RMB</strong> buying desk</span>
            </div>
          </div>
          <div className="public-hero-visual" aria-label="234 Cargo shipment dashboard preview">
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
              <div className="public-phone-head"><span>Client Portal</span><strong>NG-001-AC</strong></div>
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
          <div className="public-section-heading"><div className="public-eyebrow">What changed</div><h2>A sharper workspace for clients and the logistics team.</h2></div>
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
          <div><div className="public-eyebrow">Simple process</div><h2>From supplier link to delivery update.</h2></div>
          <ol>
            {process.map(([step, title, text]) => <li key={step} data-step={step}><strong>{title}</strong><span>{text}</span></li>)}
          </ol>
        </section>

        <section className="public-cta"><div><h2>Already shipping with us?</h2><p>Sign in to view your goods, prepaid balance, receipts, purchase requests and messages.</p></div><button className="btn btn-primary" onClick={() => openLogin('client')}>Open Client Portal</button></section>
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
          <div className="login-card-kicker">{mode === 'client' ? 'Shipment access' : 'Team workspace'}</div>
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
