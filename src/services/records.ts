import { requireSupabase } from '../lib/supabase'
import { DATA_PAGES } from '../data/catalog'
import { formatWhen } from '../data/helpers'
import type { DataPage, DocumentLine, RecordItem, RecordStatus } from '../types'

type Row = Record<string, unknown>

// Datos que captura el formulario (RecordModal).
export type RecordInput = {
  name: string
  detail: string
  status: RecordStatus
  amount?: number
  quantity?: number
  /** Productos: precio de venta referencial. undefined = no tocar la columna. */
  precio?: number
  /** UUID del cliente (ventas) o proveedor (compras/productos). null = sin vínculo. */
  cliente_id?: string | null
  proveedor_id?: string | null
}

// Cómo cada módulo de la interfaz se corresponde con una tabla de Supabase.
type PageConfig = {
  table: string
  name: string      // columna que guarda el "nombre" principal
  amount?: string   // columna monetaria (si el módulo tiene valor)
  quantity?: string // columna de existencias (inventario)
  price?: string    // columna de precio (productos)
  /** Columna FK opcional hacia clientes/proveedores. */
  relationColumn?: 'cliente_id' | 'proveedor_id'
  /** Módulo origen para resolver el nombre del vinculado. */
  relationTarget?: DataPage
}

export const pageConfig: Record<DataPage, PageConfig> = {
  sales: { table: 'ventas', name: 'cliente_nombre', amount: 'monto', relationColumn: 'cliente_id', relationTarget: 'customers' },
  purchases: { table: 'compras', name: 'proveedor_nombre', amount: 'monto', relationColumn: 'proveedor_id', relationTarget: 'suppliers' },
  inventory: { table: 'productos', name: 'nombre', quantity: 'stock', price: 'precio', relationColumn: 'proveedor_id', relationTarget: 'suppliers' },
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
    rowId: typeof row.id === 'string' ? row.id : undefined,
    name: String(row[config.name] ?? ''),
    detail: String(row.detalle ?? ''),
    date,
    status: String(row.estado) as RecordStatus,
  }
  if (config.amount && row[config.amount] !== null && row[config.amount] !== undefined) item.amount = Number(row[config.amount])
  if (config.quantity && row[config.quantity] !== null && row[config.quantity] !== undefined) item.quantity = Number(row[config.quantity])
  // Precio del producto (si la migración de precio ya se ejecutó).
  if (config.price && row[config.price] !== null && row[config.price] !== undefined) item.precio = Number(row[config.price])
  // FKs en crudo (pueden venir null o no existir si la migración aún no se ejecutó).
  if (typeof row.cliente_id === 'string' || row.cliente_id === null) item.cliente_id = row.cliente_id as string | null
  else if ('cliente_id' in row) item.cliente_id = (row.cliente_id as string | null) ?? null
  if (typeof row.proveedor_id === 'string' || row.proveedor_id === null) item.proveedor_id = row.proveedor_id as string | null
  else if ('proveedor_id' in row) item.proveedor_id = (row.proveedor_id as string | null) ?? null
  // Joins embebidos de PostgREST (si algún día se usan selects con embed).
  const embeddedClient = row.clientes as { codigo?: unknown; razon_social?: unknown } | null | undefined
  if (embeddedClient && typeof embeddedClient.razon_social === 'string') {
    item.relatedName = embeddedClient.razon_social
    if (typeof embeddedClient.codigo === 'string') item.relatedCode = embeddedClient.codigo
  }
  const embeddedSupplier = row.proveedores as { codigo?: unknown; razon_social?: unknown } | null | undefined
  if (embeddedSupplier && typeof embeddedSupplier.razon_social === 'string') {
    item.relatedName = embeddedSupplier.razon_social
    if (typeof embeddedSupplier.codigo === 'string') item.relatedCode = embeddedSupplier.codigo
  }
  return item
}

