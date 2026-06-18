import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Icons } from '../components/Icons'

export default function LoginPage() {
  const { signInStaff, signInClient } = useAuth()
  const [mode, setMode] = useState('client')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClientLogin = async () => {
    if (!identifier.trim() || !password.trim()) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      const { data, error: qErr } = await supabase
        .from('clients')
        .select('*')
        .or(`phone.eq.${identifier.trim()},shipping_mark.eq.${identifier.trim()}`)
        .single()
      if (qErr || !data) throw new Error('Client not found. Check your phone number or shipping mark.')
      if (data.password_hash !== password.trim()) throw new Error('Incorrect password.')
      signInClient(data)
      toast.success('Welcome back, ' + data.full_name.split(' ')[0] + '!')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const handleStaffLogin = async () => {
    if (!email.trim() || !password.trim()) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      const profile = await signInStaff(email.trim(), password.trim())
      toast.success('Welcome, ' + (profile?.full_name || 'User') + '!')
    } catch (e) {
      setError(e.message || 'Invalid email or password.')
    }
    finally { setLoading(false) }
  }

  const onKey = (e, fn) => { if (e.key === 'Enter') fn() }

  const inputStyle = { width: '100%', padding: '13px 14px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--white)', fontSize: 15, color: 'var(--text)', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box', marginTop: 5, transition: 'border-color 0.15s' }
  const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }

  return (
    <div className="login-bg">
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div className="login-logo">OA</div>
        <div style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--white)', fontSize: 24, fontWeight: 800 }}>OceanAir Logistics</div>
        <div style={{ color: 'var(--teal)', fontSize: 13, marginTop: 4 }}>Sea & Air Freight Forwarding</div>
      </div>

      <div className="login-card">
        <div className="tab-row" style={{ marginBottom: 22 }}>
          <button className={'tab-btn ' + (mode === 'client' ? 'active' : '')} onClick={() => { setMode('client'); setError('') }}><span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><Icons.box size={15} />Client</span></button>
          <button className={'tab-btn ' + (mode === 'staff' ? 'active' : '')} onClick={() => { setMode('staff'); setError('') }}><span style={{display:'inline-flex',alignItems:'center',gap:6,justifyContent:'center'}}><Icons.warehouse size={15} />Staff / Admin</span></button>
        </div>

        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Welcome back</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 22 }}>
          {mode === 'client' ? 'Sign in with your phone number or shipping mark' : 'Sign in with your staff account email'}
        </div>

        {mode === 'client' ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Phone Number or Shipping Mark</label>
              <input style={inputStyle} placeholder="e.g. 60199887766 or MY-001-LWM" value={identifier}
                onChange={e => setIdentifier(e.target.value)} onKeyDown={e => onKey(e, handleClientLogin)} autoFocus />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Password</label>
              <input style={inputStyle} type="password" placeholder="Enter your password" value={password}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => onKey(e, handleClientLogin)} />
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email Address</label>
              <input style={inputStyle} type="email" placeholder="you@company.com" value={email}
                onChange={e => setEmail(e.target.value)} onKeyDown={e => onKey(e, handleStaffLogin)} autoFocus />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Password</label>
              <input style={inputStyle} type="password" placeholder="Enter your password" value={password}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => onKey(e, handleStaffLogin)} />
            </div>
          </>
        )}

        {error && <div className="banner banner-error" style={{ marginBottom: 14 }}>{error}</div>}

        <button style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: loading ? 'var(--muted)' : 'var(--teal)', color: 'var(--navy)', fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Space Grotesk, sans-serif', marginTop: 4 }}
          onClick={mode === 'client' ? handleClientLogin : handleStaffLogin} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In →'}
        </button>

        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 18, lineHeight: 1.7 }}>
          {mode === 'client' ? 'Contact your agent if you need login assistance.' : 'Staff accounts are created by the administrator.'}
        </div>
      </div>
    </div>
  )
}
