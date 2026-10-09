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
  name: string
  detail: string
  date: string
  amount?: number
  quantity?: number
  status: RecordStatus
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
