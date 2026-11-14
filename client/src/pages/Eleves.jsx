import React, { useRef, useState } from 'react';
import { Download, Upload, FileText, ShieldCheck, Eraser } from 'lucide-react';
import { useApp, PageHead, Badge, useFetch, Modal, Alert } from '../ui/core.jsx';
import { CrudTable } from '../ui/Crud.jsx';
import { api, openFile, post } from '../lib/api.js';
import { date, NIVEAUX } from '../lib/format.js';

const label = c => `${c.niveau} ${c.section} (${c.effectif}/${c.cap})`;

export default function Eleves() {
  const { user, toast, confirm } = useApp();
  const canWrite = ['admin', 'comptable', 'superadmin'].includes(user.role);
  const [classe, setClasse] = useState('');
  const [statut, setStatut] = useState('inscrit');
  const [tick, setTick] = useState(0);
  const [importRes, setImportRes] = useState(null);
  const fileRef = useRef(null);
  const classes = useFetch('/classes');

  const fields = [
    { key: 'nom', label: 'Nom', required: true },
    { key: 'prenom', label: 'Prénom', required: true },
    { key: 'naissance', label: 'Date de naissance', type: 'date', required: true },
    { key: 'genre', label: 'Genre', type: 'select', options: [{ value: 'M', label: 'Garçon' }, { value: 'F', label: 'Fille' }], required: true },
    { key: 'classe_id', label: 'Classe', ref: '/classes', label_of: label, help: 'L\'effectif maximal de la classe est contrôlé.' },
    { key: 'ville', label: 'Ville' },
    { key: 'parent_id', label: 'Compte parent', ref: '/users?role=parent', label_of: u => `${u.nom} – ${u.email}` },
    { key: 'parent_nom', label: 'Nom du parent / tuteur' },
    { key: 'parent_tel', label: 'Téléphone du parent' },
    { key: 'parent_email', label: 'E-mail du parent', type: 'email' },
    { key: 'annee_entree', label: 'Année d\'entrée', help: 'ex. 2026-2027' },
    { key: 'statut', label: 'Statut', type: 'select', options: [{ value: 'inscrit', label: 'Inscrit' }, { value: 'radie', label: 'Radié / transféré' }, { value: 'abandon', label: 'Abandon' }], required: true },
    { key: 'date_depart', label: 'Date de départ', type: 'date', hidden: d => d.statut === 'inscrit' || !d.statut },
    { key: 'motif_depart', label: 'Motif du départ', hidden: d => d.statut === 'inscrit' || !d.statut },
    { key: 'antecedents_medicaux', label: 'Antécédents médicaux', type: 'textarea' },
    { key: 'consentement_rgpd', label: 'Consentement parental (RGPD)', type: 'checkbox', checkLabel: 'Consentement recueilli' }
  ];
  const columns = [
    { key: 'nom', label: 'Élève', render: e => <><div className="cell-main">{e.nom} {e.prenom}</div><div className="cell-sub">{e.matricule}</div></>, text: e => `${e.nom} ${e.prenom} ${e.matricule}` },
    { key: 'classe_nom', label: 'Classe', render: e => e.classe_nom ? <Badge tone="accent">{e.classe_nom}</Badge> : <Badge>Non affecté</Badge>, sort: e => e.classe_nom },
    { key: 'naissance', label: 'Naissance', render: e => date(e.naissance) },
    { key: 'parent_nom', label: 'Parent', render: e => <><div>{e.parent_nom || '—'}</div><div className="cell-sub">{e.parent_tel}</div></>, text: e => `${e.parent_nom} ${e.parent_tel}` },
    { key: 'ville', label: 'Ville' },
    { key: 'statut', label: 'Statut', render: e => <Badge tone={e.statut === 'inscrit' ? 'success' : e.statut === 'abandon' ? 'danger' : 'warning'} dot>{e.statut === 'inscrit' ? 'Inscrit' : e.statut === 'abandon' ? 'Abandon' : 'Radié'}</Badge> }
  ];

  const importer = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = await api('/import/eleves', { method: 'POST', body: await file.text() });
      setImportRes(r);
      setTick(t => t + 1);
    } catch (err) { toast(err.message, 'error'); }
  };

  const rgpdExport = e => openFile(`/rgpd/eleves/${e.id}`, { download: `dossier-${e.matricule}.json` }).catch(err => toast(err.message, 'error'));
  const anonymiser = async e => {
    if (!(await confirm({ title: 'Droit à l\'effacement', message: `Anonymiser définitivement les données personnelles de ${e.prenom} ${e.nom} ? Les données comptables sont conservées.`, danger: true, confirmLabel: 'Anonymiser' }))) return;
    try { await post(`/rgpd/eleves/${e.id}/anonymiser`); toast('Données anonymisées'); setTick(t => t + 1); } catch (err) { toast(err.message, 'error'); }
  };

  const query = `?${new URLSearchParams({ ...(classe && { classe_id: classe }), ...(statut && { statut }), t: tick })}`;
  return (
    <>
      <PageHead eyebrow="Scolarité" title="Dossiers élèves" subtitle="État civil, coordonnées des parents, antécédents médicaux et affectation en classe."
        actions={['admin', 'comptable', 'directeur', 'superadmin'].includes(user.role) && <>
          <button className="btn" onClick={() => openFile('/export/eleves.csv', { download: 'eleves.csv' }).catch(err => toast(err.message, 'error'))}><Download size={16} />Exporter CSV</button>
          {['admin', 'superadmin'].includes(user.role) && <><button className="btn" onClick={() => fileRef.current.click()}><Upload size={16} />Importer CSV</button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importer} /></>}
        </>} />
      <CrudTable key={query} entity="eleves" label="Élève" query={query} fields={fields} columns={columns} canWrite={canWrite}
        defaults={{ genre: 'M', statut: 'inscrit', consentement_rgpd: true }}
        filters={<>
          <select value={classe} onChange={e => setClasse(e.target.value)} aria-label="Filtrer par classe">
            <option value="">Toutes les classes</option>
            {(classes.data || []).sort((a, b) => NIVEAUX.indexOf(a.niveau) - NIVEAUX.indexOf(b.niveau)).map(c => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}
          </select>
          <select value={statut} onChange={e => setStatut(e.target.value)} aria-label="Filtrer par statut">
            <option value="inscrit">Inscrits</option><option value="radie">Radiés</option><option value="abandon">Abandons</option><option value="">Tous</option>
          </select>
        </>}
        extraActions={e => <>
          {user.role !== 'comptable' && <button className="btn sm ghost icon" title="Bulletin PDF" aria-label="Bulletin" onClick={() => openFile(`/bulletin/${e.id}?trimestre=1&format=pdf`).catch(err => toast(err.message, 'error'))}><FileText size={15} /></button>}
          {['admin', 'superadmin'].includes(user.role) && <button className="btn sm ghost icon" title="Export RGPD (portabilité)" aria-label="Export RGPD" onClick={() => rgpdExport(e)}><ShieldCheck size={15} /></button>}
          {['admin', 'superadmin'].includes(user.role) && <button className="btn sm ghost icon" title="Droit à l'effacement" aria-label="Anonymiser" onClick={() => anonymiser(e)}><Eraser size={15} /></button>}
        </>} />
      {importRes && (
        <Modal title="Résultat de l'import" onClose={() => setImportRes(null)} footer={<button className="btn primary" onClick={() => setImportRes(null)}>Fermer</button>}>
          <Alert tone={importRes.erreurs.length ? 'warning' : 'success'}>{importRes.crees} élève(s) importé(s), {importRes.erreurs.length} ligne(s) en erreur.</Alert>
          {importRes.erreurs.slice(0, 20).map(e => <div key={e.ligne} className="small mt" style={{ marginTop: 6 }}>Ligne {e.ligne} : {e.erreur}</div>)}
          <p className="small muted mt">Colonnes attendues (séparateur « ; ») : matricule, nom, prenom, naissance, genre, ville, classe, parent_nom, parent_email, parent_tel, antecedents_medicaux, annee_entree.</p>
        </Modal>
      )}
    </>
  );
}
