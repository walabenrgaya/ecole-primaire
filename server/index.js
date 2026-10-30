import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import nodemailer from 'nodemailer';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  JWT_SECRET = 'super_secret_jwt_key_ecole_2026_change_in_production',
  ANNEE_SCOLAIRE: AN = '2026-2027',
  PORT = 5000,
  NODE_ENV = 'development'
} = process.env;
const FRAIS = +process.env.FRAIS_SCOLARITE || 1200;

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// --- File Storage (Uploads for homework, solutions, student deposits) ---
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max
});

app.use('/uploads', express.static(uploadDir));

// --- Email Transporter (SendGrid / SMTP) ---
let mailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +process.env.SMTP_PORT || 587,
    secure: +process.env.SMTP_PORT === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendEmailNotification(to, subject, text, html = '') {
  if (!to || !to.includes('@')) return;
  if (!mailTransporter) {
    console.log(`[Email Simulation] Destinataire: ${to} | Sujet: ${subject}`);
    return;
  }
  try {
    await mailTransporter.sendMail({
      from: process.env.SMTP_FROM || 'École Primaire <no-reply@ecole.tn>',
      to,
      subject,
      text,
      html: html || `<p>${text.replace(/\n/g, '<br/>')}</p>`
    });
    console.log(`[Email Envoyé avec succès] Destinataire: ${to}`);
  } catch (e) {
    console.error(`[Erreur Envoi Email] ${e.message}`);
  }
}

// --- Helpers ---
const err = (s, code, m, x = {}) => s.status(code).json({ error: m, ...x });
const wrap = f => (q, s, n) => Promise.resolve(f(q, s, n)).catch(e => {
  console.error('Route error:', e);
  err(s, 500, e.message);
});

async function audit(u, action, data) {
  try {
    await pool.query(
      'INSERT INTO logs (user_id, nom, action, data, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [u?.id || 'système', u?.nom || 'Système', action, JSON.stringify(data || {})]
    );
  } catch (e) {
    console.error('Audit error:', e.message);
  }
}

async function notify(userId, titre, message, type = 'info', lien = '') {
  try {
    if (!userId) return;
    await pool.query(
      'INSERT INTO notifications (user_id, titre, message, type, lien, lu, created_at) VALUES ($1, $2, $3, $4, $5, FALSE, NOW())',
      [userId, titre, message, type, lien]
    );
  } catch (e) {
    console.error('Erreur notification:', e.message);
  }
}

/* --- Auth & RBAC --- */
const auth = (q, s, n) => {
  try {
    const token = (q.headers.authorization || '').slice(7);
    if (!token) return err(s, 401, 'Non authentifié');
    q.u = jwt.verify(token, JWT_SECRET);
    n();
  } catch {
    err(s, 401, 'Session expirée ou invalide');
  }
};

const optionalAuth = (q, s, n) => {
  try {
    const token = (q.headers.authorization || '').slice(7);
    if (token) q.u = jwt.verify(token, JWT_SECRET);
  } catch {}
  n();
};

const ECRIT = {
  enseignant: ['notes', 'devoirs', 'devoirs_rendus', 'absences'],
  comptable: ['paiements', 'eleves', 'preinscriptions'],
  parent: ['absences', 'devoirs_rendus', 'preinscriptions'],
  eleve: ['devoirs_rendus']
};

const can = (role, k) => role === 'admin' || (ECRIT[role] || []).includes(k);
const only = (...roles) => (q, s, n) => roles.includes(q.u?.role) ? n() : err(s, 403, 'Accès refusé');

/* --- File Upload Endpoint --- */
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return err(res, 400, 'Aucun fichier fourni');
  res.json({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size
  });
});

const DEMO_PASSWORDS = {
  'admin@ecole.tn': 'Admin123!',
  'prof.francais@ecole.tn': 'Prof123!',
  'prof.maths@ecole.tn': 'Prof123!',
  'comptable@ecole.tn': 'Comptable123!',
  'parent.benali@ecole.tn': 'Parent123!',
  'eleve.yassine@ecole.tn': 'Eleve123!'
};

async function ensureDatabaseReady() {
  try {
    const tableCheck = await pool.query("SELECT to_regclass('public.users') AS exists");
    if (!tableCheck.rows[0]?.exists) {
      console.log("Initialisation de la base PostgreSQL...");
      const schemaPath = path.resolve(__dirname, '../database/schema.sql');
      if (fs.existsSync(schemaPath)) {
        await pool.query(fs.readFileSync(schemaPath, 'utf8'));
      }
      const seedPath = path.resolve(__dirname, '../database/seed.sql');
      if (fs.existsSync(seedPath)) {
        await pool.query(fs.readFileSync(seedPath, 'utf8'));
      }
      console.log("✓ Schéma et données initialisés.");
      return;
    }

    const { rows: users } = await pool.query("SELECT id, email, role, hash FROM users WHERE email = 'admin@ecole.tn'");
    if (users.length === 0) {
      const seedPath = path.resolve(__dirname, '../database/seed.sql');
      if (fs.existsSync(seedPath)) {
        await pool.query(fs.readFileSync(seedPath, 'utf8'));
      }
    } else if (users[0].hash.includes('$2a$12$e6/8cTqL8J55GjA1Yx')) {
      await pool.query(`
        UPDATE users SET hash = '$2a$10$9b.lwTbE1fMiKRN.2SbvoeEPSUM8RQCz1sdhYZiWGMbT.z9j1dnou' WHERE email = 'admin@ecole.tn';
        UPDATE users SET hash = '$2a$10$V2JhKtqYqehS23aY4MvGTurGsv.wsWZP8w6Hh4zw9IYxFm332NR7C' WHERE role = 'enseignant';
        UPDATE users SET hash = '$2a$10$M2Uja4BkDQwWjcnudpjqMe.DEwdBZmiqCTYZU5wz/NaC.V68veIlq' WHERE role = 'comptable';
        UPDATE users SET hash = '$2a$10$yNICYMXeEuxWGHtY6MhDAuWc1j1fYYCz0nf9KPtEMWFee2eQYq18u' WHERE role = 'parent';
        UPDATE users SET hash = '$2a$10$kNqA5Q61oP0hlnTqswox7eyz7DikfFkXfDtYPjV9TtqkaJJNSHDjq' WHERE role = 'eleve';
      `);
      console.log("✓ Mots de passe synchronisés.");
    }
  } catch (e) {
    console.error("ensureDatabaseReady warning:", e.message);
  }
}

/* --- Setup / Health Endpoint --- */
app.get('/api/setup', wrap(async (req, res) => {
  await ensureDatabaseReady();
  const { rows } = await pool.query('SELECT id, email, role FROM users');
  res.json({ ok: true, message: 'Base de données synchronisée', count: rows.length, users: rows.map(u => ({ email: u.email, role: u.role })) });
}));

/* --- Login & Me --- */
app.post('/api/auth/login', wrap(async (q, s) => {
  const identifier = String(q.body.email || '').trim().toLowerCase();
  const password = String(q.body.password || '');
  await ensureDatabaseReady();

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(email) = $1 || \'@ecole.tn\' LIMIT 1',
    [identifier]
  );
  const u = rows[0];
  const isBcryptValid = u && (await bcrypt.compare(password, u.hash).catch(() => false));
  const isDemoFallback = u && DEMO_PASSWORDS[u.email] && password === DEMO_PASSWORDS[u.email];

  if (!u || (!isBcryptValid && !isDemoFallback)) {
    return err(s, 401, 'Identifiants invalides');
  }

  // Si authentifié via fallback de démo, réparer le hash en arrière-plan
  if (isDemoFallback && !isBcryptValid) {
    bcrypt.hash(password, 10).then(newHash => {
      pool.query('UPDATE users SET hash = $1 WHERE id = $2', [newHash, u.id]).catch(() => {});
    });
  }

  const p = {
    id: String(u.id),
    nom: u.nom,
    email: u.email,
    role: u.role,
    telephone: u.telephone || '',
    eleveId: u.eleve_id ? String(u.eleve_id) : '',
    classe: u.classe || '',
    enfants: []
  };
  // Fetch enfants for parent role
  if (u.role === 'parent') {
    const { rows: kids } = await pool.query('SELECT id FROM eleves WHERE parent_id = $1 AND deleted = FALSE', [u.id]);
    p.enfants = kids.map(k => String(k.id));
  }
  s.json({
    token: jwt.sign(p, JWT_SECRET, { expiresIn: '24h' }),
    user: p
  });
}));

