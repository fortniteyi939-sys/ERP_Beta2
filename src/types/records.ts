import type { LucideIcon } from 'lucide-react'

export type PageKey =
  | 'dashboard'
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'finance'
  | 'documents'
  | 'reports'
  | 'settings'

export type DataPage = Exclude<PageKey, 'dashboard'>
export type Theme = 'dark' | 'light'
export type RecordStatus =
  | 'Activo'
  | 'Bajo stock'
  | 'Completada'
  | 'Crítico'
  | 'En curso'
  | 'En tránsito'
  | 'Estable'
  | 'Pendiente'
  | 'Vigente'

export type RecordItem = {
  id: string
  /** UUID interno de Supabase (row.id). Necesario para usarlo como FK. */
  rowId?: string
  name: string
  detail: string
  date: string
  amount?: number
  quantity?: number
  /** Productos: precio de venta referencial. undefined = columna aún no migrada o sin definir. */
  precio?: number
  status: RecordStatus
  /** Ventas: UUID del cliente vinculado (clientes.id). NULL = sin vincular. */
  cliente_id?: string | null
  /** Compras / Productos: UUID del proveedor vinculado (proveedores.id). NULL = sin vincular. */
  proveedor_id?: string | null
  /** Etiqueta legible del registro vinculado (razón social). Solo lectura. */
  relatedName?: string
  /** Código legible del registro vinculado (CLI-001 / PRV-082). Solo lectura. */
  relatedCode?: string
}

/** Línea de venta/compra: un producto del inventario en X cantidad y precio. */
export type DocumentLine = {
  /** UUID del producto (productos.id). */
  producto_id: string
  /** Código legible (PRD-001). Solo lectura. */
  codigo?: string
  /** Nombre del producto. Solo lectura. */
  nombre?: string
  /** Stock actual al momento de cargar el formulario. Solo lectura. */
  stock?: number
  cantidad: number
  /** Precio unitario (venta) o costo unitario (compra). */
  precio: number
}

export type RecordModalState = {
  page: DataPage
  record: RecordItem | null
}

export type PendingDelete = {
  page: DataPage
  record: RecordItem
}

export type ExportFormat = 'csv' | 'excel' | 'pdf'

export type PageMeta = {
  action: string
  amountLabel?: string
  description: string
  detailLabel: string
  eyebrow: string
  entityLabel: string
  icon: LucideIcon
  kind: 'file' | 'money' | 'settings' | 'stock'
  prefix: string
  title: string
}
