import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api, post, put, upload } from '../lib/api.js';
import { isoDate } from '../lib/format.js';
import { DataTable, Field, Modal, ErrorBox, useApp, useFetch } from './core.jsx';

/** Charge les listes de référence (classes, enseignants...) nécessaires aux champs « ref ». */
export function useRefs(fields) {
  const paths = [...new Set(fields.filter(f => f.ref).map(f => f.ref))];
  const results = paths.map(p => [p, useFetch(p)]); // nombre d'appels stable pour une configuration donnée
  return Object.fromEntries(results.map(([p, r]) => [p, r.data || []]));
}

export function FileInput({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true); setErr('');
    try { onChange((await upload(file)).url); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input type="file" onChange={pick} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.odt,.txt,.ppt,.pptx" style={{ height: 'auto', padding: 7 }} />
      {busy && <span className="spinner" />}
      {value && !busy && <a href={value} target="_blank" rel="noreferrer" className="small nowrap">Voir le fichier</a>}
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}

export function FormFields({ fields, data, setData, refs }) {
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="form-grid">
      {fields.filter(f => !f.hidden?.(data)).map(f => {
        const v = data[f.key] ?? '';
        let input;
        if (f.type === 'select') {
          input = <select value={v} onChange={e => set(f.key, e.target.value)} required={f.required}>
            {!f.required && <option value="">—</option>}
            {f.options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>;
        } else if (f.ref) {
          const opts = (refs[f.ref] || []).filter(f.filter || (() => true));
          input = <select value={v ?? ''} onChange={e => set(f.key, e.target.value ? +e.target.value : null)} required={f.required}>
            <option value="">{f.required ? 'Sélectionner…' : '—'}</option>
            {opts.map(o => <option key={o.id} value={o.id}>{f.label_of(o)}</option>)}
          </select>;
        } else if (f.type === 'textarea') {
          input = <textarea value={v} onChange={e => set(f.key, e.target.value)} required={f.required} />;
        } else if (f.type === 'file') {
          input = <FileInput value={v} onChange={url => set(f.key, url)} />;
        } else if (f.type === 'checkbox') {
          input = <label className="checkbox"><input type="checkbox" checked={!!data[f.key]} onChange={e => set(f.key, e.target.checked)} />{f.checkLabel || 'Oui'}</label>;
        } else {
          input = <input type={f.type || 'text'} value={f.type === 'date' ? isoDate(v) : v} step={f.step} min={f.min} max={f.max}
            onChange={e => set(f.key, f.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value)} required={f.required} />;
        }
        return <Field key={f.key} label={f.label} required={f.required} help={f.help} full={f.full || f.type === 'textarea'}>{input}</Field>;
      })}
    </div>
  );
}

/**
 * Page CRUD générique.
 * props : entity, title, fields, columns, canWrite, query, defaults, extraActions, onSaved
 */
export function CrudTable({ entity, label, fields, columns, canWrite, canCreate = canWrite, query = "", defaults = {}, extraActions, toolbar, filters, initialSort, transformOut, reloadKey }) {
  const { toast, confirm } = useApp();
  const list = useFetch(`/${entity}${query}`);
  const refs = useRefs(fields);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const open = row => {
    setError(null);
    const base = row ? { ...row } : { ...defaults };
    setForm({ id: row?.id, data: base });
  };

  const save = async e => {
    e.preventDefault();
    setSaving(true); setError(null);
    const payload = {};
    for (const f of fields) if (f.key in form.data && !f.readOnly) payload[f.key] = form.data[f.key] === '' ? null : form.data[f.key];
    try {
      const body = transformOut ? transformOut(payload) : payload;
      if (form.id) await put(`/${entity}/${form.id}`, body); else await post(`/${entity}`, body);
      toast(form.id ? `${label} modifié(e)` : `${label} ajouté(e)`);
      setForm(null);
      list.reload();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async row => {
    if (!(await confirm({ title: `Supprimer ${label.toLowerCase()}`, message: 'Cette action est journalisée. L\'élément sera archivé (suppression logique).', danger: true, confirmLabel: 'Supprimer' }))) return;
    try {
      await api(`/${entity}/${row.id}`, { method: 'DELETE' });
      toast(`${label} supprimé(e)`);
      list.reload();
    } catch (err) {
      if (err.status === 409 && err.data.forcable) {
        const ok = await confirm({ title: 'Élément référencé', message: `${err.message}`, danger: true, confirmLabel: 'Confirmer et supprimer' });
        if (!ok) return;
        try {
          await api(`/${entity}/${row.id}?force=true`, { method: 'DELETE' });
          toast(`${label} supprimé(e) après réaffectation`);
          list.reload();
        } catch (e2) { toast(e2.message, 'error'); }
      } else {
        toast(err.message, 'error');
      }
    }
  };

  const tools = useMemo(() => (
    <>
      {toolbar}
      {canCreate && <button className="btn primary" onClick={() => open(null)}><Plus size={16} />Ajouter</button>}
    </>
  ), [toolbar, canCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ErrorBox error={list.error} />
      <DataTable
        columns={columns}
        rows={list.data}
        loading={list.loading}
        toolbar={tools}
        filters={filters}
        initialSort={initialSort}
        actions={canWrite || extraActions ? row => (
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 4 }}>
            {extraActions?.(row, list.reload)}
            {canWrite && <button className="btn sm ghost icon" title="Modifier" aria-label="Modifier" onClick={() => open(row)}><Pencil size={15} /></button>}
            {canWrite && <button className="btn sm ghost icon danger" title="Supprimer" aria-label="Supprimer" onClick={() => remove(row)}><Trash2 size={15} /></button>}
          </div>
        ) : undefined}
      />
      {form && (
        <Modal title={form.id ? `Modifier – ${label}` : `Ajouter – ${label}`} onClose={() => setForm(null)}
          footer={<>
            <button className="btn" type="button" onClick={() => setForm(null)}>Annuler</button>
            <button className="btn primary" type="submit" form="crud-form" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </>}>
          <form id="crud-form" onSubmit={save} className="stack">
            <ErrorBox error={error} />
            <FormFields fields={fields} data={form.data} setData={fn => setForm(f => ({ ...f, data: typeof fn === 'function' ? fn(f.data) : fn }))} refs={refs} />
          </form>
        </Modal>
      )}
    </>
  );
}
