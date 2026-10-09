import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export type Profile = {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
}

type SignUpResult = { error: string | null; needsConfirmation: boolean }

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (nombre: string, email: string, password: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function translateAuthError(message: string) {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'Credenciales incorrectas. Revisa el correo y la contraseña e inténtalo de nuevo.'
  if (text.includes('email not confirmed')) return 'Aún no confirmaste tu correo. Revisa tu bandeja de entrada y abre el enlace de confirmación.'
  if (text.includes('already registered') || text.includes('already been registered')) return 'Este correo ya está registrado. Inicia sesión o usa otro correo.'
  if (text.includes('password should be at least')) return 'La contraseña es demasiado corta.'
  if (text.includes('rate limit') || text.includes('too many')) return 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.'
  if (text.includes('signups not allowed') || text.includes('signup is disabled')) return 'El registro de nuevos usuarios está deshabilitado en este proyecto.'
  if (text.includes('fetch') || text.includes('network')) return 'No se pudo conectar con el servidor. Revisa tu conexión.'
  return message
}

type ProfileRow = {
  id: string
  nombre: string
  email: string | null
  activo: boolean
  roles: { nombre: string } | { nombre: string }[] | null
}

async function loadProfile(session: Session): Promise<Profile> {
  const fallback: Profile = {
    id: session.user.id,
    nombre: String(session.user.user_metadata?.nombre ?? session.user.email?.split('@')[0] ?? 'Usuario'),
    email: session.user.email ?? '',
    rol: 'Usuario',
    activo: true,
  }
  if (!supabase) return fallback
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, email, activo, roles(nombre)')
    .eq('id', session.user.id)
    .maybeSingle()
  if (error || !data) return fallback
  const row = data as unknown as ProfileRow
  const role = Array.isArray(row.roles) ? row.roles[0] : row.roles
  return { id: row.id, nombre: row.nombre, email: row.email ?? fallback.email, rol: role?.nombre ?? 'Usuario', activo: row.activo }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  // El perfil se recarga solo cuando cambia la persona, no en cada renovación de token.
  const userId = session?.user.id
  useEffect(() => {
    if (!session || !userId) return
    let active = true
    loadProfile(session).then((next) => {
      if (!active) return
      setProfile(next)
      setLoading(false)
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    if (!supabase) return 'Supabase no está configurado. Completa el archivo .env.'
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return translateAuthError(error.message)
    const next = await loadProfile(data.session)
    if (!next.activo) {
      await supabase.auth.signOut()
      return 'Tu usuario está desactivado. Contacta a un administrador.'
    }
    return null
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(async (nombre, email, password) => {
    if (!supabase) return { error: 'Supabase no está configurado. Completa el archivo .env.', needsConfirmation: false }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { nombre: nombre.trim() } },
    })
    if (error) return { error: translateAuthError(error.message), needsConfirmation: false }
    // Con confirmación de correo activa, Supabase no devuelve error si el correo ya existe: devuelve identities vacío.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { error: 'Este correo ya está registrado. Inicia sesión o usa otro correo.', needsConfirmation: false }
    }
    return { error: null, needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, profile, loading, configured: isSupabaseConfigured, signIn, signUp, signOut }),
    [session, profile, loading, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
