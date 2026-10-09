import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { LogoMark } from '../components/LogoMark'
import DashboardOverview from '../components/dashboard/DashboardOverview'
import { useRecords } from '../context/RecordsContext'

function HeroOrbit() {
  const gradientId = useId()
  return (
    <div className="hero-orbit" aria-hidden="true">
      <svg className="hero-orbit-drawing" viewBox="0 0 520 520" fill="none" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="60" y1="120" x2="460" y2="420" gradientUnits="userSpaceOnUse">
            <stop className="hero-orbit-gradient-start" />
            <stop offset="1" className="hero-orbit-gradient-end" />
          </linearGradient>
        </defs>
        <circle className="hero-orbit-ticks" cx="260" cy="260" r="218" strokeDasharray="1 13" />
        <circle className="hero-orbit-outer" cx="260" cy="260" r="188" />
        <circle className="hero-orbit-inner" cx="260" cy="260" r="112" />
        <g transform="rotate(-28 260 260)">
          <ellipse className="hero-orbit-path" cx="260" cy="260" rx="240" ry="92" stroke={`url(#${gradientId})`} />
          <ellipse className="hero-orbit-trail" cx="260" cy="260" rx="240" ry="92" stroke={`url(#${gradientId})`} pathLength="100" strokeDasharray="10 90" />
        </g>
        <g transform="rotate(34 260 260)">
          <ellipse className="hero-orbit-path hero-orbit-path--secondary" cx="260" cy="260" rx="230" ry="96" />
        </g>
        <g className="hero-orbit-satellite hero-orbit-satellite--outer">
          <circle className="hero-orbit-node-halo" cx="260" cy="72" r="12" />
          <circle className="hero-orbit-node" cx="260" cy="72" r="4.5" />
        </g>
        <g className="hero-orbit-satellite hero-orbit-satellite--inner">
          <circle className="hero-orbit-node-halo" cx="372" cy="260" r="9" />
          <circle className="hero-orbit-node" cx="372" cy="260" r="3.5" />
        </g>
      </svg>
      <div className="hero-orbit-core"><LogoMark className="hero-logo" /></div>
    </div>
  )
}

export default function DashboardPage() {
  const { openComposer } = useRecords()
  const navigate = useNavigate()

  return (
    <>
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="section-kicker"><i /> CENTRO DE CONTROL</span>
          <h1>Tu negocio,<br /><span>en una sola órbita.</span></h1>
          <p>Ventas, inventario y finanzas en el mismo lugar. Registra movimientos, atiende alertas y exporta sin fricción.</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => openComposer('sales')}><Plus size={18} /> Registrar venta</button>
            <button className="text-button" type="button" onClick={() => navigate('/reports')}>Ver analítica <ArrowRight size={16} /></button>
          </div>
          <div className="hero-footnote"><span><span className="live-dot" /> Sincronización activa</span><span>Última señal: ahora</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <HeroOrbit />
        </div>
      </section>

      <DashboardOverview />
    </>
  )
}