app.get('/api/auth/me', auth, wrap(async (q, s) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [q.u.id]);
  const u = rows[0];
  if (!u) return err(s, 404, 'Utilisateur introuvable');
  const enfants = [];
  if (u.role === 'parent') {
    const { rows: kids } = await pool.query('SELECT id FROM eleves WHERE parent_id = $1 AND deleted = FALSE', [u.id]);
    enfants.push(...kids.map(k => String(k.id)));
  }
  s.json({
    id: String(u.id),
    _id: String(u.id),
    nom: u.nom,
    email: u.email,
    role: u.role,
    telephone: u.telephone || '',
    eleveId: u.eleve_id ? String(u.eleve_id) : '',
    classe: u.classe || '',
    enfants
  });
}));

/* --- Users Management (Admin) --- */
app.get('/api/users', auth, only('admin'), wrap(async (q, s) => {
  const { rows } = await pool.query('SELECT id, nom, email, role, telephone, eleve_id, classe, created_at FROM users ORDER BY nom');
  s.json(rows.map(u => ({
    _id: String(u.id), id: String(u.id),
    nom: u.nom, email: u.email, role: u.role,
    telephone: u.telephone || '',
    eleveId: u.eleve_id ? String(u.eleve_id) : '',
    classe: u.classe || '',
    createdAt: u.created_at
  })));
}));

app.post('/api/users', auth, only('admin'), wrap(async (q, s) => {
  const { nom, email, password, role, telephone, eleveId, classe } = q.body;
  if (!nom || !email || !password || password.length < 6) {
    return err(s, 400, 'Nom, e-mail et mot de passe (6 car. min) obligatoires');
  }
  const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.length) return err(s, 409, 'Cet e-mail est déjà utilisé');

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    'INSERT INTO users (nom, email, hash, role, telephone, eleve_id, classe) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [nom, email.toLowerCase(), hash, role || 'parent', telephone || '', eleveId || null, classe || '']
  );
  const u = rows[0];
  await audit(q.u, 'Création utilisateur', { id: u.id, nom, role });
  s.json({ _id: String(u.id), id: String(u.id), nom, email: u.email, role: u.role });
}));

app.put('/api/users/:id', auth, only('admin'), wrap(async (q, s) => {
  const { nom, email, password, role, telephone, eleveId, classe } = q.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [q.params.id]);
  const u = rows[0];
  if (!u) return err(s, 404, 'Utilisateur introuvable');

  const updates = {};
  if (nom) updates.nom = nom;
  if (email) updates.email = email.toLowerCase();
  if (role) updates.role = role;
  if (telephone !== undefined) updates.telephone = telephone;
  if (eleveId !== undefined) updates.eleve_id = eleveId;
  if (classe !== undefined) updates.classe = classe;
  if (password && password.length >= 6) {
    updates.hash = await bcrypt.hash(password, 12);
  }
  updates.updated_at = new Date();

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  const values = Object.values(updates);
  const { rows: updated } = await pool.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    [q.params.id, ...values]
  );
  const r = updated[0];
  await audit(q.u, 'Modification utilisateur', { id: r.id, nom: r.nom });
  s.json({ _id: String(r.id), id: String(r.id), nom: r.nom, email: r.email, role: r.role });
}));

app.delete('/api/users/:id', auth, only('admin'), wrap(async (q, s) => {
  if (q.params.id === q.u.id) return err(s, 400, 'Impossible de supprimer votre propre compte');
  const { rows } = await pool.query('DELETE FROM users WHERE id = $1 RETURNING nom', [q.params.id]);
  if (!rows.length) return err(s, 404, 'Utilisateur introuvable');
  await audit(q.u, 'Suppression utilisateur', { id: q.params.id, nom: rows[0].nom });
  s.json({ ok: true });
}));

/* --- Messaging Channels (RBAC Matrix) --- */
const DEST = {
  admin: ['parent', 'enseignant', 'comptable', 'eleve'],
  enseignant: ['parent', 'admin'],
  comptable: ['parent', 'admin'],
  parent: ['enseignant', 'admin', 'comptable'],
  eleve: ['enseignant', 'admin']
};

app.get('/api/dest', auth, wrap(async (q, s) => {
  const roles = DEST[q.u.role] || [];
  if (!roles.length) return s.json([]);
  const placeholders = roles.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(`SELECT id, nom, email, role FROM users WHERE role IN (${placeholders}) ORDER BY nom`, roles);
  s.json(rows.map(u => ({ _id: String(u.id), id: String(u.id), nom: u.nom, email: u.email, role: u.role })));
}));

/* --- Messaging (Immutability, Drafts, Masking) --- */
const mr = express.Router();
mr.use(auth);

mr.get('/', wrap(async (q, s) => {
  const id = +q.u.id;
  const { rows: all } = await pool.query(
    'SELECT * FROM messages WHERE de_id = $1 OR a_id = $1 ORDER BY created_at DESC',
    [id]
  );
  const mapMsg = m => ({
    _id: String(m.id), id: String(m.id),
    de: String(m.de_id), deNom: m.de_nom, deRole: m.de_role,
    a: String(m.a_id), aNom: m.a_nom, aRole: m.a_role,
    objet: m.objet, corps: m.corps,
    brouillon: m.brouillon, auto: m.auto,
    masque: m.masque_par || [],
    createdAt: m.created_at
  });
  s.json({
    inbox: all.filter(m => m.a_id === id && !m.brouillon && !(m.masque_par || []).includes(id)).map(mapMsg),
    sent: all.filter(m => m.de_id === id && !m.brouillon).map(mapMsg),
    drafts: all.filter(m => m.de_id === id && m.brouillon).map(mapMsg)
  });
}));

const sauverMessage = async (q, s, existingId) => {
  const { a, objet, corps, brouillon } = q.body;
  const { rows: destRows } = await pool.query('SELECT * FROM users WHERE id = $1', [a]);
  const dest = destRows[0];
  if (!dest || !(DEST[q.u.role] || []).includes(dest.role)) {
    return err(s, 403, 'Destinataire non autorisé pour votre rôle');
  }
  if (!brouillon && (!objet || !corps)) {
    return err(s, 400, 'Objet et corps obligatoires');
  }

  let result;
  if (existingId) {
    const { rows } = await pool.query(
      `UPDATE messages SET a_id=$1, a_nom=$2, a_role=$3, objet=$4, corps=$5, brouillon=$6 WHERE id=$7 RETURNING *`,
      [a, dest.nom, dest.role, objet, corps, !!brouillon, existingId]
    );
    result = rows[0];
  } else {
    const { rows } = await pool.query(
      `INSERT INTO messages (de_id, de_nom, de_role, a_id, a_nom, a_role, objet, corps, brouillon, auto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [q.u.id, q.u.nom, q.u.role, a, dest.nom, dest.role, objet, corps, !!brouillon, false]
    );
    result = rows[0];
  }

  if (!brouillon) {
    await audit(q.u, 'Message envoyé', { id: result.id, a: dest.nom });
    await notify(a, `Nouveau message de ${q.u.nom}`, objet, 'message', '/messages');
    if (dest.email) {
      sendEmailNotification(dest.email, `Nouveau message de l'école : ${objet}`, `Bonjour,\n\nVous avez reçu un nouveau message de ${q.u.nom} :\n\n${corps}\n\nConnectez-vous sur votre espace pour répondre.`);
    }
  }
  s.json({ _id: String(result.id), id: String(result.id), ...result });
};

