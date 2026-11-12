import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, ChevronUp, ChevronDown, Inbox, CheckCircle2, AlertTriangle, Info, AlertOctagon, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.js';

/* ------------------------- Contexte applicatif ------------------------ */
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

/* ------------------------------ Données ------------------------------- */
export function useFetch(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return; }
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    api(path).then(data => alive && setState({ data, loading: false, error: null }))
      .catch(error => alive && setState({ data: null, loading: false, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { ...state, reload };
}

/* ------------------------------ Toasts -------------------------------- */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);
  const node = (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === 'error' ? <AlertOctagon size={17} /> : <CheckCircle2 size={17} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
  return [push, node];
}

/* ------------------------------ Modale -------------------------------- */
export function Modal({ title, onClose, children, footer, size = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    ref.current?.querySelector('input, select, textarea, button.primary')?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Boîte de confirmation asynchrone : const ok = await confirm({...}) */
export function useConfirm() {
  const [req, setReq] = useState(null);
  const confirm = useCallback(opts => new Promise(resolve => setReq({ ...opts, resolve })), []);
  const close = v => { req?.resolve(v); setReq(null); };
  const node = req && (
    <Modal title={req.title || 'Confirmation'} onClose={() => close(false)} size="narrow"
      footer={<>
        <button className="btn" onClick={() => close(false)}>Annuler</button>
        <button className={`btn ${req.danger ? 'solid-danger' : 'primary'}`} onClick={() => close(true)}>{req.confirmLabel || 'Confirmer'}</button>
      </>}>
      <p style={{ color: 'var(--text-2)' }}>{req.message}</p>
    </Modal>
  );
  return [confirm, node];
}

/* ---------------------------- Affichage ------------------------------- */
export function PageHead({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, sub, actions, children, className = '', bodyClass = 'card-body', style }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || actions) && (
        <div className="card-head">
          <div>{title && <h3>{title}</h3>}{sub && <div className="sub">{sub}</div>}</div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, unit, hint, icon: Icon, tone = '' }) {
  return (
    <div className={`kpi ${tone ? `tone-${tone}` : ''}`}>
      <div className="label">{Icon && <span className="ico"><Icon size={15} /></span>}{label}</div>
      <div className="value">{value}{unit && <small>{unit}</small>}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export const Badge = ({ tone = '', children, dot }) => <span className={`badge ${tone}`}>{dot && <i className="pip" />}{children}</span>;

export function Meter({ value, max = 100, tone }) {
  const p = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const t = tone || (p > 100 ? 'danger' : '');
  return <div className={`meter ${t}`} role="meter" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${p}%` }} /></div>;
}

export function Empty({ title = 'Aucune donnée', text, icon: Icon = Inbox }) {
  return <div className="empty"><Icon size={34} /><b>{title}</b>{text && <span>{text}</span>}</div>;
}

export const Loading = () => <div className="loading-page"><div className="spinner" aria-label="Chargement" /></div>;

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert danger"><AlertOctagon size={16} /><span>{error.message || String(error)}</span></div>;
}

export function Alert({ tone = 'info', children }) {
  const Icon = tone === 'danger' ? AlertOctagon : tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;
  return <div className={`alert ${tone}`}><Icon size={16} /><div>{children}</div></div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => {
        const Icon = t.icon;
        return (
          <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
            {Icon && <Icon size={15} />}{t.label}{t.count != null && <Badge tone={value === t.id ? 'accent' : ''}>{t.count}</Badge>}
          </button>
        );
      })}
    </div>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg" role="group">
      {options.map(o => <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/* ---------------------------- Formulaires ----------------------------- */
export function Field({ label, required, help, full, children }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      {label && <label>{label}{required && <span className="req"> *</span>}</label>}
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

/* ---------------------------- Tableau --------------------------------- */
/**
 * columns: [{ key, label, render?(row), sort?(row) | false, num?, className? }]
 */
export function DataTable({ columns, rows, loading, searchable = true, filters, actions, empty, pageSize = 25, initialSort, onRowClick, toolbar }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [q, rows]);

  const filtered = useMemo(() => {
    let r = rows || [];
    if (q) {
      const s = q.toLowerCase();
      r = r.filter(x => columns.some(c => {
        const v = c.text ? c.text(x) : x[c.key];
        return v != null && String(v).toLowerCase().includes(s);
      }));
    }
    if (sort) {
      const col = columns.find(c => c.key === sort.key);
      const val = col?.sort || (x => x[sort.key]);
      r = [...r].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null) return 1; if (vb == null) return -1;
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr', { numeric: true })) * (sort.dir === 'asc' ? 1 : -1);
      });
    }
    return r;
  }, [rows, q, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const toggle = c => {
    if (c.sort === false) return;
    setSort(s => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }));
  };

  return (
    <div className="card">
      {(searchable || filters || toolbar) && (
        <div className="table-tools">
          {searchable && (
            <div className="search">
              <Search size={15} />
              <input className="input" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher" />
            </div>
          )}
          {filters}
          <div style={{ flex: 1 }} />
          {toolbar}
        </div>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} className={`${c.sort === false ? '' : 'sortable'} ${c.num ? 'num' : ''}`} onClick={() => toggle(c)} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <span className="row" style={{ gap: 4, display: 'inline-flex', flexWrap: 'nowrap' }}>
                    {c.label}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                  </span>
                </th>
              ))}
              {actions && <th className="num"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading && [0, 1, 2, 3].map(i => (
              <tr key={i}>{columns.map(c => <td key={c.key}><div className="skeleton" style={{ height: 14 }} /></td>)}{actions && <td />}</tr>
            ))}
            {!loading && visible.map((r, i) => (
              <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                {columns.map(c => <td key={c.key} className={`${c.num ? 'num' : ''} ${c.className || ''}`}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
                {actions && <td className="actions" onClick={e => e.stopPropagation()}>{actions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !filtered.length && (empty || <Empty title={q ? 'Aucun résultat' : 'Aucun élément'} text={q ? 'Modifiez votre recherche.' : undefined} />)}
      </div>
      {!loading && filtered.length > pageSize && (
        <div className="table-foot">
          <span>{page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} sur {filtered.length}</span>
          <div className="row">
            <button className="btn sm icon" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Page précédente"><ChevronLeft size={15} /></button>
            <span>Page {page + 1} / {pages}</span>
            <button className="btn sm icon" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} aria-label="Page suivante"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
      {!loading && filtered.length > 0 && filtered.length <= pageSize && (
        <div className="table-foot"><span>{filtered.length} élément{filtered.length > 1 ? 's' : ''}</span></div>
      )}
    </div>
  );
}