function toRow(page: DataPage, input: RecordInput): Row {
  const config = pageConfig[page]
  const row: Row = { [config.name]: input.name, detalle: input.detail, estado: input.status }
  if (config.amount && input.amount !== undefined) row[config.amount] = input.amount
  if (config.quantity && input.quantity !== undefined) row[config.quantity] = input.quantity
  if (config.price && input.precio !== undefined) row[config.price] = input.precio
  // Solo se envía la FK si el formulario la definió (incluye null para desvincular).
  if (config.relationColumn === 'cliente_id' && input.cliente_id !== undefined) row.cliente_id = input.cliente_id
  if (config.relationColumn === 'proveedor_id' && input.proveedor_id !== undefined) row.proveedor_id = input.proveedor_id
  return row
}

/** Si la BD aún no tiene una columna nueva (migración pendiente), la quita y reintenta. Así el push no rompe. */
function isMissingColumnError(error: unknown, column: string): boolean {
  const err = error as { code?: string; message?: string; details?: string; hint?: string } | null
  if (err?.code !== '42703' && err?.code !== 'PGRST204') return false
  const haystack = `${err?.message ?? ''} ${err?.details ?? ''} ${err?.hint ?? ''}`.toLowerCase()
  return haystack.includes(column.toLowerCase()) || haystack.includes('schema cache')
}

/** Quita del payload solo la columna que la BD remota aún no conoce (migración pendiente). */
function withoutColumn(row: Row, column: string): Row {
  const next = { ...row }
  delete next[column]
  return next
}

async function insertWithColumnFallback(table: string, payload: Row) {
  const client = requireSupabase()
  const first = await client.from(table).insert(payload).select('*').single()
  if (!first.error) return first
  let retryPayload = payload
  if (isMissingColumnError(first.error, 'precio') && 'precio' in retryPayload) {
    retryPayload = withoutColumn(retryPayload, 'precio')
    const second = await client.from(table).insert(retryPayload).select('*').single()
    if (!second.error) return second
    if (isMissingColumnError(second.error, 'proveedor_id') && 'proveedor_id' in retryPayload) {
      return await client.from(table).insert(withoutColumn(retryPayload, 'proveedor_id')).select('*').single()
    }
    return second
  }
  if (isMissingColumnError(first.error, 'proveedor_id') && 'proveedor_id' in retryPayload) {
    return await client.from(table).insert(withoutColumn(retryPayload, 'proveedor_id')).select('*').single()
  }
  return first
}

async function updateWithColumnFallback(table: string, payload: Row, code: string) {
  const client = requireSupabase()
  const first = await client.from(table).update(payload).eq('codigo', code).select('*').single()
  if (!first.error) return first
  let retryPayload = payload
  if (isMissingColumnError(first.error, 'precio') && 'precio' in retryPayload) {
    retryPayload = withoutColumn(retryPayload, 'precio')
    const second = await client.from(table).update(retryPayload).eq('codigo', code).select('*').single()
    if (!second.error) return second
    if (isMissingColumnError(second.error, 'proveedor_id') && 'proveedor_id' in retryPayload) {
      return await client.from(table).update(withoutColumn(retryPayload, 'proveedor_id')).eq('codigo', code).select('*').single()
    }
    return second
  }
  if (isMissingColumnError(first.error, 'proveedor_id') && 'proveedor_id' in retryPayload) {
    return await client.from(table).update(withoutColumn(retryPayload, 'proveedor_id')).eq('codigo', code).select('*').single()
  }
  return first
}

// Traduce los errores de Postgres/PostgREST a mensajes comprensibles.
export function friendlyError(error: unknown): string {
  const err = error as { code?: string; message?: string; details?: string; hint?: string } | null
  const haystack = `${err?.message ?? ''} ${err?.details ?? ''} ${err?.hint ?? ''}`
  if (err?.code === '42501' || err?.code === 'PGRST116') return 'Tu rol no tiene permiso para realizar esta acción.'
  if (err?.code === '23505') return 'Ya existe un registro con esos datos.'
  if (err?.code === '23514') return 'Alguno de los valores no es válido (revisa montos y estado).'
  if (err?.code === '42703' || err?.code === 'PGRST204' || (/proveedor_id|precio/i.test(haystack) && /column|schema cache/i.test(haystack))) {
    if (/precio/i.test(haystack)) return 'Falta la columna precio en productos. Ejecuta en Supabase la migración 20261011000000_producto_precio.sql y recarga.'
    return 'Falta la columna proveedor_id en productos. Ejecuta en Supabase la migración 20261010000000_producto_proveedor.sql y recarga.'
  }
  if (err?.code === '23503') return 'El cliente o proveedor seleccionado ya no existe. Elige otro de la lista.'
  if (err?.message && /fetch|network/i.test(err.message)) return 'No se pudo conectar con la base de datos. Revisa tu conexión.'
  return err?.message || 'Ocurrió un error inesperado con la base de datos.'
}

