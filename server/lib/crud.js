import express from 'express';
import pool from '../db.js';
import { AN } from '../config.js';
import { auth, needSchool, wrap, fail, one, toId } from './http.js';
import { audit, diff } from './audit.js';
import { notify } from './notify.js';
import { readScope, teacherClassIds, Params } from './scope.js';

/* ---------------------------------------------------------------------
   Configuration des entités : colonnes autorisées (liste blanche),
   rôles autorisés en écriture, références à vérifier (même établissement)
   et règles de suppression contrôlée.
   --------------------------------------------------------------------- */
const CLASSE_LABEL = `(SELECT c.niveau || ' ' || c.section FROM classes c WHERE c.id = t.classe_id)`;
const ELEVE_LABEL = `(SELECT e.nom || ' ' || e.prenom FROM eleves e WHERE e.id = t.eleve_id)`;

export const ENTITIES = {
  classes: {
    annee: true,
    cols: ['niveau', 'section', 'cap', 'enseignant_titulaire_id', 'salle_id'],
    required: ['niveau', 'section', 'cap'],
    write: ['admin'],
    refs: { enseignant_titulaire_id: 'users', salle_id: 'salles' },
    select: `SELECT t.*, u.nom AS titulaire_nom, s.nom AS salle_nom,
      (SELECT COUNT(*)::int FROM eleves e WHERE e.classe_id = t.id AND e.deleted = FALSE AND e.statut = 'inscrit') AS effectif
      FROM classes t LEFT JOIN users u ON u.id = t.enseignant_titulaire_id LEFT JOIN salles s ON s.id = t.salle_id`,
    order: 't.niveau, t.section',
    guards: [
      { sql: `SELECT COUNT(*)::int AS n FROM eleves WHERE classe_id = $1 AND deleted = FALSE AND statut = 'inscrit'`,
        label: 'élève(s) encore affecté(s) à cette classe', onForce: 'UPDATE eleves SET classe_id = NULL WHERE classe_id = $1' },
      { sql: 'SELECT COUNT(*)::int AS n FROM emplois WHERE classe_id = $1 AND deleted = FALSE',
        label: 'créneau(x) d\'emploi du temps', onForce: 'UPDATE emplois SET deleted = TRUE WHERE classe_id = $1' }
    ]
  },
  matieres: {
    cols: ['nom', 'coef', 'niveau', 'enseignant_id'],
    required: ['nom', 'coef'],
    write: ['admin'],
    refs: { enseignant_id: 'users' },
    select: 'SELECT t.*, u.nom AS enseignant_nom FROM matieres t LEFT JOIN users u ON u.id = t.enseignant_id',
    order: 't.niveau, t.nom',
    guards: [
      { sql: 'SELECT COUNT(*)::int AS n FROM notes WHERE matiere_id = $1 AND deleted = FALSE', label: 'note(s) rattachée(s)', blocking: true },
      { sql: 'SELECT COUNT(*)::int AS n FROM emplois WHERE matiere_id = $1 AND deleted = FALSE', label: 'créneau(x) d\'emploi du temps', blocking: true },
      { sql: 'SELECT COUNT(*)::int AS n FROM matieres WHERE id = $1 AND enseignant_id IS NOT NULL', label: 'affectation enseignant', onForce: 'UPDATE matieres SET enseignant_id = NULL WHERE id = $1' }
    ]
  },
  salles: {
    cols: ['nom', 'cap', 'dispo', 'batiment', 'type'],
    required: ['nom', 'cap'],
    write: ['admin'],
    select: `SELECT t.*, (SELECT COUNT(*)::int FROM emplois em WHERE em.salle_id = t.id AND em.deleted = FALSE AND em.annee_scolaire = '${AN}') AS nb_creneaux FROM salles t`,
    order: 't.nom',
    guards: [
      { sql: 'SELECT COUNT(*)::int AS n FROM emplois WHERE salle_id = $1 AND deleted = FALSE', label: 'cours planifié(s) dans cette salle', onForce: 'UPDATE emplois SET salle_id = NULL WHERE salle_id = $1' }
    ]
  },
  eleves: {
    annee: true,
    cols: ['nom', 'prenom', 'matricule', 'naissance', 'genre', 'photo', 'ville', 'classe_id', 'parent_id', 'parent_nom', 'parent_email', 'parent_tel', 'antecedents_medicaux', 'annee_entree', 'statut', 'date_depart', 'motif_depart', 'consentement_rgpd'],
    required: ['nom', 'prenom', 'naissance'],
    write: ['admin', 'comptable'],
    refs: { classe_id: 'classes', parent_id: 'users' },
    select: `SELECT t.*, ${CLASSE_LABEL} AS classe_nom, (SELECT c.niveau FROM classes c WHERE c.id = t.classe_id) AS niveau FROM eleves t`,
    order: 't.nom, t.prenom',
    filters: ['classe_id', 'statut', 'parent_id'],
    guards: [
      { sql: 'SELECT COUNT(*)::int AS n FROM paiements WHERE eleve_id = $1 AND deleted = FALSE', label: 'paiement(s) enregistré(s)' },
      { sql: 'SELECT COUNT(*)::int AS n FROM notes WHERE eleve_id = $1 AND deleted = FALSE', label: 'note(s) enregistrée(s)' }
    ]
  },
  notes: {
    annee: true,
    cols: ['eleve_id', 'matiere_id', 'eval', 'trimestre', 'note', 'commentaire'],
    required: ['eleve_id', 'matiere_id', 'eval', 'trimestre', 'note'],
    write: ['admin', 'enseignant'],
    refs: { eleve_id: 'eleves', matiere_id: 'matieres' },
    select: `SELECT t.*, ${ELEVE_LABEL} AS eleve_nom, (SELECT m.nom FROM matieres m WHERE m.id = t.matiere_id) AS matiere_nom,
      (SELECT e.classe_id FROM eleves e WHERE e.id = t.eleve_id) AS classe_id FROM notes t`,
    order: 't.created_at DESC',
    filters: ['eleve_id', 'matiere_id', 'trimestre', 'eval'],
    extraFilters: { classe_id: 't.eleve_id IN (SELECT id FROM eleves WHERE classe_id = $V)' },
    limit: 3000
  },
  absences: {
    annee: true,
    cols: ['eleve_id', 'date', 'type', 'creneau', 'matiere', 'motif', 'justifiee', 'statut'],
    required: ['eleve_id', 'date'],
    write: ['admin', 'enseignant'],
    refs: { eleve_id: 'eleves' },
    select: `SELECT t.*, ${ELEVE_LABEL} AS eleve_nom, (SELECT c.niveau || ' ' || c.section FROM eleves e JOIN classes c ON c.id = e.classe_id WHERE e.id = t.eleve_id) AS classe_nom FROM absences t`,
    order: 't.date DESC',
    filters: ['eleve_id', 'statut', 'type'],
    limit: 2000
  },
  emplois: {
    annee: true,
    cols: ['classe_id', 'matiere_id', 'enseignant_id', 'salle_id', 'jour', 'debut', 'fin'],
    required: ['classe_id', 'matiere_id', 'enseignant_id', 'jour', 'debut', 'fin'],
    write: ['admin'],
    refs: { classe_id: 'classes', matiere_id: 'matieres', enseignant_id: 'users', salle_id: 'salles' },
    select: `SELECT t.*, ${CLASSE_LABEL} AS classe_nom, (SELECT m.nom FROM matieres m WHERE m.id = t.matiere_id) AS matiere_nom,
      (SELECT u.nom FROM users u WHERE u.id = t.enseignant_id) AS enseignant_nom, (SELECT s.nom FROM salles s WHERE s.id = t.salle_id) AS salle_nom FROM emplois t`,
    order: 't.jour, t.debut',
    filters: ['classe_id', 'enseignant_id', 'salle_id']
  },
  paiements: {
    annee: true,
    cols: ['eleve_id', 'montant', 'mode', 'type', 'date'],
    required: ['eleve_id', 'montant', 'mode'],
    write: ['admin', 'comptable'],
    noCreate: true, // création via /api/paiements (reçu + message automatique)
    refs: { eleve_id: 'eleves' },
    select: `SELECT t.*, ${ELEVE_LABEL} AS eleve_nom, (SELECT c.niveau || ' ' || c.section FROM eleves e JOIN classes c ON c.id = e.classe_id WHERE e.id = t.eleve_id) AS classe_nom FROM paiements t`,
    order: 't.date DESC, t.id DESC',
    filters: ['eleve_id', 'mode']
  },
  frais: {
    annee: true,
    cols: ['niveau', 'inscription', 'scolarite', 'nb_tranches'],
    required: ['niveau', 'scolarite'],
    write: ['admin', 'comptable'],
    select: 'SELECT t.* FROM frais t',
    order: 't.niveau'
  },
  depenses: {
    annee: true,
    cols: ['date', 'categorie', 'libelle', 'montant'],
    required: ['date', 'categorie', 'montant'],
    write: ['admin', 'comptable'],
    select: 'SELECT t.* FROM depenses t',
    order: 't.date DESC'
  },
  devoirs: {
    annee: true,
    cols: ['titre', 'desc_devoir', 'matiere_id', 'classe_id', 'enseignant_id', 'date_assignation', 'date_remise', 'bareme', 'piece_jointe', 'corrige', 'corrige_fichier'],
    required: ['titre', 'matiere_id', 'classe_id', 'date_remise'],
    write: ['admin', 'enseignant'],
    refs: { matiere_id: 'matieres', classe_id: 'classes', enseignant_id: 'users' },
    select: `SELECT t.*, ${CLASSE_LABEL} AS classe_nom, (SELECT m.nom FROM matieres m WHERE m.id = t.matiere_id) AS matiere_nom,
      (SELECT u.nom FROM users u WHERE u.id = t.enseignant_id) AS enseignant_nom,
      (SELECT COUNT(*)::int FROM devoirs_rendus r WHERE r.devoir_id = t.id AND r.deleted = FALSE) AS nb_rendus,
      (SELECT COUNT(*)::int FROM eleves e WHERE e.classe_id = t.classe_id AND e.deleted = FALSE AND e.statut = 'inscrit') AS nb_eleves
      FROM devoirs t`,
    order: 't.date_remise DESC',
    filters: ['classe_id', 'matiere_id'],
    guards: [
      { sql: 'SELECT COUNT(*)::int AS n FROM devoirs_rendus WHERE devoir_id = $1 AND deleted = FALSE', label: 'travail(aux) d\'élève déjà déposé(s)' }
    ]
  },
  devoirs_rendus: {
    cols: [], write: [], noCreate: true,
    select: `SELECT t.*, (SELECT d.titre FROM devoirs d WHERE d.id = t.devoir_id) AS devoir_titre FROM devoirs_rendus t`,
    order: 't.date_depot DESC',
    filters: ['devoir_id', 'eleve_id']
  },
  annonces: {
    annee: true,
    cols: ['titre', 'contenu', 'cible', 'importante', 'corrige_annonce_id'],
    required: ['titre', 'contenu'],
    write: ['admin', 'directeur'],
    immutable: true, // une annonce publiée ne peut être ni modifiée ni supprimée
    refs: { corrige_annonce_id: 'annonces' },
    select: 'SELECT t.* FROM annonces t',
    order: 't.created_at DESC'
  },
  absences_enseignants: {
    annee: true,
    cols: ['enseignant_id', 'date', 'nb_heures', 'motif', 'remplacant_id'],
    required: ['enseignant_id', 'date'],
    write: ['admin', 'directeur'],
    refs: { enseignant_id: 'users', remplacant_id: 'users' },
    select: `SELECT t.*, (SELECT u.nom FROM users u WHERE u.id = t.enseignant_id) AS enseignant_nom,
      (SELECT u.nom FROM users u WHERE u.id = t.remplacant_id) AS remplacant_nom FROM absences_enseignants t`,
    order: 't.date DESC'
  },
  preinscriptions: {
    annee: true,
    cols: [], write: ['admin', 'comptable'], noCreate: true, noUpdate: true,
    select: 'SELECT t.* FROM preinscriptions t',
    order: 't.created_at DESC',
    filters: ['statut']
  }
};

