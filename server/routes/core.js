import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import pool from '../db.js';
import { JWT_SECRET, AN, SERVER_DIR } from '../config.js';
import { auth, only, needSchool, wrap, fail, one, all, toId, childrenOf } from '../lib/http.js';
import { audit, diff } from '../lib/audit.js';
import { notify, sendEmail } from '../lib/notify.js';
import { teacherClassIds } from '../lib/scope.js';
import { persistUpload, nextcloud, nextcloudInfo } from '../lib/storage.js';

export const UPLOAD_DIR = path.resolve(SERVER_DIR, process.env.UPLOAD_DIR || 'uploads');
const r = express.Router();

/* ------------------------------ Santé ------------------------------- */
r.get('/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, annee: AN, stockage: nextcloud ? 'nextcloud' : 'local' });
}));

// Liste publique minimale des établissements actifs (formulaire de pré-inscription)
r.get('/public/ecoles', wrap(async (req, res) => {
  res.json(await all(`SELECT id, name, ville FROM schools WHERE status <> 'suspended' ORDER BY name`));
}));

/* --------------------------- Authentification ------------------------ */
function profil(u, school, enfants = []) {
  return {
    id: String(u.id),
    nom: u.nom,
    email: u.email,
    role: u.role,
    telephone: u.telephone || '',
    eleveId: u.eleve_id ? String(u.eleve_id) : '',
    schoolId: u.school_id || null,
    schoolName: school?.name || 'Console plateforme',
    schoolCode: school?.code || 'plateforme',
    schoolPlan: school?.plan || null,
    schoolVille: school?.ville || null,
    enfants
  };
}

async function loadProfil(u) {
  const school = u.school_id ? await one('SELECT id, name, code, plan, status, ville FROM schools WHERE id = $1', [u.school_id]) : null;
  let enfants = [];
  if (u.role === 'parent') {
    enfants = await all(
      `SELECT e.id, e.nom, e.prenom, e.classe_id, c.niveau || ' ' || c.section AS classe
       FROM eleves e LEFT JOIN classes c ON c.id = e.classe_id WHERE e.parent_id = $1 AND e.deleted = FALSE ORDER BY e.prenom`, [u.id]);
  }
  return { school, enfants };
}

r.post('/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) fail(400, 'E-mail et mot de passe obligatoires');
  const u = await one('SELECT * FROM users WHERE LOWER(email) = $1 AND deleted = FALSE', [email]);
  const ok = u && await bcrypt.compare(password, u.hash).catch(() => false);
  if (!ok) {
    await audit(null, 'Échec de connexion', { data: { email }, schoolId: u?.school_id || null });
    fail(401, 'Identifiants invalides');
  }
  if (!u.actif) fail(403, 'Ce compte est désactivé. Contactez l\'administration.');
  const { school, enfants } = await loadProfil(u);
  if (school?.status === 'suspended') fail(403, 'Cet établissement est suspendu. Contactez l\'éditeur de la plateforme.');
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [u.id]);
  const p = profil(u, school, enfants);
  const token = jwt.sign({ id: p.id, nom: p.nom, role: p.role, schoolId: p.schoolId, eleveId: p.eleveId }, JWT_SECRET, { expiresIn: '12h' });
  await audit({ id: u.id, nom: u.nom, role: u.role, schoolId: u.school_id }, 'Connexion');
  res.json({ token, user: p });
}));

r.get('/auth/me', auth, wrap(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = $1 AND deleted = FALSE', [req.u.id]);
  if (!u || !u.actif) fail(401, 'Compte introuvable ou désactivé');
  const { school, enfants } = await loadProfil(u);
  res.json(profil(u, school, enfants));
}));

