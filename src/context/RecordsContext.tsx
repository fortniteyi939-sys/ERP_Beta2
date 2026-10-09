import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { pageMeta } from '../data/catalog'
import { defaultStatus, escapeCell, isStockAlert } from '../data/helpers'
import { convertQuoteToSale, deleteRecord, emptyRecords, enrichCatalog, fetchAllRecords, fetchDocumentLines, fetchSupplierCatalogRaw, friendlyError, insertPurchaseWithLines, insertQuoteWithLines, insertRecord, insertSaleWithLines, isMissingTableError, updatePurchaseWithLines, updateQuoteWithLines, updateRecord, updateSaleWithLines, updateStatuses, type LineInput } from '../services/records'
import { useAuth } from './AuthContext'
import type { DataPage, ExportFormat, PendingDelete, RecordItem, RecordModalState, RecordStatus } from '../types'

type RecordsContextValue = {
  records: Record<DataPage, RecordItem[]>
  /** Catálogo de productos por proveedor (independiente de mi inventario). */
  catalog: RecordItem[]
  loading: boolean
  saving: boolean
  reload: () => Promise<void>
  toast: string
  notify: (message: string) => void
  recordModal: RecordModalState | null
  openComposer: (page: DataPage) => void
  openEditor: (page: DataPage, record: RecordItem) => void
  closeRecordModal: () => void
  saveRecord: (page: DataPage, record: RecordItem | null, event: FormEvent<HTMLFormElement>) => Promise<void>
  convertQuote: (code: string) => Promise<void>
  pendingDelete: PendingDelete | null
  requestDelete: (page: DataPage, record: RecordItem) => void
  cancelDelete: () => void
  confirmDelete: () => Promise<void>
  resolveStockAlerts: () => Promise<void>
  exportTable: (page: DataPage, format: ExportFormat) => void
}

const RecordsContext = createContext<RecordsContextValue | null>(null)

