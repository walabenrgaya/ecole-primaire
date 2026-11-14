import React, { useState } from 'react';
import { Check, X, MessageSquareText } from 'lucide-react';
import { useApp, PageHead, Badge, Modal, Field, ErrorBox, Alert } from '../ui/core.jsx';
import { CrudTable } from '../ui/Crud.jsx';
import { post } from '../lib/api.js';
import { date } from '../lib/format.js';

const TONE = { 'Justifiée': 'success', 'Non justifiée': 'danger', 'En attente de validation': 'warning', 'Rejetée': 'danger' };

export default function Absences() {
  const { user, toast } = useApp();
  const canWrite = ['admin', 'enseignant', 'superadmin'].includes(user.role);
  const peutValider = ['admin', 'enseignant', 'directeur', 'superadmin'].includes(user.role);
  const [tick, setTick] = useState(0);
  const [statut, setStatut] = useState('');
  const [justif, setJustif] = useState(null);
  const [error, setError] = useState(null);

  const fields = [
    { key: 'eleve_id', label: 'Élève', ref: '/eleves?statut=inscrit', label_of: e => `${e.nom} ${e.prenom} – ${e.classe_nom || ''}`, required: true },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['Absence', 'Retard'], required: true },
    { key: 'creneau', label: 'Créneau', type: 'select', options: ['Matinée', 'Après-midi', 'Journée entière'], required: true },
    { key: 'matiere', label: 'Cours concerné' },
    { key: 'motif', label: 'Observation' }
  ];
  const columns = [
    { key: 'date', label: 'Date', render: a => date(a.date), sort: a => a.date },
    { key: 'eleve_nom', label: 'Élève', render: a => <><div className="cell-main">{a.eleve_nom}</div><div className="cell-sub">{a.classe_nom}</div></>, text: a => `${a.eleve_nom} ${a.classe_nom}` },
    { key: 'type', label: 'Type', render: a => <Badge tone={a.type === 'Retard' ? 'info' : ''}>{a.type}</Badge> },
    { key: 'creneau', label: 'Créneau' },
    { key: 'justification_parent', label: 'Justification', render: a => a.justification_parent ? <span className="small">{a.justification_parent}</span> : <span className="muted small">—</span> },
    { key: 'statut', label: 'Statut', render: a => <Badge tone={TONE[a.statut]} dot>{a.statut}</Badge> }
  ];

  const valider = async (a, ok) => {
    try { await post(`/absences/${a.id}/valider`, { validee: ok }); toast(ok ? 'Justification acceptée' : 'Justification refusée'); setTick(t => t + 1); }
    catch (e) { toast(e.message, 'error'); }
  };
  const envoyerJustif = async e => {
    e.preventDefault();
    try { await post(`/absences/${justif.id}/justifier`, { justification: justif.texte }); toast('Justification envoyée à l\'établissement'); setJustif(null); setTick(t => t + 1); }
    catch (err) { setError(err); }
  };

  return (
    <>
      <PageHead eyebrow="Pédagogie" title="Absences et retards"
        subtitle={user.role === 'parent' ? 'Justifiez en ligne les absences de vos enfants : la justification est transmise à l\'établissement pour validation.' : 'Suivi de l\'assiduité et validation des justifications envoyées par les parents.'} />
      {user.role === 'parent' && <div style={{ marginBottom: 16 }}><Alert>Cliquez sur l'icône de message d'une absence non justifiée pour envoyer un motif.</Alert></div>}
      <CrudTable key={`${tick}-${statut}`} entity="absences" label="Absence" query={statut ? `?statut=${encodeURIComponent(statut)}` : ''} fields={fields} columns={columns} canWrite={canWrite}
        defaults={{ date: new Date().toISOString().slice(0, 10), type: 'Absence', creneau: 'Matinée' }}
        filters={<select value={statut} onChange={e => setStatut(e.target.value)} aria-label="Filtrer par statut"><option value="">Tous les statuts</option>{Object.keys(TONE).map(s => <option key={s}>{s}</option>)}</select>}
        extraActions={a => <>
          {user.role === 'parent' && ['Non justifiée', 'Rejetée'].includes(a.statut) && a.type !== 'Retard' &&
            <button className="btn sm" onClick={() => { setError(null); setJustif({ id: a.id, texte: '' }); }}><MessageSquareText size={14} />Justifier</button>}
          {peutValider && a.statut === 'En attente de validation' && <>
            <button className="btn sm ghost icon" title="Accepter" aria-label="Accepter la justification" onClick={() => valider(a, true)}><Check size={16} color="var(--success)" /></button>
            <button className="btn sm ghost icon" title="Refuser" aria-label="Refuser la justification" onClick={() => valider(a, false)}><X size={16} color="var(--danger)" /></button>
          </>}
        </>} />
      {justif && (
        <Modal title="Justifier l'absence" size="narrow" onClose={() => setJustif(null)} footer={<><button className="btn" onClick={() => setJustif(null)}>Annuler</button><button className="btn primary" form="justif">Envoyer</button></>}>
          <form id="justif" onSubmit={envoyerJustif} className="stack">
            <ErrorBox error={error} />
            <Field label="Motif" required><textarea value={justif.texte} onChange={e => setJustif({ ...justif, texte: e.target.value })} required placeholder="ex. Fièvre, certificat médical remis à l'enseignant" /></Field>
          </form>
        </Modal>
      )}
    </>
  );
}
