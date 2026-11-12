import React from 'react';
import { useApp, PageHead, Badge, Meter } from '../ui/core.jsx';
import { CrudTable } from '../ui/Crud.jsx';
import { NIVEAUX, pct } from '../lib/format.js';

const isAdmin = u => ['admin', 'superadmin'].includes(u.role);
const enseignant = { ref: '/users?role=enseignant', label_of: u => `${u.nom}${u.specialite ? ` – ${u.specialite}` : ''}` };

export function Classes() {
  const { user } = useApp();
  const fields = [
    { key: 'niveau', label: 'Niveau', type: 'select', options: NIVEAUX, required: true },
    { key: 'section', label: 'Section', required: true, help: 'ex. A, B' },
    { key: 'cap', label: 'Capacité maximale', type: 'number', min: 1, required: true },
    { key: 'enseignant_titulaire_id', label: 'Enseignant titulaire', ...enseignant },
    { key: 'salle_id', label: 'Salle attitrée', ref: '/salles', label_of: s => `${s.nom} (${s.cap} places)` }
  ];
  const columns = [
    { key: 'classe', label: 'Classe', render: c => <span className="cell-main">{c.niveau} {c.section}</span>, sort: c => `${NIVEAUX.indexOf(c.niveau)}${c.section}`, text: c => `${c.niveau} ${c.section}` },
    { key: 'titulaire_nom', label: 'Titulaire' },
    { key: 'salle_nom', label: 'Salle' },
    { key: 'effectif', label: 'Effectif', sort: c => c.effectif / c.cap, render: c => {
      const t = (c.effectif / c.cap) * 100;
      return <div style={{ minWidth: 150 }}><div className="row between small"><b>{c.effectif} / {c.cap}</b><span className="muted">{pct(t)}</span></div><Meter value={c.effectif} max={c.cap} tone={t >= 100 ? 'danger' : t < 60 ? 'warning' : ''} /></div>;
    } },
    { key: 'alerte', label: 'État', sort: false, render: c => {
      const t = (c.effectif / c.cap) * 100;
      return t >= 100 ? <Badge tone="danger" dot>Complète</Badge> : t >= 95 ? <Badge tone="warning" dot>Presque complète</Badge> : t < 60 ? <Badge tone="info" dot>Sous-remplie</Badge> : <Badge tone="success" dot>Normale</Badge>;
    } }
  ];
  return (
    <>
      <PageHead eyebrow="Scolarité" title="Classes" subtitle="Niveaux, sections, capacité et enseignant titulaire pour l'année en cours. Une classe contenant des élèves ne peut être supprimée qu'après réaffectation." />
      <CrudTable entity="classes" label="Classe" fields={fields} columns={columns} canWrite={isAdmin(user)} defaults={{ niveau: 'CP', cap: 25 }} initialSort={{ key: 'classe', dir: 'asc' }} />
    </>
  );
}

export function Matieres() {
  const { user } = useApp();
  const fields = [
    { key: 'nom', label: 'Matière', required: true },
    { key: 'coef', label: 'Coefficient', type: 'number', step: 0.5, min: 0.5, required: true },
    { key: 'niveau', label: 'Niveau concerné', type: 'select', options: ['Tous', ...NIVEAUX], required: true },
    { key: 'enseignant_id', label: 'Enseignant référent', ...enseignant }
  ];
  const columns = [
    { key: 'nom', label: 'Matière', render: m => <span className="cell-main">{m.nom}</span> },
    { key: 'coef', label: 'Coefficient', num: true, sort: m => +m.coef, render: m => <Badge tone="accent">× {+m.coef}</Badge> },
    { key: 'niveau', label: 'Niveau' },
    { key: 'enseignant_nom', label: 'Enseignant référent', render: m => m.enseignant_nom || <span className="muted">Titulaire de la classe</span> }
  ];
  return (
    <>
      <PageHead eyebrow="Scolarité" title="Matières" subtitle="Les coefficients sont utilisés pour le calcul automatique des moyennes générales. Une matière déjà notée ne peut pas être supprimée." />
      <CrudTable entity="matieres" label="Matière" fields={fields} columns={columns} canWrite={isAdmin(user)} defaults={{ coef: 1, niveau: 'Tous' }} />
    </>
  );
}

export function Salles() {
  const { user } = useApp();
  const fields = [
    { key: 'nom', label: 'Nom', required: true },
    { key: 'cap', label: 'Capacité', type: 'number', min: 1, required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['Classe', 'Laboratoire', 'Sport', 'Polyvalente'], required: true },
    { key: 'batiment', label: 'Bâtiment' },
    { key: 'dispo', label: 'Disponibilité', type: 'select', options: ['Disponible', 'Indisponible'], required: true }
  ];
  const columns = [
    { key: 'nom', label: 'Salle', render: s => <span className="cell-main">{s.nom}</span> },
    { key: 'type', label: 'Type' },
    { key: 'batiment', label: 'Bâtiment' },
    { key: 'cap', label: 'Capacité', num: true },
    { key: 'nb_creneaux', label: 'Occupation', sort: s => s.nb_creneaux, render: s => <div style={{ minWidth: 130 }}><div className="small"><b>{s.nb_creneaux}</b> créneaux / 20</div><Meter value={s.nb_creneaux} max={20} tone={s.nb_creneaux < 8 ? 'warning' : ''} /></div> },
    { key: 'dispo', label: 'État', render: s => <Badge tone={s.dispo === 'Disponible' ? 'success' : 'danger'} dot>{s.dispo}</Badge> }
  ];
  return (
    <>
      <PageHead eyebrow="Scolarité" title="Salles" subtitle="Capacité, disponibilité et occupation hebdomadaire dans l'emploi du temps." />
      <CrudTable entity="salles" label="Salle" fields={fields} columns={columns} canWrite={isAdmin(user)} defaults={{ cap: 30, type: 'Classe', dispo: 'Disponible' }} />
    </>
  );
}
