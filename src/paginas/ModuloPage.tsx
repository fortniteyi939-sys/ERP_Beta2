import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Table,
  Trash2,
} from 'lucide-react'
import { DATA_PAGES, pageMeta } from '../data/catalog'
import { money, statusTone } from '../data/helpers'
import { useRecords } from '../context/RecordsContext'
import type { DataPage, ExportFormat } from '../types'

export default function ModuloPage() {
  const { pageId } = useParams()
  const page = DATA_PAGES.find((candidate) => candidate === pageId)
  if (!page) return <Navigate to="/dashboard" replace />
  return <ModuloView key={page} page={page} />
}

function ModuloView({ page }: { page: DataPage }) {
  const { records, loading, openComposer, openEditor, requestDelete, exportTable } = useRecords()
  const pageRecords = records[page]
  const meta = pageMeta[page]
  const Icon = meta.icon
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const statusFilter = searchParams.get('status') ?? 'Todos'
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

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

  const statuses = Array.from(new Set(pageRecords.map((item) => item.status)))
  const filteredRecords = useMemo(() => pageRecords.filter((item) => {
    const matchesQuery = `${item.id} ${item.name} ${item.detail}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    return matchesQuery && (statusFilter === 'Todos' || item.status === statusFilter)
  }), [pageRecords, query, statusFilter])
  const total = pageRecords.reduce((sum, item) => sum + (item.amount ?? 0), 0)
  const critical = pageRecords.filter((item) => item.status === 'Crítico' || item.status === 'Bajo stock').length
  const primaryValue = meta.kind === 'stock'
    ? `${pageRecords.reduce((sum, item) => sum + (item.quantity ?? 0), 0)} und.`
    : meta.kind === 'file' || meta.kind === 'settings'
      ? `${pageRecords.filter((item) => item.status === 'Vigente' || item.status === 'Activo').length} vigentes`
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
        <article><span className="summary-icon muted"><Activity size={18} /></span><div><small>REGISTROS ACTIVOS</small><strong>{pageRecords.filter((item) => item.status !== 'Pendiente').length} / {pageRecords.length}</strong></div></article>
        <article><span className={critical ? 'summary-icon warning' : 'summary-icon success'}>{critical ? <AlertTriangle size={18} /> : <CircleCheck size={18} />}</span><div><small>{critical ? 'REQUIERE REVISIÓN' : 'ESTADO DEL MÓDULO'}</small><strong>{critical ? `${critical} alertas` : 'Operativo'}</strong></div></article>
      </section>

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
                const showRelation = page === 'sales' || page === 'purchases' || page === 'inventory'
                return (
                <tr key={item.id}>
                  <td><span className="record-id">{item.id}</span></td>
                  <td><strong>{item.name}</strong><small>{item.detail}</small>
                    {showRelation && (linkedLabel ? (
                      <span className="linked-badge"><span className="gicon">link</span>{linkedLabel}</span>
                    ) : (
                      <span className="linked-badge muted"><span className="gicon">link_off</span>{page === 'inventory' ? 'Sin proveedor' : 'Sin vincular'}</span>
                    ))}
                  </td>
                  <td className="record-date">{item.date}</td>
                  <td className="record-value">{page === 'inventory' ? `${item.quantity ?? 0} und.${item.precio !== undefined ? ` · ${money(item.precio)}` : ''}` : page === 'documents' || page === 'reports' || page === 'settings' ? item.detail.split('·')[0].trim() : item.amount ? money(item.amount) : '—'}</td>
                  <td><span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span></td>
                  <td><div className="row-actions"><button className="row-action edit" type="button" aria-label={`Editar ${item.name}`} title="Editar" onClick={() => openEditor(page, item)}><Pencil size={15} /></button><button className="row-action delete" type="button" aria-label={`Eliminar ${item.name}`} title="Eliminar" onClick={() => requestDelete(page, item)}><Trash2 size={15} /></button></div></td>
                </tr>
                )
              })}
              {!filteredRecords.length && <tr><td colSpan={6}><div className="empty-table"><Search size={20} />{loading ? <><strong>Cargando registros…</strong><span>Consultando la base de datos.</span></> : pageRecords.length ? <><strong>Sin coincidencias</strong><span>Ajusta la búsqueda o el estado para consultar otros registros.</span></> : <><strong>Aún no hay registros</strong><span>Crea el primero con el botón «{meta.action}».</span></>}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
