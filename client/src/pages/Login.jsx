import React, { useEffect, useState } from 'react';
import { GraduationCap, BarChart3, ShieldCheck, Wallet, MessagesSquare, CalendarDays, Moon, Sun, UserPlus, Building2, UserCog, Presentation, Calculator, Users, Backpack, Crown } from 'lucide-react';
import { post, get } from '../lib/api.js';
import { Field, ErrorBox, Modal, Alert } from '../ui/core.jsx';
import { NIVEAUX } from '../lib/format.js';

// Comptes de démonstration (mots de passe temporaires – voir le document des identifiants)
const DEMO = [
  { ecole: 'Abou El Kacem Chebbi · Sousse', domaine: 'chebbi.demo.tn' },
  { ecole: 'Ibn Khaldoun · Tunis', domaine: 'ibnkhaldoun.demo.tn' },
  { ecole: 'Les Oliviers · Sfax', domaine: 'oliviers.demo.tn' }
];
const ROLES = [
  ['admin', 'Administrateur', UserCog, 'Demo#Admin2026'],
  ['directeur', 'Directeur', Presentation, 'Demo#Direct2026'],
  ['enseignant', 'Enseignant', Users, 'Demo#Prof2026'],
  ['comptable', 'Comptable', Calculator, 'Demo#Compta2026'],
  ['parent', 'Parent', Users, 'Demo#Parent2026'],
  ['eleve', 'Élève', Backpack, 'Demo#Eleve2026']
];
const SHOW_DEMO = import.meta.env.VITE_DEMO !== 'false';

export default function Login({ onLogin, theme, setTheme }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ecole, setEcole] = useState(0);
  const [preinscription, setPreinscription] = useState(false);

  const login = async (e, creds) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try { onLogin(await post('/auth/login', creds || { email, password })); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <section className="login-hero">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark"><GraduationCap size={20} /></div>
          <div><div className="brand-name">EduPilot</div><div className="brand-sub">Plateforme SaaS de gestion scolaire</div></div>
        </div>
        <h1>Pilotez votre école avec des <em>données fiables</em>, pas des intuitions.</h1>
        <p className="lead">Scolarité, finances, pédagogie et communication réunies dans un seul espace sécurisé – avec un module d'aide à la décision pour anticiper plutôt que subir.</p>
        <div className="feature-list">
          <div><BarChart3 size={17} />10 tableaux de bord décisionnels et alertes précoces</div>
          <div><Building2 size={17} />Multi-établissements, données strictement isolées</div>
          <div><Wallet size={17} />Paiements, reçus PDF et relances automatiques</div>
          <div><MessagesSquare size={17} />Messagerie parents, enseignants, administration</div>
          <div><CalendarDays size={17} />Emplois du temps sans conflit d'horaires</div>
          <div><ShieldCheck size={17} />Rôles, journal d'audit et conformité RGPD</div>
        </div>
        <div className="foot">© {new Date().getFullYear()} EduPilot · Projet Cloud & Big Data</div>
      </section>

      <section className="login-panel">
        <div className="row between">
          <span className="eyebrow" style={{ margin: 0 }}>Espace sécurisé</span>
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Changer de thème">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        </div>
        <h2 className="mt">Connexion</h2>
        <p className="muted">Identifiez-vous avec les accès fournis par votre établissement.</p>

        <form className="login-form" onSubmit={login}>
          <ErrorBox error={error} />
          <Field label="Adresse e-mail"><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required placeholder="prenom.nom@ecole.tn" /></Field>
          <Field label="Mot de passe"><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
          <button className="btn primary block" style={{ height: 42 }} disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
          <button type="button" className="btn block" onClick={() => setPreinscription(true)}><UserPlus size={16} />Pré-inscrire un enfant en ligne</button>
        </form>

        {SHOW_DEMO && (
          <div className="demo-box">
            <div className="head">
              <span>Accès de démonstration</span>
              <select className="input" style={{ height: 30, width: 'auto', fontSize: 12 }} value={ecole} onChange={e => setEcole(+e.target.value)} aria-label="Établissement de démonstration">
                {DEMO.map((d, i) => <option key={d.domaine} value={i}>{d.ecole}</option>)}
              </select>
            </div>
            <div className="demo-roles">
              {ROLES.map(([role, label, Icon, pwd]) => (
                <button key={role} disabled={busy} onClick={() => login(null, { email: `${role}@${DEMO[ecole].domaine}`, password: pwd })}><Icon size={15} />{label}</button>
              ))}
            </div>
            <div style={{ padding: '0 10px 10px' }}>
              <button className="btn sm ghost block" disabled={busy} onClick={() => login(null, { email: 'superadmin@edupilot-demo.tn', password: 'Demo#Saas2026' })}><Crown size={15} />Console éditeur SaaS (super-admin)</button>
            </div>
          </div>
        )}
      </section>
      {preinscription && <PreinscriptionPublique onClose={() => setPreinscription(false)} />}
    </div>
  );
}

