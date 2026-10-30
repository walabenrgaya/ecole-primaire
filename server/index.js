import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_ecole_2026_change_in_production';
const AN = process.env.ANNEE_SCOLAIRE || '2026-2027';
const FRAIS = +(process.env.FRAIS_SCOLARITE || 1200);

/* --- CORS & Middleware --- */
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* --- Static Uploads --- */
const uploadDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

/* --- Multer Configuration --- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${safeName}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

/* --- Helpers --- */
const err = (s, code, msg, extra = {}) => s.status(code).json({ error: msg, ...extra });
const wrap = fn => (q, s, n) => Promise.resolve(fn(q, s, n)).catch(n);

async function audit(u, action, data = {}) {
  try {
    const userId = u?.id ? String(u.id) : null;
    const nom = u?.nom || 'Anonyme';
    const schoolId = u?.schoolId || null;
    await pool.query(
      'INSERT INTO logs (school_id, user_id, nom, action, data, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [schoolId, userId, nom, action, JSON.stringify(data)]
    );
  } catch (e) {
    console.error("Erreur journal d'audit:", e.message);
  }
}

async function notify(userId, titre, message, type = 'info', lien = '', schoolId = null) {
  try {
    if (!userId) return;
    await pool.query(
      'INSERT INTO notifications (school_id, user_id, titre, message, type, lien, lu, created_at) VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())',
      [schoolId, userId, titre, message, type, lien]
    );
  } catch (e) {
    console.error('Erreur notification:', e.message);
  }
}

function sendEmailNotification(to, subject, body) {
  if (!process.env.SMTP_HOST) {
    console.log(`[SIMULATION EMAIL] Vers: ${to} | Objet: ${subject}\nCorps: ${body.slice(0, 100)}...`);
    return;
  }
}

/* --- Auth & RBAC Multi-Tenant --- */
const auth = (q, s, n) => {
  try {
    const token = (q.headers.authorization || '').slice(7);
    if (!token) return err(s, 401, 'Non authentifié');
    q.u = jwt.verify(token, JWT_SECRET);
    // Super-admin peut changer de contexte d'école via header x-school-id
    if (q.u.role === 'superadmin' && q.headers['x-school-id']) {
      q.u.schoolId = parseInt(q.headers['x-school-id'], 10);
    }
    n();
  } catch {
    err(s, 401, 'Session expirée ou invalide');
  }
};

const optionalAuth = (q, s, n) => {
  try {
    const token = (q.headers.authorization || '').slice(7);
    if (token) {
      q.u = jwt.verify(token, JWT_SECRET);
      if (q.u.role === 'superadmin' && q.headers['x-school-id']) {
        q.u.schoolId = parseInt(q.headers['x-school-id'], 10);
      }
    }
  } catch {}
  n();
};

const ECRIT = {
  enseignant: ['notes', 'devoirs', 'devoirs_rendus', 'absences'],
  comptable: ['paiements', 'eleves', 'preinscriptions'],
  parent: ['absences', 'devoirs_rendus', 'preinscriptions'],
  eleve: ['devoirs_rendus']
};

const can = (role, k) => role === 'superadmin' || role === 'admin' || (ECRIT[role] || []).includes(k);
const only = (...roles) => (q, s, n) => (q.u?.role === 'superadmin' || roles.includes(q.u?.role)) ? n() : err(s, 403, 'Accès refusé');

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

/* --- Mots de passe officiels de démo (Auto-secours) --- */
const DEMO_PASSWORDS = {
  'superadmin@saas.tn': 'SuperAdmin123!',
  'admin@ecole.tn': 'Admin123!',
  'prof.francais@ecole.tn': 'Prof123!',
  'prof.maths@ecole.tn': 'Prof123!',
  'comptable@ecole.tn': 'Comptable123!',
  'parent.benali@ecole.tn': 'Parent123!',
  'eleve.yassine@ecole.tn': 'Eleve123!',
  'admin@alamal.tn': 'Admin123!',
  'prof@alamal.tn': 'Prof123!',
  'comptable@alamal.tn': 'Comptable123!',
  'parent@alamal.tn': 'Parent123!',
  'eleve@alamal.tn': 'Eleve123!'
};

/* --- Auto-initialisation de la base si neuve (Render / Cloud) --- */
async function ensureDatabaseReady() {
  try {
    const tableCheck = await pool.query("SELECT to_regclass('public.schools') AS exists");
    if (!tableCheck.rows[0]?.exists) {
      console.log("Initialisation schéma multi-tenant SaaS...");
      const schemaPath = path.resolve(__dirname, '../database/schema.sql');
      if (fs.existsSync(schemaPath)) {
        await pool.query(fs.readFileSync(schemaPath, 'utf8'));
      }
      const seedPath = path.resolve(__dirname, '../database/seed.sql');
      if (fs.existsSync(seedPath)) {
        await pool.query(fs.readFileSync(seedPath, 'utf8'));
      }
      console.log("✓ Schéma multi-tenant et données initialisés.");
      return;
    }

    const { rows: schoolRows } = await pool.query("SELECT COUNT(*) FROM schools");
    if (parseInt(schoolRows[0]?.count || 0) === 0) {
      const seedPath = path.resolve(__dirname, '../database/seed.sql');
      if (fs.existsSync(seedPath)) {
        await pool.query(fs.readFileSync(seedPath, 'utf8'));
        console.log("✓ Données multi-écoles initialisées.");
      }
    }
  } catch (e) {
    console.error("ensureDatabaseReady warning:", e.message);
  }
}