r.post('/auth/password', auth, wrap(async (req, res) => {
  const { actuel, nouveau } = req.body;
  if (!nouveau || String(nouveau).length < 8) fail(400, 'Le nouveau mot de passe doit contenir au moins 8 caractères');
  const u = await one('SELECT * FROM users WHERE id = $1', [req.u.id]);
  if (!(await bcrypt.compare(String(actuel || ''), u.hash))) fail(400, 'Mot de passe actuel incorrect');
  await pool.query('UPDATE users SET hash = $1, updated_at = NOW() WHERE id = $2', [await bcrypt.hash(String(nouveau), 10), u.id]);
  await audit(req.u, 'Changement de mot de passe', { entite: 'users', entiteId: u.id });
  res.json({ ok: true });
}));

/* ----------------------- Console SaaS (super-admin) ------------------- */
r.get('/saas/schools', auth, only(), wrap(async (req, res) => {
  res.json(await all(`
    SELECT s.*,
      (SELECT COUNT(*)::int FROM eleves e WHERE e.school_id = s.id AND e.deleted = FALSE AND e.statut = 'inscrit' AND e.annee_scolaire = $1) AS nb_eleves,
      (SELECT COUNT(*)::int FROM users u WHERE u.school_id = s.id AND u.deleted = FALSE) AS nb_users,
      (SELECT COUNT(*)::int FROM users u WHERE u.school_id = s.id AND u.role = 'enseignant' AND u.deleted = FALSE) AS nb_enseignants,
      (SELECT COUNT(*)::int FROM classes c WHERE c.school_id = s.id AND c.deleted = FALSE AND c.annee_scolaire = $1) AS nb_classes,
      (SELECT COALESCE(SUM(p.montant), 0)::float FROM paiements p WHERE p.school_id = s.id AND p.deleted = FALSE AND p.annee_scolaire = $1) AS encaisse
    FROM schools s ORDER BY s.id`, [AN]));
}));

