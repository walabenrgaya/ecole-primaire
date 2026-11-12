import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useApp, useFetch, PageHead, Badge, DataTable, Modal, Field, ErrorBox, Alert, Seg } from '../ui/core.jsx';
import { post } from '../lib/api.js';
import { date, relative } from '../lib/format.js';

const STATUTS = { en_attente: ['En attente', 'warning'], validee: ['Validée', 'success'], rejetee: ['Rejetée', 'danger'] };

export default function Preinscriptions() {
  const { toast, confirm } = useApp();
  const [statut, setStatut] = useState('en_attente');
  const list = useFetch(`/preinscriptions${statut ? `?statut=${statut}` : ''}`);
  const classes = useFetch('/classes');
  const [valid, setValid] = useState(null);
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);

  const valider = async e => {
    e.preventDefault();
    try {
      const r = await post(`/preinscriptions/${valid.p.id}/valider`, { classe_id: valid.classe_id ? +valid.classe_id : null });
      setValid(null); setRes(r); list.reload();
    } catch (err) { setError(err); }
  };
  const rejeter = async p => {
    if (!(await confirm({ title: 'Rejeter la demande', message: `Rejeter la pré-inscription de ${p.prenom} ${p.nom} ?`, danger: true, confirmLabel: 'Rejeter' }))) return;
    try { await post(`/preinscriptions/${p.id}/rejeter`); toast('Demande rejetée'); list.reload(); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <PageHead eyebrow="Scolarité" title="Inscriptions en ligne" subtitle="Demandes déposées par les parents depuis la page publique. La validation crée le dossier élève, le compte parent et affecte l'enfant à une classe (automatiquement si aucune n'est choisie)." />
      <DataTable loading={list.loading} rows={list.data}
        filters={<Seg value={statut} onChange={setStatut} options={[{ value: 'en_attente', label: 'En attente' }, { value: 'validee', label: 'Validées' }, { value: 'rejetee', label: 'Rejetées' }, { value: '', label: 'Toutes' }]} />}
        columns={[
          { key: 'nom', label: 'Enfant', render: p => <><div className="cell-main">{p.nom} {p.prenom}</div><div className="cell-sub">Né(e) le {date(p.naissance)}</div></>, text: p => `${p.nom} ${p.prenom}` },
          { key: 'niveau_demande', label: 'Niveau', render: p => <Badge tone="accent">{p.niveau_demande}</Badge> },
          { key: 'parent_nom', label: 'Parent', render: p => <><div>{p.parent_nom}</div><div className="cell-sub">{p.parent_email} · {p.parent_tel}</div></>, text: p => `${p.parent_nom} ${p.parent_email}` },
          { key: 'ville', label: 'Ville' },
          { key: 'created_at', label: 'Reçue', render: p => relative(p.created_at), sort: p => p.created_at },
          { key: 'statut', label: 'Statut', render: p => <Badge tone={STATUTS[p.statut][1]} dot>{STATUTS[p.statut][0]}</Badge> }
        ]}
        actions={p => p.statut === 'en_attente' && <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          <button className="btn sm primary" onClick={() => { setError(null); setValid({ p, classe_id: '' }); }}><Check size={14} />Valider</button>
          <button className="btn sm ghost icon danger" aria-label="Rejeter" onClick={() => rejeter(p)}><X size={15} /></button>
        </div>} />
      {valid && (
        <Modal title={`Valider – ${valid.p.prenom} ${valid.p.nom}`} onClose={() => setValid(null)} size="narrow"
          footer={<><button className="btn" onClick={() => setValid(null)}>Annuler</button><button className="btn primary" form="valid">Valider l'inscription</button></>}>
          <form id="valid" className="stack" onSubmit={valider}>
            <ErrorBox error={error} />
            <Field label="Classe d'affectation" help="Laissez « Automatique » pour choisir la classe la moins remplie du niveau demandé.">
              <select value={valid.classe_id} onChange={e => setValid({ ...valid, classe_id: e.target.value })}>
                <option value="">Automatique ({valid.p.niveau_demande})</option>
                {(classes.data || []).filter(c => c.niveau === valid.p.niveau_demande).map(c => <option key={c.id} value={c.id} disabled={c.effectif >= c.cap}>{c.niveau} {c.section} – {c.effectif}/{c.cap}{c.effectif >= c.cap ? ' (complète)' : ''}</option>)}
              </select>
            </Field>
          </form>
        </Modal>
      )}
      {res && (
        <Modal title="Inscription validée" onClose={() => setRes(null)} size="narrow" footer={<button className="btn primary" onClick={() => setRes(null)}>Fermer</button>}>
          <div className="stack">
            <Alert tone="success">Dossier créé pour {res.eleve.prenom} {res.eleve.nom}.</Alert>
            {res.identifiants ? <Alert tone="info">Compte parent créé : <b>{res.identifiants.email}</b><br />Mot de passe temporaire : <b>{res.identifiants.motDePasse}</b><br />Ces identifiants ont aussi été envoyés par e-mail.</Alert> : <p className="small muted">Le parent disposait déjà d'un compte : l'enfant y a été rattaché.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
