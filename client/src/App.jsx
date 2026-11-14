import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GraduationCap, LayoutDashboard, Users, School, BookOpen, DoorOpen, CalendarDays, ClipboardList, FileText,
  CalendarX, Wallet, NotebookPen, Megaphone, MessagesSquare, UserCog, ScrollText, Building2, Bell, Moon, Sun,
  LogOut, Menu, KeyRound, ChevronRight, BarChart3, UserPlus, LineChart, ShieldCheck, Cloud, ExternalLink
} from 'lucide-react';
import { api, get, post, setUnauthorizedHandler, openFile } from './lib/api.js';
import { navigate, useLocation } from './lib/router.js';
import { ROLE_LABEL, initials, relative } from './lib/format.js';
import { AppCtx, useConfirm, useToasts, Loading, Modal, Field, ErrorBox } from './ui/core.jsx';
import Login from './pages/Login.jsx';
import Accueil from './pages/Accueil.jsx';
import Eleves from './pages/Eleves.jsx';
import { Classes, Matieres, Salles } from './pages/Referentiel.jsx';
import Emplois from './pages/Emplois.jsx';
import Notes from './pages/Notes.jsx';
import Bulletins from './pages/Bulletins.jsx';
import Absences from './pages/Absences.jsx';
import Finances from './pages/Finances.jsx';
import Devoirs from './pages/Devoirs.jsx';
import Messages from './pages/Messages.jsx';
import Annonces from './pages/Annonces.jsx';
import Preinscriptions from './pages/Preinscriptions.jsx';
import Personnel from './pages/Personnel.jsx';
import Journal from './pages/Journal.jsx';
import Saas from './pages/Saas.jsx';
import BI from './pages/BI.jsx';

/* --------------------------- Navigation par rôle --------------------------- */
const NAV = [
  { group: 'Pilotage', items: [
    { path: '/', label: 'Accueil', icon: LayoutDashboard, roles: '*' },
    { path: '/bi', label: 'Aide à la décision', icon: BarChart3, roles: ['admin', 'directeur', 'superadmin'] },
    { path: '/plateforme', label: 'Établissements', icon: Building2, roles: ['superadmin'], platform: true }
  ] },
  { group: 'Scolarité', items: [
    { path: '/eleves', label: 'Élèves', icon: Users, roles: ['admin', 'directeur', 'comptable', 'enseignant', 'superadmin'] },
    { path: '/preinscriptions', label: 'Inscriptions en ligne', icon: UserPlus, roles: ['admin', 'comptable', 'superadmin'] },
    { path: '/classes', label: 'Classes', icon: School, roles: ['admin', 'directeur', 'superadmin'] },
    { path: '/matieres', label: 'Matières', icon: BookOpen, roles: ['admin', 'directeur', 'superadmin'] },
    { path: '/salles', label: 'Salles', icon: DoorOpen, roles: ['admin', 'directeur', 'superadmin'] },
    { path: '/emplois', label: 'Emploi du temps', icon: CalendarDays, roles: '*' }
  ] },
  { group: 'Pédagogie', items: [
    { path: '/notes', label: 'Notes', icon: ClipboardList, roles: ['admin', 'directeur', 'enseignant', 'superadmin'] },
    { path: '/bulletins', label: 'Bulletins', icon: FileText, roles: ['admin', 'directeur', 'enseignant', 'parent', 'eleve', 'superadmin'] },
    { path: '/absences', label: 'Absences', icon: CalendarX, roles: ['admin', 'directeur', 'enseignant', 'parent', 'eleve', 'superadmin'] },
    { path: '/devoirs', label: 'Devoirs', icon: NotebookPen, roles: ['admin', 'directeur', 'enseignant', 'parent', 'eleve', 'superadmin'] }
  ] },
  { group: 'Finances', items: [
    { path: '/finances', label: 'Paiements', icon: Wallet, roles: ['admin', 'directeur', 'comptable', 'parent', 'superadmin'] },
    { path: '/bi/finances', label: 'Tableau financier', icon: LineChart, roles: ['comptable'] }
  ] },
  { group: 'Communication', items: [
    { path: '/messages', label: 'Messagerie', icon: MessagesSquare, roles: ['admin', 'directeur', 'enseignant', 'comptable', 'parent', 'eleve'], badge: 'messages' },
    { path: '/annonces', label: 'Annonces', icon: Megaphone, roles: '*' }
  ] },
  { group: 'Administration', items: [
    { path: '/personnel', label: 'Comptes & personnel', icon: UserCog, roles: ['admin', 'directeur', 'superadmin'] },
    { path: '/journal', label: 'Journal d\'audit', icon: ScrollText, roles: ['admin', 'directeur', 'superadmin'] }
  ] }
];