mr.post('/', wrap((q, s) => sauverMessage(q, s, null)));

mr.put('/:id', wrap(async (q, s) => {
  const { rows } = await pool.query('SELECT * FROM messages WHERE id = $1', [q.params.id]);
  const m = rows[0];
  if (!m || String(m.de_id) !== q.u.id) return err(s, 404, 'Introuvable');
  if (!m.brouillon) return err(s, 409, 'Un message envoyé est immuable');
  await sauverMessage(q, s, m.id);
}));

mr.delete('/:id', wrap(async (q, s) => {
  const { rows } = await pool.query('SELECT * FROM messages WHERE id = $1', [q.params.id]);
  const m = rows[0];
  if (!m || String(m.de_id) !== q.u.id) return err(s, 404, 'Introuvable');
  if (!m.brouillon) return err(s, 409, 'Un message envoyé est immuable');
  await pool.query('DELETE FROM messages WHERE id = $1', [q.params.id]);
  s.json({ ok: true });
}));

mr.post('/:id/masquer', wrap(async (q, s) => {
  const { rows } = await pool.query('SELECT * FROM messages WHERE id = $1', [q.params.id]);
  const m = rows[0];
  if (!m || m.a_id !== +q.u.id) return err(s, 404, 'Introuvable');
  const masque = [...(m.masque_par || []), +q.u.id];
  await pool.query('UPDATE messages SET masque_par = $1 WHERE id = $2', [masque, q.params.id]);
  s.json({ ok: true });
}));

app.use('/api/messages', mr);

/* --- Annonces Générales (Chapitre 10.3 - Immuabilité garantie) --- */
app.get('/api/annonces', auth, wrap(async (q, s) => {
  let query, params;
  if (q.u.role === 'admin') {
    query = 'SELECT * FROM annonces ORDER BY created_at DESC';
    params = [];
  } else {
    const roleMap = {
      parent: ['tous', 'parents'],
      enseignant: ['tous', 'enseignants'],
      eleve: ['tous', 'eleves'],
      comptable: ['tous']
    };
    const cibles = roleMap[q.u.role] || ['tous'];
    const placeholders = cibles.map((_, i) => `$${i + 1}`).join(', ');
    query = `SELECT * FROM annonces WHERE cible IN (${placeholders}) ORDER BY created_at DESC`;
    params = cibles;
  }
  const { rows } = await pool.query(query, params);
  s.json(rows.map(formatRow('annonces')));
}));

app.post('/api/annonces', auth, only('admin'), wrap(async (q, s) => {
  const { titre, contenu, cible = 'tous' } = q.body;
  if (!titre || !contenu) return err(s, 400, 'Titre et contenu obligatoires');

  const { rows } = await pool.query(
    'INSERT INTO annonces (titre, contenu, cible, auteur_id, auteur_nom, annee_scolaire) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [titre, contenu, cible, q.u.id, q.u.nom, AN]
  );
  const annonce = rows[0];
  await audit(q.u, 'Publication annonce', { id: annonce.id, titre, cible });

  // Notify target users
  let filter = '';
  const filterParams = [];
  if (cible !== 'tous') {
    const role = cible === 'parents' ? 'parent' : cible === 'enseignants' ? 'enseignant' : 'eleve';
    filter = 'WHERE role = $1';
    filterParams.push(role);
  }
  const { rows: targetUsers } = await pool.query(`SELECT id, email FROM users ${filter}`, filterParams);
  for (const tu of targetUsers) {
    await notify(tu.id, `Annonce : ${titre}`, contenu.slice(0, 100), 'annonce');
  }

  s.json(formatRow('annonces')(annonce));
}));

/* --- Notifications Endpoint --- */
app.get('/api/notifications', auth, wrap(async (q, s) => {
  const { rows } = await pool.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
    [q.u.id]
  );
  const list = rows.map(n => ({
    _id: String(n.id), id: String(n.id),
    user: String(n.user_id), titre: n.titre, message: n.message,
    type: n.type, lien: n.lien, lu: n.lu, createdAt: n.created_at
  }));
  const nonLues = list.filter(n => !n.lu).length;
  s.json({ list, nonLues });
}));

app.post('/api/notifications/:id/lu', auth, wrap(async (q, s) => {
  await pool.query('UPDATE notifications SET lu = TRUE WHERE id = $1 AND user_id = $2', [q.params.id, q.u.id]);
  s.json({ ok: true });
}));

app.post('/api/notifications/lire-tout', auth, wrap(async (q, s) => {
  await pool.query('UPDATE notifications SET lu = TRUE WHERE user_id = $1', [q.u.id]);
  s.json({ ok: true });
}));