r.post('/saas/schools', auth, only(), wrap(async (req, res) => {
  const { name, code, ville, plan, adresse, telephone, emailContact, capacite, adminNom, adminEmail, adminPassword } = req.body;
  if (!name || !code) fail(400, 'Nom et code de l\'établissement obligatoires');
  const clean = String(code).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
  if (await one('SELECT id FROM schools WHERE code = $1', [clean])) fail(409, 'Ce code d\'établissement existe déjà');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [school] } = await client.query(
      `INSERT INTO schools (name, code, ville, plan, status, adresse, telephone, email_contact, capacite_accueil)
       VALUES ($1,$2,$3,$4,'trial',$5,$6,$7,$8) RETURNING *`,
      [name.trim(), clean, ville || null, plan || 'standard', adresse || null, telephone || null, emailContact || null, +capacite || 300]
    );
    let admin = null;
    if (adminEmail) {
      if (!adminPassword || adminPassword.length < 8) throw Object.assign(new Error('Mot de passe administrateur : 8 caractères minimum'), { status: 400 });
      const { rows } = await client.query(
        `INSERT INTO users (school_id, nom, email, hash, role) VALUES ($1,$2,$3,$4,'admin') RETURNING id, nom, email, role`,
        [school.id, adminNom || `Administration ${name}`, adminEmail.toLowerCase().trim(), await bcrypt.hash(adminPassword, 10)]
      );
      admin = rows[0];
    }
    await client.query(
      `INSERT INTO frais (school_id, annee_scolaire, niveau, inscription, scolarite, nb_tranches) VALUES ($1,$2,'Tous',150,1200,3)`,
      [school.id, AN]
    );
    await client.query('COMMIT');
    await audit(req.u, 'Création établissement', { entite: 'schools', entiteId: school.id, apres: school, schoolId: school.id });
    res.status(201).json({ school, admin });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

r.put('/saas/schools/:id', auth, only(), wrap(async (req, res) => {
  const id = toId(req.params.id);
  const avant = await one('SELECT * FROM schools WHERE id = $1', [id]);
  if (!avant) fail(404, 'Établissement introuvable');
  const map = { name: 'name', ville: 'ville', status: 'status', plan: 'plan', subscriptionEnd: 'subscription_end', adresse: 'adresse', telephone: 'telephone', emailContact: 'email_contact', capacite: 'capacite_accueil' };
  const sets = [], vals = [id];
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${col} = $${vals.length}`); }
  }
  if (!sets.length) fail(400, 'Aucune donnée');
  const { rows } = await pool.query(`UPDATE schools SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`, vals);
  await audit(req.u, 'Modification établissement', { entite: 'schools', entiteId: id, ...diff(avant, rows[0]), schoolId: id });
  res.json(rows[0]);
}));

/* --------------------- Comptes utilisateurs (admin) ------------------- */
const ROLES_GERES = ['admin', 'directeur', 'enseignant', 'comptable', 'parent', 'eleve'];
const USER_COLS = 'id, nom, email, role, telephone, specialite, heures_max, eleve_id, actif, last_login, created_at';

r.get('/users', auth, needSchool, wrap(async (req, res) => {
  // Les rôles de pilotage voient tous les comptes ; les autres n'obtiennent que la liste des enseignants (affichage)
  const pilotage = ['superadmin', 'admin', 'directeur'].includes(req.u.role);
  const params = [req.u.schoolId];
  let sql = `SELECT ${USER_COLS} FROM users WHERE school_id = $1 AND deleted = FALSE`;
  if (pilotage) {
    if (req.query.role) { params.push(req.query.role); sql += ` AND role = $2`; }
  } else if (req.u.role === 'comptable' && req.query.role === 'parent') {
    sql += ` AND role = 'parent'`; // rattachement d'un élève à son compte parent
  } else {
    sql += ` AND role = 'enseignant'`;
  }
  res.json(await all(sql + ' ORDER BY role, nom', params));
}));

r.post('/users', auth, only('admin'), needSchool, wrap(async (req, res) => {
  const { nom, email, password, role, telephone, specialite, heures_max, eleve_id } = req.body;
  if (!nom || !email || !password) fail(400, 'Nom, e-mail et mot de passe obligatoires');
  if (String(password).length < 8) fail(400, 'Le mot de passe doit contenir au moins 8 caractères');
  if (!ROLES_GERES.includes(role)) fail(400, 'Rôle invalide');
  if (await one('SELECT id FROM users WHERE LOWER(email) = $1', [email.toLowerCase().trim()])) fail(409, 'Cet e-mail est déjà utilisé');
  if (eleve_id && !(await one('SELECT id FROM eleves WHERE id = $1 AND school_id = $2', [eleve_id, req.u.schoolId]))) fail(400, 'Élève introuvable');
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (school_id, nom, email, hash, role, telephone, specialite, heures_max, eleve_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${USER_COLS}`,
    [req.u.schoolId, nom, email.toLowerCase().trim(), await bcrypt.hash(password, 10), role, telephone || null, specialite || null, +heures_max || 24, eleve_id || null]
  );
  await audit(req.u, 'Création utilisateur', { entite: 'users', entiteId: u.id, apres: u });
  res.status(201).json(u);
}));

r.put('/users/:id', auth, only('admin'), needSchool, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const avant = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1 AND school_id = $2 AND deleted = FALSE`, [id, req.u.schoolId]);
  if (!avant) fail(404, 'Utilisateur introuvable dans votre établissement');
  const sets = [], vals = [id];
  const put = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  const b = req.body;
  if (b.nom) put('nom', b.nom);
  if (b.email) put('email', b.email.toLowerCase().trim());
  if (b.role) { if (!ROLES_GERES.includes(b.role)) fail(400, 'Rôle invalide'); put('role', b.role); }
  for (const c of ['telephone', 'specialite']) if (b[c] !== undefined) put(c, b[c] || null);
  if (b.heures_max !== undefined) put('heures_max', +b.heures_max || 24);
  if (b.actif !== undefined) {
    if (String(id) === String(req.u.id) && !b.actif) fail(400, 'Vous ne pouvez pas désactiver votre propre compte');
    put('actif', !!b.actif);
  }
  if (b.password) {
    if (String(b.password).length < 8) fail(400, 'Le mot de passe doit contenir au moins 8 caractères');
    put('hash', await bcrypt.hash(b.password, 10));
  }
  if (!sets.length) fail(400, 'Aucune donnée');
  const { rows: [u] } = await pool.query(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING ${USER_COLS}`, vals);
  await audit(req.u, 'Modification utilisateur', { entite: 'users', entiteId: id, ...diff(avant, u), data: b.password ? { motDePasse: 'réinitialisé' } : null });
  res.json(u);
}));

