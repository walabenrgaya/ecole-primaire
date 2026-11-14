import React, { useMemo, useState } from 'react';
import { ListChecks, Paperclip, Upload, Eye, CheckCircle2, Clock, FileCheck2 } from 'lucide-react';
import { useApp, useFetch, PageHead, Badge, Modal, Field, ErrorBox, Card, Empty, Loading, Alert, Meter, DataTable } from '../ui/core.jsx';
import { CrudTable, FileInput } from '../ui/Crud.jsx';
import { api, post, put } from '../lib/api.js';
import { date, dateTime, num } from '../lib/format.js';

const STATUT = {
  non_rendu: ['Non rendu', 'danger'], rendu: ['Rendu', 'info'], en_retard: ['En retard', 'warning'], corrige: ['Noté', 'success']
};
const passe = d => new Date(d) < new Date(new Date().toDateString());

export default function Devoirs() {
  const { user } = useApp();
  if (user.role === 'eleve' || user.role === 'parent') return <DevoirsFamille />;
  return <DevoirsEnseignant />;
}

function DevoirsEnseignant() {
  const { user } = useApp();
  const canWrite = ['admin', 'enseignant', 'superadmin'].includes(user.role);
  const [depots, setDepots] = useState(null);
  const fields = [
    { key: 'titre', label: 'Titre', required: true, full: true },
    { key: 'matiere_id', label: 'Matière', ref: '/matieres', label_of: m => m.nom, required: true },
    { key: 'classe_id', label: 'Classe', ref: '/classes', label_of: c => `${c.niveau} ${c.section}`, required: true },
    { key: 'date_assignation', label: 'Date de publication', type: 'date' },
    { key: 'date_remise', label: 'Date de remise', type: 'date', required: true },
    { key: 'bareme', label: 'Barème (points)', type: 'number', min: 1 },
    { key: 'piece_jointe', label: 'Pièce jointe (énoncé)', type: 'file', full: true },
    { key: 'desc_devoir', label: 'Consignes', type: 'textarea' },
    { key: 'corrige', label: 'Corrigé (visible après la date de remise)', type: 'textarea' },
    { key: 'corrige_fichier', label: 'Fichier du corrigé', type: 'file', full: true }
  ];
  const columns = [
    { key: 'titre', label: 'Devoir', render: d => <><div className="cell-main">{d.titre}</div><div className="cell-sub">{d.matiere_nom} · {d.classe_nom}</div></>, text: d => `${d.titre} ${d.matiere_nom} ${d.classe_nom}` },
    { key: 'date_remise', label: 'Remise', render: d => <><div>{date(d.date_remise)}</div><div className="cell-sub">{passe(d.date_remise) ? 'Échéance passée' : 'En cours'}</div></>, sort: d => d.date_remise },
    { key: 'nb_rendus', label: 'Dépôts', sort: d => d.nb_rendus / (d.nb_eleves || 1), render: d => <div style={{ minWidth: 130 }}><div className="small"><b>{d.nb_rendus}</b> / {d.nb_eleves}</div><Meter value={d.nb_rendus} max={d.nb_eleves || 1} /></div> },
    { key: 'corrige', label: 'Corrigé', render: d => d.corrige || d.corrige_fichier ? <Badge tone="success" dot>Publié</Badge> : <Badge>—</Badge> }
  ];
  return (
    <>
      <PageHead eyebrow="Pédagogie" title="Devoirs" subtitle="Publiez un devoir (élèves et parents sont notifiés), suivez les dépôts, notez chaque travail et publiez le corrigé." />
      <CrudTable entity="devoirs" label="Devoir" fields={fields} columns={columns} canWrite={canWrite}
        defaults={{ bareme: 20, date_assignation: new Date().toISOString().slice(0, 10) }}
        extraActions={d => <button className="btn sm" onClick={() => setDepots(d)}><ListChecks size={14} />Dépôts</button>} />
      {depots && <Depots devoir={depots} onClose={() => setDepots(null)} canWrite={canWrite} />}
    </>
  );
}

