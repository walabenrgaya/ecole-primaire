import React, { useState } from 'react';
import { Receipt, Send, BellRing, Plus, CheckCircle2, Wallet, AlertTriangle, Percent, TrendingUp } from 'lucide-react';
import { useApp, useFetch, PageHead, Tabs, Badge, DataTable, Modal, Field, ErrorBox, Alert, Kpi, Card, Loading, Empty } from '../ui/core.jsx';
import { CrudTable } from '../ui/Crud.jsx';
import { openFile, post } from '../lib/api.js';
import { money, money2, date, dateTime, MODES, NIVEAUX, pct, relative } from '../lib/format.js';

export default function Finances() {
  const { user } = useApp();
  if (user.role === 'parent') return <FinancesParent />;
  const lecture = user.role === 'directeur';
  const tabs = [
    { id: 'paiements', label: 'Paiements', icon: Receipt },
    { id: 'impayes', label: 'Impayés et relances', icon: BellRing },
    { id: 'grille', label: 'Grille tarifaire', icon: Wallet },
    { id: 'depenses', label: 'Dépenses', icon: TrendingUp },
    { id: 'envois', label: 'Journal des envois', icon: Send }
  ];
  const [tab, setTab] = useState('paiements');
  return (
    <>
      <PageHead eyebrow="Finances" title="Gestion financière" subtitle="Chaque paiement enregistré génère un reçu PDF et envoie automatiquement un message au parent (montant, date, mode, nouveau solde et lien du reçu)." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'paiements' && <Paiements lecture={lecture} />}
      {tab === 'impayes' && <Impayes lecture={lecture} />}
      {tab === 'grille' && <Grille lecture={lecture} />}
      {tab === 'depenses' && <Depenses lecture={lecture} />}
      {tab === 'envois' && <Envois />}
    </>
  );
}

const recu = (p, toast) => openFile(`/paiements/${p.id}/recu.pdf`).catch(e => toast(e.message, 'error'));

function Paiements({ lecture }) {
  const { toast } = useApp();
  const [modal, setModal] = useState(false);
  const [tick, setTick] = useState(0);
  const fields = [
    { key: 'eleve_id', label: 'Élève', ref: '/eleves?statut=inscrit', label_of: e => `${e.nom} ${e.prenom}`, required: true },
    { key: 'montant', label: 'Montant (TND)', type: 'number', min: 1, required: true },
    { key: 'mode', label: 'Mode', type: 'select', options: MODES, required: true },
    { key: 'type', label: 'Objet' },
    { key: 'date', label: 'Date', type: 'date', required: true }
  ];
  const columns = [
    { key: 'date', label: 'Date', render: p => date(p.date), sort: p => p.date },
    { key: 'recu_num', label: 'Reçu', render: p => <span className="small strong">{p.recu_num}</span> },
    { key: 'eleve_nom', label: 'Élève', render: p => <><div className="cell-main">{p.eleve_nom}</div><div className="cell-sub">{p.classe_nom}</div></>, text: p => `${p.eleve_nom} ${p.classe_nom}` },
    { key: 'type', label: 'Objet' },
    { key: 'mode', label: 'Mode', render: p => <Badge>{p.mode}</Badge> },
    { key: 'montant', label: 'Montant', num: true, sort: p => +p.montant, render: p => <b>{money2(p.montant)}</b> }
  ];
  return (
    <>
      <CrudTable key={tick} entity="paiements" label="Paiement" fields={fields} columns={columns} canWrite={!lecture} canCreate={false}
        toolbar={!lecture && <button className="btn primary" onClick={() => setModal(true)}><Plus size={16} />Encaisser un paiement</button>}
        extraActions={p => <button className="btn sm ghost icon" title="Reçu PDF" aria-label="Reçu PDF" onClick={() => recu(p, toast)}><Receipt size={15} /></button>} />
      {modal && <NouveauPaiement onClose={() => setModal(false)} onDone={() => setTick(t => t + 1)} />}
    </>
  );
}