r.delete('/users/:id', auth, only('admin'), needSchool, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (String(id) === String(req.u.id)) fail(400, 'Impossible de supprimer votre propre compte');
  const avant = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1 AND school_id = $2 AND deleted = FALSE`, [id, req.u.schoolId]);
  if (!avant) fail(404, 'Utilisateur introuvable dans votre établissement');
  const refs = await one(`SELECT
      (SELECT COUNT(*)::int FROM classes WHERE enseignant_titulaire_id = $1 AND deleted = FALSE) AS classes,
      (SELECT COUNT(*)::int FROM emplois WHERE enseignant_id = $1 AND deleted = FALSE) AS emplois,
      (SELECT COUNT(*)::int FROM eleves WHERE parent_id = $1 AND deleted = FALSE) AS enfants`, [id]);
  const n = refs.classes + refs.emplois + refs.enfants;
  if (n && req.query.force !== 'true') {
    fail(409, `Compte référencé (${refs.classes} classe(s) en titulaire, ${refs.emplois} créneau(x), ${refs.enfants} enfant(s)). Confirmez pour désactiver et supprimer.`, { forcable: true });
  }
  await pool.query('UPDATE users SET deleted = TRUE, actif = FALSE, updated_at = NOW() WHERE id = $1', [id]);
  await audit(req.u, 'Suppression utilisateur', { entite: 'users', entiteId: id, avant });
  res.json({ ok: true });
}));

/* ------------------------------ Messagerie ---------------------------- */
// Matrice des droits de communication (cahier des charges §10.1 / §10.2)
async function destinataires(u) {
  const sid = u.schoolId;
  const base = `SELECT id, nom, role, email FROM users WHERE school_id = $1 AND deleted = FALSE AND actif = TRUE AND id <> $2`;
  const p = [sid, u.id];
  switch (u.role) {
    case 'admin':
    case 'directeur':
    case 'superadmin':
      return all(`${base} AND role IN ('admin','directeur','enseignant','comptable','parent','eleve') ORDER BY role, nom`, p);
    case 'comptable':
      return all(`${base} AND role IN ('admin','directeur','parent') ORDER BY role, nom`, p);
    case 'enseignant': {
      const cls = await teacherClassIds(u, AN);
      return all(`${base} AND (role IN ('admin','directeur') OR (role = 'parent' AND id IN (SELECT parent_id FROM eleves WHERE classe_id = ANY($3) AND deleted = FALSE))) ORDER BY role, nom`, [...p, cls]);
    }
    case 'parent': {
      const cls = (await childrenOf(u)).map(k => k.classe_id).filter(Boolean);
      return all(`${base} AND (role IN ('admin','directeur','comptable') OR (role = 'enseignant' AND id IN (
          SELECT enseignant_titulaire_id FROM classes WHERE id = ANY($3) UNION SELECT enseignant_id FROM emplois WHERE classe_id = ANY($3) AND deleted = FALSE))) ORDER BY role, nom`, [...p, cls]);
    }
    case 'eleve':
      return all(`${base} AND role IN ('admin','directeur') ORDER BY role, nom`, p);
    default:
      return [];
  }
}

r.get('/messages/destinataires', auth, needSchool, wrap(async (req, res) => {
  res.json((await destinataires(req.u)).map(({ email, ...d }) => d));
}));

r.get('/messages', auth, needSchool, wrap(async (req, res) => {
  const id = +req.u.id;
  const rows = await all(
    `SELECT m.*, (SELECT e.prenom || ' ' || e.nom FROM eleves e WHERE e.id = m.eleve_id) AS eleve_nom
     FROM messages m WHERE m.school_id = $1 AND (m.de_id = $2 OR m.a_id = $2) ORDER BY m.created_at DESC LIMIT 500`,
    [req.u.schoolId, id]
  );
  res.json({
    inbox: rows.filter(m => m.a_id === id && !m.brouillon && !(m.masque_par || []).includes(id)),
    sent: rows.filter(m => m.de_id === id && !m.brouillon),
    drafts: rows.filter(m => m.de_id === id && m.brouillon)
  });
}));

// Ouverture d'un message : marquage « lu » + journalisation de l'accès à l'historique (§10.5)
r.get('/messages/:id', auth, needSchool, wrap(async (req, res) => {
  const m = await one('SELECT * FROM messages WHERE id = $1 AND school_id = $2', [toId(req.params.id), req.u.schoolId]);
  const me = +req.u.id;
  if (!m || (m.de_id !== me && m.a_id !== me)) fail(404, 'Message introuvable');
  if (m.a_id === me && !m.lu && !m.brouillon) {
    await pool.query('UPDATE messages SET lu = TRUE, lu_at = NOW() WHERE id = $1', [m.id]);
    m.lu = true;
  }
  await audit(req.u, 'Consultation message', { entite: 'messages', entiteId: m.id });
  res.json(m);
}));

async function saveMessage(req, existing) {
  const b = req.body;
  const dest = (await destinataires(req.u)).find(d => d.id === toId(b.a_id));
  if (!dest) fail(403, 'Destinataire non autorisé pour votre profil');
  const envoi = !b.brouillon;
  if (envoi && (!b.objet || !b.corps)) fail(400, 'Objet et message obligatoires');
  const categories = ['information', 'pedagogique', 'administratif', 'reclamation', 'demande', 'rappel'];
  const categorie = categories.includes(b.categorie) ? b.categorie : 'information';
  let eleveId = toId(b.eleve_id);
  if (eleveId && !(await one('SELECT id FROM eleves WHERE id = $1 AND school_id = $2', [eleveId, req.u.schoolId]))) eleveId = null;
  const vals = [dest.id, dest.nom, dest.role, eleveId, categorie, b.objet || '', b.corps || '', b.piece_jointe || null, !envoi];
  let m;
  if (existing) {
    ({ rows: [m] } = await pool.query(
      `UPDATE messages SET a_id=$1, a_nom=$2, a_role=$3, eleve_id=$4, categorie=$5, objet=$6, corps=$7, piece_jointe=$8, brouillon=$9, created_at = NOW() WHERE id=$10 RETURNING *`,
      [...vals, existing.id]));
  } else {
    ({ rows: [m] } = await pool.query(
      `INSERT INTO messages (a_id, a_nom, a_role, eleve_id, categorie, objet, corps, piece_jointe, brouillon, school_id, de_id, de_nom, de_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [...vals, req.u.schoolId, req.u.id, req.u.nom, req.u.role]));
  }
  if (envoi) {
    await audit(req.u, 'Message envoyé', { entite: 'messages', entiteId: m.id, data: { a: dest.nom, objet: m.objet } });
    await notify(dest.id, `Nouveau message de ${req.u.nom}`, m.objet, { type: 'message', lien: '/messages', schoolId: req.u.schoolId });
    await sendEmail({ to: dest.email, subject: `Nouveau message : ${m.objet}`, text: `${req.u.nom} vous a écrit :\n\n${m.corps}\n\nConnectez-vous à votre espace pour répondre.`, schoolId: req.u.schoolId, destinataireId: dest.id, reference: `message:${m.id}` });
  }
  return m;
}

