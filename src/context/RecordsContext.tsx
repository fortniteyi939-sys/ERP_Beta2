import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { pageMeta } from '../data/catalog'
import { defaultStatus, escapeCell, isStockAlert } from '../data/helpers'
import { deleteRecord, emptyRecords, fetchAllRecords, friendlyError, insertRecord, updateRecord, updateStatuses } from '../services/records'
import { useAuth } from './AuthContext'
import type { DataPage, ExportFormat, PendingDelete, RecordItem, RecordModalState, RecordStatus } from '../types'

type RecordsContextValue = {
  records: Record<DataPage, RecordItem[]>
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

  // Carga todos los módulos desde Supabase cada vez que entra una persona.
  const reload = useCallback(async () => {
    if (!userId) return
    try {
      setRecords(await fetchAllRecords())
    } catch (error) {
      notify(friendlyError(error))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setRecords(emptyRecords())
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    fetchAllRecords()
      .then((data) => active && setRecords(data))
      .catch((error) => active && notify(friendlyError(error)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

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
    const name = String(form.get('name') ?? '').trim()
    const detail = String(form.get('detail') ?? '').trim()
    const selectedStatus = String(form.get('status') ?? defaultStatus(page)) as RecordStatus
    const savedAmount = meta.kind === 'money' && amountInput !== '' && Number.isFinite(amount) && amount >= 0 ? amount : record?.amount
    const savedQuantity = meta.kind === 'stock' && quantityInput !== '' && Number.isFinite(quantity) && quantity >= 0 ? Math.floor(quantity) : record?.quantity
    const input = {
      name,
      detail,
      status: selectedStatus,
      ...(meta.kind === 'money' && savedAmount !== undefined ? { amount: savedAmount } : {}),
      ...(meta.kind === 'stock' && savedQuantity !== undefined ? { quantity: savedQuantity } : {}),
    }

    setSaving(true)
    try {
      const saved = record ? await updateRecord(page, record.id, input) : await insertRecord(page, input)
      setRecords((current) => ({
        ...current,
        [page]: record ? current[page].map((currentRecord) => currentRecord.id === record.id ? saved : currentRecord) : [saved, ...current[page]],
      }))
      setRecordModal(null)
      notify(record ? `${meta.title}: registro actualizado.` : `${meta.title}: registro guardado en la base de datos.`)
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