/* --- Setup / Health Endpoint --- */
app.get('/api/setup', wrap(async (req, res) => {
  await ensureDatabaseReady();
  const { rows: schools } = await pool.query('SELECT id, name, code, status, plan FROM schools ORDER BY id');
  const { rows: users } = await pool.query('SELECT id, school_id, email, role, nom FROM users ORDER BY id');
  res.json({
    ok: true,
    message: 'Base PostgreSQL Multi-Tenant opérationnelle',
    schools,
    usersCount: users.length,
    users: users.map(u => ({ email: u.email, role: u.role, schoolId: u.school_id }))
  });
}));

/* --- Login & Me Multi-Tenant --- */
app.post('/api/auth/login', wrap(async (q, s) => {
  const identifier = String(q.body.email || '').trim().toLowerCase();
  const password = String(q.body.password || '');
  await ensureDatabaseReady();

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(email) = $1 || \'@ecole.tn\' OR LOWER(email) = $1 || \'@alamal.tn\' LIMIT 1',
    [identifier]
  );
  const u = rows[0];
  const isBcryptValid = u && (await bcrypt.compare(password, u.hash).catch(() => false));
  const isDemoFallback = u && DEMO_PASSWORDS[u.email] && password === DEMO_PASSWORDS[u.email];

  if (!u || (!isBcryptValid && !isDemoFallback)) {
    return err(s, 401, 'Identifiants invalides');
  }

  // Réparer le hash en arrière-plan si validé par mot de passe démo
  if (isDemoFallback && !isBcryptValid) {
    bcrypt.hash(password, 10).then(newHash => {
      pool.query('UPDATE users SET hash = $1 WHERE id = $2', [newHash, u.id]).catch(() => {});
    });
  }

  // Vérifier statut de l'école (si non super-admin)
  let school = null;
  if (u.school_id) {
    const { rows: sRows } = await pool.query('SELECT id, name, code, status, plan FROM schools WHERE id = $1', [u.school_id]);
    school = sRows[0] || null;
    if (school && school.status === 'suspended') {
      return err(s, 403, 'Cet établissement scolaire est actuellement suspendu.');
    }
  }

  const p = {
    id: String(u.id),
    nom: u.nom,
    email: u.email,
    role: u.role,
    telephone: u.telephone || '',
    eleveId: u.eleve_id ? String(u.eleve_id) : '',
    classe: u.classe || '',
    schoolId: u.school_id || null,
    schoolName: school ? school.name : (u.role === 'superadmin' ? 'Plateforme SaaS' : 'Établissement'),
    schoolCode: school ? school.code : 'saas',
    schoolPlan: school ? school.plan : 'enterprise',
    enfants: []
  };

  // Enfants pour rôle parent
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

  let school = null;
  if (u.school_id) {
    const { rows: sRows } = await pool.query('SELECT id, name, code, status, plan FROM schools WHERE id = $1', [u.school_id]);
    school = sRows[0] || null;
  }

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
    schoolId: u.school_id || null,
    schoolName: school ? school.name : (u.role === 'superadmin' ? 'Plateforme SaaS' : 'Établissement'),
    schoolCode: school ? school.code : 'saas',
    schoolPlan: school ? school.plan : 'enterprise',
    enfants
  });
}));

/* =====================================================================
   MODULE SAAS SUPER-ADMIN (Gestion Globale des Écoles et Abonnements)
   ===================================================================== */
app.get('/api/saas/stats', auth, only('superadmin'), wrap(async (req, res) => {
  const { rows: schools } = await pool.query(`
    SELECT COUNT(*) as nb_schools,
           COUNT(*) FILTER (WHERE status = 'active') as active_schools
    FROM schools
  `);
  const { rows: eleves } = await pool.query('SELECT COUNT(*) as nb_eleves FROM eleves WHERE deleted = FALSE');
  const { rows: users } = await pool.query("SELECT COUNT(*) as nb_users FROM users WHERE role != 'superadmin'");
  const { rows: rev } = await pool.query('SELECT SUM(montant) as total_rev FROM paiements WHERE deleted = FALSE');

  res.json({
    schoolsCount: +schools[0].nb_schools,
    activeSchools: +schools[0].active_schools,
    totalEleves: +eleves[0].nb_eleves,
    totalUsers: +users[0].nb_users,
    totalRevenue: +(rev[0]?.total_rev || 0)
  });
}));

