import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import StaffApp from './pages/staff/StaffApp'
import AdminApp from './pages/admin/AdminApp'
import ClientApp from './pages/client/ClientApp'

function Gate() {
  const { loading, activeRole } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: 'var(--navy)', margin: '0 auto 14px', fontFamily: 'Space Grotesk, sans-serif' }}>OA</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Loading…</div>
        </div>
      </div>
    )
  }

  if (!activeRole) return <LoginPage />
  if (activeRole === 'admin') return <AdminApp />
  if (activeRole === 'staff') return <StaffApp />
  if (activeRole === 'client') return <ClientApp />
  return <LoginPage />
}

export default function App() {
  return (
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
  )
}
