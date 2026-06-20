import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, getCurrentProfile } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // Supabase auth user (admin/staff)
  const [profile, setProfile] = useState(null) // profiles row
  const [clientUser, setClientUser] = useState(null) // clients row (client portal)
  const [loading, setLoading] = useState(true)

  const loadStaffProfile = async (authUser) => {
    if (!authUser) return null
    const p = await getCurrentProfile(authUser.id)

    if (!p) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      throw new Error('This email can sign in, but no staff/admin profile is linked to it. Add this user UUID to the profiles table.')
    }

    if (!['staff', 'admin'].includes(p.role)) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      throw new Error('This account is not assigned a staff or admin role.')
    }

    setUser(authUser)
    setProfile(p)
    return p
  }

  const refreshStaffProfile = useCallback(async () => {
    const authUser = user || (await supabase.auth.getUser()).data.user
    if (!authUser) return null
    const nextProfile = await getCurrentProfile(authUser.id)
    if (nextProfile) setProfile(nextProfile)
    return nextProfile
  }, [user])

  useEffect(() => {
    // Restore client session from localStorage
    const saved = localStorage.getItem('oa_client')
    if (saved) {
      try { setClientUser(JSON.parse(saved)) } catch {}
    }

    // Check Supabase auth session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          await loadStaffProfile(session.user)
        } catch {
          // Leave the user on the login screen if their auth account is incomplete.
        }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        try {
          await loadStaffProfile(session.user)
        } catch {
          // The login handler shows the detailed error for interactive sign-ins.
        }
      } else {
        setUser(null)
        setProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user?.id) return undefined
    const channel = supabase.channel(`profile-live-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, payload => {
        setProfile(current => current ? { ...current, ...payload.new } : payload.new)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user?.id])

  const signInStaff = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return loadStaffProfile(data.user)
  }

  const signInClient = (clientData) => {
    setClientUser(clientData)
    localStorage.setItem('oa_client', JSON.stringify(clientData))
  }

  const signOut = async () => {
    if (clientUser) {
      setClientUser(null)
      localStorage.removeItem('oa_client')
    } else {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
    }
  }

  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'staff'
  const isClient = !!clientUser
  const hasPermission = (perm) => isAdmin || (profile?.permissions || []).includes(perm)

  return (
    <AuthContext.Provider value={{
      user, profile, clientUser,
      loading, isAdmin, isStaff, isClient,
      hasPermission,
      signInStaff, signInClient, signOut, refreshStaffProfile,
      activeRole: clientUser ? 'client' : (profile?.role || null)
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
