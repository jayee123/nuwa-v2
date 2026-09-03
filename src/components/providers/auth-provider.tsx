'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { isAdminRole, isSuperAdmin as checkSuperAdmin, type UserRole } from '@/lib/roles'

interface AuthContextType {
  user: User | null
  role: UserRole | null
  isAdmin: boolean
  isSuperAdmin: boolean
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isAdmin: false,
  isSuperAdmin: false,
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  const refreshAuth = useCallback(async () => {
    const supabase = createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    setUser(currentUser)
    if (currentUser) {
      try {
        const res = await fetch('/api/auth/me')
        const json = await res.json()
        setRole((json.role as UserRole) ?? 'user')
      } catch {
        setRole('user')
      }
    } else {
      setRole(null)
    }
    setLoading(false)
  }, [])

  // Re-check auth on route changes (handles server-side login redirect)
  useEffect(() => {
    refreshAuth()
  }, [pathname, refreshAuth])

  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        try {
          const res = await fetch('/api/auth/me')
          const json = await res.json()
          setRole((json.role as UserRole) ?? 'user')
        } catch {
          setRole('user')
        }
      } else {
        setRole(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAdmin: isAdminRole(role),
        isSuperAdmin: checkSuperAdmin(role),
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
