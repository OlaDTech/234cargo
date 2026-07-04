import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, getCurrentProfile } from '../lib/supabase'

const AuthContext = createContext(null)
const CLIENT_SESSION_STORAGE_KEY = 'oa_client'
const AUTH_BOOT_TIMEOUT_MS = 6000

function withTimeout(promise, timeoutMs = AUTH_BOOT_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Auth startup timed out')), timeoutMs)
    }),
  ])
}

function restoreClientSession() {
  try {
    const saved = localStorage.getItem(CLIENT_SESSION_STORAGE_KEY)
    if (!saved) return null

    const parsed = JSON.parse(saved)
    const client = parsed.client || parsed
    const sessionToken = parsed.sessionToken || null
    const expiresAt = parsed.expiresAt || null
    const expiresAtMs = expiresAt ? Date.parse(expiresAt) : null

    if (!client?.id || !sessionToken || (expiresAtMs && expiresAtMs <= Date.now())) {
      localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY)
      return null
    }

    return { client, sessionToken, expiresAt }
  } catch {
    localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY)
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // Supabase auth user (admin/staff)
  const [profile, setProfile] = useState(null) // profiles row
  const [clientUser, setClientUser] = useState(null) // clients row (client portal)
  const [clientSessionToken, setClientSessionToken] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadStaffProfile = async (authUser) => {
    if (!authUser) return null
    const p = await withTimeout(getCurrentProfile(authUser.id))

    if (!p) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      throw new Error('This email can sign in, but no staff/admin profile is linked to it. Add this user UUID to the profiles table.')
    }

    if (!['staff', 'warehouse_manager', 'admin'].includes(p.role)) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      throw new Error('This account is not assigned a team role.')
    }

    setUser(authUser)
    setProfile(p)
    return p
  }

  const refreshStaffProfile = useCallback(async () => {
    const authUser = user || (await withTimeout(supabase.auth.getUser())).data.user
    if (!authUser) return null
    const nextProfile = await withTimeout(getCurrentProfile(authUser.id))
    if (nextProfile) setProfile(nextProfile)
    return nextProfile
  }, [user])

  useEffect(() => {
    let mounted = true

    // Restore client session from localStorage immediately so a slow staff-auth check cannot trap the app on the splash screen.
    const savedClientSession = restoreClientSession()
    if (savedClientSession) {
      setClientUser(savedClientSession.client)
      setClientSessionToken(savedClientSession.sessionToken)
      setLoading(false)
    }

    const restoreStaffSession = async () => {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession())
        if (!mounted) return

        if (session) {
          try {
            await loadStaffProfile(session.user)
          } catch (error) {
            console.warn(error.message || 'Unable to restore staff profile')
          }
        }
      } catch (error) {
        console.warn(error.message || 'Unable to restore auth session')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    restoreStaffSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        try {
          await loadStaffProfile(session.user)
        } catch (error) {
          console.warn(error.message || 'Unable to load staff profile')
        }
      } else {
        setUser(null)
        setProfile(null)
      }
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
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

  const signInClient = (clientSession) => {
    const client = clientSession?.client || clientSession
    const sessionToken = clientSession?.sessionToken || null
    setClientUser(client)
    setClientSessionToken(sessionToken)
    localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify({ client, sessionToken, expiresAt: clientSession?.expiresAt || null }))
  }

  const signOut = async () => {
    if (clientUser) {
      setClientUser(null)
      setClientSessionToken(null)
      localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY)
    } else {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
    }
  }

  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'staff'
  const isWarehouseManager = profile?.role === 'warehouse_manager'
  const isClient = !!clientUser
  const hasPermission = (perm) => isAdmin || (profile?.permissions || []).includes(perm)

  return (
    <AuthContext.Provider value={{
      user, profile, clientUser, clientSessionToken,
      loading, isAdmin, isStaff, isWarehouseManager, isClient,
      hasPermission,
      signInStaff, signInClient, signOut, refreshStaffProfile,
      activeRole: clientUser ? 'client' : (profile?.role || null)
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
