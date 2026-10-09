import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Box, Check,
  ChevronRight, CircleCheck, CircleDot, Download, Layers3, Package,
  Plus, ShoppingCart, Sparkles, TrendingUp, Truck, Wallet, Zap,
} from 'lucide-react'
import { useRecords } from '../../context/RecordsContext'
import { financialSnapshot, percentage, totalAmount } from '../../data/dashboard'
import { isStockAlert, money, statusTone } from '../../data/helpers'
import type { DataPage, RecordItem } from '../../types'
import SalesChart from './SalesChart'
import './dashboard.css'

type Accent = 'cyan' | 'violet' | 'amber' | 'green'
type ActivityPage = 'sales' | 'purchases' | 'finance'

function Metric({ accent, icon, label, value, detail, footnote, progress, onClick }: {
  accent: Accent; icon: ReactNode; label: string; value: string; detail: string; footnote: string; progress?: number; onClick: () => void
}) {
  return (
    <button className={`dc-metric dc-accent-${accent}`} type="button" onClick={onClick}>
      <span className="dc-metric-head"><span className="dc-metric-icon">{icon}</span><span>{label}</span><ArrowUpRight size={16} /></span>
      <strong className="dc-metric-value">{value}</strong>
      <span className="dc-metric-detail">{detail}</span>
      <span className="dc-meter" aria-hidden="true">{progress !== undefined && <i style={{ width: `${progress}%` }} />}</span>
      <span className="dc-metric-foot">{footnote}<ChevronRight size={13} /></span>
    </button>
  )
}

function Accounts({ finance, onNavigate }: { finance: RecordItem[]; onNavigate: () => void }) {
  const { receivable, payable, balance, receivables, payables, unclassified } = financialSnapshot(finance)
  const total = receivable + payable
  const share = total ? receivable / total * 100 : 0
  return (
    <section className="dc-accounts" aria-labelledby="dc-accounts-title">
      <div className="dc-section-heading"><div><span className="dc-eyebrow"><i /> VISIÓN FINANCIERA</span><h2 id="dc-accounts-title">Anticipa tus compromisos.</h2></div><button className="dc-icon-button" type="button" aria-label="Abrir finanzas" onClick={onNavigate}><ArrowUpRight size={19} /></button></div>
      <div className="dc-accounts-visual">
        <div className="dc-donut" role="img" aria-label={`${money(receivable)} por cobrar y ${money(payable)} por pagar`}>
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle className="dc-donut-track" cx="80" cy="80" r="65" />
            {receivable > 0 && <circle className="dc-donut-in" cx="80" cy="80" r="65" pathLength="100" strokeDasharray={`${Math.max(0, share - (payable ? 2 : 0))} 100`} />}
            {payable > 0 && <circle className="dc-donut-out" cx="80" cy="80" r="65" pathLength="100" strokeDasharray={`${Math.max(0, 100 - share - (receivable ? 2 : 0))} 100`} strokeDashoffset={-share} />}
          </svg>
          <div><Wallet size={20} /><strong>{receivables.length + payables.length}</strong><span>cuentas abiertas</span></div>
        </div>
        <div className="dc-accounts-legend">
          <div><span><i className="dc-legend-in" /> Por cobrar</span><strong>{money(receivable)}</strong><small>{receivables.length} {receivables.length === 1 ? 'cuenta' : 'cuentas'}</small></div>
          <div><span><i className="dc-legend-out" /> Por pagar</span><strong>{money(payable)}</strong><small>{payables.length} {payables.length === 1 ? 'cuenta' : 'cuentas'}</small></div>
        </div>
      </div>
      <div className={`dc-net ${balance < 0 ? 'dc-accent-amber' : 'dc-accent-green'}`}><span>Diferencia pendiente<strong>{money(balance)}</strong></span>{balance < 0 ? <ArrowUpRight size={25} /> : <ArrowDownLeft size={25} />}</div>
      <p className="dc-finance-note">{total ? balance < 0 ? 'Los pagos pendientes superan los cobros. Revisa tus compromisos antes de una nueva compra.' : 'Los cobros pendientes cubren los pagos registrados. Prioriza su seguimiento.' : 'No hay importes pendientes en las cuentas clasificadas.'} <span>Esta diferencia no es tu saldo de caja.</span></p>
      {unclassified.length > 0 && <button className="dc-unclassified" type="button" onClick={onNavigate}>{unclassified.length} {unclassified.length === 1 ? 'movimiento sin clasificar' : 'movimientos sin clasificar'}<ArrowRight size={14} /></button>}
    </section>
  )
}

