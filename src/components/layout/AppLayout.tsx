import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  User,
} from 'lucide-react'
import ConfirmModal from '../ConfirmModal'
import RecordModal from '../RecordModal'
import { DATA_PAGES, navigation, pageMeta } from '../../data/catalog'
import { isStockAlert, money } from '../../data/helpers'
import { useAuth } from '../../context/AuthContext'
import { useRecords } from '../../context/RecordsContext'
import { useTheme } from '../../context/ThemeContext'
import type { DataPage, PageKey, RecordItem } from '../../types'

export default function AppLayout() {
  const { theme, toggleTheme } = useTheme()
  const { profile, signOut } = useAuth()
  const {
    records,
    toast,
    notify,
    recordModal,
    saving,
    saveRecord,
    closeRecordModal,
    pendingDelete,
    cancelDelete,
    confirmDelete,
  } = useRecords()
  const navigate = useNavigate()
  const location = useLocation()
  const [globalQuery, setGlobalQuery] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [navHover, setNavHover] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Buenos días'
    if (hour < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key === '/' && target?.tagName !== 'INPUT' && target?.tagName !== 'TEXTAREA' && target?.tagName !== 'SELECT') {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (!recordModal) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRecordModal()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordModal])

  useEffect(() => {
    setMobileNavOpen(false)
    setNotificationsOpen(false)
    setProfileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!profileOpen && !notificationsOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.profile-wrap, .notification-wrap')) return
      setProfileOpen(false)
      setNotificationsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false)
        setNotificationsOpen(false)
      }
    }
    window.addEventListener('mousedown', closeOnOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeOnOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileOpen, notificationsOpen])

  const globalResults = useMemo(() => {
    const query = globalQuery.trim().toLocaleLowerCase()
    if (!query) return []
    return DATA_PAGES.flatMap((page) => records[page].map((item) => ({ item, page })))
      .filter(({ item }) => `${item.id} ${item.name} ${item.detail}`.toLocaleLowerCase().includes(query))
      .slice(0, 6)
  }, [globalQuery, records])

  const fullName = profile?.nombre ?? 'Usuario'
  const firstName = fullName.split(' ')[0]
  const role = profile?.rol ?? 'Usuario'
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('es')).join('') || 'U'

  const stockAlerts = records.inventory.filter(isStockAlert)
  const financialAlerts = records.finance.filter((item) => item.status === 'Pendiente')
  const alertCount = stockAlerts.length + financialAlerts.length

  const closeOverlays = () => {
    setMobileNavOpen(false)
    setNotificationsOpen(false)
    setProfileOpen(false)
  }

  const goTo = (page: PageKey) => {
    closeOverlays()
    navigate(`/${page}`)
  }

  const openGlobalResult = (page: DataPage, item: RecordItem) => {
    setGlobalQuery('')
    closeOverlays()
    navigate(`/${page}?q=${encodeURIComponent(item.name)}`)
  }

  const logout = async () => {
    setConfirmLogout(false)
    closeOverlays()
    setGlobalQuery('')
    await signOut()
    navigate('/login')
  }

  return (
    <div className={`erp-shell${navHover ? '' : ' nav-collapsed'}`} data-theme={theme}>
      <aside
        className={mobileNavOpen ? 'sidebar sidebar-open' : 'sidebar'}
        onMouseEnter={() => setNavHover(true)}
        onMouseLeave={() => setNavHover(false)}
      >
        <button className="brand-button" type="button" onClick={() => goTo('dashboard')}>
          <span className="brand-copy"><small>ERP / CLOUD</small><strong>ENTERPRISE</strong></span>
        </button>

        <nav className="primary-nav" aria-label="Módulos del ERP">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.pages.map((page) => {
                const meta = pageMeta[page]
                const Icon = meta.icon
                const inventoryBadge = page === 'inventory' && stockAlerts.length > 0
                return (
                  <NavLink key={page} to={`/${page}`} end onClick={closeOverlays} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    {({ isActive }) => (
                      <>
                        <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                        <span>{meta.title}</span>
                        {inventoryBadge && <em>{stockAlerts.length}</em>}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-button" type="button" onClick={() => setConfirmLogout(true)}>
            <LogOut size={17} />
            <span className="logout-label">Cerrar Sesión</span>
          </button>
          <p className="sidebar-version">EnterpriseCloud · v1.0</p>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-scrim" type="button" aria-label="Cerrar navegación" onClick={() => setMobileNavOpen(false)} />}

      <main className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" type="button" aria-label="Abrir navegación" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
            <div className="location-copy"><span>PANEL GENERAL</span><strong>EnterpriseCloud</strong></div>
          </div>

          <div className="global-search">
            <Search size={17} />
            <input ref={searchInput} value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder="Buscar en toda la operación" aria-label="Buscar en toda la operación" />
            <kbd>/</kbd>
            {globalQuery && (
              <div className="search-results">
                {globalResults.length ? globalResults.map(({ item, page }) => (
                  <button key={`${page}-${item.id}`} type="button" onClick={() => openGlobalResult(page, item)}>
                    <span className="result-icon"><Search size={14} /></span>
                    <span><strong>{item.name}</strong><small>{pageMeta[page].title} · {item.id}</small></span>
                    <ChevronRight size={15} />
                  </button>
                )) : <div className="search-empty">No encontramos coincidencias en los módulos activos.</div>}
              </div>
            )}
          </div>

          <div className="topbar-actions">
            <button className="theme-toggle" type="button" aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'} title={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'} onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="notification-wrap">
              <button className={notificationsOpen ? 'round-button active' : 'round-button'} type="button" aria-label="Ver notificaciones" onClick={() => { setProfileOpen(false); setNotificationsOpen((open) => !open) }}>
                <Bell size={18} />
                {alertCount > 0 && <span className="notification-dot" />}
              </button>
              {notificationsOpen && (
                <div className="notification-panel">
                  <div className="notification-title"><span>SEÑALES ACTIVAS</span><strong>{alertCount}</strong></div>
                  {stockAlerts.slice(0, 2).map((item) => (
                    <button key={item.id} type="button" onClick={() => goTo('inventory')}>
                      <AlertTriangle size={16} /><span><strong>{item.name}</strong><small>{item.quantity} unidades disponibles</small></span>
                    </button>
                  ))}
                  {financialAlerts.slice(0, 1).map((item) => (
                    <button key={item.id} type="button" onClick={() => goTo('finance')}>
                      <CalendarDays size={16} /><span><strong>{item.name}</strong><small>{money(item.amount)} pendiente</small></span>
                    </button>
                  ))}
                  {!alertCount && <p className="all-clear"><CircleCheck size={16} /> Operación sin alertas.</p>}
                </div>
              )}
            </div>
            <div className="profile-wrap" ref={profileRef}>
              <button className={profileOpen ? 'profile-button active' : 'profile-button'} type="button" aria-haspopup="menu" aria-expanded={profileOpen} aria-label="Abrir menú de usuario" onClick={() => { setNotificationsOpen(false); setProfileOpen((open) => !open) }}>
                <span className="profile-avatar">{initials}<span className="profile-status" aria-hidden="true" /></span>
                <span className="profile-copy"><strong>{fullName}</strong><small>{role}</small></span>
                <ChevronDown size={15} className={profileOpen ? 'chevron-open' : ''} />
              </button>
              {profileOpen && (
                <div className="profile-panel" role="menu" aria-label="Menú de usuario">
                  <div className="profile-panel-head">
                    <span className="profile-panel-avatar">{initials}<span className="profile-status" aria-hidden="true" /></span>
                    <span><small>{greeting}, {firstName}</small><strong>{fullName}</strong><span className="profile-role"><User size={11} /> {role} · En línea</span></span>
                  </div>
                  <div className="profile-panel-stats">
                    <div><strong>{records.sales.length}</strong><span>Ventas</span></div>
                    <div><strong>{alertCount}</strong><span>Alertas</span></div>
                    <div><strong>{records.inventory.length}</strong><span>Productos</span></div>
                  </div>
                  <div className="profile-panel-actions">
                    <button type="button" role="menuitem" onClick={() => { goTo('dashboard'); notify(`Hola ${firstName}, este es tu resumen de hoy.`) }}><LayoutDashboard size={15} /> Mi panel de hoy <ChevronRight size={14} /></button>
                    <button type="button" role="menuitem" onClick={() => goTo('settings')}><Settings size={15} /> Configuración del espacio <ChevronRight size={14} /></button>
                    <button type="button" role="menuitem" onClick={() => { toggleTheme(); notify(theme === 'dark' ? `Modo claro activado, ${firstName}.` : `Modo oscuro activado, ${firstName}.`) }}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} Cambiar a modo {theme === 'dark' ? 'claro' : 'oscuro'} <ChevronRight size={14} /></button>
                    <button type="button" role="menuitem" className="danger" onClick={() => { setProfileOpen(false); setConfirmLogout(true) }}><LogOut size={15} /> Cerrar sesión <ChevronRight size={14} /></button>
                  </div>
                  <p className="profile-panel-foot">{profile?.email} · EnterpriseCloud v1.0</p>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>

      {recordModal && <RecordModal page={recordModal.page} record={recordModal.record} saving={saving} onClose={closeRecordModal} onSave={(event) => saveRecord(recordModal.page, recordModal.record, event)} />}
      {confirmLogout && (
        <ConfirmModal
          title="Cerrar sesión"
          message="Volverás a la pantalla de inicio de sesión. Tus registros quedan guardados en la base de datos."
          confirmLabel="Cerrar Sesión"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={logout}
        />
      )}
      {pendingDelete && (
        <ConfirmModal
          title="Eliminar registro"
          message={`¿Eliminar "${pendingDelete.record.name}"? Se eliminará de la base de datos y no se puede deshacer.`}
          confirmLabel="Eliminar"
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  )
}