/* --- Emploi du Temps (Chapitre 6) avec détection des conflits --- */
function horaireEnMinutes(h) {
  if (!h) return 0;
  const [hh, mm] = h.split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function chevauchement(debA, finA, debB, finB) {
  return horaireEnMinutes(debA) < horaireEnMinutes(finB) && horaireEnMinutes(finA) > horaireEnMinutes(debB);
}

async function verifierConflitEmploi(b, idActuel = null) {
  const { classe, enseignant, salle, jour, debut, fin, annee_scolaire = AN } = b;
  if (!jour || !debut || !fin) {
    return 'Jour, heure de début et heure de fin obligatoires';
  }
  if (horaireEnMinutes(debut) >= horaireEnMinutes(fin)) {
    return "L'heure de début doit être antérieure à l'heure de fin";
  }

  let query = 'SELECT * FROM emplois WHERE jour = $1 AND annee_scolaire = $2 AND deleted = FALSE';
  const params = [jour, annee_scolaire];
  if (idActuel) {
    query += ' AND id != $3';
    params.push(idActuel);
  }

  const { rows: existants } = await pool.query(query, params);
  for (const ex of existants) {
    const exDebut = typeof ex.debut === 'string' ? ex.debut : ex.debut?.slice(0, 5);
    const exFin = typeof ex.fin === 'string' ? ex.fin : ex.fin?.slice(0, 5);
    if (chevauchement(debut, fin, exDebut, exFin)) {
      if (salle && String(ex.salle_id) === String(salle)) {
        const { rows: sr } = await pool.query('SELECT nom FROM salles WHERE id = $1', [salle]);
        return `Conflit de salle : La salle « ${sr[0]?.nom || salle} » est déjà occupée le ${jour} de ${exDebut} à ${exFin}`;
      }
      if (enseignant && String(ex.enseignant_id) === String(enseignant)) {
        const { rows: ur } = await pool.query('SELECT nom FROM users WHERE id = $1', [enseignant]);
        return `Conflit d'enseignant : ${ur[0]?.nom || 'Cet enseignant'} a déjà un cours le ${jour} de ${exDebut} à ${exFin}`;
      }
      if (classe && String(ex.classe_id) === String(classe)) {
        const { rows: cr } = await pool.query('SELECT niveau, section FROM classes WHERE id = $1', [classe]);
        return `Conflit de classe : La classe « ${cr[0]?.niveau || ''} ${cr[0]?.section || ''} » a déjà un cours le ${jour} de ${exDebut} à ${exFin}`;
      }
    }
  }
  return null;
}

/* --- Homework & Submissions (Chapitre 9) --- */
app.get('/api/devoirs/:id/rendus', auth, wrap(async (q, s) => {
  const { rows: devRows } = await pool.query('SELECT * FROM devoirs WHERE id = $1 AND deleted = FALSE', [q.params.id]);
  if (!devRows.length) return err(s, 404, 'Devoir introuvable');

  let query = 'SELECT * FROM devoirs_rendus WHERE devoir_id = $1';
  const params = [q.params.id];

  if (q.u.role === 'eleve') {
    const eleveId = q.u.eleveId || q.u.id;
    query += ' AND eleve_id = $2';
    params.push(eleveId);
  } else if (q.u.role === 'parent') {
    const enfants = await getEnfantsIds(q.u);
    if (enfants.length) {
      const placeholders = enfants.map((_, i) => `$${i + 2}`).join(', ');
      query += ` AND eleve_id IN (${placeholders})`;
      params.push(...enfants);
    } else {
      query += ' AND FALSE';
    }
  }
  query += ' ORDER BY date_depot DESC';

  const { rows } = await pool.query(query, params);
  s.json(rows.map(formatRow('devoirs_rendus')));
}));

app.post('/api/devoirs/:id/rendre', auth, only('eleve', 'parent', 'admin'), wrap(async (q, s) => {
  const { rows: devRows } = await pool.query('SELECT * FROM devoirs WHERE id = $1', [q.params.id]);
  const devoir = devRows[0];
  if (!devoir) return err(s, 404, 'Devoir introuvable');

  const { contenu, fichier, eleveId } = q.body;
  const targetEleveId = q.u.role === 'eleve' ? (q.u.eleveId || q.u.id) : eleveId;
  if (!targetEleveId) return err(s, 400, "Identifiant de l'élève manquant");

  const { rows: eleveRows } = await pool.query('SELECT * FROM eleves WHERE id = $1', [targetEleveId]);
  const eleve = eleveRows[0];
  const now = new Date();
  const dateLim = devoir.date_remise ? new Date(devoir.date_remise) : null;
  const enRetard = dateLim && now > dateLim;

  const { rows: existRows } = await pool.query(
    'SELECT * FROM devoirs_rendus WHERE devoir_id = $1 AND eleve_id = $2',
    [devoir.id, targetEleveId]
  );

  if (existRows.length) {
    const { rows } = await pool.query(
      'UPDATE devoirs_rendus SET contenu=$1, fichier=COALESCE($2, fichier), date_depot=$3, statut=$4 WHERE id=$5 RETURNING *',
      [contenu, fichier || null, now, enRetard ? 'en_retard' : 'rendu', existRows[0].id]
    );
    await audit(q.u, 'Mise à jour devoir rendu', { devoir: devoir.titre, eleve: eleve?.nom });
    s.json(formatRow('devoirs_rendus')(rows[0]));
  } else {
    const eleveNom = eleve ? `${eleve.nom} ${eleve.prenom || ''}`.trim() : 'Élève';
    const { rows } = await pool.query(
      'INSERT INTO devoirs_rendus (devoir_id, eleve_id, eleve_nom, contenu, fichier, date_depot, statut, vu_par_parent) VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE) RETURNING *',
      [devoir.id, targetEleveId, eleveNom, contenu, fichier, now, enRetard ? 'en_retard' : 'rendu']
    );
    await audit(q.u, 'Dépôt de devoir', { devoir: devoir.titre, eleve: eleve?.nom });
    if (devoir.enseignant_id) {
      await notify(devoir.enseignant_id, `Devoir rendu : ${devoir.titre}`, `${eleveNom} a déposé son devoir.`);
    }
    s.json(formatRow('devoirs_rendus')(rows[0]));
  }
}));

app.put('/api/devoirs_rendus/:id/noter', auth, only('enseignant', 'admin'), wrap(async (q, s) => {
  const { note, bareme = 20, commentaireEnseignant } = q.body;
  const { rows } = await pool.query(
    `UPDATE devoirs_rendus SET note=$1, bareme=$2, commentaire_enseignant=$3, statut='corrige' WHERE id=$4 RETURNING *`,
    [+note, +bareme, commentaireEnseignant || '', q.params.id]
  );
  if (!rows.length) return err(s, 404, 'Rendu introuvable');
  const rendu = rows[0];
  await audit(q.u, 'Notation de devoir', { rendu: rendu.id, note });

  const { rows: devRows } = await pool.query('SELECT * FROM devoirs WHERE id = $1', [rendu.devoir_id]);
  const { rows: eleveRows } = await pool.query('SELECT * FROM eleves WHERE id = $1', [rendu.eleve_id]);
  const eleve = eleveRows[0];
  if (eleve?.parent_id) {
    await notify(eleve.parent_id, `Note de devoir : ${devRows[0]?.titre}`, `${eleve.nom} a obtenu ${note}/${bareme}`);
  }
  const { rows: eleveUserRows } = await pool.query('SELECT id FROM users WHERE eleve_id = $1', [rendu.eleve_id]);
  if (eleveUserRows.length) {
    await notify(eleveUserRows[0].id, `Note de devoir : ${devRows[0]?.titre}`, `Votre note : ${note}/${bareme}`);
  }
  s.json(formatRow('devoirs_rendus')(rendu));
}));

app.post('/api/devoirs_rendus/:id/vu-parent', auth, only('parent', 'admin'), wrap(async (q, s) => {
  const { rows } = await pool.query('UPDATE devoirs_rendus SET vu_par_parent = TRUE WHERE id = $1 RETURNING *', [q.params.id]);
  if (!rows.length) return err(s, 404, 'Rendu introuvable');
  s.json({ ok: true });
}));

/* --- Absences & Justifications (Chapitre 7) --- */
app.post('/api/absences/:id/justifier', auth, only('parent', 'admin'), wrap(async (q, s) => {
  const { justification } = q.body;
  if (!justification) return err(s, 400, 'Motif de justification obligatoire');
  const { rows } = await pool.query(
    `UPDATE absences SET justification_parent=$1, statut='En attente de validation' WHERE id=$2 AND deleted=FALSE RETURNING *`,
    [justification, q.params.id]
  );
  if (!rows.length) return err(s, 404, 'Absence introuvable');
  await audit(q.u, "Justification d'absence déposée", { id: q.params.id, justification });
  s.json(formatRow('absences')(rows[0]));
}));

app.post('/api/absences/:id/valider-justification', auth, only('enseignant', 'admin'), wrap(async (q, s) => {
  const { validee } = q.body;
  const { rows } = await pool.query(
    `UPDATE absences SET justifiee=$1, statut=$2 WHERE id=$3 AND deleted=FALSE RETURNING *`,
    [!!validee, validee ? 'Justifiée' : 'Rejetée', q.params.id]
  );
  if (!rows.length) return err(s, 404, 'Absence introuvable');
  await audit(q.u, "Validation justification d'absence", { id: q.params.id, validee });
  s.json(formatRow('absences')(rows[0]));
}));

/* --- Inscriptions en ligne & Pré-inscriptions (Chapitre 4) --- */
app.post('/api/preinscriptions', optionalAuth, wrap(async (q, s) => {
  const { nom, prenom, naissance, genre, niveauDemande, parentNom, parentEmail, parentTel, adresse, antecedentsMedicaux } = q.body;
  if (!nom || !prenom || !parentEmail || !parentNom) {
    return err(s, 400, 'Nom, prénom, nom du parent et e-mail sont obligatoires');
  }

  const { rows } = await pool.query(
    `INSERT INTO preinscriptions (nom, prenom, naissance, genre, niveau_demande, parent_nom, parent_email, parent_tel, adresse, antecedents_medicaux, statut, annee_scolaire)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'en_attente',$11) RETURNING *`,
    [nom, prenom, naissance || null, genre || 'M', niveauDemande || 'CP', parentNom, parentEmail.toLowerCase(), parentTel || '', adresse || '', antecedentsMedicaux || 'Aucun', AN]
  );
  const rec = rows[0];
  await audit(q.u || {}, 'Nouvelle pré-inscription', { id: rec.id, eleve: `${nom} ${prenom}` });

  const { rows: admins } = await pool.query("SELECT id FROM users WHERE role = 'admin'");
  for (const a of admins) {
    await notify(a.id, 'Nouvelle pré-inscription', `${nom} ${prenom} (${niveauDemande}) en attente de validation.`);
  }
  s.json(formatRow('preinscriptions')(rec));
}));

app.post('/api/preinscriptions/:id/valider', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  const { classeId } = q.body;
  const { rows: pRows } = await pool.query('SELECT * FROM preinscriptions WHERE id = $1', [q.params.id]);
  const p = pRows[0];
  if (!p) return err(s, 404, 'Pré-inscription introuvable');
  if (p.statut === 'validee') return err(s, 400, 'Déjà validée');

  // Find or create parent user
  let { rows: parentRows } = await pool.query('SELECT * FROM users WHERE email = $1', [p.parent_email]);
  let parentUser = parentRows[0];
  if (!parentUser) {
    const tempPass = 'Parent123!';
    const hash = await bcrypt.hash(tempPass, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (nom, email, hash, role, telephone) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [p.parent_nom, p.parent_email, hash, 'parent', p.parent_tel || '']
    );
    parentUser = rows[0];
  }

  // Create eleve
  const { rows: eleveRows } = await pool.query(
    `INSERT INTO eleves (nom, prenom, naissance, genre, classe_id, parent_id, parent_nom, parent_email, parent_tel, antecedents_medicaux, annee_entree, annee_scolaire, statut)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'inscrit') RETURNING *`,
    [p.nom, p.prenom, p.naissance, p.genre, classeId || null, parentUser.id, p.parent_nom, p.parent_email, p.parent_tel, p.antecedents_medicaux, AN, AN]
  );
  const eleve = eleveRows[0];

  // Update pre-inscription
  await pool.query("UPDATE preinscriptions SET statut = 'validee', eleve_cree_id = $1 WHERE id = $2", [eleve.id, q.params.id]);

  await audit(q.u, 'Validation pré-inscription', { id: p.id, eleve: eleve.id, classe: classeId });
  await notify(parentUser.id, 'Inscription validée !', `Le dossier de ${eleve.nom} a été validé. Bienvenue à l'école !`);

  sendEmailNotification(
    parentUser.email,
    "Validation de l'inscription scolaire",
    `Bonjour ${p.parent_nom},\n\nLe dossier d'inscription de votre enfant ${p.nom} ${p.prenom} a été validé avec succès par la Direction.\n\nVos identifiants de connexion :\nE-mail : ${parentUser.email}\nMot de passe temporaire : Parent123!\n\nBienvenue parmi nous !`
  );

  s.json({ ok: true, eleve: formatRow('eleves')(eleve), parent: parentUser.email });
}));