function Depots({ devoir, onClose, canWrite }) {
  const { toast } = useApp();
  const list = useFetch(`/devoirs/${devoir.id}/rendus`);
  const [edit, setEdit] = useState({});
  const noter = async r => {
    const e = edit[r.eleve_id] || {};
    try {
      await put(`/devoirs_rendus/${r.id}/noter`, { note: e.note ?? r.note, commentaire: e.commentaire ?? r.commentaire_enseignant, bareme: devoir.bareme });
      toast(`Note enregistrée pour ${r.eleve_nom}`);
      list.reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  const stats = useMemo(() => {
    const l = list.data || [];
    return { rendus: l.filter(x => x.statut !== 'non_rendu').length, retard: l.filter(x => x.statut === 'en_retard').length, notes: l.filter(x => x.statut === 'corrige').length, total: l.length };
  }, [list.data]);
  return (
    <Modal title={`Dépôts – ${devoir.titre}`} onClose={onClose} size="wide" footer={<button className="btn primary" onClick={onClose}>Fermer</button>}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Badge tone="info">{stats.rendus}/{stats.total} rendus</Badge><Badge tone="warning">{stats.retard} en retard</Badge><Badge tone="success">{stats.notes} notés</Badge>
        <span className="small muted">Remise le {date(devoir.date_remise)} · barème /{num(devoir.bareme)}</span>
      </div>
      {list.loading ? <Loading /> : (
        <div className="table-wrap" style={{ maxHeight: '60vh' }}>
          <table className="data">
            <thead><tr><th>Élève</th><th>Statut</th><th>Dépôt</th><th className="num">Note</th><th>Commentaire</th><th /></tr></thead>
            <tbody>{(list.data || []).map(r => {
              const [l, tone] = STATUT[r.statut];
              const e = edit[r.eleve_id] || {};
              return (
                <tr key={r.eleve_id}>
                  <td className="cell-main">{r.eleve_nom}</td>
                  <td><Badge tone={tone} dot>{l}</Badge></td>
                  <td className="small">{r.date_depot ? dateTime(r.date_depot) : '—'}{r.fichier && <> · <a href={r.fichier} target="_blank" rel="noreferrer"><Paperclip size={12} /> fichier</a></>}{r.contenu && <div className="cell-sub" style={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.contenu}</div>}</td>
                  <td className="num">{r.id && canWrite ? <input className="input" type="number" min={0} max={devoir.bareme} step={0.5} style={{ width: 76, height: 32, textAlign: 'right' }} value={e.note ?? (r.note ?? '')} onChange={ev => setEdit(x => ({ ...x, [r.eleve_id]: { ...e, note: ev.target.value } }))} aria-label={`Note de ${r.eleve_nom}`} /> : r.note ?? '—'}</td>
                  <td>{r.id && canWrite ? <input className="input" style={{ height: 32 }} value={e.commentaire ?? (r.commentaire_enseignant || '')} onChange={ev => setEdit(x => ({ ...x, [r.eleve_id]: { ...e, commentaire: ev.target.value } }))} aria-label={`Commentaire pour ${r.eleve_nom}`} /> : r.commentaire_enseignant || '—'}</td>
                  <td className="actions">{r.id && canWrite && <button className="btn sm" onClick={() => noter(r)} disabled={(e.note ?? r.note) == null || (e.note ?? r.note) === ''}>Noter</button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function DevoirsFamille() {
  const { user, toast } = useApp();
  const devoirs = useFetch('/devoirs');
  const rendus = useFetch('/devoirs_rendus');
  const [depot, setDepot] = useState(null);
  const enfants = user.role === 'parent' ? user.enfants || [] : [{ id: +user.eleveId }];
  if (devoirs.loading || rendus.loading) return <Loading />;
  const marquerVu = async r => { try { await post(`/devoirs_rendus/${r.id}/vu`); rendus.reload(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <>
      <PageHead eyebrow="Pédagogie" title="Devoirs" subtitle={user.role === 'eleve' ? 'Dépose ton travail avant la date de remise ; tu peux le remplacer tant que l\'échéance n\'est pas passée.' : 'Devoirs, dépôts, notes et corrigés de vos enfants.'} />
      {!(devoirs.data || []).length && <Empty title="Aucun devoir pour le moment" />}
      <div className="grid g2">
        {(devoirs.data || []).map(d => {
          const concernes = enfants.filter(e => user.role === 'eleve' || e.classe_id === d.classe_id);
          return concernes.map(e => {
            const r = (rendus.data || []).find(x => x.devoir_id === d.id && x.eleve_id === e.id);
            const statut = r ? r.statut : 'non_rendu';
            const [l, tone] = STATUT[statut];
            const echu = passe(d.date_remise);
            return (
              <Card key={`${d.id}-${e.id}`} title={d.titre} sub={`${d.matiere_nom} · ${d.enseignant_nom}${user.role === 'parent' ? ` · ${e.prenom}` : ''}`} actions={<Badge tone={tone} dot>{l}</Badge>}>
                <p className="small" style={{ color: 'var(--text-2)' }}>{d.desc_devoir}</p>
                <div className="row mt small muted"><Clock size={14} />À rendre le <b style={{ color: 'var(--text)' }}>{date(d.date_remise)}</b>{d.piece_jointe && <a href={d.piece_jointe} target="_blank" rel="noreferrer"><Paperclip size={13} /> Énoncé</a>}</div>
                {r?.statut === 'corrige' && <div className="mt"><Alert tone="success"><b>Note : {num(r.note, 1)} / {num(r.bareme)}</b>{r.commentaire_enseignant && ` – « ${r.commentaire_enseignant} »`}</Alert></div>}
                {echu && (d.corrige || d.corrige_fichier) && <div className="mt"><Alert><FileCheck2 size={14} /> Corrigé : {d.corrige} {d.corrige_fichier && <a href={d.corrige_fichier} target="_blank" rel="noreferrer">Télécharger</a>}</Alert></div>}
                <div className="row mt">
                  {(user.role === 'eleve' || user.role === 'parent') && !echu && statut !== 'corrige' && <button className="btn primary sm" onClick={() => setDepot({ devoir: d, eleve: e, rendu: r })}><Upload size={14} />{r ? 'Remplacer mon dépôt' : 'Déposer le travail'}</button>}
                  {user.role === 'parent' && r && !r.vu_par_parent && <button className="btn sm" onClick={() => marquerVu(r)}><Eye size={14} />Marquer comme vu</button>}
                  {user.role === 'parent' && r?.vu_par_parent && <Badge tone="accent"><CheckCircle2 size={12} />Vu</Badge>}
                  {r?.fichier && <a className="small" href={r.fichier} target="_blank" rel="noreferrer"><Paperclip size={13} /> Mon dépôt ({dateTime(r.date_depot)})</a>}
                </div>
              </Card>
            );
          });
        })}
      </div>
      {depot && <Depot {...depot} onClose={() => setDepot(null)} onDone={() => { rendus.reload(); setDepot(null); }} />}
    </>
  );
}

function Depot({ devoir, eleve, rendu, onClose, onDone }) {
  const { user, toast } = useApp();
  const [file, setFile] = useState(null);
  const [contenu, setContenu] = useState(rendu?.contenu || '');
  const [error, setError] = useState(null);
  const submit = async e => {
    e.preventDefault();
    const fd = new FormData();
    if (file) fd.append('fichier', file);
    fd.append('contenu', contenu);
    if (user.role === 'parent') fd.append('eleve_id', eleve.id);
    try { await api(`/devoirs/${devoir.id}/rendre`, { method: 'POST', body: fd }); toast('Travail déposé – l\'enseignant est notifié'); onDone(); }
    catch (err) { setError(err); }
  };
  return (
    <Modal title={`Déposer – ${devoir.titre}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" form="depot">Envoyer</button></>}>
      <form id="depot" onSubmit={submit} className="stack">
        <ErrorBox error={error} />
        <Field label="Fichier (PDF, image, document)" help="10 Mo maximum"><input type="file" onChange={e => setFile(e.target.files[0])} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.odt,.txt" style={{ height: 'auto', padding: 7 }} /></Field>
        <Field label="Message ou réponse"><textarea value={contenu} onChange={e => setContenu(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
