import React, { useState, useEffect, useCallback, useMemo } from 'react';

// === API HELPER ===
async function api(path, method = 'GET', body = null) {
  const token = localStorage.getItem('t') || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (res.headers.get('content-type')?.includes('text/csv')) {
    return res.text();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Une erreur est survenue');
    error.status = res.status;
    error.details = data;
    throw error;
  }
  return data;
}

// === ENTITY DEFINITIONS & LABELS ===
const EVALS = ['Contrôle continu', 'Examen T1', 'Examen T2', 'Examen T3'];
const MODES = ['Espèces', 'Virement', 'Mobile money'];
const NIVEAUX = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const CRENEAUX = [
  { deb: '08:30', fin: '10:00' },
  { deb: '10:15', fin: '11:45' },
  { deb: '14:00', fin: '15:30' },
  { deb: '15:45', fin: '17:15' }
];

const ENT_SCHEMAS = {
  eleves: {
    t: 'Élèves',
    icon: '🎓',
    f: [
      ['nom', 'Nom de famille', 'text'],
      ['prenom', 'Prénom', 'text'],
      ['naissance', 'Date de naissance', 'date'],
      ['genre', 'Genre', 'list', ['M', 'F']],
      ['classe', 'Classe', 'ref', 'classes'],
      ['parent', 'Parent / Tuteur', 'parent'],
      ['parentTel', 'Téléphone parent', 'text'],
      ['parentEmail', 'E-mail parent', 'text'],
      ['antecedentsMedicaux', 'Antécédents médicaux', 'text']
    ]
  },
  classes: {
    t: 'Classes',
    icon: '🏫',
    f: [
      ['niveau', 'Niveau', 'list', NIVEAUX],
      ['section', 'Section (ex: A, B)', 'text'],
      ['cap', 'Capacité maximale', 'number'],
      ['enseignant_titulaire', 'Enseignant titulaire', 'ref', 'users']
    ]
  },
  matieres: {
    t: 'Matières',
    icon: '📚',
    f: [
      ['nom', 'Nom de la matière', 'text'],
      ['coef', 'Coefficient', 'number'],
      ['niveau', 'Niveau', 'list', ['Tous', ...NIVEAUX]],
      ['enseignant', 'Enseignant affecté', 'ref', 'users']
    ]
  },
  salles: {
    t: 'Salles de classe',
    icon: '🚪',
    f: [
      ['nom', 'Nom de la salle', 'text'],
      ['cap', 'Capacité', 'number'],
      ['dispo', 'Disponibilité', 'list', ['Disponible', 'Indisponible']],
      ['batiment', 'Bâtiment', 'text']
    ]
  },
  notes: {
    t: 'Évaluations & Notes',
    icon: '📝',
    f: [
      ['eleve', 'Élève', 'ref', 'eleves'],
      ['matiere', 'Matière', 'ref', 'matieres'],
      ['eval', 'Évaluation', 'list', EVALS],
      ['note', 'Note (/20)', 'number'],
      ['commentaire', 'Commentaire', 'text']
    ]
  },
  paiements: {
    t: 'Paiements & Tranches',
    icon: '💳',
    f: [
      ['eleve', 'Élève', 'ref', 'eleves'],
      ['montant', 'Montant (TND)', 'number'],
      ['mode', 'Mode de paiement', 'list', MODES],
      ['type', 'Type de frais', 'list', ['Scolarité T1', 'Scolarité T2', 'Scolarité T3', 'Scolarité Complète', 'Frais Inscription']],
      ['date', 'Date de versement', 'date']
    ]
  },
  devoirs: {
    t: 'Devoirs (Homework)',
    icon: '📖',
    f: [
      ['titre', 'Titre du devoir', 'text'],
      ['matiere', 'Matière', 'ref', 'matieres'],
      ['classe', 'Classe', 'ref', 'classes'],
      ['date', 'Date d’assignation', 'date'],
      ['dateRemise', 'Date limite de remise', 'date'],
      ['bareme', 'Barème de notation', 'number'],
      ['desc', 'Consignes / Description', 'textarea'],
      ['corrige', 'Corrigé officiel (visible après remise)', 'textarea']
    ]
  },
  absences: {
    t: 'Suivi des Absences',
    icon: '⏱️',
    f: [
      ['eleve', 'Élève', 'ref', 'eleves'],
      ['date', 'Date', 'date'],
      ['creneau', 'Créneau', 'list', ['Matinée', 'Après-midi', 'Journée entière']],
      ['matiere', 'Matière / Cours', 'text'],
      ['motif', 'Motif signalé', 'text'],
      ['justifiee', 'Justifiée ?', 'list', ['Non', 'Oui']]
    ]
  }
};

const NAV_ROLES = {
  superadmin: [
    'saas_schools', 'dashboard', 'eleves', 'classes', 'finances', 'users', 'journal'
  ],
  admin: [
    'dashboard', 'eleves', 'preinscriptions', 'classes', 'matieres', 'salles',
    'emplois', 'notes', 'absences', 'finances', 'devoirs', 'annonces', 'messages', 'users', 'journal'
  ],
  enseignant: [
    'dashboard', 'notes', 'devoirs', 'emplois', 'absences', 'messages', 'annonces'
  ],
  parent: [
    'dashboard', 'bulletins', 'devoirs', 'emplois', 'absences', 'paiements', 'messages', 'annonces'
  ],
  eleve: [
    'dashboard', 'emplois', 'devoirs', 'notes', 'absences', 'annonces', 'messages'
  ],
  comptable: [
    'dashboard', 'finances', 'paiements', 'eleves', 'preinscriptions', 'messages', 'annonces'
  ]
};

const TAB_TITLES = {
  saas_schools: '🏢 Établissements (SaaS)',
  dashboard: 'Tableau de bord',
  eleves: 'Élèves',
  preinscriptions: 'Inscriptions en ligne',
  classes: 'Classes',
  matieres: 'Matières',
  salles: 'Salles',
  emplois: 'Emploi du temps',
  notes: 'Notes',
  bulletins: 'Bulletins scolaires',
  absences: 'Absences',
  finances: 'Finances & Impayés',
  paiements: 'Paiements',
  devoirs: 'Devoirs à domicile',
  annonces: 'Annonces officielles',
  messages: 'Messagerie',
  users: 'Comptes utilisateurs',
  journal: 'Journal d’audit'
};

function formatLabel(entityKey, item) {
  if (!item) return '—';
  if (entityKey === 'classes') return `${item.niveau} ${item.section}`;
  if (entityKey === 'eleves') return `${item.nom} ${item.prenom || ''}`.trim();
  if (entityKey === 'users') return `${item.nom} (${item.role})`;
  return item.nom || item.titre || item._id;
}

