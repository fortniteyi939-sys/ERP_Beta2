import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { igvOf, money, statusTone, totalWithIgv } from '../data/helpers'
import { useRecords } from '../context/RecordsContext'
import { fetchDocumentLines, friendlyError, updatePurchaseWithLines } from '../services/records'
import type { DocumentLine, RecordItem, RecordStatus } from '../types'

/** Icono de Google (Material Symbols Outlined). */
function GoogleIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`gicon${className ? ` ${className}` : ''}`} aria-hidden="true">
      {name}
    </span>
  )
}

const PHASES = [
  { status: 'Solicitud', icon: 'description', hint: 'Pedido interno: qué se necesita y para cuándo.' },
  { status: 'Orden', icon: 'shopping_cart', hint: 'Orden emitida al proveedor.' },
  { status: 'Recepción', icon: 'warehouse', hint: 'Llega la mercadería: registra el comprobante y entra a almacén + kardex.' },
  { status: 'Factura', icon: 'receipt_long', hint: 'Factura del proveedor registrada por pagar.' },
  { status: 'Pagada', icon: 'payments', hint: 'Cuenta por pagar completada.' },
] as const

const ADVANCE_LABEL: Record<string, string> = {
  Orden: 'Aprobar solicitud y pasar a Orden',
  Recepción: 'Aprobar recepción y mandar a almacén',
  Factura: 'Registrar factura',
  Pagada: 'Marcar como pagada',
}

const COMPROBANTES = ['Factura', 'Boleta', 'Guía de Remisión', 'Nota de Venta']

