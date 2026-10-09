import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Table,
  Trash2,
} from 'lucide-react'
import { DATA_PAGES, pageMeta } from '../data/catalog'
import { financialSnapshot } from '../data/dashboard'
import { formatWhen, money, statusTone } from '../data/helpers'
import { useRecords } from '../context/RecordsContext'
import { deleteCatalogItem, fetchKardex, friendlyError, insertCatalogItem, updateCatalogItem, type KardexEntry } from '../services/records'
import ConfirmModal from '../components/ConfirmModal'
import PurchaseOrderDetail from '../components/PurchaseOrderDetail'
import type { DataPage, ExportFormat, RecordItem } from '../types'

function kardexTone(tipo: KardexEntry['tipo']) {
  if (tipo === 'entrada') return 'green'
  if (tipo === 'salida') return 'amber'
  return 'blue'
}

export default function ModuloPage() {
  const { pageId } = useParams()
  const page = DATA_PAGES.find((candidate) => candidate === pageId)
  if (!page) return <Navigate to="/dashboard" replace />
  return <ModuloView key={page} page={page} />
}

function ModuloView({ page }: { page: DataPage }) {
  const { records, catalog, loading, openComposer, openEditor, requestDelete, exportTable, convertQuote, reload, notify } = useRecords()
  const navigate = useNavigate()
  const [converting, setConverting] = useState<RecordItem | null>(null)
  // Compras: orden seleccionada para ver su panel por fases.
  const [selectedPurchase, setSelectedPurchase] = useState<string | null>(null)
  const purchaseOrder = page === 'purchases' ? records.purchases.find((item) => item.id === selectedPurchase) ?? null : null
  // Proveedores: su catálogo (lo que ofrecen), independiente de mi inventario.
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null)
  const [catBusy, setCatBusy] = useState(false)
  const [catName, setCatName] = useState('')
  const [catDetail, setCatDetail] = useState('')
  const [catCosto, setCatCosto] = useState('')
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatCosto, setEditCatCosto] = useState('')
  const [deletingCatalog, setDeletingCatalog] = useState<RecordItem | null>(null)

  const supplierCatalog = (supplierRowId?: string) =>
    !supplierRowId ? [] : catalog.filter((item) => item.proveedor_id === supplierRowId)

  const resetCatForm = () => {
    setCatName('')
    setCatDetail('')
    setCatCosto('')
    setEditingCatalogId(null)
  }

  const submitCatalogItem = async (supplierRowId: string | undefined, supplierName: string) => {
    if (!supplierRowId || catBusy) return
    const costo = Number(catCosto)
    if (catName.trim().length < 2) {
      notify('El producto del proveedor necesita un nombre.')
      return
    }
    if (!Number.isFinite(costo) || costo < 0) {
      notify('El costo debe ser cero o mayor.')
      return
    }
    setCatBusy(true)
    try {
      await insertCatalogItem(supplierRowId, { nombre: catName, detalle: catDetail, costo: Math.round(costo * 100) / 100 })
      await reload()
      resetCatForm()
      notify(`"${catName.trim()}" agregado al catálogo de ${supplierName}.`)
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setCatBusy(false)
    }
  }

  const saveCatalogEdit = async () => {
    if (!editingCatalogId || catBusy) return
    const costo = Number(editCatCosto)
    if (editCatName.trim().length < 2) {
      notify('El producto del proveedor necesita un nombre.')
      return
    }
    if (!Number.isFinite(costo) || costo < 0) {
      notify('El costo debe ser cero o mayor.')
      return
    }
    setCatBusy(true)
    try {
      const current = catalog.find((item) => item.rowId === editingCatalogId)
      await updateCatalogItem(editingCatalogId, { nombre: editCatName, detalle: current?.detail ?? '', costo: Math.round(costo * 100) / 100 })
      await reload()
      resetCatForm()
      notify('Catálogo actualizado.')
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setCatBusy(false)
    }
  }

  const confirmCatalogDelete = async () => {
    if (!deletingCatalog?.rowId || catBusy) return
    const name = deletingCatalog.name
    setCatBusy(true)
    try {
      await deleteCatalogItem(deletingCatalog.rowId)
      await reload()
      setDeletingCatalog(null)
      notify(`"${name}" eliminado del catálogo.`)
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setCatBusy(false)
    }
  }

  const confirmConvert = async () => {
    if (!converting) return
    const code = converting.id
    setConverting(null)
    await convertQuote(code)
  }
  const pageRecords = records[page]
  const meta = pageMeta[page]
  const Icon = meta.icon
  // Finanzas: pestañas por cobrar / por pagar / caja.
  const [finTab, setFinTab] = useState<'todos' | 'cobrar' | 'pagar' | 'caja'>('todos')
  const financeSnap = useMemo(() => page === 'finance' ? financialSnapshot(records.finance) : null, [page, records.finance])
  const financeIds = useMemo(() => {
    if (!financeSnap) return null
    return {
      cobrar: new Set(financeSnap.receivables.map((item) => item.id)),
      pagar: new Set(financeSnap.payables.map((item) => item.id)),
      caja: new Set([...financeSnap.completedReceivables, ...financeSnap.completedPayables].map((item) => item.id)),
    }
  }, [financeSnap])
  const baseRecords = useMemo(() => {
    if (page !== 'finance' || !financeSnap || !financeIds || finTab === 'todos') return pageRecords
    const ids = financeIds[finTab]
    return pageRecords.filter((item) => ids.has(item.id))
  }, [page, pageRecords, financeSnap, financeIds, finTab])
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const statusFilter = searchParams.get('status') ?? 'Todos'
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  // Kardex: historial de movimientos del inventario (solo en este módulo).
  const isInventory = page === 'inventory'
  const [view, setView] = useState<'registros' | 'kardex'>('registros')
  const [kardexProduct, setKardexProduct] = useState('')
  const [kardexTipo, setKardexTipo] = useState('Todos')
  const [kardex, setKardex] = useState<KardexEntry[]>([])
  const [kardexLoading, setKardexLoading] = useState(false)
  const [kardexError, setKardexError] = useState('')
  const [kardexNonce, setKardexNonce] = useState(0)

  useEffect(() => {
    if (!isInventory || view !== 'kardex') return
    let active = true
    setKardexLoading(true)
    setKardexError('')
    fetchKardex(kardexProduct || null)
      .then((rows) => active && setKardex(rows))
      .catch((error) => active && setKardexError(friendlyError(error)))
      .finally(() => active && setKardexLoading(false))
    return () => {
      active = false
    }
  }, [isInventory, view, kardexProduct, kardexNonce])

  useEffect(() => {
    if (!exportOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) setExportOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [exportOpen])

  const setQuery = (value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
  }

  const setStatusFilter = (value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value === 'Todos') next.delete('status')
      else next.set('status', value)
      return next
    }, { replace: true })
  }

  const resetFilters = () => setSearchParams({}, { replace: true })

  const chooseFormat = (format: ExportFormat) => {
    setExportOpen(false)
    exportTable(page, format)
  }

  const kardexFiltrado = useMemo(
    () => kardex.filter((row) => kardexTipo === 'Todos' || row.tipo === kardexTipo),
    [kardex, kardexTipo],
  )
  const kardexEntradas = kardexFiltrado.filter((row) => row.tipo === 'entrada').reduce((sum, row) => sum + row.cantidad, 0)
  const kardexSalidas = kardexFiltrado.filter((row) => row.tipo === 'salida').reduce((sum, row) => sum + row.cantidad, 0)

  const statuses = Array.from(new Set(baseRecords.map((item) => item.status)))
  const filteredRecords = useMemo(() => baseRecords.filter((item) => {
    const matchesQuery = `${item.id} ${item.name} ${item.detail} ${item.ruc ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    return matchesQuery && (statusFilter === 'Todos' || item.status === statusFilter)
  }), [baseRecords, query, statusFilter])
  const total = baseRecords.reduce((sum, item) => sum + (item.amount ?? 0), 0)
  const critical = baseRecords.filter((item) => item.status === 'Crítico' || item.status === 'Bajo stock').length
  const primaryValue = meta.kind === 'stock'
    ? `${baseRecords.reduce((sum, item) => sum + (item.quantity ?? 0), 0)} und.`
    : meta.kind === 'file' || meta.kind === 'settings'
      ? `${baseRecords.filter((item) => item.status === 'Vigente' || item.status === 'Activo').length} vigentes`
      : money(total)
  const valueHeading = meta.kind === 'stock' ? 'EXISTENCIA REGISTRADA' : meta.kind === 'file' ? 'ARCHIVOS DISPONIBLES' : meta.kind === 'settings' ? 'PARÁMETROS ACTIVOS' : 'VALOR ACUMULADO'

  return (
    <>
      <section className="module-header">
        <div><span className="section-kicker"><i /> {meta.eyebrow}</span><h1>{meta.title}<span>{pageRecords.length}</span></h1><p>{meta.description}</p></div>
        <button className="primary-button" type="button" onClick={() => openComposer(page)}><Plus size={18} /> {meta.action}</button>
      </section>

      <section className="module-summary-grid">
        <article><span className="summary-icon"><Icon size={18} /></span><div><small>{valueHeading}</small><strong>{primaryValue}</strong></div></article>
        <article><span className="summary-icon muted"><Activity size={18} /></span><div><small>REGISTROS ACTIVOS</small><strong>{baseRecords.filter((item) => item.status !== 'Pendiente').length} / {baseRecords.length}</strong></div></article>
        <article><span className={critical ? 'summary-icon warning' : 'summary-icon success'}>{critical ? <AlertTriangle size={18} /> : <CircleCheck size={18} />}</span><div><small>{critical ? 'REQUIERE REVISIÓN' : 'ESTADO DEL MÓDULO'}</small><strong>{critical ? `${critical} alertas` : 'Operativo'}</strong></div></article>
      </section>

      {isInventory && (
        <div className="inventory-tabs">
          <div className="segmented-control" role="tablist" aria-label="Vistas de inventario">
            <button type="button" role="tab" aria-selected={view === 'registros'} className={view === 'registros' ? 'selected' : ''} onClick={() => setView('registros')}>Productos</button>
            <button type="button" role="tab" aria-selected={view === 'kardex'} className={view === 'kardex' ? 'selected' : ''} onClick={() => setView('kardex')}>Kardex</button>
          </div>
          {view === 'kardex' && <span className="kardex-count">{kardexFiltrado.length} movimientos</span>}
        </div>
      )}

      {page === 'finance' && financeSnap && (
        <div className="inventory-tabs">
          <div className="segmented-control" role="tablist" aria-label="Cuentas de finanzas">
            <button type="button" role="tab" aria-selected={finTab === 'todos'} className={finTab === 'todos' ? 'selected' : ''} onClick={() => setFinTab('todos')}>Todos ({records.finance.length})</button>
            <button type="button" role="tab" aria-selected={finTab === 'cobrar'} className={finTab === 'cobrar' ? 'selected' : ''} onClick={() => setFinTab('cobrar')}>Por cobrar ({financeSnap.receivables.length})</button>
            <button type="button" role="tab" aria-selected={finTab === 'pagar'} className={finTab === 'pagar' ? 'selected' : ''} onClick={() => setFinTab('pagar')}>Por pagar ({financeSnap.payables.length})</button>
            <button type="button" role="tab" aria-selected={finTab === 'caja'} className={finTab === 'caja' ? 'selected' : ''} onClick={() => setFinTab('caja')}>Caja</button>
          </div>
          {finTab === 'caja' && <span className="kardex-count">Saldo {money(financeSnap.cajaSaldo)}</span>}
        </div>
      )}

      {page === 'purchases' && purchaseOrder ? (
        <PurchaseOrderDetail order={purchaseOrder} onBack={() => setSelectedPurchase(null)} />
      ) : isInventory && view === 'kardex' ? (
      <section className="table-panel panel">
        <div className="table-header">
          <div><span className="panel-label">KARDEX DE INVENTARIO</span><h2>Historial de movimientos</h2></div>
          <div className="table-actions">
            <button className="export-button" type="button" onClick={() => setKardexNonce((n) => n + 1)}><span className="gicon small">refresh</span> Recargar</button>
          </div>
        </div>
        <div className="kardex-summary">
          <span className="kardex-chip in"><span className="gicon small">add_box</span> Entradas: {kardexEntradas} und.</span>
          <span className="kardex-chip out"><span className="gicon small">remove_circle</span> Salidas: {kardexSalidas} und.</span>
          <span className="kardex-note">Se genera solo con cada venta, compra o ajuste de stock.</span>
        </div>
        <div className="table-toolbar">
          <label className="filter-select"><Filter size={16} /><select value={kardexProduct} onChange={(event) => setKardexProduct(event.target.value)}><option value="">Todos los productos</option>{pageRecords.map((item) => <option key={item.rowId ?? item.id} value={item.rowId ?? ''}>{item.name} · {item.id}</option>)}</select><ChevronDown size={14} /></label>
          <label className="filter-select"><Filter size={16} /><select value={kardexTipo} onChange={(event) => setKardexTipo(event.target.value)}><option>Todos</option><option value="entrada">Entradas</option><option value="salida">Salidas</option><option value="ajuste">Ajustes</option><option value="transferencia">Transferencias</option></select><ChevronDown size={14} /></label>
        </div>
        <div className="table-scroll">
          <table className="record-table">
            <thead><tr><th>FECHA</th><th>PRODUCTO</th><th>TIPO</th><th>CANTIDAD</th><th>STOCK</th><th>REFERENCIA</th></tr></thead>
            <tbody>
              {kardexFiltrado.map((row) => (
                <tr key={row.id}>
                  <td className="record-date">{formatWhen(row.created_at)}</td>
                  <td><strong>{row.productoNombre ?? 'Producto eliminado'}</strong><small>{row.productoCodigo ?? row.producto_id ?? '—'}</small></td>
                  <td><span className={`status-pill ${kardexTone(row.tipo)}`}>{row.tipo}</span></td>
                  <td className={row.tipo === 'entrada' ? 'kardex-qty-in' : row.tipo === 'salida' ? 'kardex-qty-out' : 'record-value'}>{row.tipo === 'entrada' ? `+${row.cantidad}` : row.tipo === 'salida' ? `−${row.cantidad}` : row.cantidad} und.</td>
                  <td className="record-date">{row.stock_anterior ?? '—'} → {row.stock_nuevo ?? '—'}</td>
                  <td><span className="record-id">{row.referencia ?? '—'}</span></td>
                </tr>
              ))}
              {!kardexFiltrado.length && <tr><td colSpan={6}><div className="empty-table"><Search size={20} />{kardexLoading ? <><strong>Cargando kardex…</strong><span>Consultando los movimientos.</span></> : kardexError ? <><strong>Sin acceso al kardex</strong><span>{kardexError}</span></> : <><strong>Sin movimientos</strong><span>Vende, compra o ajusta stock y aparecerán aquí solos.</span></>}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      ) : (
      <section className="table-panel panel">
        <div className="table-header">
          <div><span className="panel-label">REGISTRO OPERATIVO</span><h2>Información conectada</h2></div>
          <div className="table-actions">
            <div className="export-wrap" ref={exportRef}>
              <button className="export-button" type="button" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}><Download size={16} /> Exportar <ChevronDown size={14} /></button>
              <div className={`export-menu${exportOpen ? ' open' : ''}`} role="menu" aria-label="Formatos de exportación">
                <button type="button" role="menuitem" onClick={() => chooseFormat('pdf')}><span className="export-ico pdf"><FileText size={15} /></span><span><strong>PDF</strong><small>Imprimir o guardar</small></span></button>
                <button type="button" role="menuitem" onClick={() => chooseFormat('csv')}><span className="export-ico csv"><Table size={15} /></span><span><strong>CSV</strong><small>Compatible con Excel</small></span></button>
                <button type="button" role="menuitem" onClick={() => chooseFormat('excel')}><span className="export-ico excel"><FileSpreadsheet size={15} /></span><span><strong>Excel</strong><small>Hoja de cálculo .xls</small></span></button>
              </div>
            </div>
            <button className="round-action" type="button" aria-label="Restablecer filtros" title="Restablecer filtros" onClick={resetFilters}><SlidersHorizontal size={17} /></button>
          </div>
        </div>
        {page === 'finance' && finTab === 'caja' && financeSnap && (
          <div className="kardex-summary">
            <span className="kardex-chip in"><span className="gicon small">add_box</span> Ingresos: {money(financeSnap.cajaIngresos)}</span>
            <span className="kardex-chip out"><span className="gicon small">remove_circle</span> Egresos: {money(financeSnap.cajaEgresos)}</span>
            <span className="kardex-chip total"><span className="gicon small">payments</span> Saldo: {money(financeSnap.cajaSaldo)}</span>
            <span className="kardex-note">Caja = cobrado (CxC completadas) − pagado (CxP completadas).</span>
          </div>
        )}
        <div className="table-toolbar">
          <label className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar en ${meta.title.toLocaleLowerCase()}...`} /></label>
          <label className="filter-select"><Filter size={16} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={14} /></label>
        </div>
        <div className="table-scroll">
          <table className="record-table">
            <thead><tr><th>REFERENCIA</th><th>{page === 'documents' ? 'ARCHIVO' : 'DETALLE'}</th><th>ACTUALIZACIÓN</th><th>{page === 'inventory' ? 'STOCK' : page === 'documents' || page === 'reports' || page === 'settings' ? 'TIPO' : 'VALOR'}</th><th>ESTADO</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {filteredRecords.map((item) => {
                const linkedLabel = item.relatedName
                  ? `${item.relatedName}${item.relatedCode ? ` · ${item.relatedCode}` : ''}`
                  : null
                const showRelation = page === 'sales' || page === 'purchases' || page === 'quotes'
                const supplierKey = item.rowId ?? item.id
                const supplierOpen = page === 'suppliers' && expandedSupplier === supplierKey
                const offered = page === 'suppliers' ? supplierCatalog(item.rowId) : []
                return (
                <>
                <tr key={item.id}>
                  <td><span className="record-id">{item.id}</span></td>
                  <td><strong>{item.name}</strong><small>{item.detail}</small>
                    {showRelation && (linkedLabel ? (
                      <span className="linked-badge"><span className="gicon">link</span>{linkedLabel}</span>
                    ) : (
                      <span className="linked-badge muted"><span className="gicon">link_off</span>Sin vincular</span>
                    ))}
                    {page === 'suppliers' && (item.ruc ? (
                      <span className="linked-badge"><span className="gicon">badge</span>RUC {item.ruc}</span>
                    ) : (
                      <span className="linked-badge muted"><span className="gicon">badge</span>Sin RUC</span>
                    ))}
                  </td>
                  <td className="record-date">{item.date}</td>
                  <td className="record-value">{page === 'inventory' ? `${item.quantity ?? 0} und.${item.precio !== undefined ? ` · ${money(item.precio)}` : ''}` : page === 'documents' || page === 'reports' || page === 'settings' ? item.detail.split('·')[0].trim() : item.amount ? money(item.amount) : '—'}</td>
                  <td><span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span></td>
                  <td><div className="row-actions">{page === 'purchases' && <button className="row-action" type="button" aria-label={`Ver seguimiento de ${item.id}`} title="Ver seguimiento por fases" onClick={() => setSelectedPurchase(item.id)}><Eye size={15} /></button>}{page === 'quotes' && (item.status === 'Pendiente' || item.status === 'En curso' || item.status === 'Aprobada') && <button className="row-action convert" type="button" aria-label={`Convertir ${item.id} en venta`} title="Convertir en venta" onClick={() => setConverting(item)}><ShoppingCart size={15} /></button>}{page === 'suppliers' && <button className="row-action" type="button" aria-label={supplierOpen ? `Ocultar catálogo de ${item.name}` : `Ver catálogo que ofrece ${item.name}`} title={`Catálogo que ofrece (${offered.length})`} aria-expanded={supplierOpen} onClick={() => { setExpandedSupplier(supplierOpen ? null : supplierKey); resetCatForm() }}>{supplierOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>}<button className="row-action edit" type="button" aria-label={`Editar ${item.name}`} title="Editar" onClick={() => openEditor(page, item)}><Pencil size={15} /></button><button className="row-action delete" type="button" aria-label={`Eliminar ${item.name}`} title="Eliminar" onClick={() => requestDelete(page, item)}><Trash2 size={15} /></button></div></td>
                </tr>
                {supplierOpen && (
                <tr key={`${item.id}-ofrece`}>
                  <td colSpan={6}>
                    <div className="supplier-detail">
                      <span className="lines-title"><span className="gicon small">storefront</span> Catálogo de {item.name} ({offered.length})</span>
                      <small className="relation-hint"><span className="gicon small">info</span> Lo que ofrece, independiente de tu inventario. Al completar una compra, lo comprado ingresa a tu stock.</small>
                      {offered.length ? (
                        <div className="supplier-product-list">
                          {offered.map((product) => (
                            editingCatalogId === product.rowId ? (
                              <div key={product.id} className="supplier-product-row editing">
                                <input
                                  aria-label="Nombre del producto"
                                  value={editCatName}
                                  onChange={(event) => setEditCatName(event.target.value)}
                                  placeholder="Nombre del producto"
                                />
                                <input
                                  aria-label="Costo"
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={editCatCosto}
                                  onChange={(event) => setEditCatCosto(event.target.value)}
                                  placeholder="0.00"
                                />
                                <span className="supplier-product-actions">
                                  <button className="export-button" type="button" disabled={catBusy} onClick={saveCatalogEdit}>Guardar</button>
                                  <button className="export-button" type="button" disabled={catBusy} onClick={resetCatForm}>Cancelar</button>
                                </span>
                              </div>
                            ) : (
                              <div key={product.id} className="supplier-product-row">
                                <span className="supplier-product-copy"><strong>{product.name}</strong><small>{product.id} · Costo {money(product.amount ?? 0)}{product.productoId ? ` · En inventario: ${product.quantity ?? 0} und.` : ' · Nuevo: ingresa al completar'}</small></span>
                                <span className="supplier-product-actions">
                                  {product.productoId && product.relatedName && <button className="export-button" type="button" onClick={() => navigate(`/inventory?q=${encodeURIComponent(product.relatedName ?? product.name)}`)}>Ver stock</button>}
                                  <button
                                    className="export-button"
                                    type="button"
                                    disabled={catBusy}
                                    onClick={() => {
                                      setEditingCatalogId(product.rowId ?? null)
                                      setEditCatName(product.name)
                                      setEditCatCosto(String(product.amount ?? 0))
                                    }}
                                  >
                                    Editar
                                  </button>
                                  <button className="export-button danger" type="button" disabled={catBusy} onClick={() => setDeletingCatalog(product)}>Eliminar</button>
                                </span>
                              </div>
                            )
                          ))}
                        </div>
                      ) : (
                        <p className="relation-hint"><span className="gicon small">inventory_2</span> Catálogo vacío. Agrega abajo lo que ofrece este proveedor.</p>
                      )}
                      <div className="supplier-link-bar">
                        <input
                          aria-label="Nombre del producto"
                          value={catName}
                          onChange={(event) => setCatName(event.target.value)}
                          placeholder="Nombre del producto que ofrece"
                        />
                        <input
                          aria-label="Detalle"
                          value={catDetail}
                          onChange={(event) => setCatDetail(event.target.value)}
                          placeholder="Detalle (opcional)"
                        />
                        <input
                          aria-label="Costo"
                          type="number"
                          min={0}
                          step={0.01}
                          value={catCosto}
                          onChange={(event) => setCatCosto(event.target.value)}
                          placeholder="Costo S/"
                        />
                        <button className="primary-button" type="button" disabled={catBusy} onClick={() => submitCatalogItem(item.rowId, item.name)}>Agregar</button>
                      </div>
                    </div>
                  </td>
                </tr>
                )}
                </>
                )
              })}
              {!filteredRecords.length && <tr><td colSpan={6}><div className="empty-table"><Search size={20} />{loading ? <><strong>Cargando registros…</strong><span>Consultando la base de datos.</span></> : pageRecords.length ? <><strong>Sin coincidencias</strong><span>Ajusta la búsqueda o el estado para consultar otros registros.</span></> : <><strong>Aún no hay registros</strong><span>Crea el primero con el botón «{meta.action}».</span></>}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      )}
      {converting && (
        <ConfirmModal
          title="Convertir en venta"
          message={`Se creará una venta con los productos de "${converting.name}" (${converting.id}), se descontará stock y la cotización pasará a Completada.`}
          confirmLabel="Convertir"
          onCancel={() => setConverting(null)}
          onConfirm={confirmConvert}
        />
      )}
      {deletingCatalog && (
        <ConfirmModal
          title="Eliminar del catálogo"
          message={`¿Quitar "${deletingCatalog.name}" del catálogo? No borra tu inventario, solo la oferta del proveedor.`}
          confirmLabel="Eliminar"
          onCancel={() => setDeletingCatalog(null)}
          onConfirm={confirmCatalogDelete}
        />
      )}
    </>
  )
}
