import React, { useState } from 'react';
import { Plus, Pencil, Power, Trash2, UserCog, CalendarOff } from 'lucide-react';
import { useApp, useFetch, PageHead, Tabs, Badge, DataTable, Modal, Field, ErrorBox } from '../ui/core.jsx';
import { CrudTable } from '../ui/Crud.jsx';
import { api, post, put } from '../lib/api.js';
import { ROLE_LABEL, relative, date } from '../lib/format.js';

const ROLE_TONE = { admin: 'danger', directeur: 'info', enseignant: 'accent', comptable: 'warning', parent: '', eleve: '' };

export default function Personnel() {
  const [tab, setTab] = useState('comptes');
  return (
    <>
      <PageHead eyebrow="Administration" title="Comptes et personnel" subtitle="Chaque compte dispose de droits correspondant à son rôle. Les mots de passe sont chiffrés (bcrypt) et chaque modification est journalisée." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'comptes', label: 'Comptes utilisateurs', icon: UserCog }, { id: 'absences', label: 'Absences des enseignants', icon: CalendarOff }]} />
      {tab === 'comptes' ? <Comptes /> : <AbsencesEnseignants />}
    </>
  );
}

function Comptes() {
  const { user, toast, confirm } = useApp();
  const admin = ['admin', 'superadmin'].includes(user.role);
  const [role, setRole] = useState('');
  const list = useFetch(`/users${role ? `?role=${role}` : ''}`);
  const eleves = useFetch(admin ? '/eleves?statut=inscrit' : null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  const save = async e => {
    e.preventDefault();
    const body = { ...form };
    if (!body.password) delete body.password;
    try {
      if (form.id) await put(`/users/${form.id}`, body); else await post('/users', body);
      toast(form.id ? 'Compte modifié' : 'Compte créé');
      setForm(null); list.reload();
    } catch (err) { setError(err); }
  };
  const toggle = async u => { try { await put(`/users/${u.id}`, { actif: !u.actif }); toast(u.actif ? 'Compte désactivé' : 'Compte réactivé'); list.reload(); } catch (e) { toast(e.message, 'error'); } };
  const remove = async u => {
    if (!(await confirm({ title: 'Supprimer le compte', message: `Supprimer le compte de ${u.nom} ?`, danger: true, confirmLabel: 'Supprimer' }))) return;
    try { await api(`/users/${u.id}`, { method: 'DELETE' }); toast('Compte supprimé'); list.reload(); }
    catch (e) {
      if (e.status === 409 && e.data.forcable && await confirm({ title: 'Compte référencé', message: e.message, danger: true, confirmLabel: 'Désactiver et supprimer' })) {
        await api(`/users/${u.id}?force=true`, { method: 'DELETE' }); toast('Compte supprimé'); list.reload();
      } else if (e.status !== 409) toast(e.message, 'error');
    }
  };

  return (
    <>
      <DataTable loading={list.loading} rows={list.data}
        filters={<select value={role} onChange={e => setRole(e.target.value)} aria-label="Filtrer par rôle"><option value="">Tous les rôles</option>{['admin', 'directeur', 'enseignant', 'comptable', 'parent', 'eleve'].map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}
        toolbar={admin && <button className="btn primary" onClick={() => { setError(null); setForm({ role: 'enseignant', nom: '', email: '', password: '' }); }}><Plus size={16} />Créer un compte</button>}
        columns={[
          { key: 'nom', label: 'Nom', render: u => <><div className="cell-main">{u.nom}</div><div className="cell-sub">{u.email}</div></>, text: u => `${u.nom} ${u.email}` },
          { key: 'role', label: 'Rôle', render: u => <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge> },
          { key: 'specialite', label: 'Spécialité', render: u => u.specialite || '—' },
          { key: 'telephone', label: 'Téléphone' },
          { key: 'last_login', label: 'Dernière connexion', render: u => relative(u.last_login), sort: u => u.last_login || '' },
          { key: 'actif', label: 'État', render: u => <Badge tone={u.actif ? 'success' : 'danger'} dot>{u.actif ? 'Actif' : 'Désactivé'}</Badge> }
        ]}
        actions={admin ? u => <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 4 }}>
          <button className="btn sm ghost icon" title="Modifier" aria-label="Modifier" onClick={() => { setError(null); setForm({ ...u, password: '' }); }}><Pencil size={15} /></button>
          {String(u.id) !== user.id && <button className="btn sm ghost icon" title={u.actif ? 'Désactiver' : 'Réactiver'} aria-label="Activer ou désactiver" onClick={() => toggle(u)}><Power size={15} /></button>}
          {String(u.id) !== user.id && <button className="btn sm ghost icon danger" title="Supprimer" aria-label="Supprimer" onClick={() => remove(u)}><Trash2 size={15} /></button>}
        </div> : undefined} />
      {form && (
        <Modal title={form.id ? 'Modifier le compte' : 'Créer un compte'} onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>Annuler</button><button className="btn primary" form="user">Enregistrer</button></>}>
          <form id="user" className="stack" onSubmit={save}>
            <ErrorBox error={error} />
            <div className="form-grid">
              <Field label="Nom complet" required><input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required /></Field>
              <Field label="E-mail" required><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></Field>
              <Field label="Rôle" required><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{['admin', 'directeur', 'enseignant', 'comptable', 'parent', 'eleve'].map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
              <Field label="Téléphone"><input value={form.telephone || ''} onChange={e => setForm({ ...form, telephone: e.target.value })} /></Field>
              {form.role === 'enseignant' && <>
                <Field label="Spécialité"><input value={form.specialite || ''} onChange={e => setForm({ ...form, specialite: e.target.value })} /></Field>
                <Field label="Heures max / semaine"><input type="number" min={1} value={form.heures_max || 24} onChange={e => setForm({ ...form, heures_max: +e.target.value })} /></Field>
              </>}
              {form.role === 'eleve' && !form.id && <Field label="Dossier élève lié" required full><select value={form.eleve_id || ''} onChange={e => setForm({ ...form, eleve_id: +e.target.value })} required><option value="">Sélectionner…</option>{(eleves.data || []).map(e => <option key={e.id} value={e.id}>{e.nom} {e.prenom} – {e.classe_nom}</option>)}</select></Field>}
              <Field label={form.id ? 'Nouveau mot de passe' : 'Mot de passe temporaire'} required={!form.id} help="8 caractères minimum" full>
                <input type="text" minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!form.id} placeholder={form.id ? 'Laisser vide pour ne pas changer' : ''} />
              </Field>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function AbsencesEnseignants() {
  const { user } = useApp();
  const ens = { ref: '/users?role=enseignant', label_of: u => u.nom };
  return (
    <CrudTable entity="absences_enseignants" label="Absence enseignant" canWrite={['admin', 'directeur', 'superadmin'].includes(user.role)}
      defaults={{ date: new Date().toISOString().slice(0, 10), nb_heures: 4 }}
      fields={[
        { key: 'enseignant_id', label: 'Enseignant absent', ...ens, required: true },
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'nb_heures', label: 'Heures non assurées', type: 'number', step: 0.5, min: 0.5 },
        { key: 'motif', label: 'Motif' },
        { key: 'remplacant_id', label: 'Remplaçant', ...ens, help: 'Laisser vide si non remplacé' }
      ]}
      columns={[
        { key: 'date', label: 'Date', render: a => date(a.date), sort: a => a.date },
        { key: 'enseignant_nom', label: 'Enseignant', render: a => <span className="cell-main">{a.enseignant_nom}</span> },
        { key: 'nb_heures', label: 'Heures', num: true },
        { key: 'motif', label: 'Motif' },
        { key: 'remplacant_nom', label: 'Remplacement', render: a => a.remplacant_nom ? <Badge tone="success">{a.remplacant_nom}</Badge> : <Badge tone="danger">Non remplacé</Badge> }
      ]} />
  );
}