/** Enriquece ventas/compras/productos con el nombre del cliente/proveedor vinculado. */
function enrichRelations(records: Record<DataPage, RecordItem[]>): Record<DataPage, RecordItem[]> {
  const customersById = new Map<string, RecordItem>()
  for (const customer of records.customers) {
    if (customer.rowId) customersById.set(customer.rowId, customer)
  }
  const suppliersById = new Map<string, RecordItem>()
  for (const supplier of records.suppliers) {
    if (supplier.rowId) suppliersById.set(supplier.rowId, supplier)
  }
  const withRelation = (items: RecordItem[], lookup: Map<string, RecordItem>): RecordItem[] =>
    items.map((item) => {
      const fk = item.cliente_id ?? item.proveedor_id
      if (!fk) return item
      const target = lookup.get(fk)
      if (!target) return item
      // No pisar un embed que ya traía nombre.
      if (item.relatedName) return item
      return { ...item, relatedName: target.name, relatedCode: target.id }
    })
  return {
    ...records,
    sales: withRelation(records.sales, customersById),
    purchases: withRelation(records.purchases, suppliersById),
    inventory: withRelation(records.inventory, suppliersById),
  }
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
  const base = Object.fromEntries(entries) as Record<DataPage, RecordItem[]>
  return enrichRelations(base)
}

export async function insertRecord(page: DataPage, input: RecordInput): Promise<RecordItem> {
  const payload = toRow(page, input)
  // Solo inventario tiene columnas nuevas (proveedor_id, precio): ahí se aplica el fallback.
  const attempt = page === 'inventory'
    ? await insertWithColumnFallback(pageConfig[page].table, payload)
    : await requireSupabase().from(pageConfig[page].table).insert(payload).select('*').single()
  if (attempt.error) throw attempt.error
  return toRecord(page, attempt.data as Row)
}