// === GENERIC REUSABLE MODAL ===
function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// =========================================================================
// 1. DASHBOARD COMPONENT
// =========================================================================
function Dashboard({ user, setTab }) {
  const [stats, setStats] = useState(null);
  const [annonces, setAnnonces] = useState([]);
  const [eleves, setEleves] = useState([]);

  useEffect(() => {
    if (['admin', 'comptable'].includes(user.role)) {
      api('/finances/stats').then(setStats).catch(() => {});
    }
    api('/annonces').then(setAnnonces).catch(() => {});
    if (user.role === 'parent') {
      api('/eleves').then(setEleves).catch(() => {});
    }
  }, [user]);

  return (
    <div>
      <div className="view-header">
        <div>
          <h2>Bienvenue, {user.nom}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13.5px' }}>
            Année scolaire 2026-2027 · École Primaire d'Excellence
          </p>
        </div>
        <div className="view-actions">
          <span className={`badge badge-${user.role === 'admin' ? 'red' : user.role === 'enseignant' ? 'blue' : 'green'}`}>
            Compte {user.role.toUpperCase()}
          </span>
        </div>
      </div>

      {/* KPI Cards for Admin and Accountant */}
      {['admin', 'comptable'].includes(user.role) && stats && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">🎓</div>
            <div>
              <div className="kpi-title">Total Élèves</div>
              <div className="kpi-value">{stats.nbEleves}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon green">💵</div>
            <div>
              <div className="kpi-title">Total Encaissé</div>
              <div className="kpi-value">{stats.totalRecu.toLocaleString()} TND</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon amber">⚠️</div>
            <div>
              <div className="kpi-title">Restant à Recouvrer</div>
              <div className="kpi-value">{stats.totalRestant.toLocaleString()} TND</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon purple">📊</div>
            <div>
              <div className="kpi-title">Taux de Recouvrement</div>
              <div className="kpi-value">{stats.tauxRecouvrement}%</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick shortcuts and role-specific dashboard sections */}
      <div className="grid-2">
        {/* Announcements section */}
        <div className="card">
          <div className="card-header">
            <h3>📢 Dernières Annonces Officielles</h3>
            <button className="btn-sm" onClick={() => setTab('annonces')}>Toutes les annonces</button>
          </div>
          {annonces.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Aucune annonce pour le moment.</p>
          ) : (
            annonces.slice(0, 3).map(a => (
              <div key={a._id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: '14.5px' }}>{a.titre}</b>
                  <span className="badge badge-blue">{a.cible}</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-main)', marginTop: '4px' }}>{a.contenu}</p>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Par {a.auteurNom} · {new Date(a.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Action quicklinks */}
        <div className="card">
          <div className="card-header">
            <h3>⚡ Accès Rapides</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {user.role === 'admin' && (
              <>
                <button className="btn" onClick={() => setTab('eleves')}>🎓 Gestion des Élèves</button>
                <button className="btn" onClick={() => setTab('emplois')}>📅 Emploi du temps</button>
                <button className="btn" onClick={() => setTab('finances')}>💳 Finances & Impayés</button>
                <button className="btn" onClick={() => setTab('users')}>👥 Comptes Utilisateurs</button>
              </>
            )}
            {user.role === 'enseignant' && (
              <>
                <button className="btn" onClick={() => setTab('notes')}>📝 Saisie des Notes</button>
                <button className="btn" onClick={() => setTab('devoirs')}>📖 Devoirs & Dépôts</button>
                <button className="btn" onClick={() => setTab('emplois')}>📅 Mon Emploi du temps</button>
                <button className="btn" onClick={() => setTab('messages')}>✉️ Contacter Parents</button>
              </>
            )}
            {user.role === 'parent' && (
              <>
                <button className="btn" onClick={() => setTab('bulletins')}>📜 Consulter Bulletins</button>
                <button className="btn" onClick={() => setTab('devoirs')}>📖 Devoirs des enfants</button>
                <button className="btn" onClick={() => setTab('absences')}>⏱️ Justifier une Absence</button>
                <button className="btn" onClick={() => setTab('paiements')}>💳 Paiements & Reçus</button>
              </>
            )}
            {user.role === 'eleve' && (
              <>
                <button className="btn" onClick={() => setTab('devoirs')}>📖 Mes Devoirs à Rendre</button>
                <button className="btn" onClick={() => setTab('emplois')}>📅 Mon Emploi du temps</button>
                <button className="btn" onClick={() => setTab('notes')}>📝 Mes Notes</button>
                <button className="btn" onClick={() => setTab('messages')}>✉️ Messagerie</button>
              </>
            )}
            {user.role === 'comptable' && (
              <>
                <button className="btn" onClick={() => setTab('paiements')}>💳 Encaisser un Paiement</button>
                <button className="btn" onClick={() => setTab('finances')}>⚠️ Relances Impayés</button>
                <button className="btn" onClick={() => setTab('preinscriptions')}>📋 Dossiers Inscriptions</button>
                <button className="btn" onClick={() => setTab('eleves')}>🎓 Liste des Élèves</button>
              </>
            )}
          </div>

          {user.role === 'parent' && eleves.length > 0 && (
            <div style={{ marginTop: '20px', background: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '8px' }}>Mes Enfants Inscrits :</div>
              {eleves.map(e => (
                <div key={e._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span>🧒 {e.nom} {e.prenom}</span>
                  <span className="badge badge-green">Inscrit</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 2. TIMETABLE (EMPLOI DU TEMPS) COMPONENT WITH CONFLICT DETECTION
// =========================================================================
function EmploiDuTemps({ user }) {
  const [slots, setSlots] = useState([]);
  const [classes, setClasses] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [salles, setSalles] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [filterClass, setFilterClass] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ jour: 'Lundi', debut: '08:30', fin: '10:00', classe: '', matiere: '', enseignant: '', salle: '' });
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [s, c, m, sal, u] = await Promise.all([
        api('/emplois'),
        api('/classes'),
        api('/matieres'),
        api('/salles'),
        api('/users').catch(() => [])
      ]);
      setSlots(s);
      setClasses(c);
      setMatieres(m);
      setSalles(sal);
      setTeachers(u.filter(usr => usr.role === 'enseignant'));
      if (c.length && !filterClass) setFilterClass(c[0]._id);
    } catch (e) {
      console.error(e);
    }
  }, [filterClass]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setEditItem(null);
    setForm({
      jour: 'Lundi',
      debut: '08:30',
      fin: '10:00',
      classe: filterClass || classes[0]?._id || '',
      matiere: matieres[0]?._id || '',
      enseignant: teachers[0]?._id || '',
      salle: salles[0]?._id || ''
    });
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    setErrorMsg('');
    try {
      if (editItem) {
        await api(`/emplois/${editItem._id}`, 'PUT', form);
      } else {
        await api('/emplois', 'POST', form);
      }
      setModalOpen(false);
      loadData();
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Supprimer ce créneau d’emploi du temps ?')) {
      await api(`/emplois/${id}`, 'DELETE');
      loadData();
    }
  };

  const filteredSlots = useMemo(() => {
    if (filterClass) return slots.filter(s => s.classe === filterClass);
    return slots;
  }, [slots, filterClass]);

  const canEdit = user.role === 'admin';

  return (
    <div>
      <div className="view-header">
        <h2>📅 Emploi du Temps Hebdomadaire</h2>
        <div className="view-actions">
          {classes.length > 0 && (
            <select style={{ width: 'auto' }} value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">Toutes les classes</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.niveau} {c.section}</option>)}
            </select>
          )}
          {canEdit && <button className="btn-primary" onClick={openAdd}>+ Ajouter un cours</button>}
        </div>
      </div>

      {/* Visual Weekly Grid */}
      <div className="timetable-grid">
        <div className="timetable-header">Heure</div>
        {JOURS.map(j => <div key={j} className="timetable-header">{j}</div>)}

        {CRENEAUX.map(({ deb, fin }) => (
          <React.Fragment key={`${deb}-${fin}`}>
            <div className="timetable-time-slot">{deb} - {fin}</div>
            {JOURS.map(jour => {
              const matched = filteredSlots.filter(s => s.jour === jour && s.debut === deb);
              return (
                <div key={`${jour}-${deb}`} style={{ minHeight: '80px', background: 'var(--bg-subtle)', borderRadius: '6px', padding: '4px' }}>
                  {matched.map(slot => {
                    const mat = matieres.find(m => m._id === slot.matiere);
                    const sal = salles.find(s => s._id === slot.salle);
                    const ens = teachers.find(t => t._id === slot.enseignant);
                    const cls = classes.find(c => c._id === slot.classe);
                    return (
                      <div key={slot._id} className="timetable-course">
                        <div className="course-title">{mat?.nom || 'Matière'}</div>
                        <div className="course-meta">🚪 {sal?.nom || 'Salle'} · 👨‍🏫 {ens?.nom?.split(' ')[1] || 'Prof'}</div>
                        {!filterClass && <div className="course-meta">🏫 {cls?.niveau} {cls?.section}</div>}
                        {canEdit && (
                          <div style={{ marginTop: '4px', textAlign: 'right' }}>
                            <button className="btn-danger btn-sm" onClick={() => handleDelete(slot._id)}>🗑</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Modal for adding/editing a course slot with conflict detector */}
      {modalOpen && (
        <Modal title={editItem ? 'Modifier le créneau' : 'Créer un créneau de cours'} onClose={() => setModalOpen(false)}>
          {errorMsg && <p className="badge badge-red" style={{ display: 'block', padding: '8px', marginBottom: '14px' }}>⚠️ {errorMsg}</p>}
          <div className="form-group">
            <label>Classe</label>
            <select value={form.classe} onChange={e => setForm({ ...form, classe: e.target.value })}>
              {classes.map(c => <option key={c._id} value={c._id}>{c.niveau} {c.section}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Matière</label>
            <select value={form.matiere} onChange={e => setForm({ ...form, matiere: e.target.value })}>
              {matieres.map(m => <option key={m._id} value={m._id}>{m.nom} (Coef {m.coef})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Enseignant</label>
            <select value={form.enseignant} onChange={e => setForm({ ...form, enseignant: e.target.value })}>
              {teachers.map(t => <option key={t._id} value={t._id}>{t.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Salle de classe</label>
            <select value={form.salle} onChange={e => setForm({ ...form, salle: e.target.value })}>
              {salles.map(s => <option key={s._id} value={s._id}>{s.nom} ({s.cap} places)</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div className="form-group">
              <label>Jour</label>
              <select value={form.jour} onChange={e => setForm({ ...form, jour: e.target.value })}>
                {JOURS.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Heure Début</label>
              <input type="time" value={form.debut} onChange={e => setForm({ ...form, debut: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Heure Fin</label>
              <input type="time" value={form.fin} onChange={e => setForm({ ...form, fin: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setModalOpen(false)}>Annuler</button>
            <button className="btn-primary" onClick={handleSave}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// 3. HOMEWORK & SUBMISSIONS LIFECYCLE (CHAPITRE 9)
// =========================================================================
function DevoirsSection({ user }) {
  const [devoirs, setDevoirs] = useState([]);
  const [classes, setClasses] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [selectedDevoir, setSelectedDevoir] = useState(null);
  const [rendus, setRendus] = useState([]);
  const [createModal, setCreateModal] = useState(false);
  const [submitModal, setSubmitModal] = useState(false);
  const [gradeModal, setGradeModal] = useState(null);
  const [form, setForm] = useState({ titre: '', desc: '', matiere: '', classe: '', dateRemise: '', bareme: 20, corrige: '' });
  const [submitForm, setSubmitForm] = useState({ contenu: '', fichier: '' });
  const [gradeForm, setGradeForm] = useState({ note: 15, bareme: 20, commentaireEnseignant: '' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, c, m, el] = await Promise.all([
        api('/devoirs'),
        api('/classes'),
        api('/matieres'),
        api('/eleves')
      ]);
      setDevoirs(d);
      setClasses(c);
      setMatieres(m);
      setEleves(el);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const viewRendus = async (dev) => {
    setSelectedDevoir(dev);
    try {
      const res = await api(`/devoirs/${dev._id}/rendus`);
      setRendus(res);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateDevoir = async () => {
    try {
      await api('/devoirs', 'POST', form);
      setCreateModal(false);
      setMsg('Devoir publié avec succès !');
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleSubmitDevoir = async () => {
    try {
      await api(`/devoirs/${selectedDevoir._id}/rendre`, 'POST', submitForm);
      setSubmitModal(false);
      viewRendus(selectedDevoir);
      alert('Travail déposé avec succès !');
    } catch (e) {
      alert(e.message);
    }
  };

  const handleGradeSubmit = async () => {
    try {
      await api(`/devoirs_rendus/${gradeModal._id}/noter`, 'PUT', gradeForm);
      setGradeModal(null);
      viewRendus(selectedDevoir);
    } catch (e) {
      alert(e.message);
    }
  };

  const markVuParent = async (renduId) => {
    try {
      await api(`/devoirs_rendus/${renduId}/vu-parent`, 'POST');
      viewRendus(selectedDevoir);
    } catch (e) {
      console.error(e);
    }
  };

  const canCreate = user.role === 'admin' || user.role === 'enseignant';

  return (
    <div>
      <div className="view-header">
        <h2>📖 Devoirs & Travaux d’Élèves</h2>
        <div className="view-actions">
          {canCreate && (
            <button className="btn-primary" onClick={() => {
              setForm({
                titre: '',
                desc: '',
                matiere: matieres[0]?._id || '',
                classe: classes[0]?._id || '',
                dateRemise: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                bareme: 20,
                corrige: ''
              });
              setCreateModal(true);
            }}>+ Créer un Devoir</button>
          )}
        </div>
      </div>

      {msg && <p className="badge badge-green" style={{ marginBottom: '14px', display: 'block' }}>{msg}</p>}

      <div className="grid-2">
        {/* Left: Devoirs List */}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Devoirs assignés</h3>
          {devoirs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Aucun devoir enregistré.</p>
          ) : (
            devoirs.map(dev => {
              const mat = matieres.find(m => m._id === dev.matiere);
              const cls = classes.find(c => c._id === dev.classe);
              const isSelected = selectedDevoir?._id === dev._id;
              return (
                <div
                  key={dev._id}
                  className="card"
                  style={{
                    marginBottom: '12px',
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                    boxShadow: isSelected ? '0 0 0 2px var(--primary)' : 'none'
                  }}
                  onClick={() => viewRendus(dev)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <b>{dev.titre}</b>
                    <span className="badge badge-blue">{mat?.nom || 'Matière'}</span>
                  </div>
                  <p style={{ fontSize: '13px', margin: '6px 0', color: 'var(--text-main)' }}>{dev.desc}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>🏫 Classe : {cls?.niveau} {cls?.section}</span>
                    <span>⏳ À rendre le : <b>{dev.dateRemise || 'Non précisé'}</b></span>
                  </div>
                  {dev.corrige && (
                    <div style={{ marginTop: '8px', background: 'var(--success-bg)', color: 'var(--success-text)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>
                      ✅ <b>Corrigé disponible :</b> {dev.corrige}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right: Submissions & Grading Panel */}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
            {selectedDevoir ? `Dépôts pour : « ${selectedDevoir.titre} »` : 'Sélectionnez un devoir pour voir les dépôts'}
          </h3>

          {selectedDevoir && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Total rendus : <b>{rendus.length}</b>
                </span>
                {(user.role === 'eleve' || user.role === 'parent') && (
                  <button className="btn-primary btn-sm" onClick={() => {
                    setSubmitForm({ contenu: '', fichier: 'mon_devoir.pdf' });
                    setSubmitModal(true);
                  }}>
                    📤 Déposer mon travail
                  </button>
                )}
              </div>

              {rendus.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Aucun élève n’a encore déposé ce devoir.</p>
              ) : (
                rendus.map(r => (
                  <div key={r._id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b>{r.eleveNom}</b>
                      <span className={`badge badge-${r.statut === 'corrige' ? 'green' : r.statut === 'en_retard' ? 'amber' : 'blue'}`}>
                        {r.statut}
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', margin: '4px 0' }}>{r.contenu}</p>
                    {r.fichier && <span style={{ fontSize: '11px', color: 'var(--primary-text)' }}>📎 Pièce jointe : {r.fichier}</span>}

                    {r.note !== undefined && (
                      <div style={{ marginTop: '6px', background: 'var(--bg-subtle)', padding: '6px', borderRadius: '6px', fontSize: '12px' }}>
                        <b>Note attribuée : {r.note} / {r.bareme || 20}</b>
                        {r.commentaireEnseignant && <div style={{ color: 'var(--text-muted)' }}>Commentaire : {r.commentaireEnseignant}</div>}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      {canCreate && (
                        <button className="btn-sm" onClick={() => {
                          setGradeModal(r);
                          setGradeForm({ note: r.note || 15, bareme: r.bareme || 20, commentaireEnseignant: r.commentaireEnseignant || '' });
                        }}>
                          ✍️ Noter / Commenter
                        </button>
                      )}
                      {user.role === 'parent' && !r.vuParParent && (
                        <button className="btn-sm btn-success" onClick={() => markVuParent(r._id)}>
                          👁️ Marquer comme vu
                        </button>
                      )}
                      {r.vuParParent && <span style={{ fontSize: '11px', color: 'var(--success)' }}>✓ Vu par le parent</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Homework */}
      {createModal && (
        <Modal title="Créer un nouveau devoir" onClose={() => setCreateModal(false)}>
          <div className="form-group">
            <label>Titre du devoir</label>
            <input value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })} placeholder="ex: Exercices de grammaire" />
          </div>
          <div className="form-group">
            <label>Matière</label>
            <select value={form.matiere} onChange={e => setForm({ ...form, matiere: e.target.value })}>
              {matieres.map(m => <option key={m._id} value={m._id}>{m.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Classe concernée</label>
            <select value={form.classe} onChange={e => setForm({ ...form, classe: e.target.value })}>
              {classes.map(c => <option key={c._id} value={c._id}>{c.niveau} {c.section}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="form-group">
              <label>Date limite de remise</label>
              <input type="date" value={form.dateRemise} onChange={e => setForm({ ...form, dateRemise: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Barème (points max)</label>
              <input type="number" value={form.bareme} onChange={e => setForm({ ...form, bareme: +e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Consignes & Travail à réaliser</label>
            <textarea rows="3" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Corrigé officiel (optionnel)</label>
            <textarea rows="2" value={form.corrige} onChange={e => setForm({ ...form, corrige: e.target.value })} placeholder="Solutions détaillées" />
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setCreateModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={handleCreateDevoir}>Publier le devoir</button>
          </div>
        </Modal>
      )}

      {/* Modal: Student submits homework */}
      {submitModal && (
        <Modal title="Déposer mon travail" onClose={() => setSubmitModal(false)}>
          <div className="form-group">
            <label>Mes réponses / Texte explicatif</label>
            <textarea rows="4" value={submitForm.contenu} onChange={e => setSubmitForm({ ...submitForm, contenu: e.target.value })} placeholder="Tapez vos réponses ici..." />
          </div>
          <div className="form-group">
            <label>Nom du fichier joint (PDF, document ou scan)</label>
            <input value={submitForm.fichier} onChange={e => setSubmitForm({ ...submitForm, fichier: e.target.value })} placeholder="ex: devoir_maths_yassine.pdf" />
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setSubmitModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={handleSubmitDevoir}>Valider le dépôt</button>
          </div>
        </Modal>
      )}

      {/* Modal: Teacher grades homework */}
      {gradeModal && (
        <Modal title={`Noter le travail de ${gradeModal.eleveNom}`} onClose={() => setGradeModal(null)}>
          <div className="form-group">
            <label>Note attribuée (/ {gradeForm.bareme})</label>
            <input type="number" step="0.5" value={gradeForm.note} onChange={e => setGradeForm({ ...gradeForm, note: +e.target.value })} />
          </div>
          <div className="form-group">
            <label>Commentaire de l’enseignant</label>
            <textarea rows="3" value={gradeForm.commentaireEnseignant} onChange={e => setGradeForm({ ...gradeForm, commentaireEnseignant: e.target.value })} placeholder="Observations, encouragements..." />
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setGradeModal(null)}>Annuler</button>
            <button className="btn-primary" onClick={handleGradeSubmit}>Enregistrer la note</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// 4. FINANCIAL MANAGEMENT & UNPAID BALANCES (CHAPITRE 8)
// =========================================================================
function FinancesSection({ user }) {
  const [stats, setStats] = useState(null);
  const [impayes, setImpayes] = useState([]);
  const [msg, setMsg] = useState('');

  const loadFinances = useCallback(async () => {
    try {
      const [st, imp] = await Promise.all([
        api('/finances/stats'),
        api('/finances/impayes')
      ]);
      setStats(st);
      setImpayes(imp);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { loadFinances(); }, [loadFinances]);

  const triggerRelance = async (eleveId, nom) => {
    try {
      await api(`/finances/relancer/${eleveId}`, 'POST');
      setMsg(`Message de relance envoyé au parent de ${nom} avec succès !`);
      setTimeout(() => setMsg(''), 4000);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className="view-header">
        <h2>💳 Suivi Financier & Recouvrement des Impayés</h2>
      </div>

      {msg && <p className="badge badge-green" style={{ display: 'block', padding: '10px', marginBottom: '14px' }}>✓ {msg}</p>}

      {stats && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">💰</div>
            <div>
              <div className="kpi-title">Frais Annuels / Élève</div>
              <div className="kpi-value">{stats.fraisAnnuel} TND</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon green">📈</div>
            <div>
              <div className="kpi-title">Total Encaissé</div>
              <div className="kpi-value">{stats.totalRecu.toLocaleString()} TND</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon amber">⚠️</div>
            <div>
              <div className="kpi-title">Impayés Restants</div>
              <div className="kpi-value">{stats.totalRestant.toLocaleString()} TND</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon purple">🎯</div>
            <div>
              <div className="kpi-title">Taux de Recouvrement</div>
              <div className="kpi-value">{stats.tauxRecouvrement}%</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Dossiers en retard de paiement (Impayés)</h3>
          <span className="badge badge-amber">{impayes.length} élèves concernés</span>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Élève</th>
                <th>Classe</th>
                <th>Parent / Contact</th>
                <th>Total Payé</th>
                <th>Solde Restant</th>
                <th>Dernier Paiement</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {impayes.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Tous les élèves sont à jour ! Aucun impayé.</td></tr>
              ) : (
                impayes.map(item => (
                  <tr key={item._id}>
                    <td><b>{item.nom}</b></td>
                    <td>{item.classeNom}</td>
                    <td>
                      <div>{item.parentNom}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.parentTel || item.parentEmail}</div>
                    </td>
                    <td>{item.totalPaye} TND</td>
                    <td><b style={{ color: 'var(--danger-text)' }}>{item.soldeRestant} TND</b></td>
                    <td>{item.dernierPaiement}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-primary btn-sm" onClick={() => triggerRelance(item._id, item.nom)}>
                        ✉️ Relancer le parent
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 5. OFFICIAL REPORT CARD (BULLETIN SCOLAIRE OFFICIEL) MODAL & PRINT
// =========================================================================
function BulletinModal({ bulletin, onClose }) {
  if (!bulletin) return null;

  return (
    <Modal title="Bulletin Scolaire Officiel" onClose={onClose} wide>
      <div className="bulletin-paper">
        <div className="official-header">
          <h2>RÉPUBLIQUE TUNISIENNE · MINISTÈRE DE L’ÉDUCATION</h2>
          <p>École Primaire Privée d’Excellence · Année Scolaire {bulletin.annee}</p>
          <h3 style={{ marginTop: '6px', color: '#1e3a8a', fontSize: '15px' }}>BULLETIN TRIMESTRIEL D’ÉVALUATION</h3>
        </div>

        <div className="bulletin-student-info">
          <div>
            <div><b>Élève :</b> {bulletin.eleve}</div>
            <div><b>Date de naissance :</b> {bulletin.naissance}</div>
          </div>
          <div>
            <div><b>Classe :</b> {bulletin.classe}</div>
            <div><b>Enseignant titulaire :</b> {bulletin.titulaire}</div>
          </div>
        </div>

        <table className="bulletin-table">
          <thead>
            <tr>
              <th>Matière</th>
              <th>Enseignant</th>
              <th style={{ textAlign: 'center' }}>Coef.</th>
              <th style={{ textAlign: 'center' }}>Nb Évals</th>
              <th style={{ textAlign: 'center' }}>Moyenne /20</th>
              <th>Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {bulletin.lignes.map(l => (
              <tr key={l.matiereId || l.matiere}>
                <td><b>{l.matiere}</b></td>
                <td>{l.enseignant}</td>
                <td style={{ textAlign: 'center' }}>{l.coef}</td>
                <td style={{ textAlign: 'center' }}>{l.notesCount}</td>
                <td style={{ textAlign: 'center', fontWeight: '700' }}>{l.moyenne}</td>
                <td>{l.appreciation}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bulletin-summary">
          <div>
            <b>Moyenne Générale : {bulletin.moyenneGenerale !== null ? `${bulletin.moyenneGenerale} / 20` : '—'}</b>
          </div>
          <div>
            <b>Mention : {bulletin.mention}</b>
          </div>
          <div>
            <b>Assiduité : {bulletin.absences.total} absences ({bulletin.absences.justifiees} justifiées)</b>
          </div>
        </div>

        <div className="bulletin-signatures">
          <div>
            <p><b>Visa de l’Enseignant Titulaire</b></p>
            <div className="signature-box" />
          </div>
          <div>
            <p><b>Le Directeur de l’Établissement</b></p>
            <div className="signature-box" />
            <span style={{ fontSize: '10px', color: '#64748b' }}>(Cachet officiel de l’école)</span>
          </div>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: '16px' }}>
        <button className="btn-primary" onClick={() => window.print()}>🖨️ Imprimer / Télécharger en PDF</button>
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

// =========================================================================
// 6. OFFICIAL PAYMENT RECEIPT (REÇU DE PAIEMENT OFFICIEL) MODAL & PRINT
// =========================================================================
function RecuModal({ paiement, eleve, onClose }) {
  if (!paiement) return null;

  return (
    <Modal title="Reçu de Paiement Officiel" onClose={onClose}>
      <div className="recu-paper">
        <div className="official-header">
          <h2>ÉCOLE PRIMAIRE PRIVÉE D'EXCELLENCE</h2>
          <p>Reçu de règlement des frais scolaires</p>
          <div style={{ marginTop: '6px', fontWeight: '800', color: '#1e3a8a' }}>
            N° REÇU : {paiement.recuNum || 'REC-2026-001'}
          </div>
        </div>

        <div style={{ margin: '18px 0', lineHeight: '1.8', fontSize: '13.5px' }}>
          <div><b>Date :</b> {paiement.date}</div>
          <div><b>Élève :</b> {eleve?.nom} {eleve?.prenom}</div>
          <div><b>Classe :</b> {eleve?.classeNom || 'CP-A'}</div>
          <div><b>Type de frais :</b> {paiement.type || 'Scolarité'}</div>
          <div><b>Mode de règlement :</b> {paiement.mode}</div>
          <div style={{ marginTop: '10px', background: '#ecfdf5', padding: '10px', borderRadius: '6px', color: '#065f46', fontSize: '15px' }}>
            <b>MONTANT VERSÉ : {paiement.montant} TND</b>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <div>
            <p>Pour acquit de règlement,</p>
            <p>Le secrétariat comptable</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p>Cachet & Signature :</p>
            <div style={{ height: '40px' }} />
          </div>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: '16px' }}>
        <button className="btn-primary" onClick={() => window.print()}>🖨️ Imprimer le reçu</button>
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

// =========================================================================
// 7. ONLINE PRE-REGISTRATION COMPONENT (CHAPITRE 4)
// =========================================================================
function PreinscriptionsSection({ user }) {
  const [list, setList] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState({});

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api('/preinscriptions'),
        api('/classes')
      ]);
      setList(p);
      setClasses(c);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleValidate = async (id) => {
    const clsId = selectedClass[id] || classes[0]?._id;
    try {
      await api(`/preinscriptions/${id}/valider`, 'POST', { classeId: clsId });
      alert('Inscription validée avec succès ! Le compte parent et l’élève ont été créés.');
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleReject = async (id) => {
    if (confirm('Rejeter cette demande d’inscription ?')) {
      await api(`/preinscriptions/${id}/rejeter`, 'POST');
      load();
    }
  };

  return (
    <div>
      <div className="view-header">
        <h2>📋 Demandes de Pré-inscription en Ligne</h2>
        <span className="badge badge-blue">{list.length} demandes</span>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Élève</th>
              <th>Niveau demandé</th>
              <th>Parent / Contact</th>
              <th>Adresse</th>
              <th>Statut</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucune demande en attente.</td></tr>
            ) : (
              list.map(p => (
                <tr key={p._id}>
                  <td><b>{p.nom} {p.prenom}</b><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Né(e) le {p.naissance}</div></td>
                  <td><span className="badge badge-purple">{p.niveauDemande}</span></td>
                  <td>
                    <div>{p.parentNom}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.parentEmail} · {p.parentTel}</div>
                  </td>
                  <td>{p.adresse}</td>
                  <td>
                    <span className={`badge badge-${p.statut === 'validee' ? 'green' : p.statut === 'rejetee' ? 'red' : 'amber'}`}>
                      {p.statut}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {p.statut === 'en_attente' && (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <select
                          style={{ width: 'auto', fontSize: '12px' }}
                          value={selectedClass[p._id] || ''}
                          onChange={e => setSelectedClass({ ...selectedClass, [p._id]: e.target.value })}
                        >
                          {classes.map(c => <option key={c._id} value={c._id}>{c.niveau} {c.section}</option>)}
                        </select>
                        <button className="btn-success btn-sm" onClick={() => handleValidate(p._id)}>✓ Valider</button>
                        <button className="btn-danger btn-sm" onClick={() => handleReject(p._id)}>✗</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =========================================================================
// 8. ABSENCES & PARENT JUSTIFICATION (CHAPITRE 7)
// =========================================================================
function AbsencesSection({ user }) {
  const [absences, setAbsences] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [justifModal, setJustifModal] = useState(null);
  const [justifText, setJustifText] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, el] = await Promise.all([
        api('/absences'),
        api('/eleves')
      ]);
      setAbsences(a);
      setEleves(el);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitJustif = async () => {
    try {
      await api(`/absences/${justifModal._id}/justifier`, 'POST', { justification: justifText });
      setJustifModal(null);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const validateJustif = async (id, validee) => {
    try {
      await api(`/absences/${id}/valider-justification`, 'POST', { validee });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className="view-header">
        <h2>⏱️ Suivi des Absences & Justifications</h2>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Élève</th>
              <th>Date</th>
              <th>Créneau / Cours</th>
              <th>Motif</th>
              <th>Justification Parent</th>
              <th>Statut</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {absences.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucune absence signalée.</td></tr>
            ) : (
              absences.map(a => {
                const el = eleves.find(e => e._id === a.eleve);
                return (
                  <tr key={a._id}>
                    <td><b>{el ? `${el.nom} ${el.prenom || ''}` : 'Élève'}</b></td>
                    <td>{a.date}</td>
                    <td>{a.creneau} ({a.matiere})</td>
                    <td>{a.motif}</td>
                    <td>{a.justificationParent || <span style={{ color: 'var(--text-muted)' }}>Non transmise</span>}</td>
                    <td>
                      <span className={`badge badge-${a.justifiee ? 'green' : a.statut === 'En attente de validation' ? 'amber' : 'red'}`}>
                        {a.statut || (a.justifiee ? 'Justifiée' : 'Non justifiée')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {user.role === 'parent' && !a.justifiee && (
                        <button className="btn-sm btn-primary" onClick={() => {
                          setJustifModal(a);
                          setJustifText(a.justificationParent || '');
                        }}>
                          ✍️ Justifier
                        </button>
                      )}
                      {['admin', 'enseignant'].includes(user.role) && a.justificationParent && !a.justifiee && (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button className="btn-success btn-sm" onClick={() => validateJustif(a._id, true)}>✓ Valider</button>
                          <button className="btn-danger btn-sm" onClick={() => validateJustif(a._id, false)}>✗ Rejeter</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {justifModal && (
        <Modal title="Justifier l’absence" onClose={() => setJustifModal(null)}>
          <div className="form-group">
            <label>Motif détaillé (Raison médicale, urgence familiale, etc.)</label>
            <textarea rows="4" value={justifText} onChange={e => setJustifText(e.target.value)} placeholder="Précisez la raison de l’absence..." />
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setJustifModal(null)}>Annuler</button>
            <button className="btn-primary" onClick={submitJustif}>Envoyer la justification</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// 9. GENERIC CRUD COMPONENT WITH CSV EXPORT/IMPORT & REPORT CARDS
// =========================================================================
function CrudManager({ k, user, onOpenBulletin, onOpenRecu }) {
  const schema = ENT_SCHEMAS[k];
  const [rows, setRows] = useState([]);
  const [refs, setRefs] = useState({});
  const [form, setForm] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api('/' + k);
      setRows(data);

      const r = {};
      for (const f of schema.f) {
        if (f[2] === 'ref') r[f[3]] = await api('/' + f[3]);
        if (f[2] === 'parent') {
          const dests = await api('/dest').catch(() => []);
          r.parents = dests.filter(u => u.role === 'parent');
        }
      }
      setRefs(r);
    } catch (e) {
      setErrorMsg(e.message);
    }
  }, [k, schema]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (force = false) => {
    try {
      const body = { ...form.data, ...(force ? { force: true } : {}) };
      for (const f of schema.f) {
        if (f[2] === 'number') body[f[0]] = +body[f[0]];
      }
      if (form.id) {
        await api(`/${k}/${form.id}`, 'PUT', body);
      } else {
        await api('/' + k, 'POST', body);
      }
      setForm(null);
      load();
    } catch (x) {
      if (x.capacite && confirm('Capacité de la classe atteinte. Confirmer quand même l’affectation ?')) {
        return handleSave(true);
      }
      setErrorMsg(x.message);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Voulez-vous vraiment supprimer cet élément ?')) {
      try {
        await api(`/${k}/${id}`, 'DELETE');
        load();
      } catch (e) {
        alert(e.message);
      }
    }
  };

  const exportCSV = async () => {
    if (k === 'eleves') {
      window.open('/api/export/eleves', '_blank');
    }
  };

  const openForm = (item = null) => {
    const d = item ? { ...item } : {};
    schema.f.forEach(f => {
      if (d[f[0]] == null) {
        d[f[0]] = f[2] === 'date'
          ? new Date().toISOString().slice(0, 10)
          : f[2] === 'list'
          ? f[3][0]
          : f[2] === 'ref'
          ? refs[f[3]]?.[0]?._id || ''
          : f[2] === 'parent'
          ? refs.parents?.[0]?._id || ''
          : '';
      }
    });
    setForm({ id: item?._id, data: d });
  };

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    return rows.filter(r => Object.values(r).some(val => String(val).toLowerCase().includes(search.toLowerCase())));
  }, [rows, search]);

  const canWrite = user.role === 'admin' || (user.role === 'comptable' && ['eleves', 'paiements'].includes(k)) || (user.role === 'enseignant' && ['notes', 'devoirs', 'absences'].includes(k));

  return (
    <div>
      <div className="view-header">
        <h2>{schema.icon} {schema.t}</h2>
        <div className="view-actions">
          <input
            style={{ width: '200px' }}
            placeholder="🔍 Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {k === 'eleves' && ['admin', 'comptable'].includes(user.role) && (
            <button className="btn" onClick={exportCSV}>📥 Exporter CSV</button>
          )}
          {canWrite && (
            <button className="btn-primary" onClick={() => openForm()}>+ Ajouter</button>
          )}
        </div>
      </div>

      {errorMsg && <p className="badge badge-red" style={{ display: 'block', padding: '10px', marginBottom: '14px' }}>⚠️ {errorMsg}</p>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {schema.f.map(f => <th key={f[0]}>{f[1]}</th>)}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={schema.f.length + 1} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun enregistrement trouvé.</td></tr>
            ) : (
              filteredRows.map(r => (
                <tr key={r._id}>
                  {schema.f.map(f => {
                    let val = r[f[0]];
                    if (f[2] === 'ref') {
                      val = formatLabel(f[3], refs[f[3]]?.find(x => x._id === val));
                    } else if (f[2] === 'parent') {
                      val = refs.parents?.find(x => x._id === val)?.nom || r.parentNom || '—';
                    }
                    return <td key={f[0]}>{val}</td>;
                  })}
                  <td className="table-actions">
                    {k === 'eleves' && (
                      <button className="btn-sm" onClick={async () => {
                        const bull = await api(`/bulletin/${r._id}`);
                        onOpenBulletin(bull);
                      }}>
                        📜 Bulletin
                      </button>
                    )}
                    {k === 'paiements' && (
                      <button className="btn-sm" onClick={() => onOpenRecu(r)}>
                        🖨️ Reçu
                      </button>
                    )}
                    {canWrite && (
                      <>
                        <button className="btn-sm" onClick={() => openForm(r)}>✎</button>
                        <button className="btn-sm btn-danger" onClick={() => handleDelete(r._id)}>🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {form && (
        <Modal title={`${form.id ? 'Modifier' : 'Ajouter'} – ${schema.t}`} onClose={() => setForm(null)}>
          {schema.f.map(f => {
            const val = form.data[f[0]] ?? '';
            const setVal = v => setForm({ ...form, data: { ...form.data, [f[0]]: v } });

            return (
              <div key={f[0]} className="form-group">
                <label>{f[1]}</label>
                {f[2] === 'ref' || f[2] === 'parent' || f[2] === 'list' ? (
                  <select value={val} onChange={e => setVal(e.target.value)}>
                    {f[2] === 'list'
                      ? f[3].map(opt => <option key={opt} value={opt}>{opt}</option>)
                      : (f[2] === 'parent' ? refs.parents : refs[f[3]])?.map(item => (
                          <option key={item._id} value={item._id}>{formatLabel(f[2] === 'ref' ? f[3] : 'users', item)}</option>
                        ))}
                  </select>
                ) : f[2] === 'textarea' ? (
                  <textarea rows="3" value={val} onChange={e => setVal(e.target.value)} />
                ) : (
                  <input type={f[2]} value={val} onChange={e => setVal(e.target.value)} />
                )}
              </div>
            );
          })}
          <div className="form-actions">
            <button className="btn" onClick={() => setForm(null)}>Annuler</button>
            <button className="btn-primary" onClick={() => handleSave(false)}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// 10. MESSAGING & NOTIFICATIONS (CHAPITRE 10)
// =========================================================================
function MessagesSection({ user }) {
  const [data, setData] = useState({ inbox: [], sent: [], drafts: [] });
  const [destinataires, setDestinataires] = useState([]);
  const [form, setForm] = useState(null);
  const [activeTab, setActiveTab] = useState('inbox');

  const load = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([api('/messages'), api('/dest')]);
      setData(m);
      setDestinataires(d);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSend = async (brouillon) => {
    if (!brouillon && !confirm('Un message envoyé est immuable et ne pourra plus être modifié ni supprimé. Confirmer l’envoi ?')) {
      return;
    }
    try {
      const b = { ...form, brouillon };
      if (form._id) {
        await api(`/messages/${form._id}`, 'PUT', b);
      } else {
        await api('/messages', 'POST', b);
      }
      setForm(null);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleMask = async (id) => {
    await api(`/messages/${id}/masquer`, 'POST');
    load();
  };

  return (
    <div>
      <div className="view-header">
        <h2>✉️ Messagerie Interne Sécurisée</h2>
        <button className="btn-primary" onClick={() => setForm({ a: destinataires[0]?._id, objet: '', corps: '' })}>
          + Nouveau message
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={`btn ${activeTab === 'inbox' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('inbox')}>
          📥 Boîte de réception ({data.inbox.length})
        </button>
        <button className={`btn ${activeTab === 'sent' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('sent')}>
          📤 Messages envoyés (Immuables) ({data.sent.length})
        </button>
        <button className={`btn ${activeTab === 'drafts' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('drafts')}>
          📝 Brouillons ({data.drafts.length})
        </button>
      </div>

      {activeTab === 'inbox' && (
        <div>
          {data.inbox.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun message reçu.</p> : (
            data.inbox.map(m => (
              <div key={m._id} className="msg-thread">
                <div className="msg-header">
                  <span>De : <b>{m.deNom}</b> ({m.deRole})</span>
                  <span>{new Date(m.createdAt).toLocaleString('fr-FR')}</span>
                </div>
                <div className="msg-title">{m.objet}</div>
                <div className="msg-body">{m.corps}</div>
                <div style={{ marginTop: '8px', textAlign: 'right' }}>
                  <button className="btn-sm" onClick={() => handleMask(m._id)}>Masquer de ma boîte</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'sent' && (
        <div>
          {data.sent.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun message envoyé.</p> : (
            data.sent.map(m => (
              <div key={m._id} className="msg-thread">
                <div className="msg-header">
                  <span>À : <b>{m.aNom}</b></span>
                  <span>{new Date(m.createdAt).toLocaleString('fr-FR')}</span>
                </div>
                <div className="msg-title">{m.objet}</div>
                <div className="msg-body">{m.corps}</div>
                <span className="badge badge-blue" style={{ marginTop: '8px' }}>🔒 Enregistrement certifié (Immuable)</span>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'drafts' && (
        <div>
          {data.drafts.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucun brouillon en cours.</p> : (
            data.drafts.map(m => (
              <div key={m._id} className="msg-thread">
                <div className="msg-header">
                  <span>Brouillon pour : {m.aNom || 'Non spécifié'}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn-sm" onClick={() => setForm(m)}>Modifier ✎</button>
                    <button className="btn-danger btn-sm" onClick={async () => {
                      if (confirm('Supprimer ce brouillon ?')) {
                        await api(`/messages/${m._id}`, 'DELETE');
                        load();
                      }
                    }}>🗑</button>
                  </div>
                </div>
                <div className="msg-title">{m.objet || '(Sans objet)'}</div>
                <div className="msg-body">{m.corps}</div>
              </div>
            ))
          )}
        </div>
      )}

      {form && (
        <Modal title="Rédiger un message" onClose={() => setForm(null)}>
          <div className="form-group">
            <label>Destinataire autorisé (RBAC)</label>
            <select value={form.a} onChange={e => setForm({ ...form, a: e.target.value })}>
              {destinataires.map(u => (
                <option key={u._id} value={u._id}>{u.nom} ({u.role})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Objet du message</label>
            <input value={form.objet} onChange={e => setForm({ ...form, objet: e.target.value })} placeholder="ex: Suivi pédagogique" />
          </div>
          <div className="form-group">
            <label>Corps du message</label>
            <textarea rows="5" value={form.corps} onChange={e => setForm({ ...form, corps: e.target.value })} placeholder="Rédigez votre message ici..." />
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => handleSend(true)}>Sauvegarder en brouillon</button>
            <button className="btn-primary" onClick={() => handleSend(false)}>Envoyer définitivement</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// 11. ANNOUNCEMENTS (ANNONCES OFFICIELLES IMMUABLES)
// =========================================================================
function AnnoncesSection({ user }) {
  const [annonces, setAnnonces] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ titre: '', contenu: '', cible: 'tous' });

  const load = useCallback(async () => {
    try {
      const data = await api('/annonces');
      setAnnonces(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePublish = async () => {
    if (!confirm('Une annonce officielle publiée est immuable et visible immédiatement. Confirmer ?')) return;
    try {
      await api('/annonces', 'POST', form);
      setModalOpen(false);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className="view-header">
        <h2>📢 Annonces Officielles de l’Établissement</h2>
        {user.role === 'admin' && (
          <button className="btn-primary" onClick={() => {
            setForm({ titre: '', contenu: '', cible: 'tous' });
            setModalOpen(true);
          }}>
            + Publier une Annonce
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gap: '14px' }}>
        {annonces.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aucune annonce publiée.</p> : (
          annonces.map(a => (
            <div key={a._id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: '16px' }}>{a.titre}</b>
                <span className="badge badge-purple">Audience : {a.cible}</span>
              </div>
              <p style={{ margin: '10px 0', fontSize: '14px', whiteSpace: 'pre-wrap' }}>{a.contenu}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                <span>Publié par <b>{a.auteurNom}</b></span>
                <span>{new Date(a.createdAt).toLocaleString('fr-FR')}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <Modal title="Publier une annonce officielle" onClose={() => setModalOpen(false)}>
          <div className="form-group">
            <label>Titre de l’annonce</label>
            <input value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })} placeholder="ex: Réunion de rentrée" />
          </div>
          <div className="form-group">
            <label>Public cible</label>
            <select value={form.cible} onChange={e => setForm({ ...form, cible: e.target.value })}>
              <option value="tous">Tous (Parents, Enseignants, Élèves)</option>
              <option value="parents">Parents uniquement</option>
              <option value="enseignants">Enseignants uniquement</option>
              <option value="eleves">Élèves uniquement</option>
            </select>
          </div>
          <div className="form-group">
            <label>Contenu de l’annonce</label>
            <textarea rows="5" value={form.contenu} onChange={e => setForm({ ...form, contenu: e.target.value })} placeholder="Texte de l’annonce..." />
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setModalOpen(false)}>Annuler</button>
            <button className="btn-primary" onClick={handlePublish}>Publier</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// 12. USER MANAGEMENT & AUDIT LOGS (ADMIN)
// =========================================================================
function UserAccountsManager({ user }) {
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ nom: '', email: '', password: '', role: 'parent', telephone: '', classe: '' });

  const load = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([api('/users'), api('/classes')]);
      setUsers(u);
      setClasses(c);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveUser = async () => {
    try {
      if (modal?.id) {
        await api(`/users/${modal.id}`, 'PUT', form);
      } else {
        await api('/users', 'POST', form);
      }
      setModal(null);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const deleteUser = async (id) => {
    if (confirm('Supprimer définitivement ce compte utilisateur ?')) {
      try {
        await api(`/users/${id}`, 'DELETE');
        load();
      } catch (e) {
        alert(e.message);
      }
    }
  };

  return (
    <div>
      <div className="view-header">
        <h2>👥 Gestion des Comptes Utilisateurs (RBAC)</h2>
        <button className="btn-primary" onClick={() => {
          setForm({ nom: '', email: '', password: '', role: 'parent', telephone: '', classe: '' });
          setModal({ id: null });
        }}>+ Nouvel Utilisateur</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nom complet</th>
              <th>E-mail</th>
              <th>Rôle</th>
              <th>Téléphone</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u._id}>
                <td><b>{u.nom}</b></td>
                <td>{u.email}</td>
                <td><span className={`role-tag ${u.role}`}>{u.role}</span></td>
                <td>{u.telephone || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-sm" onClick={() => {
                    setForm({ nom: u.nom, email: u.email, password: '', role: u.role, telephone: u.telephone || '', classe: u.classe || '' });
                    setModal({ id: u._id });
                  }}>✎</button>
                  {u._id !== user.id && (
                    <button className="btn-danger btn-sm" onClick={() => deleteUser(u._id)}>🗑</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? 'Modifier l’utilisateur' : 'Créer un utilisateur'} onClose={() => setModal(null)}>
          <div className="form-group">
            <label>Nom et Prénom</label>
            <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Adresse E-mail</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Mot de passe {modal.id && '(laisser vide pour ne pas modifier)'}</label>
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 caractères" />
          </div>
          <div className="form-group">
            <label>Rôle</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="admin">Administrateur / Direction</option>
              <option value="enseignant">Enseignant</option>
              <option value="parent">Parent d'élève</option>
              <option value="eleve">Élève</option>
              <option value="comptable">Comptable / Secrétariat</option>
            </select>
          </div>
          <div className="form-group">
            <label>Téléphone</label>
            <input value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setModal(null)}>Annuler</button>
            <button className="btn-primary" onClick={saveUser}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function JournalSection() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api('/journal/tout').then(setLogs).catch(() => {});
  }, []);

  return (
    <div>
      <div className="view-header">
        <h2>📜 Journal d’Audit & Sécurité (Traçabilité)</h2>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Horodatage</th>
              <th>Utilisateur</th>
              <th>Action réalisée</th>
              <th>Détails techniques</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l._id}>
                <td>{new Date(l.createdAt).toLocaleString('fr-FR')}</td>
                <td><b>{l.nom}</b></td>
                <td><span className="badge badge-blue">{l.action}</span></td>
                <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {JSON.stringify(l.data || {})}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =========================================================================
// 13. PUBLIC ONLINE PRE-REGISTRATION MODAL (FOR PARENTS BEFORE LOGIN)
// =========================================================================
function PublicPreinscriptionModal({ onClose }) {
  const [form, setForm] = useState({
    nom: '',
    prenom: '',
    naissance: '2019-01-01',
    genre: 'M',
    niveauDemande: 'CP',
    parentNom: '',
    parentEmail: '',
    parentTel: '',
    adresse: '',
    antecedentsMedicaux: 'Aucun'
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    try {
      await api('/preinscriptions', 'POST', form);
      setSuccess(true);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal title="Pré-inscription Scolaire en Ligne" onClose={onClose}>
      {success ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎉</div>
          <h3>Demande enregistrée avec succès !</h3>
          <p style={{ color: 'var(--text-muted)', margin: '10px 0' }}>
            L'administration examinera votre demande et vous contactera à l’adresse <b>{form.parentEmail}</b> dès validation.
          </p>
          <button className="btn-primary" onClick={onClose}>Fermer</button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Remplissez ce formulaire pour pré-inscrire votre enfant pour l'année scolaire 2026-2027.
          </p>
          {error && <p className="badge badge-red" style={{ display: 'block', padding: '8px', marginBottom: '12px' }}>{error}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label>Nom de l'élève</label>
              <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Prénom de l'élève</label>
              <input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label>Date de Naissance</label>
              <input type="date" value={form.naissance} onChange={e => setForm({ ...form, naissance: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Genre</label>
              <select value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })}>
                <option value="M">Garçon</option>
                <option value="F">Fille</option>
              </select>
            </div>
            <div className="form-group">
              <label>Niveau</label>
              <select value={form.niveauDemande} onChange={e => setForm({ ...form, niveauDemande: e.target.value })}>
                {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Nom complet du Parent / Tuteur</label>
            <input value={form.parentNom} onChange={e => setForm({ ...form, parentNom: e.target.value })} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label>E-mail du parent</label>
              <input type="email" value={form.parentEmail} onChange={e => setForm({ ...form, parentEmail: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Téléphone portable</label>
              <input value={form.parentTel} onChange={e => setForm({ ...form, parentTel: e.target.value })} required />
            </div>
          </div>

          <div className="form-group">
            <label>Adresse de résidence</label>
            <input value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} placeholder="ex: Sousse, Khezama" />
          </div>

          <div className="form-actions">
            <button className="btn" onClick={onClose}>Annuler</button>
            <button className="btn-primary" onClick={handleSubmit}>Soumettre la demande</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// =========================================================================
// 14. SAAS SUPER-ADMIN SCHOOLS MANAGER
// =========================================================================
function SaasSchoolsSection({ user }) {
  const [schools, setSchools] = useState([]);
  const [stats, setStats] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', plan: 'standard', adresse: '', telephone: '', emailContact: '', adminNom: '', adminEmail: '', adminPassword: 'Admin123!' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api('/saas/schools'),
      api('/saas/stats')
    ]).then(([sList, sStats]) => {
      setSchools(sList);
      setStats(sStats);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (school) => {
    const nextStatus = school.status === 'active' ? 'suspended' : 'active';
    if (!window.confirm(`Confirmer le changement de statut en "${nextStatus}" pour l'école ${school.name} ?`)) return;
    try {
      await api(`/saas/schools/${school.id}`, 'PUT', { status: nextStatus });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.code) return alert("Nom et code d'école obligatoires");
    try {
      await api('/saas/schools', 'POST', form);
      setModal(false);
      setForm({ name: '', code: '', plan: 'standard', adresse: '', telephone: '', emailContact: '', adminNom: '', adminEmail: '', adminPassword: 'Admin123!' });
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="card"><p>Chargement des établissements SaaS...</p></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2>🏢 Plateforme SaaS Multi-Écoles</h2>
          <p style={{ color: 'var(--text-muted)' }}>Gestion centrale des établissements partenaires, abonnements et isolation des données.</p>
        </div>
        <button className="btn-primary" onClick={() => setModal(true)}>+ Ajouter un Établissement</button>
      </div>

      {stats && (
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <span className="stat-label">Établissements Hébergés</span>
            <span className="stat-val">{stats.schoolsCount}</span>
            <span style={{ fontSize: '12px', color: 'var(--success)' }}>{stats.activeSchools} actifs</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Élèves (Toutes Écoles)</span>
            <span className="stat-val">{stats.totalEleves}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Comptes Utilisateurs Actifs</span>
            <span className="stat-val">{stats.totalUsers}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Volume Financier Global</span>
            <span className="stat-val">{stats.totalRevenue} TND</span>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Liste des Établissements Partenaires</h3>
        <table className="table" style={{ width: '100%', marginTop: '12px' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom de l'école</th>
              <th>Code Tenant</th>
              <th>Formule / Plan</th>
              <th>Élèves</th>
              <th>Utilisateurs</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schools.map(s => (
              <tr key={s.id}>
                <td><b>#{s.id}</b></td>
                <td>
                  <b>{s.name}</b>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.adresse || s.telephone || '—'}</div>
                </td>
                <td><code>{s.code}</code></td>
                <td><span className="badge badge-blue">{s.plan?.toUpperCase()}</span></td>
                <td>🎓 {s.nbEleves}</td>
                <td>👥 {s.nbUsers}</td>
                <td>
                  <span className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                    {s.status === 'active' ? '● Actif' : '● Suspendu'}
                  </span>
                </td>
                <td>
                  <button
                    className={`btn-sm ${s.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                    onClick={() => toggleStatus(s)}
                  >
                    {s.status === 'active' ? 'Suspendre' : 'Activer'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="Créer un nouvel Établissement Scolaire (Tenant)" onClose={() => setModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label>Nom de l'école *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ex: Collège Al-Farabi" required />
            </div>
            <div className="form-group">
              <label>Code unique (sous-domaine) *</label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="ex: alfarabi-tunis" required />
            </div>
            <div className="form-group">
              <label>Formule d'abonnement</label>
              <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                <option value="basic">Basic (Mono-classe)</option>
                <option value="standard">Standard (École complète)</option>
                <option value="premium">Premium (Multi-bâtiments + SMS)</option>
                <option value="enterprise">Entreprise (Illimité)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Téléphone contact</label>
              <input value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} placeholder="+216 71 000 000" />
            </div>
          </div>
          <h4 style={{ marginTop: '16px', marginBottom: '8px' }}>Compte Administrateur / Direction :</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label>Nom du directeur</label>
              <input value={form.adminNom} onChange={e => setForm({ ...form, adminNom: e.target.value })} placeholder="ex: Direction M. Khaled" />
            </div>
            <div className="form-group">
              <label>E-mail admin</label>
              <input type="email" value={form.adminEmail} onChange={e => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@alfarabi.tn" />
            </div>
            <div className="form-group">
              <label>Mot de passe provisoire</label>
              <input value={form.adminPassword} onChange={e => setForm({ ...form, adminPassword: e.target.value })} />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: '16px' }}>
            <button className="btn" onClick={() => setModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={handleCreate}>Créer l'Établissement</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// =========================================================================
// MAIN APP ROOT COMPONENT
// =========================================================================
export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('u')); } catch { return null; }
  });
  const [activeTab, setActiveTab] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [publicModal, setPublicModal] = useState(false);
  const [notifications, setNotifications] = useState({ list: [], nonLues: 0 });
  const [notifOpen, setNotifOpen] = useState(false);
  const [bulletinModal, setBulletinModal] = useState(null);
  const [recuModal, setRecuModal] = useState(null);

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  // Load notifications periodically
  useEffect(() => {
    if (!user) return;
    const loadNotifs = () => {
      api('/notifications').then(setNotifications).catch(() => {});
    };
    loadNotifs();
    const interval = setInterval(loadNotifs, 20000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoginError('');
    try {
      const res = await api('/auth/login', 'POST', credentials);
      localStorage.setItem('t', res.token);
      localStorage.setItem('u', JSON.stringify(res.user));
      setUser(res.user);
      setActiveTab(null);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
  };

  const quickLogin = (email, password) => {
    setCredentials({ email, password });
    api('/auth/login', 'POST', { email, password }).then(res => {
      localStorage.setItem('t', res.token);
      localStorage.setItem('u', JSON.stringify(res.user));
      setUser(res.user);
      setActiveTab(null);
    }).catch(err => setLoginError(err.message));
  };

  // --- LOGIN SCREEN — PREMIUM DESIGN ---
  if (!user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Animated gradient orbs background */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: theme === 'dark'
            ? 'radial-gradient(ellipse 80% 60% at 20% 0%, rgba(79,110,247,0.12) 0%, transparent 50%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(139,92,246,0.1) 0%, transparent 50%), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(20,184,166,0.06) 0%, transparent 50%)'
            : 'radial-gradient(ellipse 80% 60% at 20% 0%, rgba(79,110,247,0.08) 0%, transparent 50%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(139,92,246,0.06) 0%, transparent 50%), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(20,184,166,0.04) 0%, transparent 50%)'
        }} />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="btn-sm"
          style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 10 }}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        <div style={{ maxWidth: '440px', width: '100%', zIndex: 1 }}>
          {/* Hero Brand */}
          <div style={{
            textAlign: 'center',
            marginBottom: '32px',
            animation: 'slideUp 0.6s cubic-bezier(0.4,0,0.2,1) both'
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '18px',
              background: 'linear-gradient(135deg, #4f6ef7 0%, #8b5cf6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '30px', margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(79,110,247,0.35)',
              animation: 'float 3s ease-in-out infinite'
            }}>
              🏫
            </div>
            <h2 style={{
              fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px',
              background: 'linear-gradient(135deg, var(--text-main) 0%, var(--text-muted) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              École Primaire d'Excellence
            </h2>
            <p style={{
              color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px',
              fontWeight: '500'
            }}>
              Portail de Gestion Scolaire · Année 2026-2027
            </p>
          </div>

          {/* Login Card — Glassmorphism */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '18px',
            padding: '32px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
            animation: 'slideUp 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s both'
          }}>
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-muted)', letterSpacing: '0.3px' }}>
                  Adresse E-mail
                </label>
                <input
                  type="email"
                  placeholder="nom@ecole.tn"
                  value={credentials.email}
                  onChange={e => setCredentials({ ...credentials, email: e.target.value })}
                  required
                  style={{ padding: '12px 16px', fontSize: '14.5px', borderRadius: '12px' }}
                />
              </div>
              <div className="form-group">
                <label style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-muted)', letterSpacing: '0.3px' }}>
                  Mot de passe
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={credentials.password}
                  onChange={e => setCredentials({ ...credentials, password: e.target.value })}
                  required
                  style={{ padding: '12px 16px', fontSize: '14.5px', borderRadius: '12px' }}
                />
              </div>

              {loginError && (
                <div style={{
                  background: 'var(--danger-bg)', color: 'var(--danger-text)',
                  padding: '10px 14px', borderRadius: '10px', fontSize: '13px',
                  fontWeight: '600', marginBottom: '14px',
                  border: '1px solid rgba(239,68,68,0.2)',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  ⚠️ {loginError}
                </div>
              )}

              <button type="submit" className="btn-primary" style={{
                width: '100%', justifyContent: 'center', padding: '13px',
                fontSize: '15px', borderRadius: '12px', fontWeight: '700',
                letterSpacing: '0.2px'
              }}>
                Se connecter →
              </button>
            </form>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              margin: '20px 0', color: 'var(--text-light)', fontSize: '12px'
            }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span>ou</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            <button className="btn" style={{
              width: '100%', justifyContent: 'center',
              padding: '11px', borderRadius: '12px', fontWeight: '600'
            }} onClick={() => setPublicModal(true)}>
              📋 Nouvelle Pré-inscription en ligne
            </button>
          </div>

          {/* Demo Fast Login — Premium Styled */}
          <div style={{
            marginTop: '28px', padding: '22px',
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            borderRadius: '16px',
            animation: 'slideUp 0.6s cubic-bezier(0.4,0,0.2,1) 0.2s both'
          }}>
            <p style={{
              fontWeight: '700', marginBottom: '14px', fontSize: '11.5px',
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.8px', textAlign: 'center'
            }}>
              ⚡ Accès Démonstration Multi-Écoles
            </p>
            
            {/* École 1 */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{
                fontSize: '11px', fontWeight: '700', color: 'var(--primary)',
                marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: 'var(--primary)', display: 'inline-block'
                }} />
                ÉCOLE 1 : EXCELLENCE (SOUSSE)
              </div>
              <div className="demo-btns">
                <button className="demo-btn" onClick={() => quickLogin('admin@ecole.tn', 'Admin123!')}>👨‍💼 Direction</button>
                <button className="demo-btn" onClick={() => quickLogin('prof.francais@ecole.tn', 'Prof123!')}>👨‍🏫 Prof</button>
                <button className="demo-btn" onClick={() => quickLogin('comptable@ecole.tn', 'Comptable123!')}>💼 Comptable</button>
                <button className="demo-btn" onClick={() => quickLogin('parent.benali@ecole.tn', 'Parent123!')}>👪 Parent</button>
              </div>
            </div>

            {/* École 2 */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{
                fontSize: '11px', fontWeight: '700', color: 'var(--success)',
                marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: 'var(--success)', display: 'inline-block'
                }} />
                ÉCOLE 2 : AL-AMAL (TUNIS)
              </div>
              <div className="demo-btns">
                <button className="demo-btn" onClick={() => quickLogin('admin@alamal.tn', 'Admin123!')}>👩‍💼 Direction</button>
                <button className="demo-btn" onClick={() => quickLogin('prof@alamal.tn', 'Prof123!')}>👨‍🏫 Prof</button>
                <button className="demo-btn" onClick={() => quickLogin('comptable@alamal.tn', 'Comptable123!')}>💼 Comptable</button>
                <button className="demo-btn" onClick={() => quickLogin('parent@alamal.tn', 'Parent123!')}>👪 Parent</button>
              </div>
            </div>

            {/* Super Admin */}
            <div>
              <div style={{
                fontSize: '11px', fontWeight: '700', color: 'var(--purple)',
                marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: 'var(--purple)', display: 'inline-block'
                }} />
                SUPER-ADMINISTRATEUR SAAS
              </div>
              <div className="demo-btns">
                <button className="demo-btn" style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(79,110,247,0.1))',
                  borderColor: 'var(--purple)', fontWeight: '700'
                }} onClick={() => quickLogin('superadmin@saas.tn', 'SuperAdmin123!')}>
                  👑 Plateforme Globale
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p style={{
            textAlign: 'center', marginTop: '24px',
            fontSize: '12px', color: 'var(--text-light)', fontWeight: '500'
          }}>
            © 2026-2027 · Système de Gestion Scolaire
          </p>
        </div>

        {publicModal && <PublicPreinscriptionModal onClose={() => setPublicModal(false)} />}
      </div>
    );
  }

  // --- AUTHENTICATED PORTAL ---
  const navTabs = NAV_ROLES[user.role] || ['dashboard'];
  const currentTab = activeTab || navTabs[0];

  return (
    <div>
      {/* Top Header */}
      <header className="topbar">
        <div className="brand" onClick={() => setActiveTab('dashboard')}>
          <div className="brand-logo">{user.role === 'superadmin' ? '🌐' : '🏫'}</div>
          <div className="brand-info">
            <h1>{user.schoolName || "Portail Scolaire"}</h1>
            <span>
              {user.schoolCode ? `Établissement : ${user.schoolCode.toUpperCase()} (${user.schoolPlan || 'Standard'})` : 'Administration Plateforme SaaS'}
              {' · '}<span className="academic-badge">2026-2027</span>
            </span>
          </div>
        </div>

        <div className="header-actions">
          {/* Notification Bell */}
          <div style={{ position: 'relative' }}>
            <button className="btn-sm" onClick={() => setNotifOpen(!notifOpen)}>
              🔔 {notifications.nonLues > 0 && <span className="badge badge-red" style={{ padding: '1px 5px' }}>{notifications.nonLues}</span>}
            </button>

            {notifOpen && (
              <div className="card" style={{ position: 'absolute', right: 0, top: '35px', width: '300px', zIndex: 60, padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <b>Notifications ({notifications.nonLues})</b>
                  <button className="btn-sm" onClick={async () => {
                    await api('/notifications/lire-tout', 'POST');
                    setNotifications({ ...notifications, nonLues: 0 });
                  }}>Tout marquer lu</button>
                </div>
                {notifications.list.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Aucune notification.</p>
                ) : (
                  notifications.list.slice(0, 5).map(n => (
                    <div key={n._id} style={{ fontSize: '12px', borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                      <b>{n.titre}</b>
                      <p style={{ color: 'var(--text-muted)' }}>{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <button className="btn-sm" onClick={toggleTheme}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          <div className="user-badge">
            <span>{user.nom}</span>
            <span className={`role-tag ${user.role}`}>{user.role}</span>
          </div>

          <button className="btn-sm btn-danger" onClick={handleLogout}>Quitter</button>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="tab-nav">
        {navTabs.map(tab => (
          <button
            key={tab}
            className={tab === currentTab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_TITLES[tab] || tab}
          </button>
        ))}
      </nav>

      {/* Main Container */}
      <main className="container">
        {currentTab === 'saas_schools' && <SaasSchoolsSection user={user} />}
        {currentTab === 'dashboard' && <Dashboard user={user} setTab={setActiveTab} />}
        {currentTab === 'emplois' && <EmploiDuTemps user={user} />}
        {currentTab === 'devoirs' && <DevoirsSection user={user} />}
        {currentTab === 'finances' && <FinancesSection user={user} />}
        {currentTab === 'preinscriptions' && <PreinscriptionsSection user={user} />}
        {currentTab === 'absences' && <AbsencesSection user={user} />}
        {currentTab === 'messages' && <MessagesSection user={user} />}
        {currentTab === 'annonces' && <AnnoncesSection user={user} />}
        {currentTab === 'users' && <UserAccountsManager user={user} />}
        {currentTab === 'journal' && <JournalSection />}

        {/* Generic CRUD fallback for standard tables (eleves, classes, matieres, salles, notes, paiements) */}
        {['eleves', 'classes', 'matieres', 'salles', 'notes', 'paiements'].includes(currentTab) && (
          <CrudManager
            key={currentTab}
            k={currentTab}
            user={user}
            onOpenBulletin={setBulletinModal}
            onOpenRecu={setRecuModal}
          />
        )}

        {/* Parent's dedicated Bulletins tab */}
        {currentTab === 'bulletins' && (
          <CrudManager
            key="eleves"
            k="eleves"
            user={user}
            onOpenBulletin={setBulletinModal}
            onOpenRecu={setRecuModal}
          />
        )}
      </main>

      {/* Print Modals */}
      {bulletinModal && <BulletinModal bulletin={bulletinModal} onClose={() => setBulletinModal(null)} />}
      {recuModal && <RecuModal paiement={recuModal} onClose={() => setRecuModal(null)} />}
    </div>
  );
}