r.post('/messages', auth, needSchool, wrap(async (req, res) => res.status(201).json(await saveMessage(req, null))));

// Seuls les brouillons sont modifiables / supprimables ; un message envoyé est immuable
r.put('/messages/:id', auth, needSchool, wrap(async (req, res) => {
  const m = await one('SELECT * FROM messages WHERE id = $1 AND de_id = $2', [toId(req.params.id), req.u.id]);
  if (!m) fail(404, 'Brouillon introuvable');
  if (!m.brouillon) fail(409, 'Un message envoyé ne peut plus être modifié');
  res.json(await saveMessage(req, m));
}));

r.delete('/messages/:id', auth, needSchool, wrap(async (req, res) => {
  const m = await one('SELECT * FROM messages WHERE id = $1 AND de_id = $2', [toId(req.params.id), req.u.id]);
  if (!m) fail(404, 'Brouillon introuvable');
  if (!m.brouillon) fail(409, 'Un message envoyé ne peut pas être supprimé');
  await pool.query('DELETE FROM messages WHERE id = $1', [m.id]);
  res.json({ ok: true });
}));

// Le destinataire peut masquer un message de sa boîte (suppression logique côté destinataire)
r.post('/messages/:id/masquer', auth, needSchool, wrap(async (req, res) => {
  const m = await one('SELECT * FROM messages WHERE id = $1 AND a_id = $2', [toId(req.params.id), req.u.id]);
  if (!m) fail(404, 'Message introuvable');
  await pool.query('UPDATE messages SET masque_par = array_append(masque_par, $1) WHERE id = $2', [+req.u.id, m.id]);
  await audit(req.u, 'Message masqué', { entite: 'messages', entiteId: m.id });
  res.json({ ok: true });
}));