function NouveauPaiement({ onClose, onDone }) {
  const { toast } = useApp();
  const eleves = useFetch('/eleves?statut=inscrit');
  const [f, setF] = useState({ eleve_id: '', montant: '', mode: 'Espèces', type: 'Scolarité – tranche', date: new Date().toISOString().slice(0, 10) });
  const situation = useFetch(f.eleve_id ? `/eleves/${f.eleve_id}/situation` : null);
  const [error, setError] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { setRes(await post('/paiements', { ...f, montant: +f.montant })); onDone(); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  };
  if (res) {
    return (
      <Modal title="Paiement enregistré" onClose={onClose} footer={<><button className="btn" onClick={() => recu(res.paiement, toast)}><Receipt size={15} />Ouvrir le reçu</button><button className="btn primary" onClick={onClose}>Terminer</button></>}>
        <div className="stack">
          <Alert tone="success">Reçu n° <b>{res.paiement.recu_num}</b> généré pour {money2(res.paiement.montant)}.</Alert>
          <div className="grid g3">
            <Kpi label="Total dû" value={money(res.situation.du)} />
            <Kpi label="Payé" value={money(res.situation.paye)} tone="success" />
            <Kpi label="Nouveau solde" value={money(res.situation.reste)} tone={res.situation.reste > 0 ? 'warning' : 'success'} />
          </div>
          <div className="list">
            <div className="list-item"><div className="ico"><CheckCircle2 size={16} color="var(--success)" /></div><div><b className="small">Messagerie interne</b><div className="small muted">Message {res.envoi.message} au parent (montant, date, mode, solde, lien du reçu)</div></div></div>
            <div className="list-item"><div className="ico"><Send size={16} /></div><div><b className="small">E-mail</b><div className="small muted">{res.envoi.email === 'envoye' ? 'Envoyé' : res.envoi.email === 'simule' ? 'Simulé (SMTP non configuré) et journalisé' : res.envoi.email || 'Aucun e-mail'}</div></div></div>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Encaisser un paiement" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" form="pay" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer et notifier'}</button></>}>
      <form id="pay" onSubmit={submit} className="stack">
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Élève" required full>
            <select value={f.eleve_id} onChange={e => setF({ ...f, eleve_id: e.target.value })} required>
              <option value="">Sélectionner…</option>
              {(eleves.data || []).map(e => <option key={e.id} value={e.id}>{e.nom} {e.prenom} – {e.classe_nom}</option>)}
            </select>
          </Field>
          {situation.data && <div className="full"><Alert tone={situation.data.reste > 0 ? 'warning' : 'success'}>Total dû {money(situation.data.du)} · payé {money(situation.data.paye)} · <b>reste {money(situation.data.reste)}</b></Alert></div>}
          <Field label="Montant (TND)" required><input type="number" min="1" step="0.01" value={f.montant} onChange={e => setF({ ...f, montant: e.target.value })} required /></Field>
          <Field label="Mode de paiement" required><select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}>{MODES.map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Objet"><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{['Frais d\'inscription', 'Scolarité – tranche', 'Scolarité complète', 'Scolarité – acompte'].map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Date" required><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required /></Field>
        </div>
      </form>
    </Modal>
  );
}

function Impayes({ lecture }) {
  const { toast, confirm } = useApp();
  const list = useFetch('/finances/impayes');
  const relancer = async x => {
    try { await post(`/finances/relancer/${x.id}`); toast(`Relance envoyée à ${x.parent_nom}`); list.reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const auto = async () => {
    if (!(await confirm({ title: 'Relances automatiques', message: 'Envoyer un rappel à chaque famille ayant un solde impayé et non relancée depuis 30 jours ? (Cette tâche s\'exécute aussi automatiquement chaque jour.)', confirmLabel: 'Lancer' }))) return;
    try { const r = await post('/finances/relances-auto'); toast(`${r.envoyees} relance(s) envoyée(s)`); list.reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const total = (list.data || []).reduce((s, x) => s + x.reste, 0);
  return (
    <>
      <div className="kpis">
        <Kpi icon={AlertTriangle} label="Familles avec solde" value={(list.data || []).length} tone="warning" />
        <Kpi icon={Wallet} label="Reste à encaisser" value={money(total)} tone="danger" />
      </div>
      <DataTable loading={list.loading} rows={list.data}
        toolbar={!lecture && <button className="btn primary" onClick={auto}><BellRing size={16} />Lancer les relances automatiques</button>}
        columns={[
          { key: 'nom', label: 'Élève', render: x => <><div className="cell-main">{x.nom} {x.prenom}</div><div className="cell-sub">{x.classe}</div></>, text: x => `${x.nom} ${x.prenom} ${x.classe}` },
          { key: 'parent_nom', label: 'Parent', render: x => <><div>{x.parent_nom}</div><div className="cell-sub">{x.parent_tel}</div></> },
          { key: 'du', label: 'Dû', num: true, render: x => money(x.du) },
          { key: 'paye', label: 'Payé', num: true, render: x => money(x.paye) },
          { key: 'reste', label: 'Reste', num: true, render: x => <b style={{ color: 'var(--danger)' }}>{money(x.reste)}</b> },
          { key: 'dernier_paiement', label: 'Dernier paiement', render: x => date(x.dernier_paiement), sort: x => x.dernier_paiement || '' },
          { key: 'derniere_relance', label: 'Dernière relance', render: x => x.derniere_relance ? relative(x.derniere_relance) : <span className="muted">jamais</span>, sort: x => x.derniere_relance || '' }
        ]}
        initialSort={{ key: 'reste', dir: 'desc' }}
        actions={lecture ? undefined : x => <button className="btn sm" onClick={() => relancer(x)}><Send size={14} />Relancer</button>} />
    </>
  );
}

function Grille({ lecture }) {
  return (
    <CrudTable entity="frais" label="Tarif" canWrite={!lecture} defaults={{ niveau: 'Tous', nb_tranches: 3 }}
      fields={[
        { key: 'niveau', label: 'Niveau', type: 'select', options: ['Tous', ...NIVEAUX], required: true, help: 'Un tarif par niveau remplace le tarif « Tous ».' },
        { key: 'inscription', label: 'Frais d\'inscription (TND)', type: 'number', min: 0, required: true },
        { key: 'scolarite', label: 'Scolarité annuelle (TND)', type: 'number', min: 0, required: true },
        { key: 'nb_tranches', label: 'Nombre de tranches', type: 'number', min: 1, max: 10, required: true }
      ]}
      columns={[
        { key: 'niveau', label: 'Niveau', render: f => <Badge tone="accent">{f.niveau}</Badge> },
        { key: 'inscription', label: 'Inscription', num: true, render: f => money(f.inscription) },
        { key: 'scolarite', label: 'Scolarité', num: true, render: f => money(f.scolarite) },
        { key: 'nb_tranches', label: 'Tranches', num: true, render: f => `${f.nb_tranches} × ${money(f.scolarite / f.nb_tranches)}` },
        { key: 'total', label: 'Total annuel', num: true, sort: f => +f.inscription + +f.scolarite, render: f => <b>{money(+f.inscription + +f.scolarite)}</b> }
      ]} />
  );
}

function Depenses({ lecture }) {
  return (
    <CrudTable entity="depenses" label="Dépense" canWrite={!lecture} defaults={{ date: new Date().toISOString().slice(0, 10), categorie: 'Fournitures' }}
      fields={[
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'categorie', label: 'Catégorie', type: 'select', options: ['Salaires', 'Loyer et charges', 'Fournitures', 'Maintenance', 'Transport', 'Autre'], required: true },
        { key: 'libelle', label: 'Libellé', full: true },
        { key: 'montant', label: 'Montant (TND)', type: 'number', min: 1, required: true }
      ]}
      columns={[
        { key: 'date', label: 'Date', render: d => date(d.date), sort: d => d.date },
        { key: 'categorie', label: 'Catégorie', render: d => <Badge>{d.categorie}</Badge> },
        { key: 'libelle', label: 'Libellé' },
        { key: 'montant', label: 'Montant', num: true, sort: d => +d.montant, render: d => <b>{money(d.montant)}</b> }
      ]} />
  );
}

function Envois() {
  const list = useFetch('/envois');
  return (
    <DataTable loading={list.loading} rows={list.data} columns={[
      { key: 'created_at', label: 'Date', render: e => dateTime(e.created_at), sort: e => e.created_at },
      { key: 'canal', label: 'Canal', render: e => <Badge tone={e.canal === 'email' ? 'info' : 'accent'}>{e.canal}</Badge> },
      { key: 'destinataire', label: 'Destinataire' },
      { key: 'objet', label: 'Objet' },
      { key: 'statut', label: 'Statut', render: e => <Badge tone={e.statut === 'envoye' ? 'success' : e.statut === 'simule' ? 'warning' : 'danger'} dot>{e.statut === 'envoye' ? 'Envoyé' : e.statut === 'simule' ? 'Simulé' : 'Échec'}</Badge> }
    ]} />
  );
}

function FinancesParent() {
  const { user, toast } = useApp();
  const paiements = useFetch('/paiements');
  return (
    <>
      <PageHead eyebrow="Finances" title="Paiements et reçus" subtitle="Situation des frais de scolarité de vos enfants et téléchargement des reçus." />
      <div className="grid g2" style={{ marginBottom: 16 }}>
        {(user.enfants || []).map(e => <Situation key={e.id} enfant={e} />)}
      </div>
      <DataTable loading={paiements.loading} rows={paiements.data} searchable={false}
        columns={[
          { key: 'date', label: 'Date', render: p => date(p.date), sort: p => p.date },
          { key: 'eleve_nom', label: 'Enfant' },
          { key: 'type', label: 'Objet' },
          { key: 'mode', label: 'Mode' },
          { key: 'montant', label: 'Montant', num: true, render: p => <b>{money2(p.montant)}</b> }
        ]}
        actions={p => <button className="btn sm" onClick={() => recu(p, toast)}><Receipt size={14} />Reçu</button>} />
    </>
  );
}

function Situation({ enfant }) {
  const s = useFetch(`/eleves/${enfant.id}/situation`);
  if (s.loading) return <Card><Loading /></Card>;
  if (!s.data) return <Card><Empty /></Card>;
  const t = s.data.du ? (s.data.paye / s.data.du) * 100 : 100;
  return (
    <Card title={`${enfant.prenom} ${enfant.nom}`} sub={enfant.classe}>
      <div className="row between"><span className="muted small strong">Payé</span><b>{money(s.data.paye)} / {money(s.data.du)}</b></div>
      <div className="meter mt" style={{ marginTop: 8 }}><i style={{ width: `${Math.min(100, t)}%` }} /></div>
      <div className="row between mt"><span className="small muted">{pct(t)} réglé</span><Badge tone={s.data.reste > 0 ? 'warning' : 'success'}>{s.data.reste > 0 ? `Reste ${money(s.data.reste)}` : 'À jour'}</Badge></div>
    </Card>
  );
}
