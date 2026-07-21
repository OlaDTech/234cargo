import { Component } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import AdminApp from './pages/admin/AdminApp'
import ClientApp from './pages/client/ClientApp'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--ink)' }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 14, padding: 24 }}>
            <div style={{ color: 'var(--red)', fontWeight: 800, fontSize: 18, marginBottom: 8 }}>The app could not load</div>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 14 }}>Please take a screenshot of this message and send it to support.</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--surface)', padding: 12, borderRadius: 8, color: 'var(--t1)', fontSize: 12 }}>{this.state.error.message}</pre>
            <button className="btn btn-primary btn-full" onClick={() => window.location.reload()} style={{ marginTop: 14 }}>Reload App</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function Gate() {
  const { loading, activeRole } = useAuth()
  const teamLoginRequested = ['#/admin-login', '#/staff-login'].includes(window.location.hash)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 188, height: 62, borderRadius: 14, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', margin: '0 auto 14px', boxShadow: '0 18px 45px rgba(0,0,0,0.22)' }}>
            <img src="/234cargo-logo.svg" alt="234Cargo" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          </div>
        </div>
      </div>
    )
  }

  if (teamLoginRequested && !['admin', 'staff', 'warehouse_manager'].includes(activeRole)) return <LoginPage />
  if (!activeRole) return <LoginPage />
  if (['admin', 'staff', 'warehouse_manager'].includes(activeRole)) return <AdminApp />
  if (activeRole === 'client') return <ClientApp />
  return <LoginPage />
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            style: { background: 'var(--navy)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14, borderRadius: 12 },
            success: { iconTheme: { primary: '#00C9A7', secondary: '#0B1B3E' } },
          }}
        />
        <Gate />
      </AuthProvider>
    </AppErrorBoundary>
  )
}
