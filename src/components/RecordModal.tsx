import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { pageMeta } from '../data/catalog'
import { defaultStatus, money, statusesForPage } from '../data/helpers'
import { useRecords } from '../context/RecordsContext'
import { fetchDocumentLines } from '../services/records'
import type { DataPage, DocumentLine, RecordItem, RecordStatus } from '../types'

/** Comprobante de venta: tipos con su serie y correlativo automático (editable). */
const SALE_DOC_TYPES = ['Factura', 'Boleta', 'Cotización', 'Nota de venta'] as const
type SaleDocType = (typeof SALE_DOC_TYPES)[number] | 'Manual'
const SALE_CITIES = ['Lima', 'Arequipa', 'Cusco', 'Trujillo', 'Piura', 'Chiclayo', 'Huancayo', 'Iquitos', 'Tacna']

function nextSaleDocNumber(sales: RecordItem[], tipo: string): string {
  const patterns: Record<string, RegExp> = {
    Factura: /F\d+-(\d+)/,
    Boleta: /B\d+-(\d+)/,
    Cotización: /COT-(\d+)/,
    'Nota de venta': /NV-(\d+)/,
  }
  const rx = patterns[tipo]
  let max = 0
  if (rx) {
    for (const sale of sales) {
      const match = sale.detail.match(rx)
      if (match) max = Math.max(max, Number(match[1]))
    }
  }
  const next = max + 1
  if (tipo === 'Factura') return `F001-${String(next).padStart(4, '0')}`
  if (tipo === 'Boleta') return `B001-${String(next).padStart(4, '0')}`
  if (tipo === 'Cotización') return `COT-${String(next).padStart(4, '0')}`
  return `NV-${String(next).padStart(3, '0')}`
}

function parseSaleDetail(detail: string): { tipo: SaleDocType; ciudad: string } {
  const match = detail.match(/^(Factura|Boleta|Cotización|Nota de venta)\s+\S+\s*·\s*(.+)$/)
  if (match) return { tipo: match[1] as SaleDocType, ciudad: match[2].trim() }
  return { tipo: 'Manual', ciudad: 'Lima' }
}

/** Ruta de seguimiento de una compra: el inventario se mueve solo al completar. */
const PURCHASE_FLOW = [
  { status: 'Pendiente', icon: 'schedule' },
  { status: 'En curso', icon: 'sync' },
  { status: 'En tránsito', icon: 'local_shipping' },
  { status: 'Completada', icon: 'check_circle' },
] as const

/** Icono de Google (Material Symbols Outlined). Requiere el <link> de index.html. */
function GoogleIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`gicon${className ? ` ${className}` : ''}`} aria-hidden="true">
      {name}
    </span>
  )
}

type LineDraft = { selected: boolean; qty: number; price: number }