function PreinscriptionPublique({ onClose }) {
  const [ecoles, setEcoles] = useState([]);
  const [f, setF] = useState({ school_id: '', nom: '', prenom: '', naissance: '', genre: 'M', niveau_demande: 'CP', parent_nom: '', parent_email: '', parent_tel: '', ville: '', adresse: '', antecedents_medicaux: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [rgpd, setRgpd] = useState(false);
  useEffect(() => { get('/public/ecoles').then(e => { setEcoles(e); setF(x => ({ ...x, school_id: e[0]?.id || '' })); }).catch(setError); }, []);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const submit = async e => {
    e.preventDefault();
    try { await post('/preinscriptions', f); setDone(true); } catch (err) { setError(err); }
  };
  return (
    <Modal title="Pré-inscription en ligne" onClose={onClose} size="wide"
      footer={done ? <button className="btn primary" onClick={onClose}>Fermer</button> : <><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" form="pre" disabled={!rgpd}>Envoyer la demande</button></>}>
      {done ? <Alert tone="success">Votre demande a bien été transmise. L'administration de l'établissement vous contactera par e-mail après validation, avec vos identifiants de connexion.</Alert> : (
        <form id="pre" className="stack" onSubmit={submit}>
          <ErrorBox error={error} />
          <div className="form-grid">
            <Field label="Établissement" required full><select value={f.school_id} onChange={e => set('school_id', +e.target.value)}>{ecoles.map(s => <option key={s.id} value={s.id}>{s.name} – {s.ville}</option>)}</select></Field>
            <Field label="Nom de l'enfant" required><input value={f.nom} onChange={e => set('nom', e.target.value)} required /></Field>
            <Field label="Prénom" required><input value={f.prenom} onChange={e => set('prenom', e.target.value)} required /></Field>
            <Field label="Date de naissance" required><input type="date" value={f.naissance} onChange={e => set('naissance', e.target.value)} required /></Field>
            <Field label="Genre"><select value={f.genre} onChange={e => set('genre', e.target.value)}><option value="M">Garçon</option><option value="F">Fille</option></select></Field>
            <Field label="Niveau demandé" required><select value={f.niveau_demande} onChange={e => set('niveau_demande', e.target.value)}>{NIVEAUX.map(n => <option key={n}>{n}</option>)}</select></Field>
            <Field label="Ville"><input value={f.ville} onChange={e => set('ville', e.target.value)} /></Field>
            <Field label="Nom du parent / tuteur" required><input value={f.parent_nom} onChange={e => set('parent_nom', e.target.value)} required /></Field>
            <Field label="E-mail du parent" required><input type="email" value={f.parent_email} onChange={e => set('parent_email', e.target.value)} required /></Field>
            <Field label="Téléphone"><input value={f.parent_tel} onChange={e => set('parent_tel', e.target.value)} /></Field>
            <Field label="Adresse"><input value={f.adresse} onChange={e => set('adresse', e.target.value)} /></Field>
            <Field label="Antécédents médicaux" full><textarea value={f.antecedents_medicaux} onChange={e => set('antecedents_medicaux', e.target.value)} placeholder="Allergies, traitements…" /></Field>
          </div>
          <label className="checkbox"><input type="checkbox" checked={rgpd} onChange={e => setRgpd(e.target.checked)} />J'accepte que ces données soient traitées par l'établissement pour l'inscription de mon enfant (consentement parental RGPD).</label>
        </form>
      )}
    </Modal>
  );
}