// Traitement d'une réclamation / demande (suivi BI communication)
r.post('/messages/:id/traiter', auth, only('admin', 'directeur', 'comptable', 'enseignant'), wrap(async (req, res) => {
  const { rows } = await pool.query('UPDATE messages SET traite = TRUE WHERE id = $1 AND a_id = $2 RETURNING id', [toId(req.params.id), req.u.id]);
  if (!rows.length) fail(404, 'Message introuvable');
  res.json({ ok: true });
}));

/* ---------------------------- Notifications --------------------------- */
r.get('/notifications', auth, wrap(async (req, res) => {
  const list = await all('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [req.u.id]);
  const nonLues = (await one('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND lu = FALSE', [req.u.id])).n;
  res.json({ list, nonLues });
}));

r.post('/notifications/:id/lu', auth, wrap(async (req, res) => {
  await pool.query('UPDATE notifications SET lu = TRUE WHERE id = $1 AND user_id = $2', [toId(req.params.id), req.u.id]);
  res.json({ ok: true });
}));

r.post('/notifications/tout-lire', auth, wrap(async (req, res) => {
  await pool.query('UPDATE notifications SET lu = TRUE WHERE user_id = $1', [req.u.id]);
  res.json({ ok: true });
}));

/* ------------------------------ Fichiers ------------------------------ */
const EXT_OK = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.odt', '.txt', '.ppt', '.pptx', '.xls', '.xlsx'];
export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    // Nom aléatoire non devinable (les fichiers ne sont pas listables)
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = EXT_OK.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : Object.assign(new Error('Type de fichier non autorisé (PDF, images, documents bureautiques)'), { status: 400 }), ok);
  }
});

r.post('/upload', auth, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) fail(400, 'Aucun fichier reçu');
  await persistUpload(req.file);
  res.json({ url: `/uploads/${req.file.filename}`, nom: req.file.originalname, taille: req.file.size });
}));

// Espace documentaire Nextcloud (lien affiché à l'administration)
r.get('/stockage', auth, only('admin', 'directeur', 'comptable'), (req, res) => res.json(nextcloudInfo()));

/* --------------------------- Journal d'audit -------------------------- */
r.get('/journal', auth, only('admin', 'directeur'), needSchool, wrap(async (req, res) => {
  const params = [req.u.schoolId];
  let sql = 'SELECT * FROM logs WHERE school_id = $1';
  if (req.query.entite) { params.push(req.query.entite); sql += ` AND entite = $${params.length}`; }
  res.json(await all(sql + ' ORDER BY created_at DESC LIMIT 300', params));
}));

r.get('/envois', auth, only('admin', 'directeur', 'comptable'), needSchool, wrap(async (req, res) => {
  res.json(await all('SELECT * FROM envois WHERE school_id = $1 ORDER BY created_at DESC LIMIT 300', [req.u.schoolId]));
}));

export default r;
