import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import LoadingScreen from '../components/LoadingScreen'
import { useAuth } from '../context/AuthContext'
import DashboardPage from '../paginas/DashboardPage'
import LandingPage from '../paginas/LandingPage'
import LoginPage from '../paginas/LoginPage'
import ModuloPage from '../paginas/ModuloPage'

// Solo deja pasar a quien tenga una sesión de Supabase activa.
function RequireAuth() {
  const { session, profile, loading } = useAuth()
  if (loading || (session && !profile)) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  return <AppLayout />
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<LoginPage mode="register" />} />
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/:pageId" element={<ModuloPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