export default function RecordModal({ page, record, saving = false, onClose, onSave }: { page: DataPage; record: RecordItem | null; saving?: boolean; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const meta = pageMeta[page]
  const editing = Boolean(record)
  const { records } = useRecords()

  const hasClientRelation = page === 'sales'
  const hasSupplierRelation = page === 'purchases' || page === 'inventory'
  const hasDocumentLines = page === 'sales' || page === 'purchases'
  const isInventoryOptional = page === 'inventory'

  const initialRelated =
    page === 'sales' ? (record?.cliente_id ?? '') : hasSupplierRelation ? (record?.proveedor_id ?? '') : ''

  const [relatedId, setRelatedId] = useState<string>(initialRelated ?? '')
  const [nameValue, setNameValue] = useState<string>(record?.name ?? '')
  const [statusValue, setStatusValue] = useState(record?.status ?? defaultStatus(page))
  // Comprobante automático (solo ventas): tipo + ciudad generan el detalle con
  // el siguiente correlativo de la serie. Escribir a mano pasa a modo Manual.
  const initialDoc = page === 'sales'
    ? (record ? parseSaleDetail(record.detail) : { tipo: 'Factura' as SaleDocType, ciudad: 'Lima' })
    : { tipo: 'Manual' as SaleDocType, ciudad: 'Lima' }
  const [docType, setDocType] = useState<SaleDocType>(initialDoc.tipo)
  const [docCity, setDocCity] = useState<string>(initialDoc.ciudad)
  const [detailTouched, setDetailTouched] = useState(false)
  const [detailValue, setDetailValue] = useState<string>(
    record?.detail ?? (page === 'sales' ? `Factura ${nextSaleDocNumber(records.sales, 'Factura')} · Lima` : ''),
  )
  const [lines, setLines] = useState<Record<string, LineDraft>>({})
  const [linesLoading, setLinesLoading] = useState(false)
  const [showAllProducts, setShowAllProducts] = useState(false)
  // Ventas: filtro por proveedor. Sin selección no se lista nada: al elegir
  // recién aparecen los productos relacionados a ese proveedor.
  const [supplierFilter, setSupplierFilter] = useState<string>('')

  const customers = records.customers
  const suppliers = records.suppliers
  const inventory = records.inventory
  const options = hasClientRelation ? customers : hasSupplierRelation ? suppliers : []

  const linkedTarget = relatedId ? options.find((item) => item.rowId === relatedId) : undefined

  const handleRelatedChange = (value: string) => {
    setRelatedId(value)
    if (!value) return
    // En productos el nombre es propio del producto y nunca se hereda del
    // proveedor: solo se guarda el vínculo (proveedor_id). En ventas/compras
    // el nombre sí se hereda para mantener coherencia con la FK.
    if (page === 'inventory') return
    const target = options.find((item) => item.rowId === value)
    if (target) setNameValue(target.name)
  }

  const handleDocTypeChange = (tipo: SaleDocType) => {
    setDocType(tipo)
    if (tipo === 'Manual' || page !== 'sales') return
    // Al elegir tipo se propone el siguiente correlativo de su serie.
    setDetailTouched(false)
    setDetailValue(`${tipo} ${nextSaleDocNumber(records.sales, tipo)} · ${docCity}`)
  }

  const handleCityChange = (ciudad: string) => {
    setDocCity(ciudad)
    if (docType === 'Manual') return
    // La ciudad solo cambia el sufijo: conserva el número ya propuesto.
    setDetailValue((current) => {
      const base = current.includes('·') ? current.split('·')[0].trim() : current.trim()
      if (!base) return `${docType} ${nextSaleDocNumber(records.sales, docType)} · ${ciudad}`
      return `${base} · ${ciudad}`
    })
  }

  const handleDetailInput = (value: string) => {
    setDetailValue(value)
    // Escribir a mano pasa a modo Manual para no sobrescribirlo.
    if (page !== 'sales') return
    setDetailTouched(true)
    setDocType('Manual')
  }

  // Si la lista de ventas aún cargaba al abrir, recalcula el correlativo al llegar.
  useEffect(() => {
    if (page !== 'sales' || record || detailTouched || docType === 'Manual') return
    setDetailValue(`${docType} ${nextSaleDocNumber(records.sales, docType)} · ${docCity}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, record, detailTouched, records.sales])

  // Precarga las líneas guardadas al editar una venta/compra.
  useEffect(() => {
    if (!hasDocumentLines || !record?.rowId) return
    let active = true
    setLinesLoading(true)
    fetchDocumentLines(page as 'sales' | 'purchases', record.rowId)
      .then((previous: DocumentLine[]) => {
        if (!active) return
        const draft: Record<string, LineDraft> = {}
        for (const line of previous) {
          draft[line.producto_id] = { selected: true, qty: line.cantidad, price: line.precio }
        }
        setLines(draft)
      })
      .catch(() => active && setLines({}))
      .finally(() => active && setLinesLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDocumentLines, record?.rowId])

  // En compras: solo productos del proveedor elegido (los "relacionados a este").
  // Si el proveedor no tiene productos, se ofrecen todos con aviso.
  const purchaseBase = useMemo(() => {
    if (page !== 'purchases' || !relatedId || showAllProducts) return inventory
    const related = inventory.filter((item) => item.proveedor_id === relatedId)
    return related.length ? related : inventory
  }, [page, relatedId, showAllProducts, inventory])

  // En ventas: el selector de proveedor filtra la lista. Sin selección no se
  // muestra nada hasta elegir (o "Todos" para ver todo el inventario).
  const saleBase = useMemo(() => {
    if (page !== 'sales') return inventory
    if (supplierFilter === 'all') return inventory
    if (!supplierFilter) return []
    return inventory.filter((item) => item.proveedor_id === supplierFilter)
  }, [page, supplierFilter, inventory])

  const baseProducts = page === 'purchases' ? purchaseBase : page === 'sales' ? saleBase : inventory

  // No perder lo ya marcado al cambiar el filtro (edición segura): lo
  // seleccionado siempre queda visible aunque el filtro lo oculte.
  const visibleProducts = useMemo(() => {
    const selectedIds = new Set(
      Object.entries(lines)
        .filter(([, draft]) => draft.selected)
        .map(([id]) => id),
    )
    if (!selectedIds.size) return baseProducts
    const baseIds = new Set(baseProducts.map((product) => product.rowId))
    const extras = inventory.filter((product) => product.rowId && selectedIds.has(product.rowId) && !baseIds.has(product.rowId))
    return extras.length ? [...baseProducts, ...extras] : baseProducts
  }, [baseProducts, lines, inventory])

  const supplierHasRelated = page === 'purchases' && relatedId
    ? inventory.some((item) => item.proveedor_id === relatedId)
    : true
  const saleFilterHasRelated = page === 'sales' && supplierFilter && supplierFilter !== 'all'
    ? inventory.some((item) => item.proveedor_id === supplierFilter)
    : true
  const saleFilterName = page === 'sales' && supplierFilter && supplierFilter !== 'all'
    ? suppliers.find((item) => item.rowId === supplierFilter)?.name
    : undefined

  const toggleLine = (uuid: string) => {
    // Al marcar se toma el precio fijo del producto (se define en Inventario,
    // no se edita por línea).
    const product = inventory.find((item) => item.rowId === uuid)
    // En ventas no se puede marcar un producto sin stock.
    if (page === 'sales' && (product?.quantity ?? 0) <= 0) {
      const already = Object.prototype.hasOwnProperty.call(lines, uuid) && lines[uuid]?.selected
      if (!already) return
    }
    const suggested = product?.precio ?? 0
    const stock = product?.quantity ?? 0
    setLines((current) => {
      if (current[uuid]?.selected) return { ...current, [uuid]: { ...current[uuid], selected: false } }
      const qty = current[uuid]?.qty ?? 1
      return {
        ...current,
        [uuid]: {
          selected: true,
          qty: page === 'sales' ? Math.min(qty, Math.max(1, stock)) : qty,
          price: current[uuid]?.price ?? suggested,
        },
      }
    })
  }

  const changeLine = (uuid: string, patch: Partial<LineDraft>) => {
    setLines((current) => ({
      ...current,
      [uuid]: { selected: true, qty: current[uuid]?.qty ?? 1, price: current[uuid]?.price ?? 0, ...patch },
    }))
  }

  const selectedLines = useMemo(
    () =>
      visibleProducts
        .filter((product) => product.rowId && lines[product.rowId]?.selected)
        .map((product) => {
          const uuid = product.rowId as string
          const draft = lines[uuid]
          return { product, qty: draft.qty, price: draft.price, subtotal: draft.qty * draft.price }
        }),
    [visibleProducts, lines],
  )
  const linesTotal = selectedLines.reduce((sum, line) => sum + line.subtotal, 0)

  const relationIcon = hasClientRelation ? 'group' : 'factory'
  const relationLabel = page === 'sales' ? 'Cliente registrado' : page === 'purchases' ? 'Proveedor registrado' : 'Proveedor habitual (opcional)'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="record-modal record-modal--wide" onSubmit={onSave}>
        <div className="modal-heading"><div><span className="section-kicker"><i /> {meta.eyebrow}</span><h2>{editing ? `Editar registro de ${meta.title.toLocaleLowerCase()}` : meta.action}</h2><p>{editing ? 'Los cambios se guardarán en la base de datos.' : 'El registro se guardará en la base de datos.'}</p></div><button className="modal-close" type="button" aria-label="Cerrar" onClick={onClose}><GoogleIcon name="close" /></button></div>
        <div className="modal-fields">
          {(hasClientRelation || hasSupplierRelation) && (
            <div className="relation-field">
              <label htmlFor="related_id">{relationLabel}</label>
              <span className="relation-control">
                <GoogleIcon name={relationIcon} />
                <select
                  id="related_id"
                  name="related_id"
                  value={relatedId}
                  onChange={(event) => handleRelatedChange(event.target.value)}
                >
                  <option value="">
                    {isInventoryOptional
                      ? 'Sin proveedor — a elección'
                      : page === 'sales'
                        ? 'Sin vincular — escritura manual'
                        : 'Sin vincular — escritura manual'}
                  </option>
                  {options.map((item) => (
                    <option key={item.rowId ?? item.id} value={item.rowId ?? ''}>
                      {item.name} · {item.id}
                    </option>
                  ))}
                </select>
              </span>
              {!options.length ? (
                <small className="relation-hint">
                  <GoogleIcon name="person_add" className="small" />
                  Aún no hay {hasClientRelation ? 'clientes' : 'proveedores'} registrados. Escribe el nombre manualmente o crea primero el registro en su módulo.
                </small>
              ) : linkedTarget ? (
                <small className="relation-hint linked">
                  <GoogleIcon name="link" className="small" />
                  {page === 'inventory'
                    ? `Vinculado a ${linkedTarget.name} (${linkedTarget.id}) como proveedor habitual. El nombre del producto no cambia.`
                    : `Vinculado a ${linkedTarget.name} (${linkedTarget.id}). El nombre se completa solo; puedes cambiarlo si lo necesitas.`}
                </small>
              ) : (
                <small className="relation-hint">
                  <GoogleIcon name="link_off" className="small" />
                  {isInventoryOptional
                    ? 'A elección del usuario: puedes dejar el producto sin proveedor o elegir uno de la lista.'
                    : 'Opcional: elige de la lista para vincular, o deja sin vincular y escribe el nombre.'}
                </small>
              )}
            </div>
          )}
          <label>{meta.entityLabel}<input autoFocus name="name" required value={nameValue} onChange={(event) => setNameValue(event.target.value)} placeholder={meta.entityLabel} /></label>
          {page === 'sales' && (
            <div className="relation-field">
              <label htmlFor="doc_type">Tipo de comprobante</label>
              <span className="relation-control">
                <GoogleIcon name="receipt_long" />
                <select id="doc_type" value={docType} onChange={(event) => handleDocTypeChange(event.target.value as SaleDocType)}>
                  {SALE_DOC_TYPES.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                  <option value="Manual">Manual (escribir)</option>
                </select>
              </span>
              {docType !== 'Manual' ? (
                <>
                  <label htmlFor="doc_city">Ciudad / sede</label>
                  <span className="relation-control">
                    <GoogleIcon name="location_on" />
                    <select id="doc_city" value={SALE_CITIES.includes(docCity) ? docCity : 'Lima'} onChange={(event) => handleCityChange(event.target.value)}>
                      {SALE_CITIES.map((ciudad) => <option key={ciudad} value={ciudad}>{ciudad}</option>)}
                    </select>
                  </span>
                  <small className="relation-hint linked">
                    <GoogleIcon name="autorenew" className="small" />
                    Correlativo automático: se propone el siguiente número de la serie. Puedes editarlo abajo.
                  </small>
                </>
              ) : (
                <small className="relation-hint">
                  <GoogleIcon name="edit" className="small" />
                  Modo manual: escribe el comprobante libremente o elige un tipo para generarlo.
                </small>
              )}
            </div>
          )}
          {page === 'sales' ? (
            <label>{meta.detailLabel}<input name="detail" required value={detailValue} onChange={(event) => handleDetailInput(event.target.value)} placeholder={meta.detailLabel} /></label>
          ) : (
            <label>{meta.detailLabel}<input name="detail" required defaultValue={record?.detail} placeholder={meta.detailLabel} /></label>
          )}

          {hasDocumentLines ? (
            <div className="lines-section">
              <div className="lines-head">
                <span className="lines-title">
                  <GoogleIcon name={page === 'sales' ? 'shopping_cart' : 'factory'} className="small" />
                  {page === 'sales' ? 'Productos de la venta' : 'Productos del proveedor'}
                </span>
                <span className="lines-total">{money(linesTotal)}</span>
              </div>
              {page === 'sales' && (
                <div className="relation-field">
                  <label htmlFor="supplier_filter">Proveedor (filtro de productos)</label>
                  <span className="relation-control">
                    <GoogleIcon name="factory" />
                    <select
                      id="supplier_filter"
                      name="supplier_filter"
                      value={supplierFilter}
                      onChange={(event) => setSupplierFilter(event.target.value)}
                    >
                      <option value="">Elige un proveedor para ver sus productos</option>
                      <option value="all">Todos los proveedores</option>
                      {suppliers.map((item) => (
                        <option key={item.rowId ?? item.id} value={item.rowId ?? ''}>
                          {item.name} · {item.id}
                        </option>
                      ))}
                    </select>
                  </span>
                  {!suppliers.length ? (
                    <small className="relation-hint">
                      <GoogleIcon name="person_add" className="small" />
                      Aún no hay proveedores registrados. Créalo primero en su módulo o elige Todos para ver el inventario completo.
                    </small>
                  ) : !supplierFilter ? (
                    <small className="relation-hint">
                      <GoogleIcon name="filter_alt" className="small" />
                      Al seleccionar recién aparecerán aquí los productos relacionados a ese proveedor.
                    </small>
                  ) : supplierFilter === 'all' ? (
                    <small className="relation-hint">
                      <GoogleIcon name="inventory_2" className="small" />
                      Viendo todo el inventario. Elige un proveedor para filtrar solo sus productos.
                    </small>
                  ) : saleFilterHasRelated ? (
                    <small className="relation-hint linked">
                      <GoogleIcon name="link" className="small" />
                      Mostrando productos de {saleFilterName ?? 'este proveedor'}. Marca 1 o más: el precio es fijo del producto (se define en Inventario).
                    </small>
                  ) : (
                    <small className="relation-hint">
                      <GoogleIcon name="link_off" className="small" />
                      Este proveedor aún no tiene productos relacionados. Elige Todos o asigna el proveedor desde Inventario.
                    </small>
                  )}
                </div>
              )}
              <small className="relation-hint">
                <GoogleIcon name="info" className="small" />
                {page === 'sales'
                  ? 'La cantidad nunca supera el stock y el sin stock no se puede marcar. El total calcula el monto y descuenta stock.'
                  : relatedId
                    ? supplierHasRelated && !showAllProducts
                      ? 'Solo se listan los productos relacionados a este proveedor, con su precio fijo. Marca 1 o más: suma al total y aumenta stock.'
                      : 'Este proveedor aún no tiene productos relacionados: se muestran todos con su precio fijo. Márcalos para la compra.'
                    : 'Elige primero un proveedor para filtrar sus productos, o marca directamente de todo el inventario.'}
              </small>
              {page === 'purchases' && relatedId && (
                <label className="lines-toggle">
                  <input type="checkbox" checked={showAllProducts} onChange={(event) => setShowAllProducts(event.target.checked)} />
                  Mostrar todos los productos (no solo los del proveedor)
                </label>
              )}
              {linesLoading ? (
                <p className="relation-hint"><GoogleIcon name="progress_activity" className="small login-spin" /> Cargando líneas guardadas…</p>
              ) : !visibleProducts.length ? (
                page === 'sales' && !supplierFilter ? (
                  <p className="relation-hint"><GoogleIcon name="filter_alt" className="small" /> Elige un proveedor arriba y aquí aparecerán sus productos relacionados para seleccionar.</p>
                ) : page === 'sales' && supplierFilter !== 'all' && !saleFilterHasRelated ? (
                  <p className="relation-hint"><GoogleIcon name="link_off" className="small" /> Sin productos relacionados a este proveedor. Cambia el filtro o asigna productos a este proveedor desde Inventario.</p>
                ) : (
                  <p className="relation-hint"><GoogleIcon name="inventory_2" className="small" /> Aún no hay productos en inventario.</p>
                )
              ) : (
                <div className="lines-list">
                  {visibleProducts.map((product) => {
                    const uuid = product.rowId ?? ''
                    if (!uuid) return null
                    const draft = lines[uuid]
                    const checked = Boolean(draft?.selected)
                    const stock = product.quantity ?? 0
                    const suggested = product.precio
                    const noPrice = suggested === undefined || suggested === 0
                    const noStock = page === 'sales' && stock <= 0
                    const qty = draft?.qty ?? 1
                    const unit = draft?.price ?? 0
                    const overStock = page === 'sales' && checked && qty > stock
                    return (
                      <div key={uuid} className={`line-row${checked ? ' checked' : ''}${overStock ? ' over' : ''}`}>
                        <label className="line-check">
                          <input
                            type="checkbox"
                            name={`sel_${uuid}`}
                            checked={checked}
                            disabled={noStock && !checked}
                            title={noStock && !checked ? 'Sin stock disponible para vender' : `Seleccionar ${product.name}`}
                            onChange={() => toggleLine(uuid)}
                          />
                          <span className="line-copy">
                            <strong>{product.name}</strong>
                            <small>
                              {product.id} · {stock} und.
                              {suggested !== undefined ? ` · P. fijo ${money(suggested)}` : ' · Sin precio'}
                              {product.relatedName ? ` · ${product.relatedName}` : ''}
                            </small>
                            {noStock && <small className="line-warn"><GoogleIcon name="block" className="small" /> Sin stock: no se puede vender.</small>}
                            {checked && noPrice && <small className="line-warn"><GoogleIcon name="sell" className="small" /> Sin precio definido: no se puede guardar. Defínelo en Inventario.</small>}
                            {overStock && <small className="line-warn"><GoogleIcon name="warning" className="small" /> Máximo {stock} und. disponibles.</small>}
                          </span>
                        </label>
                        <label className="line-qty">Cant.
                          <input
                            type="number"
                            name={`qty_${uuid}`}
                            min={1}
                            max={page === 'sales' ? Math.max(1, stock) : undefined}
                            step={1}
                            value={draft?.qty ?? 1}
                            disabled={!checked}
                            onChange={(event) => {
                              const raw = Math.max(1, Math.floor(Number(event.target.value) || 1))
                              const capped = page === 'sales' ? Math.min(raw, Math.max(1, stock)) : raw
                              changeLine(uuid, { qty: capped })
                            }}
                          />
                        </label>
                        <label className="line-qty">P. unitario
                          <input
                            type="number"
                            name={`price_${uuid}`}
                            min={0}
                            step={0.01}
                            value={draft?.price ?? suggested ?? 0}
                            disabled={!checked}
                            readOnly
                            title="Precio fijo del producto: se define en Inventario y no se edita aquí"
                          />
                        </label>
                        <span className="line-subtotal" title={checked ? `${money(unit)} × ${qty} = ${money(qty * unit)}` : 'Marca el producto para sumar'}>
                          <small>{checked ? `${money(unit)} × ${qty}` : '—'}</small>
                          <strong>{money((draft?.qty ?? 0) * (draft?.price ?? 0))}</strong>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {(() => {
                const totalUnits = selectedLines.reduce((sum, line) => sum + line.qty, 0)
                return (
                  <div className="lines-summary">
                    <span className="lines-summary-title"><GoogleIcon name="receipt_long" className="small" /> Resumen</span>
                    <span>{selectedLines.length} {selectedLines.length === 1 ? 'producto' : 'productos'} · {totalUnits} und.</span>
                    <strong>Total {money(linesTotal)}</strong>
                  </div>
                )
              })()}
              <p className="relation-hint">
                <GoogleIcon name="payments" className="small" />
                {selectedLines.length
                  ? page === 'sales'
                    ? 'La cantidad nunca supera el stock. Al guardar descuenta stock y genera cuenta por cobrar si no está completada.'
                    : 'La compra se sigue por estados: el stock entra al inventario solo al marcar Completada. Genera cuenta por pagar si no está completada.'
                  : 'Sin productos marcados: se guardará solo la cabecera con el monto manual (si lo indicas abajo).'}
              </p>
              {!selectedLines.length && (
                <label>{meta.amountLabel}<input name="amount" min="0" step="0.01" type="number" defaultValue={record?.amount} placeholder="0.00" /></label>
              )}
            </div>
          ) : (
            <>
              {meta.kind === 'money' && <label>{meta.amountLabel}<input name="amount" min="0" step="0.01" type="number" defaultValue={record?.amount} placeholder="0.00" /></label>}
              {meta.kind === 'stock' && (
                <>
                  <label>Unidades iniciales<input name="quantity" min="0" step="1" type="number" defaultValue={record?.quantity} placeholder="0" /></label>
                  {page === 'inventory' && (
                    <>
                      <label>Precio de venta (S/)<input name="precio" min="0" step="0.01" type="number" required defaultValue={record?.precio ?? ''} placeholder="0.00" /></label>
                      <small className="relation-hint">
                        <GoogleIcon name="payments" className="small" />
                        {record?.precio !== undefined
                          ? `Precio actual: ${money(record.precio)}. Se usará fijo en ventas y compras (no editable por línea).`
                          : 'Define el precio aquí. Si lo dejas vacío se guarda en 0 y lo defines después editando el producto.'}
                      </small>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <label>Estado
            <select name="status" value={statusValue} onChange={(event) => setStatusValue(event.target.value as RecordStatus)}>
              {statusesForPage(page).map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          {page === 'purchases' && (() => {
            const stepIndex = Math.max(0, PURCHASE_FLOW.findIndex((step) => step.status === statusValue))
            const wasCompleted = record?.status === 'Completada'
            const becomesCompleted = statusValue === 'Completada'
            const pendingUnits = selectedLines.reduce((sum, line) => sum + line.qty, 0)
            const unitsLabel = `${pendingUnits} und.`
            return (
              <div className="tracking-section">
                <span className="lines-title"><GoogleIcon name="package_2" className="small" /> Seguimiento de la compra</span>
                <div className="tracking-steps">
                  {PURCHASE_FLOW.map((step, index) => (
                    <button
                      key={step.status}
                      type="button"
                      className={`tracking-step${index < stepIndex ? ' done' : ''}${index === stepIndex ? ' current' : ''}`}
                      onClick={() => setStatusValue(step.status as RecordStatus)}
                      title={`Marcar como ${step.status}`}
                    >
                      <GoogleIcon name={step.icon} className="small" />
                      <span>{step.status}</span>
                    </button>
                  ))}
                </div>
                {stepIndex < PURCHASE_FLOW.length - 1 ? (
                  <button
                    type="button"
                    className="tracking-advance"
                    onClick={() => setStatusValue(PURCHASE_FLOW[stepIndex + 1].status as RecordStatus)}
                  >
                    <GoogleIcon name="arrow_forward" className="small" /> Avanzar a {PURCHASE_FLOW[stepIndex + 1].status}
                  </button>
                ) : (
                  <small className="relation-hint linked">
                    <GoogleIcon name="check_circle" className="small" /> Compra completada: lo comprado ya está en el inventario.
                  </small>
                )}
                {selectedLines.length > 0 ? (
                  !wasCompleted && !becomesCompleted ? (
                    <small className="relation-hint">
                      <GoogleIcon name="hourglass_top" className="small" /> {unitsLabel} pendientes de ingreso: entrarán al inventario al marcar Completada. Mientras tanto la compra se sigue por estados.
                    </small>
                  ) : !wasCompleted && becomesCompleted ? (
                    <small className="relation-hint linked">
                      <GoogleIcon name="add_box" className="small" /> Al guardar ingresan {unitsLabel} al inventario.
                    </small>
                  ) : wasCompleted && !becomesCompleted ? (
                    <small className="relation-hint">
                      <GoogleIcon name="warning" className="small" /> Al guardar se retiran {unitsLabel} del inventario (revierte el ingreso). Solo es posible si hay stock suficiente.
                    </small>
                  ) : (
                    <small className="relation-hint">
                      <GoogleIcon name="sync" className="small" /> Compra completada: al guardar se ajusta la diferencia de unidades en el inventario.
                    </small>
                  )
                ) : (
                  <small className="relation-hint">
                    <GoogleIcon name="info" className="small" /> Sin productos marcados el stock no se mueve: marca productos arriba para controlar el ingreso.
                  </small>
                )}
              </div>
            )
          })()}
        </div>
        <div className="modal-actions"><button className="cancel-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? <GoogleIcon name="progress_activity" className="login-spin" /> : <GoogleIcon name="check" />} {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar y sincronizar'}</button></div>
      </form>
    </div>
  )
}