app.get('/api/saas/schools', auth, only('superadmin'), wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*,
      (SELECT COUNT(*) FROM eleves e WHERE e.school_id = s.id AND e.deleted = FALSE) AS nb_eleves,
      (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id) AS nb_users,
      (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id AND c.deleted = FALSE) AS nb_classes
    FROM schools s
    ORDER BY s.id ASC
  `);
  res.json(rows.map(r => ({
    id: r.id,
    _id: String(r.id),
    name: r.name,
    code: r.code,
    status: r.status,
    plan: r.plan,
    adresse: r.adresse || '',
    telephone: r.telephone || '',
    emailContact: r.email_contact || '',
    subscriptionEnd: r.subscription_end,
    createdAt: r.created_at,
    nbEleves: +r.nb_eleves,
    nbUsers: +r.nb_users,
    nbClasses: +r.nb_classes
  })));
}));

app.post('/api/saas/schools', auth, only('superadmin'), wrap(async (req, res) => {
  const { name, code, plan, adresse, telephone, emailContact, adminNom, adminEmail, adminPassword } = req.body;
  if (!name || !code) return err(res, 400, "Nom et code d'école obligatoires");

  const cleanCode = code.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
  const { rows: check } = await pool.query('SELECT id FROM schools WHERE code = $1', [cleanCode]);
  if (check.length) return err(res, 409, "Ce code d'école existe déjà");

  const { rows: sRows } = await pool.query(
    `INSERT INTO schools (name, code, plan, status, adresse, telephone, email_contact)
     VALUES ($1, $2, $3, 'active', $4, $5, $6) RETURNING *`,
    [name.trim(), cleanCode, plan || 'standard', adresse || '', telephone || '', emailContact || '']
  );
  const newSchool = sRows[0];

  let adminUser = null;
  if (adminEmail && adminPassword) {
    const hash = await bcrypt.hash(adminPassword, 10);
    const { rows: uRows } = await pool.query(
      `INSERT INTO users (school_id, nom, email, hash, role, telephone)
       VALUES ($1, $2, $3, $4, 'admin', $5) RETURNING id, nom, email, role`,
      [newSchool.id, adminNom || `Direction ${name}`, adminEmail.toLowerCase().trim(), hash, telephone || '']
    );
    adminUser = uRows[0];
  }

  await audit(req.u, 'Création nouvel établissement SaaS', { schoolId: newSchool.id, name: newSchool.name });
  res.json({ ok: true, school: newSchool, admin: adminUser });
}));

app.put('/api/saas/schools/:id', auth, only('superadmin'), wrap(async (req, res) => {
  const { name, status, plan, subscriptionEnd, adresse, telephone, emailContact } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (status) updates.status = status;
  if (plan) updates.plan = plan;
  if (subscriptionEnd) updates.subscription_end = subscriptionEnd;
  if (adresse !== undefined) updates.adresse = adresse;
  if (telephone !== undefined) updates.telephone = telephone;
  if (emailContact !== undefined) updates.email_contact = emailContact;
  updates.updated_at = new Date();

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  const vals = Object.values(updates);
  const { rows } = await pool.query(
    `UPDATE schools SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    [req.params.id, ...vals]
  );
  if (!rows.length) return err(res, 404, 'École introuvable');
  await audit(req.u, 'Mise à jour école SaaS', { schoolId: req.params.id, updates });
  res.json(rows[0]);
}));

