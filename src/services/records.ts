import { requireSupabase } from '../lib/supabase'
import { DATA_PAGES } from '../data/catalog'
import { formatWhen } from '../data/helpers'
import type { DataPage, RecordItem, RecordStatus } from '../types'

type Row = Record<string, unknown>

// Datos que captura el formulario (RecordModal).
export type RecordInput = {
  name: string
  detail: string
  status: RecordStatus
  amount?: number
  quantity?: number
}

// Cómo cada módulo de la interfaz se corresponde con una tabla de Supabase.
type PageConfig = {
  table: string
  name: string      // columna que guarda el "nombre" principal
  amount?: string   // columna monetaria (si el módulo tiene valor)
  quantity?: string // columna de existencias (inventario)
}

export const pageConfig: Record<DataPage, PageConfig> = {
  sales: { table: 'ventas', name: 'cliente_nombre', amount: 'monto' },
  purchases: { table: 'compras', name: 'proveedor_nombre', amount: 'monto' },
  inventory: { table: 'productos', name: 'nombre', quantity: 'stock' },
  customers: { table: 'clientes', name: 'razon_social', amount: 'linea_credito' },
  suppliers: { table: 'proveedores', name: 'razon_social', amount: 'linea_credito' },
  finance: { table: 'pagos', name: 'contraparte', amount: 'monto' },
  documents: { table: 'documentos', name: 'nombre_archivo' },
  reports: { table: 'reportes', name: 'nombre' },
  settings: { table: 'configuracion', name: 'nombre' },
}

export function emptyRecords(): Record<DataPage, RecordItem[]> {
  return Object.fromEntries(DATA_PAGES.map((page) => [page, [] as RecordItem[]])) as Record<DataPage, RecordItem[]>
}

function dueLabel(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return `Vence el ${date.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}`
}

function toRecord(page: DataPage, row: Row): RecordItem {
  const config = pageConfig[page]
  const createdAt = String(row.created_at ?? '')
  let date = formatWhen(String(row.updated_at ?? createdAt))
  if (page === 'finance' && typeof row.fecha_vencimiento === 'string') date = dueLabel(row.fecha_vencimiento)
  if (page === 'customers' && createdAt) date = `Cliente desde ${new Date(createdAt).getFullYear()}`

  const item: RecordItem = {
    id: String(row.codigo),
    name: String(row[config.name] ?? ''),
    detail: String(row.detalle ?? ''),
    date,
    status: String(row.estado) as RecordStatus,
  }
  if (config.amount && row[config.amount] !== null && row[config.amount] !== undefined) item.amount = Number(row[config.amount])
  if (config.quantity && row[config.quantity] !== null && row[config.quantity] !== undefined) item.quantity = Number(row[config.quantity])
  return item
}

function toRow(page: DataPage, input: RecordInput): Row {
  const config = pageConfig[page]
  const row: Row = { [config.name]: input.name, detalle: input.detail, estado: input.status }
  if (config.amount && input.amount !== undefined) row[config.amount] = input.amount
  if (config.quantity && input.quantity !== undefined) row[config.quantity] = input.quantity
  return row
}

// Traduce los errores de Postgres/PostgREST a mensajes comprensibles.
export function friendlyError(error: unknown): string {
  const err = error as { code?: string; message?: string } | null
  if (err?.code === '42501' || err?.code === 'PGRST116') return 'Tu rol no tiene permiso para realizar esta acción.'
  if (err?.code === '23505') return 'Ya existe un registro con esos datos.'
  if (err?.code === '23514') return 'Alguno de los valores no es válido (revisa montos y estado).'
  if (err?.message && /fetch|network/i.test(err.message)) return 'No se pudo conectar con la base de datos. Revisa tu conexión.'
  return err?.message || 'Ocurrió un error inesperado con la base de datos.'
}

export async function fetchAllRecords(): Promise<Record<DataPage, RecordItem[]>> {
  const client = requireSupabase()
  const entries = await Promise.all(
    DATA_PAGES.map(async (page) => {
      const { data, error } = await client
        .from(pageConfig[page].table)
        .select('*')
        .order('created_at', { ascending: false })
        .order('codigo', { ascending: false })
      if (error) throw error
      return [page, (data as Row[]).map((row) => toRecord(page, row))] as const
    }),
  )
  return Object.fromEntries(entries) as Record<DataPage, RecordItem[]>
}

export async function insertRecord(page: DataPage, input: RecordInput): Promise<RecordItem> {
  const { data, error } = await requireSupabase().from(pageConfig[page].table).insert(toRow(page, input)).select('*').single()
  if (error) throw error
  return toRecord(page, data as Row)
}

export async function updateRecord(page: DataPage, code: string, input: RecordInput): Promise<RecordItem> {
  const { data, error } = await requireSupabase().from(pageConfig[page].table).update(toRow(page, input)).eq('codigo', code).select('*').single()
  if (error) throw error
  return toRecord(page, data as Row)
}

export async function deleteRecord(page: DataPage, code: string): Promise<void> {
  const { data, error } = await requireSupabase().from(pageConfig[page].table).delete().eq('codigo', code).select('codigo')
  if (error) throw error
  // Si las políticas de seguridad impiden borrar, Supabase responde sin error pero sin filas.
  if (!data || data.length === 0) throw { code: '42501', message: 'No se pudo eliminar el registro.' }
}

export async function updateStatuses(page: DataPage, codes: string[], status: RecordStatus): Promise<RecordItem[]> {
  const { data, error } = await requireSupabase().from(pageConfig[page].table).update({ estado: status }).in('codigo', codes).select('*')
  if (error) throw error
  return (data as Row[]).map((row) => toRecord(page, row))
}