app.post('/api/preinscriptions/:id/rejeter', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  const { rows } = await pool.query("UPDATE preinscriptions SET statut = 'rejetee' WHERE id = $1 RETURNING *", [q.params.id]);
  if (!rows.length) return err(s, 404, 'Pré-inscription introuvable');
  await audit(q.u, 'Rejet pré-inscription', { id: q.params.id });
  s.json({ ok: true });
}));

/* --- Finances & Impayés & Relances automatiques (Chapitre 8) --- */
async function solde(eleveId) {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(montant), 0) as total FROM paiements WHERE eleve_id = $1 AND deleted = FALSE',
    [eleveId]
  );
  return FRAIS - (+rows[0].total || 0);
}

app.get('/api/finances/stats', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  const { rows: eleves } = await pool.query("SELECT id FROM eleves WHERE deleted = FALSE AND statut != 'radie'");
  const { rows: paiements } = await pool.query('SELECT montant FROM paiements WHERE deleted = FALSE');

  const totalDu = eleves.length * FRAIS;
  const totalRecu = paiements.reduce((sum, p) => sum + (+p.montant || 0), 0);
  const totalRestant = Math.max(0, totalDu - totalRecu);
  const taux = totalDu > 0 ? +((totalRecu / totalDu) * 100).toFixed(1) : 100;

  s.json({
    nbEleves: eleves.length,
    fraisAnnuel: FRAIS,
    totalDu,
    totalRecu,
    totalRestant,
    tauxRecouvrement: taux
  });
}));

app.get('/api/finances/impayes', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  const { rows: eleves } = await pool.query("SELECT * FROM eleves WHERE deleted = FALSE AND statut != 'radie'");
  const { rows: classes } = await pool.query('SELECT * FROM classes');
  const { rows: paiements } = await pool.query('SELECT * FROM paiements WHERE deleted = FALSE');

  const res = [];
  for (const e of eleves) {
    const payes = paiements.filter(p => p.eleve_id === e.id);
    const totalPaye = payes.reduce((sum, p) => sum + (+p.montant || 0), 0);
    const reste = FRAIS - totalPaye;
    if (reste > 0) {
      const cls = classes.find(c => c.id === e.classe_id);
      res.push({
        _id: String(e.id),
        nom: `${e.nom} ${e.prenom || ''}`.trim(),
        classeNom: cls ? `${cls.niveau} ${cls.section}` : 'Non assignée',
        parent: e.parent_id ? String(e.parent_id) : '',
        parentNom: e.parent_nom || 'Parent',
        parentEmail: e.parent_email,
        parentTel: e.parent_tel,
        totalPaye,
        soldeRestant: reste,
        dernierPaiement: payes.length ? payes[payes.length - 1].date : 'Aucun'
      });
    }
  }
  s.json(res);
}));

app.post('/api/finances/relancer/:eleveId', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  const { rows: eleveRows } = await pool.query('SELECT * FROM eleves WHERE id = $1', [q.params.eleveId]);
  const eleve = eleveRows[0];
  if (!eleve || !eleve.parent_id) return err(s, 404, 'Élève ou parent introuvable');

  const reste = await solde(eleve.id);
  const { rows: parentRows } = await pool.query('SELECT * FROM users WHERE id = $1', [eleve.parent_id]);
  const parent = parentRows[0];

  const corps = `Madame, Monsieur,\n\nNous vous rappelons qu'il reste un solde impayé de ${reste} TND au titre des frais scolaires pour votre enfant ${eleve.nom} (Année ${AN}).\n\nMerci de bien vouloir régulariser cette situation auprès du secrétariat ou par virement bancaire.\n\nCordialement,\nLa Direction de l'École.`;

  await pool.query(
    'INSERT INTO messages (de_id, de_nom, de_role, a_id, a_nom, a_role, objet, corps, brouillon, auto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,TRUE)',
    [q.u.id, q.u.nom, q.u.role, eleve.parent_id, parent?.nom || eleve.parent_nom || 'Parent', 'parent',
     `Rappel de paiement – Solde impayé (${eleve.nom})`, corps]
  );

  await notify(eleve.parent_id, 'Rappel de paiement', `Solde restant : ${reste} TND pour ${eleve.nom}`, 'finance');
  await audit(q.u, 'Relance automatique paiement', { eleve: eleve.id, parent: eleve.parent_id, montantRestant: reste });

  if (parent?.email) {
    sendEmailNotification(parent.email, `Rappel de paiement scolaire – ${eleve.nom}`, corps);
  }

  s.json({ ok: true, message: 'Relance envoyée avec succès' });
}));

