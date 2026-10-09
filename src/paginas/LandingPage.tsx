import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'
import Landing from '../components/landing/Landing'
import { initialData } from '../data/catalog'
import { useTheme } from '../context/ThemeContext'

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [booting, setBooting] = useState(false)
  const bootTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(bootTimer.current), [])

  const enterApp = () => {
    if (booting) return
    window.scrollTo(0, 0)
    setBooting(true)
    bootTimer.current = window.setTimeout(() => {
      setBooting(false)
      navigate('/login')
    }, 1500)
  }

  return (
    <div className="erp-shell" data-theme={theme}>
      {booting ? (
        <LoadingScreen />
      ) : (
        <Landing
          theme={theme}
          onToggleTheme={toggleTheme}
          onEnter={enterApp}
          previewData={{ sales: initialData.sales, inventory: initialData.inventory, finance: initialData.finance }}
        />
      )}
    </div>
  )
}