function formatLimite(value?: string | null) {
  if (!value) return 'Sin fecha límite'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PurchaseOrderDetail({ order, onBack }: { order: RecordItem; onBack: () => void }) {
  const { records, catalog, reload, notify } = useRecords()
  const navigate = useNavigate()
  const supplier = order.proveedor_id ? records.suppliers.find((item) => item.rowId === order.proveedor_id) : undefined
  const supplierOffers = supplier?.rowId ? catalog.filter((item) => item.proveedor_id === supplier.rowId).length : 0
  const [lines, setLines] = useState<DocumentLine[]>([])
  const [loadingLines, setLoadingLines] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fecha, setFecha] = useState(order.fechaLimite ?? '')
  const [compTipo, setCompTipo] = useState(order.comprobanteTipo ?? 'Factura')
  const [compNum, setCompNum] = useState(order.comprobanteNumero ?? '')

  useEffect(() => {
    setFecha(order.fechaLimite ?? '')
    setCompTipo(order.comprobanteTipo ?? 'Factura')
    setCompNum(order.comprobanteNumero ?? '')
  }, [order.id, order.fechaLimite, order.comprobanteTipo, order.comprobanteNumero])

  const loadLines = useCallback(async () => {
    if (!order.rowId) {
      setLines([])
      setLoadingLines(false)
      return
    }
    setLoadingLines(true)
    try {
      setLines(await fetchDocumentLines('purchases', order.rowId))
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setLoadingLines(false)
    }
  }, [order.rowId, notify])

  useEffect(() => {
    void loadLines()
  }, [loadLines])

  const qtyTotal = useMemo(() => lines.reduce((sum, line) => sum + line.cantidad, 0), [lines])
  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.cantidad * line.precio, 0), [lines])
  const igv = igvOf(subtotal)
  const total = totalWithIgv(subtotal)

  const phaseIndex = Math.max(0, PHASES.findIndex((phase) => phase.status === order.status))
  const nextPhase = phaseIndex < PHASES.length - 1 ? PHASES[phaseIndex + 1].status as RecordStatus : null

  const persist = async (nextStatus: RecordStatus) => {
    if (busy) return
    setBusy(true)
    try {
      await updatePurchaseWithLines(order.id, {
        name: order.name,
        detail: order.detail,
        status: nextStatus,
        proveedor_id: order.proveedor_id ?? null,
        fecha_limite: fecha || null,
        comprobante_tipo: compTipo || null,
        comprobante_numero: compNum.trim() || null,
      }, lines.map((line) => ({ producto_id: line.producto_id, cantidad: line.cantidad, precio: line.precio })))
      await reload()
      await loadLines()
      notify(nextStatus === order.status
        ? `Orden ${order.id} actualizada.`
        : `Orden ${order.id} avanzó a ${nextStatus}${nextStatus === 'Recepción' ? ': ingreso a almacén + kardex.' : nextStatus === 'Pagada' ? ': cuenta por pagar completada.' : '.'}`)
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="po-topbar">
        <button className="text-button" type="button" onClick={onBack}><GoogleIcon name="arrow_back" className="small" /> Volver a compras</button>
        <span className={`status-pill ${statusTone(order.status)}`}>{order.status}</span>
      </div>

      <section className="po-head panel">
        <div>
          <span className="panel-label">ORDEN DE COMPRA · {order.id}</span>
          <h2>{order.name}</h2>
          <p>{order.detail}</p>
        </div>
        <div className="po-head-meta">
          <span><GoogleIcon name="event" className="small" /> Límite: {formatLimite(order.fechaLimite)}</span>
          <span><GoogleIcon name="receipt_long" className="small" /> {order.comprobanteTipo ? `${order.comprobanteTipo}${order.comprobanteNumero ? ` ${order.comprobanteNumero}` : ''}` : 'Sin comprobante'}</span>
        </div>
      </section>

      <section className="po-supplier panel">
        <div>
          <span className="panel-label">EMPRESA PROVEEDORA · VERIFICACIÓN</span>
          {supplier ? (
            <>
              <h2>{supplier.name}</h2>
              <p>RUC {supplier.ruc ?? 'Sin RUC registrado'}{supplier.detail ? ` · ${supplier.detail}` : ''}</p>
              <span className="linked-badge"><GoogleIcon name="verified" className="small" /> Proveedor verificado en el registro · {supplierOffers} {supplierOffers === 1 ? 'producto en catálogo' : 'productos en catálogo'}</span>
            </>
          ) : (
            <>
              <h2>{order.name}</h2>
              <span className="linked-badge muted"><GoogleIcon name="warning" className="small" /> Sin vincular: verifica el RUC de la empresa y vincúlalo editando la compra.</span>
            </>
          )}
        </div>
        {supplier && (
          <button
            className="export-button"
            type="button"
            onClick={() => navigate(`/suppliers?q=${encodeURIComponent(supplier.ruc ?? supplier.name)}`)}
          >
            <GoogleIcon name="open_in_new" className="small" /> Abrir ficha
          </button>
        )}
      </section>

      <section className="po-phases panel">
        <div><span className="panel-label">SEGUIMIENTO POR FASES</span><h2>Aprueba paso a paso</h2></div>
        <div className="tracking-steps five">
          {PHASES.map((phase, index) => (
            <button
              key={phase.status}
              type="button"
              disabled={busy}
              className={`tracking-step${index < phaseIndex ? ' done' : ''}${index === phaseIndex ? ' current' : ''}`}
              onClick={() => { if (phase.status !== order.status) void persist(phase.status as RecordStatus) }}
              title={phase.hint}
            >
              <GoogleIcon name={phase.icon} className="small" />
              <span>{phase.status}</span>
            </button>
          ))}
        </div>
        <p className="relation-hint"><GoogleIcon name="info" className="small" /> {PHASES[phaseIndex].hint}</p>
        {nextPhase && (
          <button className="primary-button" type="button" disabled={busy || loadingLines} onClick={() => void persist(nextPhase)}>
            {busy ? <GoogleIcon name="progress_activity" className="login-spin" /> : <GoogleIcon name="check" />}
            {busy ? 'Guardando…' : ADVANCE_LABEL[nextPhase] ?? `Avanzar a ${nextPhase}`}
          </button>
        )}
      </section>

      <section className="table-panel panel">
        <div className="table-header">
          <div><span className="panel-label">SOLICITUD DE COMPRA</span><h2>Productos, cantidades e IGV</h2></div>
        </div>
        <div className="po-datos">
          <label>Fecha límite o aproximada<input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} /></label>
          <label>Tipo de comprobante
            <select value={COMPROBANTES.includes(compTipo) ? compTipo : 'Factura'} onChange={(event) => setCompTipo(event.target.value)}>
              {COMPROBANTES.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </label>
          <label>Número de comprobante<input value={compNum} onChange={(event) => setCompNum(event.target.value)} placeholder="F001-0001" /></label>
          <button className="export-button" type="button" disabled={busy} onClick={() => void persist(order.status)}><GoogleIcon name="save" className="small" /> Guardar datos</button>
        </div>
        <div className="table-scroll">
          <table className="record-table">
            <thead><tr><th>PRODUCTO</th><th>CANT.</th><th>COSTO UNIT.</th><th>SUBTOTAL</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.producto_id}>
                  <td><strong>{line.nombre ?? line.producto_id}</strong><small>{line.codigo ?? ''}</small></td>
                  <td className="record-value">{line.cantidad} und.</td>
                  <td className="record-value">{money(line.precio)}</td>
                  <td className="record-value">{money(line.cantidad * line.precio)}</td>
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={4}><div className="empty-table"><GoogleIcon name="inventory_2" />{loadingLines ? <><strong>Cargando productos…</strong></> : <><strong>Sin productos</strong><span>Edita la compra para agregar su catálogo.</span></>}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="po-totals">
          <div className="lines-summary">
            <span className="lines-summary-title"><GoogleIcon name="receipt_long" className="small" /> Resumen</span>
            <span>{lines.length} {lines.length === 1 ? 'producto' : 'productos'} · {qtyTotal} und.</span>
            <strong>Subtotal {money(subtotal)}</strong>
          </div>
          <div className="po-tax">
            <span>Subtotal <strong>{money(subtotal)}</strong></span>
            <span>IGV 18% <strong>{money(igv)}</strong></span>
            <span className="po-grand">Total <strong>{money(total)}</strong></span>
          </div>
        </div>
        <p className="po-foot"><GoogleIcon name="schedule" className="small" /> Actualización: {order.date} · La CxP se genera por el total con IGV.</p>
      </section>
    </>
  )
}