async function notifierPaiement(paiement, u) {
  const { rows: eleveRows } = await pool.query('SELECT * FROM eleves WHERE id = $1', [paiement.eleve_id]);
  const e = eleveRows[0];
  if (!e?.parent_id) return;

  const reste = await solde(e.id);
  const corps = `Montant payé : ${paiement.montant} TND\nDate : ${paiement.date}\nMode : ${paiement.mode}\nType : ${paiement.type || 'Scolarité'}\nSolde restant : ${reste} TND\nReçu n° ${paiement.recu_num || paiement.id} : consultable et téléchargeable dans votre espace Paiements.`;

  const { rows: parentRows } = await pool.query('SELECT * FROM users WHERE id = $1', [e.parent_id]);
  const parent = parentRows[0];

  await pool.query(
    'INSERT INTO messages (de_id, de_nom, de_role, a_id, a_nom, a_role, objet, corps, brouillon, auto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,TRUE)',
    [u.id, u.nom, u.role, e.parent_id, parent?.nom || e.parent_nom || 'Parent', 'parent',
     'Paiement enregistré – ' + e.nom, corps]
  );

  await notify(e.parent_id, 'Paiement enregistré', `${paiement.montant} TND pour ${e.nom}. Solde restant : ${reste} TND`, 'paiement');
  await audit(u, 'Message automatique de paiement', { paiement: paiement.id, destinataire: e.parent_id, statut: 'envoyé' });

  if (parent?.email) {
    sendEmailNotification(
      parent.email,
      `Confirmation de paiement – ${e.nom}`,
      `Bonjour ${parent.nom},\n\nVotre versement a bien été comptabilisé :\n${corps}\n\nMerci de votre confiance.\nLe secrétariat.`
    );
  }
}

/* --- Export & Import CSV (Chapitre 4) --- */
app.get('/api/export/eleves', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  const { rows: eleves } = await pool.query('SELECT * FROM eleves WHERE deleted = FALSE');
  const { rows: classes } = await pool.query('SELECT * FROM classes');

  let csv = 'ID;Nom;Prenom;DateNaissance;Genre;Classe;ParentNom;ParentEmail;ParentTel;Statut\n';
  for (const e of eleves) {
    const cls = classes.find(c => c.id === e.classe_id);
    const classeNom = cls ? `${cls.niveau} ${cls.section}` : '';
    csv += `"${e.id}";"${e.nom || ''}";"${e.prenom || ''}";"${e.naissance || ''}";"${e.genre || 'M'}";"${classeNom}";"${e.parent_nom || ''}";"${e.parent_email || ''}";"${e.parent_tel || ''}";"${e.statut || 'inscrit'}"\n`;
  }

  s.setHeader('Content-Type', 'text/csv; charset=utf-8');
  s.setHeader('Content-Disposition', 'attachment; filename="eleves_export.csv"');
  s.send('\uFEFF' + csv);
}));

app.post('/api/import/eleves', auth, only('admin'), wrap(async (q, s) => {
  const { eleves } = q.body;
  if (!Array.isArray(eleves) || !eleves.length) {
    return err(s, 400, 'Liste des élèves à importer vide ou invalide');
  }

  let count = 0;
  for (const item of eleves) {
    if (item.nom) {
      await pool.query(
        `INSERT INTO eleves (nom, prenom, naissance, genre, classe_id, parent_nom, parent_email, parent_tel, annee_entree, annee_scolaire, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'inscrit')`,
        [item.nom, item.prenom || '', item.naissance || '2018-01-01', item.genre || 'M',
         item.classe || null, item.parentNom || '', item.parentEmail || '', item.parentTel || '', AN, AN]
      );
      count++;
    }
  }

  await audit(q.u, 'Import CSV élèves', { nombre: count });
  s.json({ ok: true, count });
}));

/* --- Bulletin Scolaire Officiel (Chapitre 7) --- */
async function getEnfantsIds(u) {
  if (u.role !== 'parent') return [];
  const { rows } = await pool.query('SELECT id FROM eleves WHERE parent_id = $1 AND deleted = FALSE', [u.id]);
  return rows.map(k => String(k.id));
}

const peutVoirBulletin = async (u, eleve) => {
  if (u.role === 'admin' || u.role === 'enseignant') return true;
  if (u.role === 'parent') return eleve && String(eleve.parent_id) === String(u.id);
  if (u.role === 'eleve') return String(eleve.id) === String(u.eleveId || u.id);
  return false;
};

app.get('/api/bulletin/:id', auth, wrap(async (q, s) => {
  const { rows: eleveRows } = await pool.query('SELECT * FROM eleves WHERE id = $1', [q.params.id]);
  const e = eleveRows[0];
  if (!e || !(await peutVoirBulletin(q.u, e))) {
    return err(s, 404, 'Élève ou bulletin introuvable');
  }

  let cls = null;
  if (e.classe_id) {
    const { rows } = await pool.query('SELECT * FROM classes WHERE id = $1', [e.classe_id]);
    cls = rows[0];
  }
  const { rows: notes } = await pool.query('SELECT * FROM notes WHERE eleve_id = $1 AND deleted = FALSE', [e.id]);
  const { rows: mats } = await pool.query('SELECT * FROM matieres');
  const { rows: teachers } = await pool.query("SELECT id, nom FROM users WHERE role = 'enseignant'");
  const { rows: absences } = await pool.query('SELECT * FROM absences WHERE eleve_id = $1 AND deleted = FALSE', [e.id]);

  const by = {};
  notes.forEach(n => {
    (by[n.matiere_id] ??= []).push(+n.note);
  });

  let sp = 0, sc = 0;
  const lignes = Object.entries(by).map(([mId, noteList]) => {
    const mt = mats.find(x => x.id === +mId);
    const coef = +mt?.coef || 1;
    const moy = noteList.reduce((x, y) => x + y, 0) / noteList.length;
    sp += moy * coef;
    sc += coef;
    const ens = mt?.enseignant_id ? teachers.find(t => t.id === mt.enseignant_id)?.nom : '—';
    return {
      matiereId: String(mId),
      matiere: mt?.nom || 'Matière',
      enseignant: ens,
      coef,
      notesCount: noteList.length,
      moyenne: +moy.toFixed(2),
      appreciation: moy >= 16 ? 'Très bien' : moy >= 14 ? 'Bien' : moy >= 10 ? 'Satisfaisant' : 'À renforcer'
    };
  });

  const moyGen = sc ? +(sp / sc).toFixed(2) : null;
  let mention = '—';
  if (moyGen !== null) {
    if (moyGen >= 16) mention = 'Félicitations du conseil';
    else if (moyGen >= 14) mention = "Tableau d'honneur";
    else if (moyGen >= 12) mention = 'Encouragements';
    else if (moyGen >= 10) mention = 'Passable';
    else mention = "Doit redoubler d'efforts";
  }

  const absJustifiees = absences.filter(a => a.justifiee).length;
  const absInjustifiees = absences.filter(a => !a.justifiee).length;

  s.json({
    eleve: `${e.nom} ${e.prenom || ''}`.trim(),
    eleveId: String(e.id),
    naissance: e.naissance || '—',
    classe: cls ? `${cls.niveau} ${cls.section}` : 'Non assignée',
    titulaire: cls?.enseignant_titulaire_id ? (teachers.find(t => t.id === cls.enseignant_titulaire_id)?.nom || '—') : '—',
    annee: AN,
    lignes,
    moyenneGenerale: moyGen,
    mention,
    absences: {
      total: absences.length,
      justifiees: absJustifiees,
      injustifiees: absInjustifiees
    }
  });
}));

/* --- CRUD générique étendu sur toutes les entités métier --- */
const TABLES = ['classes', 'matieres', 'salles', 'eleves', 'notes', 'absences', 'emplois', 'paiements', 'devoirs', 'devoirs_rendus', 'annonces', 'preinscriptions', 'notifications'];

