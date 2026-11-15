import React, { useState } from 'react';
import { useFetch, PageHead, Badge, DataTable, Modal } from '../ui/core.jsx';
import { dateTime, ROLE_LABEL } from '../lib/format.js';

const tone = a => /Suppression|Effacement|Échec/.test(a) ? 'danger' : /Modification/.test(a) ? 'warning' : /Création|Enregistrement|Validation/.test(a) ? 'success' : /Consultation|Connexion/.test(a) ? '' : 'info';

export default function Journal() {
  const list = useFetch('/journal');
  const [detail, setDetail] = useState(null);
  return (
    <>
      <PageHead eyebrow="Administration" title="Journal d'audit" subtitle="Traçabilité complète : qui a fait quoi et quand, avec les anciennes et nouvelles valeurs de chaque modification (300 derniers évènements)." />
      <DataTable loading={list.loading} rows={list.data} pageSize={30} onRowClick={r => (r.avant || r.apres || r.data) && setDetail(r)}
        columns={[
          { key: 'created_at', label: 'Date', render: l => <span className="nowrap">{dateTime(l.created_at)}</span>, sort: l => l.created_at },
          { key: 'nom', label: 'Utilisateur', render: l => <><div className="cell-main">{l.nom}</div><div className="cell-sub">{ROLE_LABEL[l.role] || '—'}</div></>, text: l => l.nom },
          { key: 'action', label: 'Action', render: l => <Badge tone={tone(l.action)}>{l.action}</Badge> },
          { key: 'entite', label: 'Élément', render: l => l.entite ? `${l.entite} #${l.entite_id}` : '—' },
          { key: 'details', label: 'Détails', sort: false, render: l => (l.avant || l.apres || l.data) ? <span className="small" style={{ color: 'var(--accent-text)' }}>Voir</span> : <span className="muted">—</span> }
        ]} />
      {detail && (
        <Modal title={detail.action} onClose={() => setDetail(null)} size="wide" footer={<button className="btn primary" onClick={() => setDetail(null)}>Fermer</button>}>
          <p className="small muted">{detail.nom} · {dateTime(detail.created_at)} · {detail.entite} #{detail.entite_id}</p>
          {(detail.avant || detail.apres) && (
            <table className="data mt">
              <thead><tr><th>Champ</th><th>Ancienne valeur</th><th>Nouvelle valeur</th></tr></thead>
              <tbody>{[...new Set([...Object.keys(detail.avant || {}), ...Object.keys(detail.apres || {})])].map(k => (
                <tr key={k}><td className="cell-main">{k}</td><td style={{ color: 'var(--danger)' }}>{fmt(detail.avant?.[k])}</td><td style={{ color: 'var(--success)' }}>{fmt(detail.apres?.[k])}</td></tr>
              ))}</tbody>
            </table>
          )}
          {detail.data && <pre className="small mt" style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, overflowX: 'auto' }}>{JSON.stringify(detail.data, null, 2)}</pre>}
        </Modal>
      )}
    </>
  );
}

const fmt = v => (v === undefined ? '' : v === null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));
