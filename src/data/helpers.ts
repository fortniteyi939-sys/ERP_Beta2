import type { DataPage, RecordItem, RecordStatus, Theme } from '../types'

export const THEME_STORAGE_KEY = 'enterprisecloud-theme'

export function loadTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

// Fecha legible a partir de una marca de tiempo de la base de datos.
export function formatWhen(iso: string, now = new Date()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes} min`
  const time = date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000)
  if (days === 0) return `Hoy, ${time}`
  if (days === 1) return `Ayer, ${time}`
  return date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function money(value = 0) {
  return new Intl.NumberFormat('es-PE', {
    currency: 'PEN',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)
}

export function statusTone(status: RecordStatus) {
  if (status === 'Crítico' || status === 'Rechazada') return 'red'
  if (status === 'Pendiente' || status === 'Bajo stock' || status === 'Vencida' || status === 'Solicitud' || status === 'Factura') return 'amber'
  if (status === 'En curso' || status === 'En tránsito' || status === 'Orden' || status === 'Recepción') return 'blue'
  return 'green'
}

/** IGV del Perú para compras: subtotal sin impuesto + 18%. */
export const IGV_RATE = 0.18
export function igvOf(subtotal: number) {
  return Math.round(subtotal * IGV_RATE * 100) / 100
}
export function totalWithIgv(subtotal: number) {
  return Math.round(subtotal * (1 + IGV_RATE) * 100) / 100
}

/** Fases de compra que ya tienen la mercadería en almacén. */
export function purchaseHasStock(status: string) {
  return status === 'Recepción' || status === 'Factura' || status === 'Pagada'
}

export function defaultStatus(page: DataPage): RecordStatus {
  if (page === 'inventory') return 'Estable'
  if (page === 'documents' || page === 'reports') return 'Vigente'
  if (page === 'customers' || page === 'suppliers' || page === 'settings') return 'Activo'
  if (page === 'purchases') return 'En curso'
  return 'Pendiente'
}

export function statusesForPage(page: DataPage): RecordStatus[] {
  if (page === 'purchases') return ['Solicitud', 'Orden', 'Recepción', 'Factura', 'Pagada']
  if (page === 'quotes') return ['Pendiente', 'En curso', 'Aprobada', 'Rechazada', 'Vencida', 'Completada']
  if (page === 'inventory') return ['Estable', 'Bajo stock', 'Crítico']
  if (page === 'documents' || page === 'reports') return ['Vigente']
  if (page === 'customers' || page === 'suppliers' || page === 'settings') return ['Activo', 'En curso']
  return ['Pendiente', 'En curso', 'Completada']
}

export function isStockAlert(item: RecordItem) {
  return item.status === 'Crítico' || item.status === 'Bajo stock'
}

export function escapeCell(value: string) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