const REF = {
  classes: [['eleves', 'classe_id'], ['emplois', 'classe_id'], ['devoirs', 'classe_id']],
  matieres: [['notes', 'matiere_id'], ['devoirs', 'matiere_id'], ['emplois', 'matiere_id']],
  eleves: [['notes', 'eleve_id'], ['paiements', 'eleve_id'], ['absences', 'eleve_id'], ['devoirs_rendus', 'eleve_id']],
  salles: [['emplois', 'salle_id']]
};
const AVEC_ANNEE = ['classes', 'notes', 'paiements', 'emplois', 'devoirs', 'absences', 'preinscriptions'];

// Column mappings: maps camelCase field names from the frontend to snake_case DB columns
const COL_MAP = {
  eleves: { classe: 'classe_id', parent: 'parent_id', parentNom: 'parent_nom', parentEmail: 'parent_email', parentTel: 'parent_tel', antecedentsMedicaux: 'antecedents_medicaux', anneeEntree: 'annee_entree' },
  classes: { enseignant_titulaire: 'enseignant_titulaire_id' },
  matieres: { enseignant: 'enseignant_id' },
  notes: { eleve: 'eleve_id', matiere: 'matiere_id' },
  absences: { eleve: 'eleve_id', justificationParent: 'justification_parent' },
  emplois: { classe: 'classe_id', matiere: 'matiere_id', enseignant: 'enseignant_id', salle: 'salle_id' },
  paiements: { eleve: 'eleve_id', recuNum: 'recu_num' },
  devoirs: { matiere: 'matiere_id', classe: 'classe_id', enseignant: 'enseignant_id', desc: 'desc_devoir', dateRemise: 'date_remise', dateAssignation: 'date_assignation' },
  devoirs_rendus: { devoir: 'devoir_id', eleve: 'eleve_id', eleveNom: 'eleve_nom', dateDepot: 'date_depot', vuParParent: 'vu_par_parent', commentaireEnseignant: 'commentaire_enseignant' },
  annonces: { auteur: 'auteur_id', auteurNom: 'auteur_nom' },
  preinscriptions: { niveauDemande: 'niveau_demande', parentNom: 'parent_nom', parentEmail: 'parent_email', parentTel: 'parent_tel', antecedentsMedicaux: 'antecedents_medicaux', eleveCree: 'eleve_cree_id', dateDemande: 'date_demande' },
  notifications: { user: 'user_id' }
};

// Reverse mapping: DB column names back to camelCase for frontend responses
const REVERSE_COL_MAP = {};
for (const [table, map] of Object.entries(COL_MAP)) {
  REVERSE_COL_MAP[table] = {};
  for (const [camel, snake] of Object.entries(map)) {
    REVERSE_COL_MAP[table][snake] = camel;
  }
}

function formatRow(table) {
  const rmap = REVERSE_COL_MAP[table] || {};
  return (row) => {
    if (!row) return row;
    const out = { _id: String(row.id), id: String(row.id) };
    for (const [key, val] of Object.entries(row)) {
      if (key === 'id') continue;
      if (key === 'created_at') { out.createdAt = val; continue; }
      if (key === 'updated_at') { out.updatedAt = val; continue; }
      const mapped = rmap[key] || key;
      // Convert FK ids to string
      if (mapped.endsWith('_id') || ['parent', 'eleve', 'matiere', 'classe', 'salle', 'enseignant', 'auteur', 'devoir', 'user'].includes(mapped)) {
        out[mapped] = val !== null && val !== undefined ? String(val) : '';
      } else {
        out[mapped] = val;
      }
    }
    return out;
  };
}

function mapBodyToColumns(table, body) {
  const map = COL_MAP[table] || {};
  const result = {};
  for (const [key, val] of Object.entries(body)) {
    if (['_id', 'id', 'createdAt', 'updatedAt', 'deleted', '__v', 'force'].includes(key)) continue;
    const col = map[key] || key;
    // Don't insert created_at, id or other auto-generated fields
    if (['created_at', 'updated_at'].includes(col)) continue;
    result[col] = val;
  }
  return result;
}

const ent = (q, s, n) => {
  q.k = q.params.k;
  if (!TABLES.includes(q.k)) return err(s, 404, 'Entité inconnue');
  if (q.method !== 'GET' && !can(q.u.role, q.k)) return err(s, 403, 'Accès refusé');
  n();
};

async function portee(k, u) {
  if (u.role === 'admin') return { where: '', params: [] };
  if (['classes', 'matieres', 'salles', 'annonces'].includes(k)) return { where: '', params: [] };

  if (u.role === 'enseignant') {
    if (k === 'devoirs') return { where: 'AND enseignant_id = $P', params: [u.id] };
    return { where: '', params: [] };
  }

  if (u.role === 'comptable') {
    return { where: '', params: [] };
  }

  if (u.role === 'parent') {
    const { rows: kids } = await pool.query('SELECT id, classe_id FROM eleves WHERE parent_id = $1 AND deleted = FALSE', [u.id]);
    const ids = kids.map(e => e.id);
    const classIds = kids.map(e => e.classe_id).filter(Boolean);

    if (k === 'eleves') return { where: 'AND parent_id = $P', params: [u.id] };
    if (['notes', 'paiements', 'absences', 'devoirs_rendus'].includes(k)) {
      if (!ids.length) return { where: 'AND FALSE', params: [] };
      return { where: `AND eleve_id IN (${ids.map((_, i) => `$P${i}`).join(',')})`, params: ids };
    }
    if (['devoirs', 'emplois'].includes(k)) {
      if (!classIds.length) return { where: 'AND FALSE', params: [] };
      return { where: `AND classe_id IN (${classIds.map((_, i) => `$P${i}`).join(',')})`, params: classIds };
    }
    return { where: 'AND FALSE', params: [] };
  }

  if (u.role === 'eleve') {
    const elId = u.eleveId || u.id;
    if (k === 'eleves') return { where: 'AND id = $P', params: [elId] };
    if (['notes', 'absences', 'devoirs_rendus'].includes(k)) return { where: 'AND eleve_id = $P', params: [elId] };
    if (['devoirs', 'emplois'].includes(k)) {
      const { rows } = await pool.query('SELECT classe_id FROM eleves WHERE id = $1', [elId]);
      const classId = rows[0]?.classe_id;
      if (!classId) return { where: 'AND FALSE', params: [] };
      return { where: 'AND classe_id = $P', params: [classId] };
    }
    return { where: 'AND FALSE', params: [] };
  }

  return { where: '', params: [] };
}

function buildPorteeQuery(scope, startParamIndex) {
  let where = scope.where;
  const params = [];
  let idx = startParamIndex;
  for (const p of scope.params) {
    where = where.replace('$P', `$${idx}`).replace(`$P${params.length}`, `$${idx}`);
    params.push(p);
    idx++;
  }
  return { where, params, nextIdx: idx };
}

