import { Check, Loader2, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { pageMeta } from '../data/catalog'
import { defaultStatus, statusesForPage } from '../data/helpers'
import type { DataPage, RecordItem } from '../types'

export default function RecordModal({ page, record, saving = false, onClose, onSave }: { page: DataPage; record: RecordItem | null; saving?: boolean; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const meta = pageMeta[page]
  const editing = Boolean(record)
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="record-modal" onSubmit={onSave}>
        <div className="modal-heading"><div><span className="section-kicker"><i /> {meta.eyebrow}</span><h2>{editing ? `Editar registro de ${meta.title.toLocaleLowerCase()}` : meta.action}</h2><p>{editing ? 'Los cambios se guardarán en la base de datos.' : 'El registro se guardará en la base de datos.'}</p></div><button className="modal-close" type="button" aria-label="Cerrar" onClick={onClose}><X size={19} /></button></div>
        <div className="modal-fields">
          <label>{meta.entityLabel}<input autoFocus name="name" required defaultValue={record?.name} placeholder={meta.entityLabel} /></label>
          <label>{meta.detailLabel}<input name="detail" required defaultValue={record?.detail} placeholder={meta.detailLabel} /></label>
          {meta.kind === 'money' && <label>{meta.amountLabel}<input name="amount" min="0" step="0.01" type="number" defaultValue={record?.amount} placeholder="0.00" /></label>}
          {meta.kind === 'stock' && <label>Unidades iniciales<input name="quantity" min="0" step="1" type="number" defaultValue={record?.quantity} placeholder="0" /></label>}
          <label>Estado<select name="status" defaultValue={record?.status ?? defaultStatus(page)}>{statusesForPage(page).map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        <div className="modal-actions"><button className="cancel-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? <Loader2 size={17} className="login-spin" /> : <Check size={17} />} {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar y sincronizar'}</button></div>
      </form>
    </div>
  )
}