/* --- Users Management (Admin Établissement) --- */
app.get('/api/users', auth, only('admin'), wrap(async (q, s) => {
  let query = 'SELECT id, nom, email, role, telephone, eleve_id, classe, school_id, created_at FROM users WHERE 1=1';
  const params = [];
  if (q.u.schoolId) {
    query += ' AND school_id = $1';
    params.push(q.u.schoolId);
  }
  query += ' ORDER BY nom';
  const { rows } = await pool.query(query, params);
  s.json(rows.map(u => ({
    _id: String(u.id), id: String(u.id),
    nom: u.nom, email: u.email, role: u.role,
    telephone: u.telephone || '',
    eleveId: u.eleve_id ? String(u.eleve_id) : '',
    classe: u.classe || '',
    schoolId: u.school_id,
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

  const hash = await bcrypt.hash(password, 10);
  const schoolId = q.u.schoolId || null;
  const { rows } = await pool.query(
    'INSERT INTO users (school_id, nom, email, hash, role, telephone, eleve_id, classe) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [schoolId, nom, email.toLowerCase(), hash, role || 'parent', telephone || '', eleveId || null, classe || '']
  );
  const u = rows[0];
  await audit(q.u, 'Création utilisateur', { id: u.id, nom, role });
  s.json({ _id: String(u.id), id: String(u.id), nom, email: u.email, role: u.role });
}));

app.put('/api/users/:id', auth, only('admin'), wrap(async (q, s) => {
  const { nom, email, password, role, telephone, eleveId, classe } = q.body;
  let findQuery = 'SELECT * FROM users WHERE id = $1';
  const findParams = [q.params.id];
  if (q.u.schoolId) {
    findQuery += ' AND school_id = $2';
    findParams.push(q.u.schoolId);
  }
  const { rows } = await pool.query(findQuery, findParams);
  const u = rows[0];
  if (!u) return err(s, 404, 'Utilisateur introuvable dans votre établissement');

  const updates = {};
  if (nom) updates.nom = nom;
  if (email) updates.email = email.toLowerCase();
  if (role) updates.role = role;
  if (telephone !== undefined) updates.telephone = telephone;
  if (eleveId !== undefined) updates.eleve_id = eleveId;
  if (classe !== undefined) updates.classe = classe;
  if (password && password.length >= 6) {
    updates.hash = await bcrypt.hash(password, 10);
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
  let delQuery = 'DELETE FROM users WHERE id = $1';
  const delParams = [q.params.id];
  if (q.u.schoolId) {
    delQuery += ' AND school_id = $2';
    delParams.push(q.u.schoolId);
  }
  delQuery += ' RETURNING nom';
  const { rows } = await pool.query(delQuery, delParams);
  if (!rows.length) return err(s, 404, 'Utilisateur introuvable dans votre établissement');
  await audit(q.u, 'Suppression utilisateur', { id: q.params.id, nom: rows[0].nom });
  s.json({ ok: true });
}));

/* --- Messaging Channels (RBAC Matrix & Tenant-Isolated) --- */
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
  let query = `SELECT id, nom, email, role FROM users WHERE role IN (${placeholders})`;
  const params = [...roles];
  if (q.u.schoolId) {
    query += ` AND school_id = $${params.length + 1}`;
    params.push(q.u.schoolId);
  }
  query += ' ORDER BY nom';
  const { rows } = await pool.query(query, params);
  s.json(rows.map(u => ({ _id: String(u.id), id: String(u.id), nom: u.nom, email: u.email, role: u.role })));
}));

/* --- Messaging Router --- */
const mr = express.Router();
mr.use(auth);

mr.get('/', wrap(async (q, s) => {
  const id = +q.u.id;
  let query = 'SELECT * FROM messages WHERE (de_id = $1 OR a_id = $1)';
  const params = [id];
  if (q.u.schoolId) {
    query += ' AND school_id = $2';
    params.push(q.u.schoolId);
  }
  query += ' ORDER BY created_at DESC';
  const { rows: all } = await pool.query(query, params);
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
  let destQuery = 'SELECT * FROM users WHERE id = $1';
  const destParams = [a];
  if (q.u.schoolId) {
    destQuery += ' AND school_id = $2';
    destParams.push(q.u.schoolId);
  }
  const { rows: destRows } = await pool.query(destQuery, destParams);
  const dest = destRows[0];
  if (!dest || !(DEST[q.u.role] || []).includes(dest.role)) {
    return err(s, 403, 'Destinataire non autorisé ou hors de votre établissement');
  }
  if (!brouillon && (!objet || !corps)) {
    return err(s, 400, 'Objet et corps obligatoires');
  }

  const schoolId = q.u.schoolId || dest.school_id || null;
  let result;
  if (existingId) {
    const { rows } = await pool.query(
      `UPDATE messages SET a_id=$1, a_nom=$2, a_role=$3, objet=$4, corps=$5, brouillon=$6 WHERE id=$7 AND de_id=$8 RETURNING *`,
      [a, dest.nom, dest.role, objet, corps, !!brouillon, existingId, q.u.id]
    );
    result = rows[0];
  } else {
    const { rows } = await pool.query(
      `INSERT INTO messages (school_id, de_id, de_nom, de_role, a_id, a_nom, a_role, objet, corps, brouillon, auto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [schoolId, q.u.id, q.u.nom, q.u.role, a, dest.nom, dest.role, objet, corps, !!brouillon, false]
    );
    result = rows[0];
  }

  if (!brouillon) {
    await audit(q.u, 'Message envoyé', { id: result.id, a: dest.nom });
    await notify(a, `Nouveau message de ${q.u.nom}`, objet, 'message', '/messages', schoolId);
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

/* --- Notifications In-App --- */
app.get('/api/notifications', auth, wrap(async (q, s) => {
  const { rows } = await pool.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
    [q.u.id]
  );
  s.json(rows.map(n => ({
    _id: String(n.id), id: String(n.id),
    titre: n.titre, message: n.message, type: n.type,
    lien: n.lien, lu: n.lu, createdAt: n.created_at
  })));
}));

app.post('/api/notifications/:id/lu', auth, wrap(async (q, s) => {
  await pool.query('UPDATE notifications SET lu = TRUE WHERE id = $1 AND user_id = $2', [q.params.id, q.u.id]);
  s.json({ ok: true });
}));

app.post('/api/notifications/tout-lire', auth, wrap(async (q, s) => {
  await pool.query('UPDATE notifications SET lu = TRUE WHERE user_id = $1', [q.u.id]);
  s.json({ ok: true });
}));

/* --- Conflits d'emploi du temps (avec school_id) --- */
async function verifierConflitEmploi(body, currentId = null, schoolId = null) {
  const { classe, enseignant, salle, jour, debut, fin, annee_scolaire } = body;
  const annee = annee_scolaire || AN;

  let query = `
    SELECT id, classe_id, enseignant_id, salle_id, jour, debut, fin
    FROM emplois
    WHERE deleted = FALSE
      AND annee_scolaire = $1
      AND jour = $2
      AND (debut < $4 AND fin > $3)
  `;
  const params = [annee, jour, debut, fin];

  if (schoolId) {
    query += ` AND school_id = $${params.length + 1}`;
    params.push(schoolId);
  }

  if (currentId) {
    query += ` AND id != $${params.length + 1}`;
    params.push(currentId);
  }

  const { rows } = await pool.query(query, params);
  for (const c of rows) {
    if (classe && c.classe_id === +classe) return `Conflit de créneau : La classe est déjà occupée sur ce créneau (${c.debut} - ${c.fin})`;
    if (enseignant && c.enseignant_id === +enseignant) return `Conflit d'enseignant : L'enseignant a déjà un cours sur ce créneau (${c.debut} - ${c.fin})`;
    if (salle && c.salle_id === +salle) return `Conflit de salle : La salle est déjà réservée sur ce créneau (${c.debut} - ${c.fin})`;
  }
  return null;
}

/* --- Devoirs & Devoirs Rendus --- */
app.get('/api/devoirs/:id/rendus', auth, only('enseignant', 'admin'), wrap(async (q, s) => {
  let devQuery = 'SELECT * FROM devoirs WHERE id = $1';
  const devParams = [q.params.id];
  if (q.u.schoolId) {
    devQuery += ' AND school_id = $2';
    devParams.push(q.u.schoolId);
  }
  const { rows: devRows } = await pool.query(devQuery, devParams);
  if (!devRows.length) return err(s, 404, 'Devoir introuvable ou non autorisé');

  const { rows } = await pool.query(
    'SELECT * FROM devoirs_rendus WHERE devoir_id = $1 ORDER BY date_depot DESC',
    [q.params.id]
  );
  s.json(rows.map(formatRow('devoirs_rendus')));
}));

app.post('/api/devoirs/:id/rendre', auth, only('eleve', 'parent'), upload.single('fichier'), wrap(async (q, s) => {
  let devQuery = 'SELECT * FROM devoirs WHERE id = $1';
  const devParams = [q.params.id];
  if (q.u.schoolId) {
    devQuery += ' AND school_id = $2';
    devParams.push(q.u.schoolId);
  }
  const { rows: devRows } = await pool.query(devQuery, devParams);
  const devoir = devRows[0];
  if (!devoir) return err(s, 404, 'Devoir introuvable');

  const eleveId = q.u.eleveId || q.body.eleveId;
  if (!eleveId) return err(s, 400, 'Identifiant élève obligatoire');

  const { rows: elRows } = await pool.query('SELECT * FROM eleves WHERE id = $1 AND deleted = FALSE', [eleveId]);
  const eleve = elRows[0];
  if (!eleve) return err(s, 404, 'Élève introuvable');

  const dateLimite = new Date(devoir.date_remise);
  dateLimite.setHours(23, 59, 59, 999);
  const statut = new Date() > dateLimite ? 'en_retard' : 'rendu';
  const fichierUrl = q.file ? `/uploads/${q.file.filename}` : (q.body.fichier || null);
  const contenu = q.body.contenu || '';

  const schoolId = q.u.schoolId || devoir.school_id;
  const { rows: existing } = await pool.query(
    'SELECT id FROM devoirs_rendus WHERE devoir_id = $1 AND eleve_id = $2',
    [devoir.id, eleveId]
  );

  let rec;
  if (existing.length) {
    const { rows } = await pool.query(
      `UPDATE devoirs_rendus SET contenu = $1, fichier = COALESCE($2, fichier), statut = $3, date_depot = NOW()
       WHERE id = $4 RETURNING *`,
      [contenu, fichierUrl, statut, existing[0].id]
    );
    rec = rows[0];
  } else {
    const { rows } = await pool.query(
      `INSERT INTO devoirs_rendus (school_id, devoir_id, eleve_id, eleve_nom, contenu, fichier, statut, bareme)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [schoolId, devoir.id, eleveId, `${eleve.nom} ${eleve.prenom || ''}`.trim(), contenu, fichierUrl, statut, devoir.bareme || 20.0]
    );
    rec = rows[0];
  }

  await notify(devoir.enseignant_id, 'Nouveau devoir rendu', `${eleve.nom} a rendu son travail pour : ${devoir.titre}`, 'devoir', `/devoirs/${devoir.id}`, schoolId);
  await audit(q.u, 'Dépôt de devoir', { devoir: devoir.id, eleve: eleveId, statut });
  s.json(formatRow('devoirs_rendus')(rec));
}));

app.put('/api/devoirs_rendus/:id/noter', auth, only('enseignant', 'admin'), wrap(async (q, s) => {
  const { note, commentaire, bareme } = q.body;
  if (note === undefined || note === null || note < 0) {
    return err(s, 400, 'Note valide obligatoire');
  }

  let updateQuery = `UPDATE devoirs_rendus SET note=$1, commentaire_enseignant=$2, bareme=COALESCE($3, bareme), statut='corrige' WHERE id=$4`;
  const updateParams = [note, commentaire || '', bareme || 20.0, q.params.id];
  if (q.u.schoolId) {
    updateQuery += ` AND school_id=$5`;
    updateParams.push(q.u.schoolId);
  }
  updateQuery += ` RETURNING *`;

  const { rows } = await pool.query(updateQuery, updateParams);
  if (!rows.length) return err(s, 404, 'Rendu introuvable dans votre établissement');
  const rendu = rows[0];
  await audit(q.u, 'Notation de devoir', { rendu: rendu.id, note });

  const { rows: devRows } = await pool.query('SELECT * FROM devoirs WHERE id = $1', [rendu.devoir_id]);
  const { rows: eleveRows } = await pool.query('SELECT * FROM eleves WHERE id = $1', [rendu.eleve_id]);
  const eleve = eleveRows[0];
  if (eleve?.parent_id) {
    await notify(eleve.parent_id, `Note de devoir : ${devRows[0]?.titre}`, `${eleve.nom} a obtenu ${note}/${bareme || 20}`, 'devoir', '', rendu.school_id);
  }
  s.json(formatRow('devoirs_rendus')(rendu));
}));

app.post('/api/devoirs_rendus/:id/vu-parent', auth, only('parent', 'admin'), wrap(async (q, s) => {
  const { rows } = await pool.query('UPDATE devoirs_rendus SET vu_par_parent = TRUE WHERE id = $1 RETURNING *', [q.params.id]);
  if (!rows.length) return err(s, 404, 'Rendu introuvable');
  s.json({ ok: true });
}));

/* --- Absences & Justifications --- */
app.post('/api/absences/:id/justifier', auth, only('parent', 'admin'), wrap(async (q, s) => {
  const { justification } = q.body;
  if (!justification) return err(s, 400, 'Motif de justification obligatoire');
  let query = `UPDATE absences SET justification_parent=$1, statut='En attente de validation' WHERE id=$2 AND deleted=FALSE`;
  const params = [justification, q.params.id];
  if (q.u.schoolId) {
    query += ` AND school_id=$3`;
    params.push(q.u.schoolId);
  }
  query += ` RETURNING *`;
  const { rows } = await pool.query(query, params);
  if (!rows.length) return err(s, 404, 'Absence introuvable dans votre établissement');
  await audit(q.u, "Justification d'absence déposée", { id: q.params.id, justification });
  s.json(formatRow('absences')(rows[0]));
}));

app.post('/api/absences/:id/valider-justification', auth, only('enseignant', 'admin'), wrap(async (q, s) => {
  const { validee } = q.body;
  let query = `UPDATE absences SET justifiee=$1, statut=$2 WHERE id=$3 AND deleted=FALSE`;
  const params = [!!validee, validee ? 'Justifiée' : 'Rejetée', q.params.id];
  if (q.u.schoolId) {
    query += ` AND school_id=$4`;
    params.push(q.u.schoolId);
  }
  query += ` RETURNING *`;
  const { rows } = await pool.query(query, params);
  if (!rows.length) return err(s, 404, 'Absence introuvable dans votre établissement');
  await audit(q.u, "Validation justification d'absence", { id: q.params.id, validee });
  s.json(formatRow('absences')(rows[0]));
}));

/* --- Pré-inscriptions en ligne --- */
app.post('/api/preinscriptions', optionalAuth, wrap(async (q, s) => {
  const { nom, prenom, naissance, genre, niveauDemande, parentNom, parentEmail, parentTel, adresse, antecedentsMedicaux, schoolId } = q.body;
  if (!nom || !prenom || !parentEmail || !parentNom) {
    return err(s, 400, 'Nom, prénom, nom du parent et e-mail sont obligatoires');
  }

  const sid = q.u?.schoolId || schoolId || 1;
  const { rows } = await pool.query(
    `INSERT INTO preinscriptions (school_id, nom, prenom, naissance, genre, niveau_demande, parent_nom, parent_email, parent_tel, adresse, antecedents_medicaux, statut, annee_scolaire)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'en_attente',$12) RETURNING *`,
    [sid, nom, prenom, naissance || null, genre || 'M', niveauDemande || 'CP', parentNom, parentEmail.toLowerCase(), parentTel || '', adresse || '', antecedentsMedicaux || 'Aucun', AN]
  );
  const rec = rows[0];
  await audit(q.u || {}, 'Nouvelle pré-inscription', { id: rec.id, eleve: `${nom} ${prenom}`, schoolId: sid });

  const { rows: admins } = await pool.query("SELECT id FROM users WHERE role = 'admin' AND school_id = $1", [sid]);
  for (const a of admins) {
    await notify(a.id, 'Nouvelle pré-inscription', `${nom} ${prenom} (${niveauDemande}) en attente de validation.`, 'info', '', sid);
  }
  s.json(formatRow('preinscriptions')(rec));
}));

app.post('/api/preinscriptions/:id/valider', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  const { classeId } = q.body;
  let pQuery = 'SELECT * FROM preinscriptions WHERE id = $1';
  const pParams = [q.params.id];
  if (q.u.schoolId) {
    pQuery += ' AND school_id = $2';
    pParams.push(q.u.schoolId);
  }
  const { rows: pRows } = await pool.query(pQuery, pParams);
  const p = pRows[0];
  if (!p) return err(s, 404, 'Pré-inscription introuvable dans votre établissement');
  if (p.statut === 'validee') return err(s, 400, 'Déjà validée');

  const sid = p.school_id;
  let { rows: parentRows } = await pool.query('SELECT * FROM users WHERE email = $1', [p.parent_email]);
  let parentUser = parentRows[0];
  if (!parentUser) {
    const hash = await bcrypt.hash('Parent123!', 10);
    const { rows } = await pool.query(
      'INSERT INTO users (school_id, nom, email, hash, role, telephone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [sid, p.parent_nom, p.parent_email, hash, 'parent', p.parent_tel || '']
    );
    parentUser = rows[0];
  }

  const { rows: eleveRows } = await pool.query(
    `INSERT INTO eleves (school_id, nom, prenom, naissance, genre, classe_id, parent_id, parent_nom, parent_email, parent_tel, antecedents_medicaux, annee_entree, annee_scolaire, statut)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'inscrit') RETURNING *`,
    [sid, p.nom, p.prenom, p.naissance, p.genre, classeId || null, parentUser.id, p.parent_nom, p.parent_email, p.parent_tel, p.antecedents_medicaux, AN, AN]
  );
  const eleve = eleveRows[0];

  await pool.query("UPDATE preinscriptions SET statut = 'validee', eleve_cree_id = $1 WHERE id = $2", [eleve.id, q.params.id]);
  await audit(q.u, 'Validation pré-inscription', { id: q.params.id, eleveId: eleve.id });
  s.json({ ok: true, eleve: formatRow('eleves')(eleve) });
}));