function ActivityFeed({ records, onOpen, onCreate }: { records: Record<DataPage, RecordItem[]>; onOpen: (page: DataPage, item: RecordItem) => void; onCreate: (page: DataPage) => void }) {
  const [page, setPage] = useState<ActivityPage>('sales')
  const options: { value: ActivityPage; label: string; icon: ReactNode }[] = [
    { value: 'sales', label: 'Ventas', icon: <ShoppingCart size={17} /> },
    { value: 'purchases', label: 'Compras', icon: <Truck size={17} /> },
    { value: 'finance', label: 'Finanzas', icon: <Wallet size={17} /> },
  ]
  const active = options.find((option) => option.value === page)!
  return (
    <section className="dc-activity" aria-labelledby="dc-activity-title">
      <div className="dc-section-heading"><div><span className="dc-eyebrow"><i /> TRAZABILIDAD</span><h2 id="dc-activity-title">Detrás de cada número.</h2></div><button className="dc-text-action" type="button" onClick={() => onCreate(page)}><Plus size={15} /> Nuevo registro</button></div>
      <div className="dc-activity-tabs" role="group" aria-label="Tipo de actividad">
        {options.map((option) => <button type="button" key={option.value} aria-pressed={page === option.value} onClick={() => setPage(option.value)}>{option.label}<span>{records[option.value].length}</span></button>)}
      </div>
      <div className="dc-feed-head" aria-hidden="true"><span>ÚLTIMOS REGISTROS</span><span>ESTADO / IMPORTE</span></div>
      <div className="dc-feed">
        {records[page].slice(0, 5).map((item) => (
          <button className="dc-feed-row" key={item.id} type="button" onClick={() => onOpen(page, item)} aria-label={`Abrir ${item.id}, ${item.name}`}>
            <span className={`dc-feed-icon dc-accent-${page === 'purchases' ? 'violet' : page === 'finance' ? 'green' : 'cyan'}`}>{active.icon}</span>
            <span className="dc-feed-copy"><strong>{item.name}</strong><small>{item.id} <span>· {item.date}</span></small></span>
            <span className={`dc-state dc-state-${statusTone(item.status)}`}><i />{item.status}</span>
            <strong className="dc-feed-amount">{money(item.amount)}</strong><ArrowUpRight className="dc-feed-arrow" size={16} />
          </button>
        ))}
        {!records[page].length && <div className="dc-empty-feed"><Layers3 size={28} /><strong>Aún no hay movimientos aquí.</strong><span>Crea tu primer registro para conectar la operación.</span><button className="dc-text-action" type="button" onClick={() => onCreate(page)}>Crear registro<Plus size={15} /></button></div>}
      </div>
      <div className="dc-feed-footer"><CircleDot size={12} /> {Math.min(5, records[page].length)} de {records[page].length} registros · Selecciona uno para ver o editar su detalle.</div>
    </section>
  )
}