export function RecordsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [records, setRecords] = useState<Record<DataPage, RecordItem[]>>(emptyRecords)
  const [catalog, setCatalog] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recordModal, setRecordModal] = useState<RecordModalState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const notify = (message: string) => {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }

  // Carga todos los módulos + catálogo de proveedores cada vez que entra una persona.
  const loadAll = useCallback(async () => {
    const base = await fetchAllRecords()
    // El catálogo puede faltar si su migración aún no se ejecutó: no rompe lo demás.
    const raw = await fetchSupplierCatalogRaw().catch((error) => {
      if (isMissingTableError(error)) {
        notify('Falta la tabla del catálogo de proveedores. Ejecuta en Supabase la migración 20261013000000_catalogo_proveedores.sql y recarga.')
      } else {
        notify(friendlyError(error))
      }
      return null
    })
    return { base, catalog: raw ? enrichCatalog(raw, base.inventory) : [] as RecordItem[] }
  }, [])

  const reload = useCallback(async () => {
    if (!userId) return
    try {
      const { base, catalog: next } = await loadAll()
      setRecords(base)
      setCatalog(next)
    } catch (error) {
      notify(friendlyError(error))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadAll])

  useEffect(() => {
    if (!userId) {
      setRecords(emptyRecords())
      setCatalog([])
      setLoading(false)
      return
    }
    let active = true
    setRecords(emptyRecords())
    setCatalog([])
    setLoading(true)
    loadAll()
      .then(({ base, catalog: next }) => {
        if (!active) return
        setRecords(base)
        setCatalog(next)
      })
      .catch((error) => active && notify(friendlyError(error)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadAll])

  // Si otra persona cambió datos mientras la pestaña estaba en segundo plano, se actualiza al volver.
  useEffect(() => {
    if (!userId) return
    const refresh = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [userId, reload])

  const openComposer = (page: DataPage) => setRecordModal({ page, record: null })
  const openEditor = (page: DataPage, record: RecordItem) => setRecordModal({ page, record })
  const closeRecordModal = () => setRecordModal(null)

  const saveRecord = async (page: DataPage, record: RecordItem | null, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const meta = pageMeta[page]
    const amountInput = String(form.get('amount') ?? '')
    const quantityInput = String(form.get('quantity') ?? '')
    const amount = Number(amountInput)
    const quantity = Number(quantityInput)
    const rawRelated = String(form.get('related_id') ?? '')
    // '' = sin vínculo (opcional). UUID = vínculo a cliente/proveedor registrado.
    // undefined = el módulo no tiene relación (no se envía la columna).
    const relatedId: string | null | undefined =
      page === 'sales' || page === 'purchases' || page === 'quotes'
        ? (rawRelated ? rawRelated : null)
        : undefined
    let name = String(form.get('name') ?? '').trim()
    const detail = String(form.get('detail') ?? '').trim()
    const selectedStatus = String(form.get('status') ?? defaultStatus(page)) as RecordStatus
    const savedAmount = meta.kind === 'money' && amountInput !== '' && Number.isFinite(amount) && amount >= 0 ? amount : record?.amount
    const savedQuantity = meta.kind === 'stock' && quantityInput !== '' && Number.isFinite(quantity) && quantity >= 0 ? Math.floor(quantity) : record?.quantity
    // Precio del producto (inventario). Si viene vacío se conserva el anterior; si no hay anterior, queda undefined (no toca la columna).
    const precioInput = String(form.get('precio') ?? '')
    const precioNumber = Number(precioInput)
    const savedPrecio = page === 'inventory' && precioInput !== '' && Number.isFinite(precioNumber) && precioNumber >= 0
      ? Math.round(precioNumber * 100) / 100
      : record?.precio
    // Fecha límite de la compra: la define el comprador al crear la solicitud.
    // Vacío = sin fecha (en edición conserva la anterior).
    const fechaInput = String(form.get('fecha_limite') ?? '')
    let savedFechaLimite = record?.fechaLimite
    if (page === 'purchases' && fechaInput !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInput)) {
        notify('La fecha límite no es válida.')
        return
      }
      savedFechaLimite = fechaInput
    }
    // RUC del proveedor: 11 dígitos obligatorios (identifica la empresa en cada orden).
    const rucDigits = String(form.get('ruc') ?? '').replace(/\D/g, '')
    if (page === 'suppliers' && !/^\d{11}$/.test(rucDigits)) {
      notify('El RUC del proveedor debe tener 11 dígitos.')
      return
    }
    // Si se eligió un cliente/proveedor registrado, el nombre se hereda de ese
    // registro para que cliente_nombre/proveedor_nombre y la FK queden coherentes.
    // El trigger vincular_cliente/vincular_proveedor queda como respaldo.
    if (relatedId) {
      if (page === 'sales' || page === 'quotes') {
        const target = records.customers.find((item) => item.rowId === relatedId)
        if (target) name = target.name
      } else if (page === 'purchases') {
        const target = records.suppliers.find((item) => item.rowId === relatedId)
        if (target) name = target.name
      }
    }
    // Líneas: ventas/cotizaciones eligen de MI inventario; compras del CATÁLOGO
    // del proveedor (independiente). Inputs qty_<uuid> + price_<uuid> con sel_<uuid>.
    const lines: LineInput[] = []
    const parseLines = (source: RecordItem[], priceHint: string) => {
      for (const product of source) {
        const uuid = product.rowId
        if (!uuid) continue
        if (!form.get(`sel_${uuid}`)) continue
        const qty = Math.floor(Number(String(form.get(`qty_${uuid}`) ?? '')))
        const price = Number(String(form.get(`price_${uuid}`) ?? ''))
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Cantidad inválida para ${product.name}.`)
        if (!Number.isFinite(price) || price <= 0) throw new Error(`"${product.name}" no tiene precio definido. ${priceHint}`)
        lines.push({ producto_id: uuid, cantidad: qty, precio: price })
      }
    }
    try {
      if (page === 'sales' || page === 'quotes') {
        parseLines(records.inventory, 'Defínelo en Inventario antes de guardar.')
      } else if (page === 'purchases') {
        parseLines(catalog, 'Defínelo en el catálogo del proveedor antes de guardar.')
      }
    } catch (error) {
      notify(friendlyError(error))
      return
    }
    const input = {
      name,
      detail,
      status: selectedStatus,
      ...(meta.kind === 'money' && savedAmount !== undefined ? { amount: savedAmount } : {}),
      ...(meta.kind === 'stock' && savedQuantity !== undefined ? { quantity: savedQuantity } : {}),
      ...(page === 'inventory' && savedPrecio !== undefined ? { precio: savedPrecio } : {}),
      ...(page === 'purchases' && savedFechaLimite !== undefined ? { fecha_limite: savedFechaLimite } : {}),
      ...(page === 'suppliers' ? { ruc: rucDigits } : {}),
      ...((page === 'sales' || page === 'quotes') && relatedId !== undefined ? { cliente_id: relatedId } : {}),
      ...(page === 'purchases' && relatedId !== undefined ? { proveedor_id: relatedId } : {}),
    }
    // Si hay líneas, el total manda sobre el monto manual.
    if (lines.length) {
      const total = lines.reduce((sum, line) => sum + line.cantidad * line.precio, 0)
      ;(input as { amount?: number }).amount = total
    }

    setSaving(true)
    try {
      let saved: RecordItem
      if (page === 'sales' && (lines.length || record)) {
        // En ventas siempre se usa la ruta con líneas para recalcular stock/cobranza.
        // Si se edita sin marcar líneas, se conservan las anteriores.
        if (!lines.length && record?.rowId) {
          const previous = await fetchDocumentLines('sales', record.rowId)
          const previousInput: LineInput[] = previous.map((line) => ({ producto_id: line.producto_id, cantidad: line.cantidad, precio: line.precio }))
          saved = record
            ? await updateSaleWithLines(record.id, input, previousInput)
            : await insertSaleWithLines(input, [])
        } else {
          saved = record
            ? await updateSaleWithLines(record.id, input, lines)
            : await insertSaleWithLines(input, lines)
        }
      } else if (page === 'quotes' && (lines.length || record)) {
        if (!lines.length && record?.rowId) {
          const previous = await fetchDocumentLines('quotes', record.rowId)
          const previousInput: LineInput[] = previous.map((line) => ({ producto_id: line.producto_id, cantidad: line.cantidad, precio: line.precio }))
          saved = record
            ? await updateQuoteWithLines(record.id, input, previousInput)
            : await insertQuoteWithLines(input, [])
        } else {
          saved = record
            ? await updateQuoteWithLines(record.id, input, lines)
            : await insertQuoteWithLines(input, lines)
        }
      } else if (page === 'purchases' && (lines.length || record)) {
        if (!lines.length && record?.rowId) {
          const previous = await fetchDocumentLines('purchases', record.rowId)
          const previousInput: LineInput[] = previous.map((line) => ({ producto_id: line.producto_id, cantidad: line.cantidad, precio: line.precio }))
          saved = record
            ? await updatePurchaseWithLines(record.id, input, previousInput)
            : await insertPurchaseWithLines(input, [])
        } else {
          saved = record
            ? await updatePurchaseWithLines(record.id, input, lines)
            : await insertPurchaseWithLines(input, lines)
        }
      } else {
        saved = record ? await updateRecord(page, record.id, input) : await insertRecord(page, input)
      }
      // Ventas/compras/cotizaciones mueven inventario o generan CxC/CxP: recarga todo para verlo.
      if (page === 'sales' || page === 'purchases' || page === 'inventory' || page === 'quotes') {
        try {
          setRecords(await fetchAllRecords())
        } catch {
          setRecords((current) => ({
            ...current,
            [page]: record ? current[page].map((currentRecord) => currentRecord.id === record.id ? saved : currentRecord) : [saved, ...current[page]],
          }))
        }
      } else {
        setRecords((current) => ({
          ...current,
          [page]: record ? current[page].map((currentRecord) => currentRecord.id === record.id ? saved : currentRecord) : [saved, ...current[page]],
        }))
      }
      setRecordModal(null)
      const linesNote = lines.length ? ` (${lines.length} ${lines.length === 1 ? 'producto' : 'productos'}, stock y cobranza actualizados)` : ''
      // Si la BD aún no tiene las columnas nuevas, el guardado las descarta en
      // silencio (push-safety): se avisa para que se ejecuten las migraciones.
      let migrationNote = ''
      if (page === 'inventory') {
        const wantedPrecio = (input as { precio?: number }).precio !== undefined
        if (wantedPrecio && saved.precio === undefined) {
          migrationNote = ' Sin precio: falta ejecutar la migración 20261011000000_producto_precio.sql en Supabase.'
        }
      } else if (page === 'suppliers' && saved.ruc === undefined) {
        migrationNote = ' Sin RUC: falta ejecutar la migración 20261015000000_proveedor_ruc.sql en Supabase.'
      }
      notify(record ? `${meta.title}: registro actualizado${linesNote}.${migrationNote}` : `${meta.title}: registro guardado en la base de datos${linesNote}.${migrationNote}`)
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setSaving(false)
    }
  }

  const requestDelete = (page: DataPage, record: RecordItem) => setPendingDelete({ page, record })
  const cancelDelete = () => setPendingDelete(null)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const { page, record } = pendingDelete
    try {
      await deleteRecord(page, record.id)
      setRecords((current) => ({ ...current, [page]: current[page].filter((item) => item.id !== record.id) }))
      notify(`${pageMeta[page].title}: registro eliminado.`)
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setPendingDelete(null)
    }
  }

  const convertQuote = async (code: string) => {
    if (saving) return
    setSaving(true)
    try {
      const { sale } = await convertQuoteToSale(code)
      try {
        setRecords(await fetchAllRecords())
      } catch {
        // Si la recarga falla, la próxima visita o foco la reintenta.
      }
      notify(`Cotización ${code} convertida en venta ${sale.id}. Stock y cobranza actualizados.`)
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setSaving(false)
    }
  }

  const resolveStockAlerts = async () => {
    const stockAlerts = records.inventory.filter(isStockAlert)
    if (!stockAlerts.length) {
      notify('No hay alertas de stock pendientes.')
      return
    }
    try {
      const updated = await updateStatuses('inventory', stockAlerts.map((item) => item.id), 'Estable')
      const byId = new Map(updated.map((item) => [item.id, item]))
      setRecords((current) => ({ ...current, inventory: current.inventory.map((item) => byId.get(item.id) ?? item) }))
      notify('Las alertas de inventario se marcaron como revisadas.')
    } catch (error) {
      notify(friendlyError(error))
    }
  }

  const downloadBlob = (file: Blob, filename: string) => {
    const href = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = href
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 0)
  }

  const exportTable = (page: DataPage, format: ExportFormat) => {
    const title = pageMeta[page].title
    const baseName = `${title.toLocaleLowerCase()}-enterprisecloud`
    const header = ['Referencia', 'Nombre', 'Detalle', 'Fecha', 'Valor', 'Estado']
    const rows = records[page].map((item) => [
      item.id,
      item.name,
      item.detail,
      item.date,
      page === 'inventory' ? `${item.quantity ?? 0} unidades` : item.amount ? String(item.amount) : '',
      item.status,
    ])

    if (format === 'csv') {
      const csv = [header, ...rows]
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
        .join('\n')
      downloadBlob(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `${baseName}.csv`)
      notify(`Exportación de ${title.toLocaleLowerCase()} en CSV preparada.`)
      return
    }

    if (format === 'excel') {
      const table = `<table><thead><tr>${header.map((cell) => `<th>${escapeCell(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      const workbook = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" /></head><body>${table}</body></html>`
      downloadBlob(new Blob([`\ufeff${workbook}`], { type: 'application/vnd.ms-excel' }), `${baseName}.xls`)
      notify(`Exportación de ${title.toLocaleLowerCase()} en Excel preparada.`)
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      notify('El navegador bloqueó la ventana de impresión.')
      return
    }
    printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>${escapeCell(title)} · EnterpriseCloud</title><style>body{font-family:Arial,sans-serif;color:#111}h1{font-size:20px;margin:0 0 4px}p{color:#555;font-size:12px;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border:1px solid #999;text-align:left}th{background:#eee}</style></head><body><h1>${escapeCell(title)} · EnterpriseCloud</h1><p>${rows.length} registros · Generado desde el panel</p><table><thead><tr>${header.map((cell) => `<th>${escapeCell(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`)
    printWindow.document.close()
    notify(`Exportación de ${title.toLocaleLowerCase()} en PDF preparada.`)
  }

  const value: RecordsContextValue = {
    records,
    catalog,
    loading,
    saving,
    reload,
    toast,
    notify,
    recordModal,
    openComposer,
    openEditor,
    closeRecordModal,
    saveRecord,
    convertQuote,
    pendingDelete,
    requestDelete,
    cancelDelete,
    confirmDelete,
    resolveStockAlerts,
    exportTable,
  }

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>
}

export function useRecords() {
  const context = useContext(RecordsContext)
  if (!context) throw new Error('useRecords debe usarse dentro de RecordsProvider')
  return context
}