app.post('/api/preinscriptions/:id/rejeter', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  let pQuery = "UPDATE preinscriptions SET statut = 'rejetee' WHERE id = $1";
  const pParams = [q.params.id];
  if (q.u.schoolId) {
    pQuery += ' AND school_id = $2';
    pParams.push(q.u.schoolId);
  }
  pQuery += ' RETURNING *';
  const { rows } = await pool.query(pQuery, pParams);
  if (!rows.length) return err(s, 404, 'Pré-inscription introuvable');
  await audit(q.u, 'Rejet pré-inscription', { id: q.params.id });
  s.json({ ok: true });
}));

/* --- Finances & Comptabilité (Isolation Tenant Étanche) --- */
async function solde(eleveId, schoolId = null) {
  let pQuery = 'SELECT montant FROM paiements WHERE eleve_id = $1 AND deleted = FALSE';
  const pParams = [eleveId];
  if (schoolId) {
    pQuery += ' AND school_id = $2';
    pParams.push(schoolId);
  }
  const { rows } = await pool.query(pQuery, pParams);
  const paye = rows.reduce((s, p) => s + (+p.montant || 0), 0);
  return Math.max(0, FRAIS - paye);
}

app.get('/api/finances/stats', auth, only('admin', 'comptable'), wrap(async (q, s) => {
  let eQuery = "SELECT id FROM eleves WHERE deleted = FALSE AND statut != 'radie'";
  let pQuery = 'SELECT montant FROM paiements WHERE deleted = FALSE';
  const params = [];
  if (q.u.schoolId) {
    eQuery += ' AND school_id = $1';
    pQuery += ' AND school_id = $1';
    params.push(q.u.schoolId);
  }
  const { rows: eleves } = await pool.query(eQuery, params);
  const { rows: paiements } = await pool.query(pQuery, params);

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
  let eQuery = "SELECT * FROM eleves WHERE deleted = FALSE AND statut != 'radie'";
  let cQuery = 'SELECT * FROM classes WHERE deleted = FALSE';
  let pQuery = 'SELECT * FROM paiements WHERE deleted = FALSE';
  const params = [];
  if (q.u.schoolId) {
    eQuery += ' AND school_id = $1';
    cQuery += ' AND school_id = $1';
    pQuery += ' AND school_id = $1';
    params.push(q.u.schoolId);
  }
  const { rows: eleves } = await pool.query(eQuery, params);
  const { rows: classes } = await pool.query(cQuery, params);
  const { rows: paiements } = await pool.query(pQuery, params);

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
  let query = 'SELECT * FROM eleves WHERE id = $1';
  const params = [q.params.eleveId];
  if (q.u.schoolId) {
    query += ' AND school_id = $2';
    params.push(q.u.schoolId);
  }
  const { rows: eleveRows } = await pool.query(query, params);
  const eleve = eleveRows[0];
  if (!eleve || !eleve.parent_id) return err(s, 404, 'Élève ou parent introuvable dans votre établissement');

  const reste = await solde(eleve.id, eleve.school_id);
  const { rows: parentRows } = await pool.query('SELECT * FROM users WHERE id = $1', [eleve.parent_id]);
  const parent = parentRows[0];

  const corps = `Madame, Monsieur,\n\nNous vous rappelons qu'il reste un solde impayé de ${reste} TND pour votre enfant ${eleve.nom} (Année ${AN}).\n\nMerci de régulariser la situation auprès de notre secrétariat.\n\nCordialement,\nLa Direction.`;

  await pool.query(
    'INSERT INTO messages (school_id, de_id, de_nom, de_role, a_id, a_nom, a_role, objet, corps, brouillon, auto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,TRUE)',
    [eleve.school_id, q.u.id, q.u.nom, q.u.role, eleve.parent_id, parent?.nom || eleve.parent_nom || 'Parent', 'parent',
     `Rappel de paiement – Solde impayé (${eleve.nom})`, corps]
  );

  await notify(eleve.parent_id, 'Rappel de paiement', `Solde restant : ${reste} TND pour ${eleve.nom}`, 'finance', '', eleve.school_id);
  await audit(q.u, 'Relance automatique paiement', { eleve: eleve.id, parent: eleve.parent_id, montantRestant: reste });
  s.json({ ok: true, message: 'Relance envoyée avec succès' });
}));