export default function DashboardOverview() {
  const { records, openComposer, openEditor, exportTable } = useRecords()
  const navigate = useNavigate()
  const { sales, purchases, inventory, finance } = records
  const salesTotal = totalAmount(sales)
  const completedSales = sales.filter((item) => item.status === 'Completada')
  const openSales = sales.filter((item) => item.status !== 'Completada')
  const openPurchases = purchases.filter((item) => item.status !== 'Completada')
  const stockAlerts = inventory.filter(isStockAlert)
  const criticalStock = stockAlerts.filter((item) => item.status === 'Crítico')
  const units = inventory.reduce((sum, item) => sum + (item.quantity ?? 0), 0)
  const stableStock = inventory.length - stockAlerts.length
  const accounts = financialSnapshot(finance)
  const goTo = (page: DataPage) => navigate(`/${page}`)
  const completedValue = percentage(totalAmount(completedSales), salesTotal)
  const allOperations = sales.length + purchases.length + inventory.length + finance.length
  const priorities: { page: DataPage; label: string; description: string; count: number; accent: Accent; icon: ReactNode }[] = [
    { page: 'inventory', label: 'Inventario', description: stockAlerts.length ? `${criticalStock.length} ${criticalStock.length === 1 ? 'crítico' : 'críticos'} · ${stockAlerts.length - criticalStock.length} con stock bajo` : 'Sin alertas de stock', count: stockAlerts.length, accent: 'amber', icon: <Package size={17} /> },
    { page: 'finance', label: 'Cobros y pagos', description: 'Movimientos por completar', count: accounts.open.length, accent: 'green', icon: <Wallet size={17} /> },
    { page: 'purchases', label: 'Compras', description: 'Órdenes por completar', count: openPurchases.length, accent: 'violet', icon: <Truck size={17} /> },
    { page: 'sales', label: 'Ventas', description: 'Pendientes o en curso', count: openSales.length, accent: 'cyan', icon: <ShoppingCart size={17} /> },
  ]
  const taskCount = priorities.reduce((sum, item) => sum + item.count, 0)
  const nextPriority = priorities.find((item) => item.count > 0)
  const priorityTitle = nextPriority?.page === 'inventory'
    ? criticalStock.length ? 'Empieza por el stock crítico.' : 'Anticípate a una falta de stock.'
    : nextPriority?.page === 'finance' ? 'Pon tus compromisos al día.'
    : nextPriority?.page === 'purchases' ? 'Da seguimiento a tus compras.'
    : nextPriority ? 'Impulsa las ventas en curso.' : 'Todo listo para avanzar.'
  const priorityDescription = nextPriority?.page === 'inventory'
    ? `${(criticalStock[0] ?? stockAlerts[0]).name}: ${(criticalStock[0] ?? stockAlerts[0]).quantity ?? 0} unidades registradas.`
    : nextPriority ? `${nextPriority.count} ${nextPriority.count === 1 ? 'registro requiere' : 'registros requieren'} seguimiento en ${nextPriority.label.toLocaleLowerCase()}.`
    : 'No tienes operaciones pendientes. Es un buen momento para registrar la siguiente venta.'
  const flow: { page: DataPage; label: string; value: string; detail: string; action: string; accent: Accent; icon: ReactNode }[] = [
    { page: 'purchases', label: 'Abastece', value: `${purchases.length} órdenes`, detail: `${openPurchases.length} por completar`, action: 'Nueva compra', accent: 'violet', icon: <Truck size={22} /> },
    { page: 'inventory', label: 'Organiza', value: `${units} unidades`, detail: `${inventory.length} productos en catálogo`, action: 'Nuevo producto', accent: 'amber', icon: <Box size={22} /> },
    { page: 'sales', label: 'Vende', value: `${sales.length} ventas`, detail: `${completedSales.length} completadas`, action: 'Nueva venta', accent: 'cyan', icon: <ShoppingCart size={22} /> },
    { page: 'finance', label: 'Controla', value: `${finance.length} movimientos`, detail: `${accounts.open.length} por completar`, action: 'Nuevo movimiento', accent: 'green', icon: <Wallet size={22} /> },
  ]

  return (
    <div className="command-dashboard">
      <div className="dc-overview-heading">
        <div><span className="dc-eyebrow">TU OPERACIÓN, EN FOCO</span><h2>El pulso de tu negocio<span>.</span></h2></div>
        <div className="dc-overview-tools"><span className="dc-data-label"><span /> {allOperations} registros conectados</span><button className="dc-outline-button" type="button" onClick={() => exportTable('sales', 'csv')}><Download size={15} /> Exportar ventas</button></div>
      </div>

      <section className="dc-metrics" aria-label="Indicadores de la operación registrada">
        <Metric accent="cyan" icon={<TrendingUp size={18} />} label="Ventas registradas" value={money(salesTotal)} detail={`${sales.length} operaciones · ${completedSales.length} completadas`} progress={completedValue} footnote={`${completedValue}% del valor completado`} onClick={() => goTo('sales')} />
        <Metric accent="violet" icon={<Truck size={18} />} label="Compras registradas" value={money(totalAmount(purchases))} detail={`${purchases.length} órdenes · ${openPurchases.length} por completar`} progress={percentage(purchases.length - openPurchases.length, purchases.length)} footnote={`${purchases.length - openPurchases.length} ${purchases.length - openPurchases.length === 1 ? 'orden completada' : 'órdenes completadas'}`} onClick={() => goTo('purchases')} />
        <Metric accent="green" icon={<Wallet size={18} />} label="Pendiente de cobro" value={money(accounts.receivable)} detail={`${accounts.receivables.length} cuentas por cobrar abiertas`} footnote={`${money(accounts.payable)} pendiente de pago`} onClick={() => goTo('finance')} />
        <Metric accent="amber" icon={<Package size={18} />} label="Salud del inventario" value={inventory.length ? `${percentage(stableStock, inventory.length)}%` : 'Sin datos'} detail={`${stableStock} de ${inventory.length} productos sin alertas`} progress={percentage(stableStock, inventory.length)} footnote={stockAlerts.length ? `${stockAlerts.length} productos necesitan atención` : inventory.length ? 'Inventario en equilibrio' : 'Agrega tu primer producto'} onClick={() => goTo('inventory')} />
      </section>

      <div className="dc-main-grid">
        <SalesChart sales={sales} onCreate={() => openComposer('sales')} onOpen={(item) => openEditor('sales', item)} />
        <aside className="dc-priorities" aria-labelledby="dc-priorities-title">
          <div className="dc-section-heading"><div><span className="dc-eyebrow"><i /> 02 / RADAR OPERATIVO</span><h2 id="dc-priorities-title">Tu siguiente movimiento.</h2></div></div>
          <div className="dc-priority-summary"><span className="dc-priority-total">{String(taskCount).padStart(2, '0')}</span><div><strong>{taskCount === 1 ? 'registro por atender' : 'registros por atender'}</strong><span>En los cuatro frentes de tu operación</span></div><Activity size={24} strokeWidth={1.4} /></div>
          <div className={`dc-spotlight dc-accent-${nextPriority?.accent ?? 'green'}`}>
            <span className="dc-spotlight-kicker">{nextPriority ? <Zap size={13} /> : <CircleCheck size={13} />}{nextPriority ? 'EMPIEZA POR AQUÍ' : 'AL DÍA'}</span>
            <h3>{priorityTitle}</h3><p>{priorityDescription}</p>
            <button type="button" onClick={() => nextPriority ? goTo(nextPriority.page) : openComposer('sales')}>{nextPriority ? `Revisar ${nextPriority.label.toLocaleLowerCase()}` : 'Registrar venta'}<ArrowRight size={16} /></button>
          </div>
          <div className="dc-priority-list">{priorities.map((priority) => <button className={`dc-priority-row dc-accent-${priority.accent}`} key={priority.page} type="button" onClick={() => goTo(priority.page)}><span className="dc-priority-icon">{priority.icon}</span><span><strong>{priority.label}</strong><small>{priority.description}</small></span><b className={priority.count ? '' : 'is-clear'}>{priority.count || <Check size={14} />}</b><ChevronRight size={14} /></button>)}</div>
        </aside>
      </div>

      <section className="dc-workflow" aria-labelledby="dc-workflow-title">
        <div className="dc-section-heading"><div><span className="dc-eyebrow"><i /> 03 / CIRCUITO DE NEGOCIO</span><h2 id="dc-workflow-title">Todo conectado. Todo en movimiento.</h2></div><span className="dc-workflow-hint"><Sparkles size={15} /> De la compra al control financiero</span></div>
        <div className="dc-flow">{flow.map((step, index) => <article className={`dc-flow-step dc-accent-${step.accent}`} key={step.page} style={{ '--dc-step': index } as CSSProperties}><button className="dc-flow-main" type="button" onClick={() => goTo(step.page)}><span className="dc-flow-top"><span className="dc-flow-icon">{step.icon}</span><span>0{index + 1} / {step.label}</span><ArrowUpRight size={15} /></span><strong>{step.value}</strong><small>{step.detail}</small></button><button type="button" className="dc-flow-create" onClick={() => openComposer(step.page)}>{step.action}<Plus size={14} /></button>{index < flow.length - 1 && <span className="dc-flow-connector" aria-hidden="true"><ChevronRight size={13} /></span>}</article>)}</div>
      </section>

      <div className="dc-bottom-grid"><ActivityFeed records={records} onOpen={openEditor} onCreate={openComposer} /><Accounts finance={finance} onNavigate={() => goTo('finance')} /></div>
      <footer className="dc-footer"><span><span className="dc-footer-mark"><Layers3 size={14} /></span> EnterpriseCloud <i /> Una visión, toda tu operación.</span><span>Indicadores calculados sobre tus registros</span></footer>
    </div>
  )
}