export async function updateRecord(page: DataPage, code: string, input: RecordInput): Promise<RecordItem> {
  const payload = toRow(page, input)
  const attempt = page === 'inventory'
    ? await updateWithColumnFallback(pageConfig[page].table, payload, code)
    : await requireSupabase().from(pageConfig[page].table).update(payload).eq('codigo', code).select('*').single()
  if (attempt.error) throw attempt.error
  return toRecord(page, attempt.data as Row)
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

// -----------------------------------------------------------------------------
// Documentos con líneas: ventas ↔ detalle_ventas, compras ↔ detalle_compras.
// Además mueven stock y generan la cuenta por cobrar / por pagar (cobranzas).
// -----------------------------------------------------------------------------

export type LineInput = { producto_id: string; cantidad: number; precio: number }

function lineTotal(lines: LineInput[]) {
  return lines.reduce((sum, line) => sum + line.cantidad * line.precio, 0)
}

function assertValidLines(lines: LineInput[]) {
  for (const line of lines) {
    if (!line.producto_id) throw new Error('Elige un producto válido en cada línea.')
    if (!Number.isInteger(line.cantidad) || line.cantidad <= 0) throw new Error('La cantidad debe ser un entero mayor a cero.')
    if (!Number.isFinite(line.precio) || line.precio < 0) throw new Error('El precio/costo debe ser cero o mayor.')
  }
}

/** Líneas guardadas de una venta o compra (para precargar el editor). */
export async function fetchDocumentLines(page: 'sales' | 'purchases', docRowId: string): Promise<DocumentLine[]> {
  const client = requireSupabase()
  if (page === 'sales') {
    const { data, error } = await client
      .from('detalle_ventas')
      .select('producto_id, cantidad, precio_unitario, productos(codigo, nombre, stock)')
      .eq('venta_id', docRowId)
    if (error) throw error
    return (data as unknown as Array<{ producto_id: string | null; cantidad: number; precio_unitario: number; productos: { codigo: string; nombre: string; stock: number } | null }>)
      .filter((row) => row.producto_id)
      .map((row) => ({
        producto_id: row.producto_id as string,
        cantidad: Number(row.cantidad),
        precio: Number(row.precio_unitario),
        codigo: row.productos?.codigo,
        nombre: row.productos?.nombre,
        stock: row.productos?.stock,
      }))
  }
  const { data, error } = await client
    .from('detalle_compras')
    .select('producto_id, cantidad, costo_unitario, productos(codigo, nombre, stock)')
    .eq('compra_id', docRowId)
  if (error) throw error
  return (data as unknown as Array<{ producto_id: string | null; cantidad: number; costo_unitario: number; productos: { codigo: string; nombre: string; stock: number } | null }>)
    .filter((row) => row.producto_id)
    .map((row) => ({
      producto_id: row.producto_id as string,
      cantidad: Number(row.cantidad),
      precio: Number(row.costo_unitario),
      codigo: row.productos?.codigo,
      nombre: row.productos?.nombre,
      stock: row.productos?.stock,
    }))
}

async function getStocks(productIds: string[]): Promise<Map<string, number>> {
  const client = requireSupabase()
  const unique = [...new Set(productIds)]
  if (!unique.length) return new Map()
  const { data, error } = await client.from('productos').select('id, stock').in('id', unique)
  if (error) throw error
  return new Map((data as Array<{ id: string; stock: number }>).map((row) => [row.id, Number(row.stock)]))
}

async function setStock(producto_id: string, nuevo: number): Promise<void> {
  if (!Number.isInteger(nuevo) || nuevo < 0) throw new Error('El stock resultante no puede ser negativo.')
  const { error } = await requireSupabase().from('productos').update({ stock: nuevo }).eq('id', producto_id)
  if (error) {
    if ((error as { code?: string }).code === '42501') {
      throw { code: '42501', message: 'Tu rol no tiene permiso para mover inventario (se necesita editar inventario).' }
    }
    throw error
  }
}

/** Crea la cuenta por cobrar (venta) o por pagar (compra). El trigger asigna CXC-/CXP-. */
async function createRelatedPago(kind: 'sale' | 'purchase', header: Row, total: number, estado: RecordStatus): Promise<void> {
  if (estado === 'Completada') return // al contado: no genera cobranza pendiente.
  const client = requireSupabase()
  const codigo = String(header.codigo)
  const isSale = kind === 'sale'
  const pagoEstado: RecordStatus = estado === 'En curso' || estado === 'En tránsito' ? 'En curso' : 'Pendiente'
  const { error } = await client.from('pagos').insert({
    contraparte: isSale ? String(header.cliente_nombre) : String(header.proveedor_nombre),
    detalle: isSale ? `Cuenta por cobrar · ${codigo}` : `Cuenta por pagar · ${codigo}`,
    monto: total,
    estado: pagoEstado,
    tipo: isSale ? 'cobrar' : 'pagar',
    venta_id: isSale ? String(header.id) : null,
    compra_id: isSale ? null : String(header.id),
  })
  // Si el pago falla por permisos de finanzas, no se revierte la venta/compra:
  // se avisa en consola y el usuario lo crea manual en Finanzas.
  if (error && (error as { code?: string }).code !== '42501') throw error
}

async function syncRelatedPago(kind: 'sale' | 'purchase', headerId: string, total: number, estado: RecordStatus): Promise<void> {
  const client = requireSupabase()
  const column = kind === 'sale' ? 'venta_id' : 'compra_id'
  const { data } = await client.from('pagos').select('id, estado').eq(column, headerId).limit(1)
  const existing = (data as Array<{ id: string; estado: string }> | null)?.[0]
  if (!existing) {
    // Recupera el header para heredar contraparte/código.
    const table = kind === 'sale' ? 'ventas' : 'compras'
    const { data: header } = await client.from(table).select('*').eq('id', headerId).single()
    if (header) await createRelatedPago(kind, header as Row, total, estado)
    return
  }
  const nextEstado = estado === 'Completada' ? 'Completada' : existing.estado
  await client.from('pagos').update({ monto: total, estado: nextEstado }).eq('id', existing.id)
}

export async function insertSaleWithLines(input: RecordInput, lines: LineInput[]): Promise<RecordItem> {
  assertValidLines(lines)
  const client = requireSupabase()
  const total = lines.length ? lineTotal(lines) : (input.amount ?? 0)
  const headerInput: RecordInput = { ...input, amount: total }

  // 1. Valida stock antes de tocar nada (evita dejar la venta a medias).
  const stocks = await getStocks(lines.map((line) => line.producto_id))
  for (const line of lines) {
    const available = stocks.get(line.producto_id) ?? 0
    if (line.cantidad > available) {
      const name = line.producto_id
      throw new Error(`Stock insuficiente para ${name}: disponible ${available}, pedido ${line.cantidad}.`)
    }
  }

  // 2. Cabecera.
  const { data: header, error: headerError } = await client.from('ventas').insert(toRow('sales', headerInput)).select('*').single()
  if (headerError) throw headerError
  const headerRow = header as Row

  try {
    // 3. Líneas.
    if (lines.length) {
      const { error: linesError } = await client.from('detalle_ventas').insert(
        lines.map((line) => ({
          venta_id: String(headerRow.id),
          producto_id: line.producto_id,
          cantidad: line.cantidad,
          precio_unitario: line.precio,
        })),
      )
      if (linesError) throw linesError
      // 4. Descuenta stock (el kardex se genera solo por trigger).
      for (const line of lines) {
        await setStock(line.producto_id, (stocks.get(line.producto_id) ?? 0) - line.cantidad)
      }
    }
    // 5. Cobranza automática (CxC).
    await createRelatedPago('sale', headerRow, total, input.status)
  } catch (error) {
    // Limpieza: si algo falló, no dejar cabecera huérfana.
    await client.from('detalle_ventas').delete().eq('venta_id', String(headerRow.id))
    await client.from('ventas').delete().eq('id', String(headerRow.id))
    throw error
  }
  return toRecord('sales', headerRow)
}

export async function insertPurchaseWithLines(input: RecordInput, lines: LineInput[]): Promise<RecordItem> {
  assertValidLines(lines)
  const client = requireSupabase()
  const total = lines.length ? lineTotal(lines) : (input.amount ?? 0)
  const headerInput: RecordInput = { ...input, amount: total }

  const { data: header, error: headerError } = await client.from('compras').insert(toRow('purchases', headerInput)).select('*').single()
  if (headerError) throw headerError
  const headerRow = header as Row

  try {
    if (lines.length) {
      const { error: linesError } = await client.from('detalle_compras').insert(
        lines.map((line) => ({
          compra_id: String(headerRow.id),
          producto_id: line.producto_id,
          cantidad: line.cantidad,
          costo_unitario: line.precio,
        })),
      )
      if (linesError) throw linesError
      const stocks = await getStocks(lines.map((line) => line.producto_id))
      for (const line of lines) {
        await setStock(line.producto_id, (stocks.get(line.producto_id) ?? 0) + line.cantidad)
      }
    }
    await createRelatedPago('purchase', headerRow, total, input.status)
  } catch (error) {
    await client.from('detalle_compras').delete().eq('compra_id', String(headerRow.id))
    await client.from('compras').delete().eq('id', String(headerRow.id))
    throw error
  }
  return toRecord('purchases', headerRow)
}

export async function updateSaleWithLines(code: string, input: RecordInput, lines: LineInput[]): Promise<RecordItem> {
  assertValidLines(lines)
  const client = requireSupabase()
  const { data: current, error: currentError } = await client.from('ventas').select('*').eq('codigo', code).single()
  if (currentError) throw currentError
  const headerId = String((current as Row).id)
  const oldLines = await fetchDocumentLines('sales', headerId)

  // Restaura el stock anterior antes de validar el nuevo (edición = devolución + nueva salida).
  const oldStocks = await getStocks(oldLines.map((line) => line.producto_id))
  const restored = new Map<string, number>()
  for (const line of oldLines) {
    restored.set(line.producto_id, (oldStocks.get(line.producto_id) ?? 0) + line.cantidad)
  }
  const newStocks = await getStocks(lines.map((line) => line.producto_id))
  const effective = new Map<string, number>()
  for (const [id, stock] of newStocks) effective.set(id, stock)
  for (const [id, stock] of restored) {
    if (!effective.has(id)) {
      const { data } = await client.from('productos').select('stock').eq('id', id).single()
      effective.set(id, Number((data as { stock: number } | null)?.stock ?? stock))
    } else if (!lines.some((line) => line.producto_id === id)) {
      effective.set(id, stock)
    } else {
      // El producto está en ambas listas: parte del stock restaurado.
      const oldQty = oldLines.filter((l) => l.producto_id === id).reduce((s, l) => s + l.cantidad, 0)
      effective.set(id, (newStocks.get(id) ?? 0) + oldQty)
    }
  }
  for (const line of lines) {
    const available = effective.get(line.producto_id) ?? 0
    if (line.cantidad > available) throw new Error(`Stock insuficiente: disponible ${available}, pedido ${line.cantidad}.`)
  }

  const total = lines.length ? lineTotal(lines) : (input.amount ?? Number((current as Row).monto ?? 0))
  const { data: updated, error: updateError } = await client
    .from('ventas')
    .update(toRow('sales', { ...input, amount: total }))
    .eq('codigo', code)
    .select('*')
    .single()
  if (updateError) throw updateError

  await client.from('detalle_ventas').delete().eq('venta_id', headerId)
  // Aplica restauración + descuento como movimientos netos por producto.
  const deltas = new Map<string, number>()
  for (const line of oldLines) deltas.set(line.producto_id, (deltas.get(line.producto_id) ?? 0) + line.cantidad)
  for (const line of lines) deltas.set(line.producto_id, (deltas.get(line.producto_id) ?? 0) - line.cantidad)
  for (const [producto_id, delta] of deltas) {
    if (!delta) continue
    const { data } = await client.from('productos').select('stock').eq('id', producto_id).single()
    const currentStock = Number((data as { stock: number } | null)?.stock ?? 0)
    await setStock(producto_id, currentStock + delta)
  }
  if (lines.length) {
    const { error: linesError } = await client.from('detalle_ventas').insert(
      lines.map((line) => ({ venta_id: headerId, producto_id: line.producto_id, cantidad: line.cantidad, precio_unitario: line.precio })),
    )
    if (linesError) throw linesError
  }
  await syncRelatedPago('sale', headerId, total, input.status)
  return toRecord('sales', updated as Row)
}

export async function updatePurchaseWithLines(code: string, input: RecordInput, lines: LineInput[]): Promise<RecordItem> {
  assertValidLines(lines)
  const client = requireSupabase()
  const { data: current, error: currentError } = await client.from('compras').select('*').eq('codigo', code).single()
  if (currentError) throw currentError
  const headerId = String((current as Row).id)
  const oldLines = await fetchDocumentLines('purchases', headerId)
  const total = lines.length ? lineTotal(lines) : (input.amount ?? Number((current as Row).monto ?? 0))

  const { data: updated, error: updateError } = await client
    .from('compras')
    .update(toRow('purchases', { ...input, amount: total }))
    .eq('codigo', code)
    .select('*')
    .single()
  if (updateError) throw updateError

  await client.from('detalle_compras').delete().eq('compra_id', headerId)
  // Diferencia neta: antes sumaba old, ahora suma new → delta = new - old.
  const deltas = new Map<string, number>()
  for (const line of oldLines) deltas.set(line.producto_id, (deltas.get(line.producto_id) ?? 0) - line.cantidad)
  for (const line of lines) deltas.set(line.producto_id, (deltas.get(line.producto_id) ?? 0) + line.cantidad)
  for (const [producto_id, delta] of deltas) {
    if (!delta) continue
    const { data } = await client.from('productos').select('stock').eq('id', producto_id).single()
    const currentStock = Number((data as { stock: number } | null)?.stock ?? 0)
    await setStock(producto_id, currentStock + delta)
  }
  if (lines.length) {
    const { error: linesError } = await client.from('detalle_compras').insert(
      lines.map((line) => ({ compra_id: headerId, producto_id: line.producto_id, cantidad: line.cantidad, costo_unitario: line.precio })),
    )
    if (linesError) throw linesError
  }
  await syncRelatedPago('purchase', headerId, total, input.status)
  return toRecord('purchases', updated as Row)
}