/* --- Bulletin Scolaire Officiel (Anti-fuite inter-écoles) --- */
const peutVoirBulletin = async (u, eleve) => {
  if (u.role === 'superadmin') return true;
  if (!eleve) return false;
  // Protection zone 1 : Un utilisateur de l'école A ne peut JAMAIS voir le bulletin de l'école B
  if (u.schoolId && eleve.school_id !== u.schoolId) return false;
  if (u.role === 'admin' || u.role === 'enseignant' || u.role === 'comptable') return true;
  if (u.role === 'parent') return String(eleve.parent_id) === String(u.id);
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
  const { rows: mats } = await pool.query('SELECT * FROM matieres WHERE school_id = $1', [e.school_id]);
  const { rows: absences } = await pool.query('SELECT * FROM absences WHERE eleve_id = $1 AND deleted = FALSE', [e.id]);

  let totalPoints = 0, totalCoef = 0;
  const lignes = mats.map(m => {
    const notesMat = notes.filter(n => n.matiere_id === m.id);
    const moyenne = notesMat.length
      ? +(notesMat.reduce((s, n) => s + (+n.note || 0), 0) / notesMat.length).toFixed(2)
      : null;
    if (moyenne !== null) {
      totalPoints += moyenne * (+m.coef || 1);
      totalCoef += (+m.coef || 1);
    }
    return {
      matiere: m.nom,
      coef: +m.coef || 1,
      notes: notesMat.map(n => ({ eval: n.eval, note: +n.note })),
      moyenne
    };
  });

  const moyGen = totalCoef > 0 ? +(totalPoints / totalCoef).toFixed(2) : null;
  let mention = '—';
  if (moyGen !== null) {
    if (moyGen >= 16) mention = 'Félicitations du conseil';
    else if (moyGen >= 14) mention = "Tableau d'honneur";
    else if (moyGen >= 12) mention = 'Encouragements';
    else if (moyGen >= 10) mention = 'Passable';
    else mention = "Doit redoubler d'efforts";
  }

  s.json({
    eleve: `${e.nom} ${e.prenom || ''}`.trim(),
    eleveId: String(e.id),
    naissance: e.naissance || '—',
    classe: cls ? `${cls.niveau} ${cls.section}` : 'Non assignée',
    annee: AN,
    lignes,
    moyenneGenerale: moyGen,
    mention,
    absences: {
      total: absences.length,
      justifiees: absences.filter(a => a.justifiee).length,
      injustifiees: absences.filter(a => !a.justifiee).length
    }
  });
}));

