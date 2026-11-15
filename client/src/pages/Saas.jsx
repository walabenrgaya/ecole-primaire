import React, { useState } from 'react';
import { Building2, Plus, Users, GraduationCap, Wallet, LogIn, Pencil } from 'lucide-react';
import { useApp, useFetch, PageHead, Kpi, Card, Badge, DataTable, Modal, Field, ErrorBox, Alert } from '../ui/core.jsx';
import { Bars } from '../ui/charts.jsx';
import { post, put } from '../lib/api.js';
import { money, pct, num, note, date } from '../lib/format.js';

const STATUS = { active: ['Actif', 'success'], trial: ['Essai', 'info'], suspended: ['Suspendu', 'danger'] };

export default function Saas() {
  const { toast } = useApp();
  const schools = useFetch('/saas/schools');
  const bi = useFetch('/bi/plateforme');
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  const entrer = s => { localStorage.setItem('ep_school', s.id); window.location.href = '/'; };
  const save = async e => {
    e.preventDefault();
    try {
      if (form.id) await put(`/saas/schools/${form.id}`, form); else await post('/saas/schools', form);
      toast(form.id ? 'Établissement mis à jour' : 'Établissement créé');
      setForm(null); schools.reload(); bi.reload();
    } catch (err) { setError(err); }
  };
  const k = bi.data?.kpis;

  return (
    <>
      <PageHead eyebrow="Console éditeur" title="Établissements clients" subtitle="Chaque école dispose de ses propres utilisateurs et de données strictement isolées. Comparez les performances et gérez les abonnements."
        actions={<button className="btn primary" onClick={() => { setError(null); setForm({ name: '', code: '', ville: '', plan: 'standard', capacite: 300, adminNom: '', adminEmail: '', adminPassword: '' }); }}><Plus size={16} />Nouvel établissement</button>} />
      {k && (
        <div className="kpis">
          <Kpi icon={Building2} label="Établissements" value={k.ecoles} hint={`${k.actives} actifs`} />
          <Kpi icon={Users} label="Élèves gérés" value={num(k.eleves)} />
          <Kpi icon={GraduationCap} label="Enseignants" value={num(k.enseignants)} />
          <Kpi icon={Wallet} label="Encaissements cumulés" value={money(k.encaisse)} tone="success" />
        </div>
      )}
      {bi.data && (
        <div className="grid g2" style={{ marginBottom: 16 }}>
          <Card title="Réussite et recouvrement par établissement"><Bars data={bi.data.ecoles} x="ecole" fmt={v => `${v}%`} series={[{ key: 'reussite', name: 'Taux de réussite' }, { key: 'recouvrement', name: 'Recouvrement', color: 'var(--c2)' }]} /></Card>
          <Card title="Effectifs et remplissage"><Bars data={bi.data.ecoles} x="ecole" series={[{ key: 'eleves', name: 'Élèves' }, { key: 'enseignants', name: 'Enseignants', color: 'var(--c3)' }]} /></Card>
        </div>
      )}
      <DataTable loading={schools.loading} rows={schools.data}
        columns={[
          { key: 'name', label: 'Établissement', render: s => <><div className="cell-main">{s.name}</div><div className="cell-sub">{s.code} · {s.ville}</div></>, text: s => `${s.name} ${s.code} ${s.ville}` },
          { key: 'plan', label: 'Offre', render: s => <Badge tone="accent">{s.plan}</Badge> },
          { key: 'status', label: 'Statut', render: s => <Badge tone={STATUS[s.status][1]} dot>{STATUS[s.status][0]}</Badge> },
          { key: 'nb_eleves', label: 'Élèves', num: true },
          { key: 'nb_enseignants', label: 'Enseignants', num: true },
          { key: 'nb_users', label: 'Comptes', num: true },
          { key: 'moyenne', label: 'Moyenne', num: true, sort: s => bi.data?.ecoles.find(e => e.id === s.id)?.moyenne, render: s => note(bi.data?.ecoles.find(e => e.id === s.id)?.moyenne) },
          { key: 'encaisse', label: 'Encaissé', num: true, render: s => money(s.encaisse) },
          { key: 'subscription_end', label: 'Fin d\'abonnement', render: s => date(s.subscription_end) }
        ]}
        actions={s => <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          <button className="btn sm ghost icon" aria-label="Modifier" title="Modifier" onClick={() => { setError(null); setForm({ id: s.id, name: s.name, ville: s.ville, plan: s.plan, status: s.status, capacite: s.capacite_accueil, subscriptionEnd: s.subscription_end?.slice(0, 10) }); }}><Pencil size={15} /></button>
          <button className="btn sm" onClick={() => entrer(s)}><LogIn size={14} />Accéder</button>
        </div>} />
      {form && (
        <Modal title={form.id ? 'Modifier l\'établissement' : 'Nouvel établissement'} onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>Annuler</button><button className="btn primary" form="school">Enregistrer</button></>}>
          <form id="school" className="stack" onSubmit={save}>
            <ErrorBox error={error} />
            <div className="form-grid">
              <Field label="Nom" required full><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></Field>
              {!form.id && <Field label="Code unique" required help="ex. ecole-nabeul"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required /></Field>}
              <Field label="Ville"><input value={form.ville || ''} onChange={e => setForm({ ...form, ville: e.target.value })} /></Field>
              <Field label="Offre"><select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>{['basic', 'standard', 'premium', 'enterprise'].map(p => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Capacité d'accueil"><input type="number" value={form.capacite || ''} onChange={e => setForm({ ...form, capacite: +e.target.value })} /></Field>
              {form.id && <>
                <Field label="Statut"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">Actif</option><option value="trial">Essai</option><option value="suspended">Suspendu</option></select></Field>
                <Field label="Fin d'abonnement"><input type="date" value={form.subscriptionEnd || ''} onChange={e => setForm({ ...form, subscriptionEnd: e.target.value })} /></Field>
              </>}
            </div>
            {!form.id && <>
              <Alert>Un compte administrateur est créé pour l'établissement (mot de passe temporaire, 8 caractères minimum).</Alert>
              <div className="form-grid">
                <Field label="Nom de l'administrateur"><input value={form.adminNom} onChange={e => setForm({ ...form, adminNom: e.target.value })} /></Field>
                <Field label="E-mail administrateur" required><input type="email" value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} required /></Field>
                <Field label="Mot de passe temporaire" required full><input minLength={8} value={form.adminPassword} onChange={e => setForm({ ...form, adminPassword: e.target.value })} required /></Field>
              </div>
            </>}
          </form>
        </Modal>
      )}
    </>
  );
}
