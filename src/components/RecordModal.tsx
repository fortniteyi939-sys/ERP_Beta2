import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { pageMeta } from '../data/catalog'
import { defaultStatus, money, statusesForPage } from '../data/helpers'
import { useRecords } from '../context/RecordsContext'
import { fetchDocumentLines } from '../services/records'
import type { DataPage, DocumentLine, RecordItem } from '../types'

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
  const [lines, setLines] = useState<Record<string, LineDraft>>({})
  const [linesLoading, setLinesLoading] = useState(false)
  const [showAllProducts, setShowAllProducts] = useState(false)

  const customers = records.customers
  const suppliers = records.suppliers
  const inventory = records.inventory
  const options = hasClientRelation ? customers : hasSupplierRelation ? suppliers : []

  const linkedTarget = relatedId ? options.find((item) => item.rowId === relatedId) : undefined

  const handleRelatedChange = (value: string) => {
    setRelatedId(value)
    if (!value) return
    const target = options.find((item) => item.rowId === value)
    if (target) setNameValue(target.name)
  }

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
  const supplierProducts = useMemo(() => {
    if (page !== 'purchases' || !relatedId || showAllProducts) return inventory
    const related = inventory.filter((item) => item.proveedor_id === relatedId)
    return related.length ? related : inventory
  }, [page, relatedId, showAllProducts, inventory])

  const visibleProducts = page === 'purchases' ? supplierProducts : inventory
  const supplierHasRelated = page === 'purchases' && relatedId
    ? inventory.some((item) => item.proveedor_id === relatedId)
    : true

  const toggleLine = (uuid: string) => {
    // Al marcar, el precio sugerido es el del producto (si lo tiene definido);
    // el usuario puede ajustarlo por línea en caso no tenga o cambie.
    const product = inventory.find((item) => item.rowId === uuid)
    const suggested = product?.precio ?? 0
    setLines((current) => ({
      ...current,
      [uuid]: current[uuid]?.selected
        ? { ...current[uuid], selected: false }
        : { selected: true, qty: current[uuid]?.qty ?? 1, price: current[uuid]?.price ?? suggested },
    }))
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
                  Vinculado a {linkedTarget.name} ({linkedTarget.id}). El nombre se completa solo; puedes cambiarlo si lo necesitas.
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
          <label>{meta.detailLabel}<input name="detail" required defaultValue={record?.detail} placeholder={meta.detailLabel} /></label>

          {hasDocumentLines ? (
            <div className="lines-section">
              <div className="lines-head">
                <span className="lines-title">
                  <GoogleIcon name={page === 'sales' ? 'shopping_cart' : 'factory'} className="small" />
                  {page === 'sales' ? 'Productos de la venta' : 'Productos del proveedor'}
                </span>
                <span className="lines-total">{money(linesTotal)}</span>
              </div>
              <small className="relation-hint">
                <GoogleIcon name="info" className="small" />
                {page === 'sales'
                  ? 'Marca 1 o más productos: el precio viene sugerido del producto y puedes ajustarlo por línea. El total calcula el monto y descuenta stock.'
                  : relatedId
                    ? supplierHasRelated && !showAllProducts
                      ? 'Solo se listan los productos relacionados a este proveedor, con su costo sugerido. Marca 1 o más: suma al total y aumenta stock.'
                      : 'Este proveedor aún no tiene productos relacionados: se muestran todos con su precio sugerido. Márcalos para la compra.'
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
                <p className="relation-hint"><GoogleIcon name="inventory_2" className="small" /> Aún no hay productos en inventario.</p>
              ) : (
                <div className="lines-list">
                  {visibleProducts.map((product) => {
                    const uuid = product.rowId ?? ''
                    if (!uuid) return null
                    const draft = lines[uuid]
                    const checked = Boolean(draft?.selected)
                    const stock = product.quantity ?? 0
                    const suggested = product.precio
                    return (
                      <div key={uuid} className={`line-row${checked ? ' checked' : ''}`}>
                        <label className="line-check">
                          <input type="checkbox" name={`sel_${uuid}`} checked={checked} onChange={() => toggleLine(uuid)} />
                          <span className="line-copy">
                            <strong>{product.name}</strong>
                            <small>{product.id} · {stock} und.{suggested !== undefined ? ` · ${money(suggested)}` : ''}{product.relatedName ? ` · ${product.relatedName}` : ''}</small>
                          </span>
                        </label>
                        <label className="line-qty">Cant.
                          <input
                            type="number"
                            name={`qty_${uuid}`}
                            min={1}
                            step={1}
                            value={draft?.qty ?? 1}
                            disabled={!checked}
                            onChange={(event) => changeLine(uuid, { qty: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                          />
                        </label>
                        <label className="line-qty">{page === 'sales' ? 'Precio' : 'Costo'}
                          <input
                            type="number"
                            name={`price_${uuid}`}
                            min={0}
                            step={0.01}
                            value={draft?.price ?? 0}
                            disabled={!checked}
                            onChange={(event) => changeLine(uuid, { price: Math.max(0, Number(event.target.value) || 0) })}
                          />
                        </label>
                        <span className="line-subtotal">{money((draft?.qty ?? 0) * (draft?.price ?? 0))}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="relation-hint">
                <GoogleIcon name="payments" className="small" />
                {selectedLines.length
                  ? `${selectedLines.length} ${selectedLines.length === 1 ? 'producto' : 'productos'} · Total ${money(linesTotal)} · ${page === 'sales' ? 'Descuenta stock y genera cuenta por cobrar si no está completada.' : 'Suma stock y genera cuenta por pagar si no está completada.'}`
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
                          ? `Precio actual: ${money(record.precio)}. Se sugerirá en cada venta y puedes ajustarlo por línea.`
                          : 'Define el precio aquí. Si lo dejas vacío se guarda en 0 y lo defines después editando el producto.'}
                      </small>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <label>Estado<select name="status" defaultValue={record?.status ?? defaultStatus(page)}>{statusesForPage(page).map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        <div className="modal-actions"><button className="cancel-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? <GoogleIcon name="progress_activity" className="login-spin" /> : <GoogleIcon name="check" />} {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar y sincronizar'}</button></div>
      </form>
    </div>
  )
}