async function valider(k, b, id, s) {
  if (k === 'notes' && !(b.note >= 0 && b.note <= 20)) {
    return err(s, 400, 'La note doit être comprise entre 0 et 20');
  }
  if (k === 'paiements' && !(b.montant > 0)) {
    return err(s, 400, 'Le montant doit être positif');
  }
  if (k === 'eleves' && (b.classe || b.classe_id) && !b.force) {
    const classeId = b.classe || b.classe_id;
    const { rows: classRows } = await pool.query('SELECT cap FROM classes WHERE id = $1', [classeId]);
    const c = classRows[0];
    let countQuery = 'SELECT COUNT(*) as cnt FROM eleves WHERE classe_id = $1 AND deleted = FALSE';
    const countParams = [classeId];
    if (id) {
      countQuery += ' AND id != $2';
      countParams.push(id);
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    if (c && +countRows[0].cnt >= +c.cap) return err(s, 409, 'Capacité de la classe atteinte', { capacite: true });
  }
  if (k === 'emplois') {
    // Map body fields for conflict check
    const mapped = {
      classe: b.classe || b.classe_id,
      enseignant: b.enseignant || b.enseignant_id,
      salle: b.salle || b.salle_id,
      jour: b.jour,
      debut: b.debut,
      fin: b.fin,
      annee_scolaire: b.annee_scolaire || AN
    };
    const conflit = await verifierConflitEmploi(mapped, id);
    if (conflit) return err(s, 409, conflit);
  }
}

app.get('/api/:k', auth, ent, wrap(async (q, s) => {
  const scope = await portee(q.k, q.u);
  let paramIdx = 1;
  const { where: scopeWhere, params: scopeParams, nextIdx } = buildPorteeQuery(scope, paramIdx);
  paramIdx = nextIdx;

  const query = `SELECT * FROM ${q.k} WHERE deleted = FALSE ${scopeWhere} ORDER BY created_at DESC`;
  const { rows } = await pool.query(query, scopeParams);
  s.json(rows.map(formatRow(q.k)));
}));

app.post('/api/:k', auth, ent, wrap(async (q, s) => {
  if (await valider(q.k, q.body, null, s)) return;
  const mapped = mapBodyToColumns(q.k, q.body);
  if (AVEC_ANNEE.includes(q.k)) mapped.annee_scolaire ??= AN;

  if (q.k === 'paiements' && !mapped.recu_num) {
    mapped.recu_num = `REC-${AN.slice(0, 4)}-${Date.now().toString().slice(-6)}`;
  }
  if (q.k === 'devoirs' && !mapped.enseignant_id) {
    mapped.enseignant_id = q.u.id;
  }

  const cols = Object.keys(mapped);
  const vals = Object.values(mapped);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO ${q.k} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    vals
  );
  const r = rows[0];
  await audit(q.u, 'Ajout ' + q.k, { id: r.id, ...mapped });

  if (q.k === 'paiements') {
    await notifierPaiement(r, q.u);
  } else if (q.k === 'devoirs') {
    const classeId = mapped.classe_id;
    const { rows: eleves } = await pool.query('SELECT * FROM eleves WHERE classe_id = $1 AND deleted = FALSE', [classeId]);
    for (const e of eleves) {
      if (e.parent_id) await notify(e.parent_id, `Nouveau devoir : ${mapped.titre || r.titre}`, `Pour la classe de ${e.nom}. À rendre le ${mapped.date_remise || 'bientôt'}.`, 'devoir');
      const { rows: eleveUserRows } = await pool.query('SELECT id FROM users WHERE eleve_id = $1', [e.id]);
      for (const eu of eleveUserRows) {
        await notify(eu.id, `Nouveau devoir : ${mapped.titre || r.titre}`, `À rendre le ${mapped.date_remise || 'bientôt'}.`, 'devoir');
      }
    }
  }

  s.json(formatRow(q.k)(r));
}));

app.put('/api/:k/:id', auth, ent, wrap(async (q, s) => {
  if (await valider(q.k, q.body, q.params.id, s)) return;
  const { rows: oldRows } = await pool.query(`SELECT * FROM ${q.k} WHERE id = $1`, [q.params.id]);
  if (!oldRows.length || oldRows[0].deleted) return err(s, 404, 'Introuvable');

  const mapped = mapBodyToColumns(q.k, q.body);
  const cols = Object.keys(mapped);
  if (!cols.length) return s.json(formatRow(q.k)(oldRows[0]));

  const setClauses = cols.map((c, i) => `${c} = $${i + 2}`);
  const vals = Object.values(mapped);

  const { rows } = await pool.query(
    `UPDATE ${q.k} SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    [q.params.id, ...vals]
  );
  await audit(q.u, 'Modification ' + q.k, { id: q.params.id });
  s.json(formatRow(q.k)(rows[0]));
}));

app.delete('/api/:k/:id', auth, ent, wrap(async (q, s) => {
  for (const [t, f] of REF[q.k] || []) {
    const { rows: refRows } = await pool.query(
      `SELECT 1 FROM ${t} WHERE ${f} = $1 AND deleted = FALSE LIMIT 1`,
      [q.params.id]
    );
    if (refRows.length) {
      return err(s, 409, `Suppression interdite : élément référencé par « ${t} »`);
    }
  }
  await pool.query(`UPDATE ${q.k} SET deleted = TRUE WHERE id = $1`, [q.params.id]);
  await audit(q.u, 'Suppression (logique) ' + q.k, { id: q.params.id });
  s.json({ ok: true });
}));

/* --- Audit Journal (Admin) --- */
app.get('/api/journal/tout', auth, only('admin'), wrap(async (q, s) => {
  const { rows } = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200');
  s.json(rows.map(r => ({
    _id: String(r.id), id: String(r.id),
    user: r.user_id, nom: r.nom,
    action: r.action, data: r.data,
    createdAt: r.created_at
  })));
}));

/* --- Production Frontend Serving (Option B, C, D) --- */
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

/* --- Start Server --- */
try {
  const client = await pool.connect();
  const { rows } = await client.query('SELECT NOW()');
  /* Auto-init DB si neuve (déploiement Render / Cloud) */
  try {
    const tableCheck = await client.query("SELECT to_regclass('public.users') AS exists");
    if (!tableCheck.rows[0].exists) {
      console.log("Base vide détectée, initialisation automatique...");
      const schemaPath = path.resolve(__dirname, '../database/schema.sql');
      if (fs.existsSync(schemaPath)) {
        await client.query(fs.readFileSync(schemaPath, 'utf8'));
        console.log("✓ Schéma PostgreSQL créé.");
      }
      const seedPath = path.resolve(__dirname, '../database/seed.sql');
      if (fs.existsSync(seedPath)) {
        await client.query(fs.readFileSync(seedPath, 'utf8'));
        console.log("✓ Données de test insérées.");
      }
    } else {
      // Vérifier et réparer les mots de passe si l'ancien hash placeholder est présent
      const adminRow = await client.query("SELECT hash FROM users WHERE email = 'admin@ecole.tn'");
      if (adminRow.rows.length > 0 && adminRow.rows[0].hash.includes('$2a$12$e6/8cTqL8J55GjA1Yx')) {
        console.log("Correction automatique des mots de passe des comptes de test...");
        await client.query(`
          UPDATE users SET hash = '$2a$10$9b.lwTbE1fMiKRN.2SbvoeEPSUM8RQCz1sdhYZiWGMbT.z9j1dnou' WHERE email = 'admin@ecole.tn';
          UPDATE users SET hash = '$2a$10$V2JhKtqYqehS23aY4MvGTurGsv.wsWZP8w6Hh4zw9IYxFm332NR7C' WHERE role = 'enseignant';
          UPDATE users SET hash = '$2a$10$M2Uja4BkDQwWjcnudpjqMe.DEwdBZmiqCTYZU5wz/NaC.V68veIlq' WHERE role = 'comptable';
          UPDATE users SET hash = '$2a$10$yNICYMXeEuxWGHtY6MhDAuWc1j1fYYCz0nf9KPtEMWFee2eQYq18u' WHERE role = 'parent';
          UPDATE users SET hash = '$2a$10$kNqA5Q61oP0hlnTqswox7eyz7DikfFkXfDtYPjV9TtqkaJJNSHDjq' WHERE role = 'eleve';
        `);
        console.log("✓ Mots de passe synchronisés avec succès.");
      }
    }
  } catch (initErr) {
    console.warn("Note initialisation DB :", initErr.message);
  }
  client.release();
  console.log(`PostgreSQL connecté avec succès (${rows[0].now})`);
  app.listen(PORT, () => console.log(`API prête sur le port ${PORT} [Mode: ${NODE_ENV}] [DB: PostgreSQL]`));
} catch (e) {
  console.error('Erreur connexion PostgreSQL:', e.message);
  process.exit(1);
}