/* =====================================================================
   CRUD GÉNÉRIQUE ÉTENDU MULTI-TENANT (Isolation Automatique)
   ===================================================================== */
const TABLES = ['classes', 'matieres', 'salles', 'eleves', 'notes', 'absences', 'emplois', 'paiements', 'devoirs', 'devoirs_rendus', 'annonces', 'preinscriptions', 'notifications'];
const AVEC_ANNEE = ['classes', 'notes', 'paiements', 'emplois', 'devoirs', 'absences', 'preinscriptions'];

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

const REVERSE_COL_MAP = {};
for (const [table, map] of Object.entries(COL_MAP)) {
  REVERSE_COL_MAP[table] = {};
  for (const [camel, snake] of Object.entries(map)) {
    REVERSE_COL_MAP[table][snake] = camel;
  }
}

function formatRow(table) {
  const rmap = REVERSE_COL_MAP[table] || {};
  return row => {
    if (!row) return null;
    const out = { _id: String(row.id), id: String(row.id) };
    for (const [key, val] of Object.entries(row)) {
      if (key === 'id') continue;
      if (key === 'created_at') { out.createdAt = val; continue; }
      if (key === 'updated_at') { out.updatedAt = val; continue; }
      const mapped = rmap[key] || key;
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
    if (['_id', 'id', 'createdAt', 'updatedAt', 'deleted', '__v', 'force', 'school_id'].includes(key)) continue;
    const col = map[key] || key;
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
  if (u.role === 'superadmin' || u.role === 'admin') return { where: '', params: [] };
  if (['classes', 'matieres', 'salles', 'annonces'].includes(k)) return { where: '', params: [] };

  if (u.role === 'enseignant') {
    if (k === 'devoirs') return { where: 'AND enseignant_id = $P', params: [u.id] };
    return { where: '', params: [] };
  }

  if (u.role === 'comptable') return { where: '', params: [] };

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

// GET générique étanche
app.get('/api/:k', auth, ent, wrap(async (q, s) => {
  let tenantWhere = '';
  const tenantParams = [];
  if (q.u.schoolId) {
    tenantWhere = ' AND school_id = $1';
    tenantParams.push(q.u.schoolId);
  }

  const scope = await portee(q.k, q.u);
  let paramIdx = tenantParams.length + 1;
  const { where: scopeWhere, params: scopeParams } = buildPorteeQuery(scope, paramIdx);

  const query = `SELECT * FROM ${q.k} WHERE deleted = FALSE ${tenantWhere} ${scopeWhere} ORDER BY created_at DESC`;
  const { rows } = await pool.query(query, [...tenantParams, ...scopeParams]);
  s.json(rows.map(formatRow(q.k)));
}));

// POST générique étanche
app.post('/api/:k', auth, ent, wrap(async (q, s) => {
  const mapped = mapBodyToColumns(q.k, q.body);
  if (AVEC_ANNEE.includes(q.k)) mapped.annee_scolaire ??= AN;

  // Injection forcée du tenant de la session
  if (q.u.schoolId) {
    mapped.school_id = q.u.schoolId;
  }

  if (q.k === 'paiements' && !mapped.recu_num) {
    mapped.recu_num = `REC-${Date.now().toString().slice(-6)}`;
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
  await audit(q.u, 'Création ' + q.k, { id: r.id });
  s.json(formatRow(q.k)(r));
}));

// PUT générique étanche
app.put('/api/:k/:id', auth, ent, wrap(async (q, s) => {
  const mapped = mapBodyToColumns(q.k, q.body);
  if (['users', 'schools'].includes(q.k)) {
    mapped.updated_at = new Date();
  }

  const cols = Object.keys(mapped);
  const vals = Object.values(mapped);
  const setClauses = cols.map((c, i) => `${c} = $${i + 2}`);

  let query = `UPDATE ${q.k} SET ${setClauses.join(', ')} WHERE id = $1`;
  const params = [q.params.id, ...vals];

  // Isolation : impossible de modifier un enregistrement d'une autre école
  if (q.u.schoolId) {
    query += ` AND school_id = $${params.length + 1}`;
    params.push(q.u.schoolId);
  }
  query += ' RETURNING *';

  const { rows } = await pool.query(query, params);
  if (!rows.length) return err(s, 404, 'Introuvable ou non autorisé pour votre établissement');
  const r = rows[0];
  await audit(q.u, 'Modification ' + q.k, { id: r.id });
  s.json(formatRow(q.k)(r));
}));

// DELETE générique étanche
app.delete('/api/:k/:id', auth, ent, wrap(async (q, s) => {
  let query = `UPDATE ${q.k} SET deleted = TRUE WHERE id = $1`;
  const params = [q.params.id];
  if (q.u.schoolId) {
    query += ` AND school_id = $2`;
    params.push(q.u.schoolId);
  }
  query += ' RETURNING id';

  const { rows } = await pool.query(query, params);
  if (!rows.length) return err(s, 404, 'Introuvable ou non autorisé pour votre établissement');
  await audit(q.u, 'Suppression ' + q.k, { id: q.params.id });
  s.json({ ok: true });
}));

/* --- Audit Journal (Admin) --- */
app.get('/api/journal/tout', auth, only('admin'), wrap(async (q, s) => {
  let query = 'SELECT * FROM logs';
  const params = [];
  if (q.u.schoolId) {
    query += ' WHERE school_id = $1';
    params.push(q.u.schoolId);
  }
  query += ' ORDER BY created_at DESC LIMIT 200';
  const { rows } = await pool.query(query, params);
  s.json(rows.map(r => ({
    _id: String(r.id), id: String(r.id),
    user: r.user_id, nom: r.nom,
    action: r.action, data: r.data,
    schoolId: r.school_id,
    createdAt: r.created_at
  })));
}));

/* --- Production Frontend Serving --- */
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
  client.release();
  console.log(`PostgreSQL connecté avec succès (${rows[0].now})`);
  await ensureDatabaseReady();
  app.listen(PORT, () => console.log(`API SaaS prête sur le port ${PORT} [Mode: ${NODE_ENV}] [Architecture: Multi-Tenant SaaS]`));
} catch (e) {
  console.error('Erreur connexion PostgreSQL:', e.message);
  process.exit(1);
}