const ROUTES = [
  ['/bi', BI], ['/plateforme', Saas], ['/eleves', Eleves], ['/preinscriptions', Preinscriptions], ['/classes', Classes],
  ['/matieres', Matieres], ['/salles', Salles], ['/emplois', Emplois], ['/notes', Notes], ['/bulletins', Bulletins],
  ['/absences', Absences], ['/finances', Finances], ['/devoirs', Devoirs], ['/messages', Messages], ['/annonces', Annonces],
  ['/personnel', Personnel], ['/journal', Journal]
];

const allowed = (item, user, school) => {
  if (user.role === 'superadmin') return item.platform || !!school || item.path === '/';
  return item.roles === '*' || item.roles.includes(user.role);
};

function readUser() { try { return JSON.parse(localStorage.getItem('ep_user')); } catch { return null; } }

export default function App() {
  const [user, setUser] = useState(readUser);
  const [theme, setTheme] = useState(() => localStorage.getItem('ep_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [school, setSchool] = useState(() => localStorage.getItem('ep_school') || '');
  const [toast, toastsNode] = useToasts();
  const [confirm, confirmNode] = useConfirm();
  const path = useLocation();

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('ep_theme', theme); }, [theme]);

  const logout = useCallback(() => {
    ['ep_token', 'ep_user', 'ep_school'].forEach(k => localStorage.removeItem(k));
    setUser(null); setSchool('');
    navigate('/', { replace: true });
  }, []);
  useEffect(() => setUnauthorizedHandler(() => { logout(); toast('Session expirée : reconnectez-vous.', 'error'); }), [logout, toast]);

  // Rafraîchit le profil (enfants, établissement) au chargement
  useEffect(() => {
    if (!user) return;
    get('/auth/me').then(u => { setUser(u); localStorage.setItem('ep_user', JSON.stringify(u)); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onLogin = ({ token, user: u }) => {
    localStorage.setItem('ep_token', token);
    localStorage.setItem('ep_user', JSON.stringify(u));
    localStorage.removeItem('ep_school');
    setSchool('');
    setUser(u);
    const pending = sessionStorage.getItem('ep_after_login');
    sessionStorage.removeItem('ep_after_login');
    navigate(pending || (u.role === 'superadmin' ? '/plateforme' : '/'), { replace: true });
  };

  const ctx = useMemo(() => ({ user, toast, confirm, school, theme }), [user, toast, confirm, school, theme]);

  if (!user) {
    if (path !== '/' && !sessionStorage.getItem('ep_after_login')) sessionStorage.setItem('ep_after_login', path);
    return <AppCtx.Provider value={ctx}><Login onLogin={onLogin} theme={theme} setTheme={setTheme} />{toastsNode}</AppCtx.Provider>;
  }

  return (
    <AppCtx.Provider value={ctx}>
      <Shell user={user} path={path} theme={theme} setTheme={setTheme} logout={logout} school={school} setSchool={setSchool} />
      {toastsNode}
      {confirmNode}
    </AppCtx.Provider>
  );
}

/* ---------------------------------- Shell ---------------------------------- */
function Shell({ user, path, theme, setTheme, logout, school, setSchool }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const isPlatform = user.role === 'superadmin';

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (isPlatform && !school) return;
    const load = () => get('/messages').then(m => setUnread(m.inbox.filter(x => !x.lu).length)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [path, isPlatform, school]);

  // Lien de reçu reçu par message : /recu/:id → ouverture du PDF
  useEffect(() => {
    const m = path.match(/^\/recu\/(\d+)$/);
    if (m) {
      navigate('/finances', { replace: true });
      openFile(`/paiements/${m[1]}/recu.pdf`).catch(() => {});
    }
  }, [path]);

  const nav = NAV.map(g => ({ ...g, items: g.items.filter(i => allowed(i, user, school)) })).filter(g => g.items.length);
  const route = ROUTES.find(([p]) => path === p || path.startsWith(`${p}/`));
  const Page = path === '/' || !route ? Accueil : route[1];
  const current = nav.flatMap(g => g.items).filter(i => path === i.path || (i.path !== '/' && path.startsWith(i.path))).sort((a, b) => b.path.length - a.path.length)[0];
  const needsSchool = isPlatform && !school && path !== '/plateforme';

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigation principale">
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={20} /></div>
          <div><div className="brand-name">EduPilot</div><div className="brand-sub">Gestion scolaire · SaaS</div></div>
        </div>
        <SchoolCard user={user} school={school} setSchool={setSchool} />
        <nav className="nav">
          {nav.map(g => (
            <div className="nav-group" key={g.group}>
              <div className="nav-group-title">{g.group}</div>
              {g.items.map(i => {
                const Icon = i.icon;
                const active = current?.path === i.path;
                return (
                  <button key={i.path} className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(i.path)} aria-current={active ? 'page' : undefined}>
                    <Icon size={17} />{i.label}
                    {i.badge === 'messages' && unread > 0 && <span className="count">{unread}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <DocumentsLink user={user} />
        </nav>
        <div className="sidebar-foot"><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> Données isolées par établissement</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu size={18} /></button>
          <div className="crumbs">
            <span className="nowrap">{isPlatform && !school ? 'Plateforme' : user.schoolName}</span>
            <ChevronRight size={14} />
            <b>{current?.label || 'Accueil'}</b>
          </div>
          <div className="spacer" />
          {!(isPlatform && !school) && <Notifications />}
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Changer de thème">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
          <UserMenu user={user} logout={logout} />
        </header>
        <main className="page" key={`${school}-${path.split('/')[1]}`}>
          {needsSchool ? <ChooseSchool /> : <Page />}
        </main>
      </div>
    </div>
  );
}

// Lien vers l'espace documentaire Nextcloud (reçus archivés, dépôts) lorsqu'il est configuré
function DocumentsLink({ user }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (['admin', 'directeur', 'comptable', 'superadmin'].includes(user.role)) get('/stockage').then(setInfo).catch(() => {});
  }, [user.role]);
  if (!info?.actif) return null;
  return (
    <div className="nav-group">
      <div className="nav-group-title">Cloud</div>
      <a className="nav-item" href={info.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        <Cloud size={17} />Documents (Nextcloud)<ExternalLink size={13} style={{ marginLeft: 'auto', opacity: .6 }} />
      </a>
    </div>
  );
}

function SchoolCard({ user, school, setSchool }) {
  const [schools, setSchools] = useState([]);
  useEffect(() => { if (user.role === 'superadmin') get('/saas/schools').then(setSchools).catch(() => {}); }, [user.role]);
  if (user.role !== 'superadmin') {
    return (
      <div className="school-card">
        <div className="name">{user.schoolName}</div>
        <div className="meta">{user.schoolVille && <span>{user.schoolVille}</span>}<span>·</span><span>{ROLE_LABEL[user.role]}</span></div>
      </div>
    );
  }
  const change = v => {
    if (v) localStorage.setItem('ep_school', v); else localStorage.removeItem('ep_school');
    setSchool(v);
    navigate(v ? '/' : '/plateforme');
  };
  return (
    <div className="school-card">
      <div className="name">Console éditeur</div>
      <div className="meta">Accès en assistance à un établissement</div>
      <select value={school} onChange={e => change(e.target.value)} aria-label="Établissement">
        <option value="">— Vue plateforme —</option>
        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}

function ChooseSchool() {
  return (
    <div className="card pad" style={{ maxWidth: 560 }}>
      <h3>Sélectionnez un établissement</h3>
      <p className="muted mt">Utilisez le sélecteur de la barre latérale pour consulter les données d'un établissement, ou revenez à la <a href="/plateforme" onClick={e => { e.preventDefault(); navigate('/plateforme'); }}>vue plateforme</a>.</p>
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ list: [], nonLues: 0 });
  const ref = useRef(null);
  const load = useCallback(() => get('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const close = e => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const clickNotif = async n => {
    if (!n.lu) await post(`/notifications/${n.id}/lu`).catch(() => {});
    setOpen(false);
    load();
    if (n.lien) navigate(n.lien.startsWith('/devoirs/') ? '/devoirs' : n.lien);
  };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(o => !o)} aria-label={`Notifications (${data.nonLues} non lues)`}>
        <Bell size={17} />{data.nonLues > 0 && <span className="dot">{data.nonLues > 99 ? '99+' : data.nonLues}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            <b>Notifications</b>
            {data.nonLues > 0 && <button className="btn sm ghost" onClick={async () => { await post('/notifications/tout-lire'); load(); }}>Tout marquer comme lu</button>}
          </div>
          {data.list.length === 0 && <div className="empty"><b>Aucune notification</b></div>}
          {data.list.map(n => (
            <div key={n.id} className={`notif ${n.lu ? '' : 'unread'}`} onClick={() => clickNotif(n)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{n.titre}</b>
                <p>{n.message}</p>
                <time>{relative(n.created_at)}</time>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = e => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="user-chip" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{initials(user.nom)}</span>
        <span className="who"><b>{user.nom}</b><span>{ROLE_LABEL[user.role]}</span></span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div style={{ padding: '8px 10px 6px' }}><b style={{ fontSize: 13 }}>{user.nom}</b><div className="muted small">{user.email}</div></div>
          <hr />
          <button role="menuitem" onClick={() => { setPwd(true); setOpen(false); }}><KeyRound size={16} />Changer le mot de passe</button>
          <button role="menuitem" onClick={logout}><LogOut size={16} />Se déconnecter</button>
        </div>
      )}
      {pwd && <PasswordModal onClose={() => setPwd(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }) {
  const [f, setF] = useState({ actuel: '', nouveau: '', confirmation: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (f.nouveau !== f.confirmation) return setError(new Error('Les deux mots de passe ne correspondent pas'));
    try { await api('/auth/password', { method: 'POST', body: f }); setDone(true); } catch (err) { setError(err); }
  };
  return (
    <Modal title="Changer le mot de passe" onClose={onClose} size="narrow"
      footer={done ? <button className="btn primary" onClick={onClose}>Fermer</button> : <><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" form="pwd" type="submit">Enregistrer</button></>}>
      {done ? <p>Votre mot de passe a été modifié.</p> : (
        <form id="pwd" className="stack" onSubmit={submit}>
          <ErrorBox error={error} />
          <Field label="Mot de passe actuel" required><input type="password" value={f.actuel} onChange={e => setF({ ...f, actuel: e.target.value })} required autoComplete="current-password" /></Field>
          <Field label="Nouveau mot de passe" required help="8 caractères minimum"><input type="password" minLength={8} value={f.nouveau} onChange={e => setF({ ...f, nouveau: e.target.value })} required autoComplete="new-password" /></Field>
          <Field label="Confirmation" required><input type="password" value={f.confirmation} onChange={e => setF({ ...f, confirmation: e.target.value })} required autoComplete="new-password" /></Field>
        </form>
      )}
    </Modal>
  );
}