const normalize = v => (v === '' || v === undefined ? null : v);

function pickColumns(cfg, body) {
  const out = {};
  for (const c of cfg.cols) {
    if (Object.prototype.hasOwnProperty.call(body, c)) out[c] = normalize(body[c]);
  }
  return out;
}

// Toute référence (classe, élève, enseignant...) doit appartenir au même établissement
async function checkRefs(cfg, data, schoolId) {
  for (const [col, table] of Object.entries(cfg.refs || {})) {
    if (data[col] == null) continue;
    const id = toId(data[col]);
    if (!id) fail(400, `Référence invalide : ${col}`);
    const row = await one(`SELECT id FROM ${table} WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    if (!row) fail(400, `Référence introuvable dans votre établissement : ${col}`);
    data[col] = id;
  }
}

// Vérifie qu'un enseignant n'agit que sur ses classes / ses devoirs
async function checkTeacher(table, u, data, existing) {
  if (u.role !== 'enseignant') return;
  const classes = await teacherClassIds(u, existing?.annee_scolaire || AN);
  const classeOfEleve = async id => (await one('SELECT classe_id FROM eleves WHERE id = $1', [id]))?.classe_id;
  if (table === 'notes' || table === 'absences') {
    for (const eid of [existing?.eleve_id, data.eleve_id].filter(Boolean)) {
      if (!classes.includes(await classeOfEleve(eid))) fail(403, 'Cet élève n\'appartient pas à vos classes');
    }
  }
  if (table === 'devoirs') {
    if (existing && +existing.enseignant_id !== +u.id) fail(403, 'Vous ne pouvez modifier que vos propres devoirs');
    if (data.classe_id && !classes.includes(+data.classe_id)) fail(403, 'Cette classe ne fait pas partie de vos classes');
    data.enseignant_id = +u.id;
  }
}

export async function checkCapacite(classeId, eleveId = null) {
  if (!classeId) return;
  const c = await one(`SELECT cap, niveau, section, (SELECT COUNT(*)::int FROM eleves e WHERE e.classe_id = classes.id AND e.deleted = FALSE AND e.statut = 'inscrit' AND e.id <> COALESCE($2, -1)) AS n FROM classes WHERE id = $1`, [classeId, eleveId]);
  if (c && c.n >= c.cap) fail(409, `Effectif maximal atteint pour ${c.niveau} ${c.section} (${c.n}/${c.cap})`);
}

export async function conflitEmploi(data, schoolId, currentId = null) {
  const q = new Params([schoolId, data.annee_scolaire || AN, data.jour, data.debut, data.fin]);
  let sql = `SELECT t.*, (SELECT c.niveau || ' ' || c.section FROM classes c WHERE c.id = t.classe_id) AS classe_nom
    FROM emplois t WHERE t.school_id = $1 AND t.deleted = FALSE AND t.annee_scolaire = $2 AND t.jour = $3 AND t.debut < $5 AND t.fin > $4`;
  if (currentId) sql += ` AND t.id <> ${q.add(currentId)}`;
  const rows = (await pool.query(sql, q.list)).rows;
  for (const c of rows) {
    const plage = `${String(c.debut).slice(0, 5)}–${String(c.fin).slice(0, 5)}`;
    if (+c.classe_id === +data.classe_id) return `La classe a déjà un cours le ${data.jour} (${plage})`;
    if (+c.enseignant_id === +data.enseignant_id) return `L'enseignant est déjà affecté à ${c.classe_nom} le ${data.jour} (${plage})`;
    if (data.salle_id && +c.salle_id === +data.salle_id) return `La salle est déjà occupée par ${c.classe_nom} le ${data.jour} (${plage})`;
  }
  return null;
}

async function beforeWrite(table, u, data, existing, schoolId) {
  if (table === 'eleves') {
    const classeChange = data.classe_id && (!existing || +existing.classe_id !== +data.classe_id);
    if (classeChange) await checkCapacite(data.classe_id, existing?.id);
    if (!existing && !data.matricule) data.matricule = `EL-${Date.now().toString(36).toUpperCase()}`;
    if (!existing && !data.annee_entree) data.annee_entree = AN;
  }
  if (table === 'emplois') {
    const merged = { ...existing, ...data };
    const conflit = await conflitEmploi(merged, schoolId, existing?.id);
    if (conflit) fail(409, `Conflit d'horaire : ${conflit}`);
  }
  if (table === 'notes' && data.note != null && (data.note < 0 || data.note > 20)) fail(400, 'La note doit être comprise entre 0 et 20');
}

async function afterCreate(table, u, row) {
  if (table === 'annonces') {
    // Notification des rôles ciblés par l'annonce
    const roles = { tous: ['admin', 'directeur', 'enseignant', 'comptable', 'parent', 'eleve'], parents: ['parent'], enseignants: ['enseignant'], eleves: ['eleve'] }[row.cible] || [];
    await pool.query(
      `INSERT INTO notifications (school_id, user_id, titre, message, type, lien)
       SELECT $1, id, $2, $3, 'annonce', '/annonces' FROM users WHERE school_id = $1 AND deleted = FALSE AND role = ANY($4) AND id <> $5`,
      [row.school_id, `${row.importante ? 'Important : ' : 'Annonce : '}${row.titre}`.slice(0, 150), row.contenu.slice(0, 200), roles, +u.id]
    );
  }
  if (table === 'devoirs') {
    const cible = await pool.query(
      `SELECT e.id, e.parent_id, (SELECT id FROM users WHERE eleve_id = e.id AND role = 'eleve' LIMIT 1) AS compte_eleve
       FROM eleves e WHERE e.classe_id = $1 AND e.deleted = FALSE AND e.statut = 'inscrit'`, [row.classe_id]);
    const dest = new Set();
    for (const e of cible.rows) { if (e.parent_id) dest.add(e.parent_id); if (e.compte_eleve) dest.add(e.compte_eleve); }
    for (const id of dest) {
      await notify(id, 'Nouveau devoir publié', `${row.titre} – à rendre le ${new Date(row.date_remise).toLocaleDateString('fr-FR')}`, { type: 'devoir', lien: '/devoirs', schoolId: row.school_id });
    }
  }
}

/* ---------------------------------------------------------------------
   Routeur générique /api/:entity
   --------------------------------------------------------------------- */
export function crudRouter() {
  const r = express.Router();
  r.use(auth, needSchool);

  const cfgOf = (req) => {
    const cfg = ENTITIES[req.params.entity];
    if (!cfg) fail(404, 'Ressource inconnue');
    return cfg;
  };
  const canWrite = (cfg, u) => u.role === 'superadmin' || cfg.write.includes(u.role);

  r.get('/:entity', wrap(async (req, res) => {
    const table = req.params.entity;
    const cfg = cfgOf(req);
    const u = req.u;
    const annee = String(req.query.annee || AN);
    const q = new Params([u.schoolId]);
    let where = ' WHERE t.school_id = $1 AND t.deleted = FALSE';
    if (cfg.annee && req.query.annee !== 'toutes') where += ` AND t.annee_scolaire = ${q.add(annee)}`;
    for (const f of cfg.filters || []) {
      if (req.query[f] !== undefined && req.query[f] !== '') where += ` AND t.${f} = ${q.add(req.query[f])}`;
    }
    for (const [f, tpl] of Object.entries(cfg.extraFilters || {})) {
      if (req.query[f]) where += ` AND ${tpl.replace('$V', q.add(req.query[f]))}`;
    }
    where += await readScope(table, u, q, annee);
    const sql = `${cfg.select}${where} ORDER BY ${cfg.order || 't.id DESC'} LIMIT ${cfg.limit || 1000}`;
    const { rows } = await pool.query(sql, q.list);
    res.json(rows);
  }));

  r.post('/:entity', wrap(async (req, res) => {
    const table = req.params.entity;
    const cfg = cfgOf(req);
    if (cfg.noCreate || !canWrite(cfg, req.u)) fail(403, 'Création non autorisée pour votre profil');
    const data = pickColumns(cfg, req.body);
    for (const f of cfg.required || []) if (data[f] == null) fail(400, `Champ obligatoire manquant : ${f}`);
    await checkRefs(cfg, data, req.u.schoolId);
    await checkTeacher(table, req.u, data, null);
    if (cfg.annee) data.annee_scolaire = AN;
    await beforeWrite(table, req.u, data, null, req.u.schoolId);
    if (table === 'annonces') { data.auteur_id = +req.u.id; data.auteur_nom = req.u.nom; }
    data.school_id = req.u.schoolId;
    const cols = Object.keys(data);
    const { rows } = await pool.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      Object.values(data)
    );
    const row = rows[0];
    await audit(req.u, `Création ${table}`, { entite: table, entiteId: row.id, apres: row });
    await afterCreate(table, req.u, row);
    res.status(201).json(row);
  }));

  r.put('/:entity/:id', wrap(async (req, res) => {
    const table = req.params.entity;
    const cfg = cfgOf(req);
    if (cfg.immutable) fail(409, 'Élément publié : il ne peut plus être modifié. Publiez un correctif.');
    if (cfg.noUpdate || !canWrite(cfg, req.u)) fail(403, 'Modification non autorisée pour votre profil');
    const id = toId(req.params.id);
    const existing = id && await one(`SELECT * FROM ${table} WHERE id = $1 AND school_id = $2 AND deleted = FALSE`, [id, req.u.schoolId]);
    if (!existing) fail(404, 'Élément introuvable dans votre établissement');
    const data = pickColumns(cfg, req.body);
    if (!Object.keys(data).length) fail(400, 'Aucune donnée à modifier');
    await checkRefs(cfg, data, req.u.schoolId);
    await checkTeacher(table, req.u, data, existing);
    await beforeWrite(table, req.u, data, existing, req.u.schoolId);
    const cols = Object.keys(data);
    const { rows } = await pool.query(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...Object.values(data)]
    );
    const { avant, apres } = diff(existing, rows[0]);
    await audit(req.u, `Modification ${table}`, { entite: table, entiteId: id, avant, apres });
    res.json(rows[0]);
  }));

  // Suppression logique contrôlée : refusée si l'élément est référencé, sauf confirmation explicite (?force=true)
  r.delete('/:entity/:id', wrap(async (req, res) => {
    const table = req.params.entity;
    const cfg = cfgOf(req);
    if (cfg.immutable) fail(409, 'Élément publié : il ne peut pas être supprimé.');
    if (!canWrite(cfg, req.u)) fail(403, 'Suppression non autorisée pour votre profil');
    const id = toId(req.params.id);
    const existing = id && await one(`SELECT * FROM ${table} WHERE id = $1 AND school_id = $2 AND deleted = FALSE`, [id, req.u.schoolId]);
    if (!existing) fail(404, 'Élément introuvable dans votre établissement');
    await checkTeacher(table, req.u, {}, existing);

    const force = req.query.force === 'true';
    const blocages = [];
    for (const g of cfg.guards || []) {
      const n = (await one(g.sql, [id]))?.n || 0;
      if (n > 0) blocages.push({ ...g, n });
    }
    const bloquants = blocages.filter(b => b.blocking);
    if (bloquants.length) {
      fail(409, `Suppression impossible : ${bloquants.map(b => `${b.n} ${b.label}`).join(', ')}.`, { references: bloquants.map(b => ({ n: b.n, label: b.label })), forcable: false });
    }
    if (blocages.length && !force) {
      fail(409, `Cet élément est référencé : ${blocages.map(b => `${b.n} ${b.label}`).join(', ')}. Confirmez pour réaffecter/détacher puis supprimer.`, { references: blocages.map(b => ({ n: b.n, label: b.label })), forcable: true });
    }
    for (const b of blocages) if (b.onForce) await pool.query(b.onForce, [id]);
    await pool.query(`UPDATE ${table} SET deleted = TRUE WHERE id = $1`, [id]);
    await audit(req.u, `Suppression ${table}`, { entite: table, entiteId: id, avant: existing, data: force ? { confirmation: true, references: blocages.map(b => `${b.n} ${b.label}`) } : null });
    res.json({ ok: true });
  }));

  return r;
}
