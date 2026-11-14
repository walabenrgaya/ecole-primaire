import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db.js';
import { AN, PUBLIC_URL } from '../config.js';
import { auth, only, needSchool, wrap, fail, one, all, toId, childrenOf, optionalAuth } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { notify, autoMessage, sendEmail } from '../lib/notify.js';
import { situationEleve, bulletin } from '../lib/metier.js';
import { recuPdf, bulletinPdf } from '../lib/pdf.js';
import { checkCapacite } from '../lib/crud.js';
import { teacherClassIds, eleveIdOf } from '../lib/scope.js';
import { upload } from './core.js';
import { persistUpload, putFile, pdfBuffer, nextcloud } from '../lib/storage.js';

const r = express.Router();
const money = n => `${(+n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;
const fmt = d => new Date(d).toLocaleDateString('fr-FR');

/** Un utilisateur peut-il consulter le dossier de cet élève ? */
async function peutVoirEleve(u, eleve) {
  if (!eleve || +eleve.school_id !== +u.schoolId) return false;
  if (['superadmin', 'admin', 'directeur', 'comptable'].includes(u.role)) return true;
  if (u.role === 'enseignant') return (await teacherClassIds(u, AN)).includes(eleve.classe_id);
  if (u.role === 'parent') return +eleve.parent_id === +u.id;
  if (u.role === 'eleve') return +eleve.id === eleveIdOf(u);
  return false;
}

/* ============================== Devoirs ============================== */
r.get('/devoirs/:id/rendus', auth, needSchool, wrap(async (req, res) => {
  const d = await one('SELECT * FROM devoirs WHERE id = $1 AND school_id = $2 AND deleted = FALSE', [toId(req.params.id), req.u.schoolId]);
  if (!d) fail(404, 'Devoir introuvable');
  const u = req.u;
  if (u.role === 'enseignant' && +d.enseignant_id !== +u.id) fail(403, 'Ce devoir ne vous appartient pas');
  if (!['superadmin', 'admin', 'directeur', 'enseignant'].includes(u.role)) fail(403, 'Accès refusé');
  // Tous les élèves de la classe, avec statut rendu / non rendu / en retard / corrigé
  const rows = await all(
    `SELECT e.id AS eleve_id, e.nom || ' ' || e.prenom AS eleve_nom, r.id, r.statut, r.date_depot, r.fichier, r.contenu, r.note, r.bareme, r.commentaire_enseignant, r.vu_par_parent
     FROM eleves e LEFT JOIN devoirs_rendus r ON r.eleve_id = e.id AND r.devoir_id = $1 AND r.deleted = FALSE
     WHERE e.classe_id = $2 AND e.deleted = FALSE AND e.statut = 'inscrit' ORDER BY e.nom`, [d.id, d.classe_id]);
  res.json(rows.map(x => ({ ...x, statut: x.statut || 'non_rendu' })));
}));

// Dépôt (ou remplacement avant la date limite) du travail de l'élève
r.post('/devoirs/:id/rendre', auth, only('eleve', 'parent'), needSchool, upload.single('fichier'), wrap(async (req, res) => {
  const d = await one('SELECT * FROM devoirs WHERE id = $1 AND school_id = $2 AND deleted = FALSE', [toId(req.params.id), req.u.schoolId]);
  if (!d) fail(404, 'Devoir introuvable');
  let eleveId = req.u.role === 'eleve' ? eleveIdOf(req.u) : toId(req.body.eleve_id);
  if (req.u.role === 'parent' && !(await childrenOf(req.u)).some(k => k.id === eleveId)) fail(403, 'Cet élève n\'est pas votre enfant');
  const eleve = await one('SELECT * FROM eleves WHERE id = $1 AND school_id = $2 AND deleted = FALSE', [eleveId, req.u.schoolId]);
  if (!eleve || eleve.classe_id !== d.classe_id) fail(403, 'Ce devoir ne concerne pas cet élève');
  const limite = new Date(d.date_remise); limite.setHours(23, 59, 59, 999);
  const enRetard = new Date() > limite;
  const existing = await one('SELECT * FROM devoirs_rendus WHERE devoir_id = $1 AND eleve_id = $2', [d.id, eleveId]);
  if (existing?.statut === 'corrige') fail(409, 'Ce travail a déjà été corrigé');
  if (existing && enRetard) fail(409, 'La date de remise est dépassée : le dépôt ne peut plus être remplacé');
  await persistUpload(req.file);
  const fichier = req.file ? `/uploads/${req.file.filename}` : null;
  if (!fichier && !req.body.contenu) fail(400, 'Ajoutez un fichier ou un texte');
  let row;
  if (existing) {
    ({ rows: [row] } = await pool.query(
      `UPDATE devoirs_rendus SET contenu = $1, fichier = COALESCE($2, fichier), statut = 'rendu', date_depot = NOW(), deleted = FALSE WHERE id = $3 RETURNING *`,
      [req.body.contenu || existing.contenu, fichier, existing.id]));
  } else {
    ({ rows: [row] } = await pool.query(
      `INSERT INTO devoirs_rendus (school_id, devoir_id, eleve_id, eleve_nom, contenu, fichier, statut, bareme)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.u.schoolId, d.id, eleveId, `${eleve.nom} ${eleve.prenom}`, req.body.contenu || null, fichier, enRetard ? 'en_retard' : 'rendu', d.bareme]));
  }
  await notify(d.enseignant_id, 'Nouveau travail déposé', `${eleve.prenom} ${eleve.nom} – ${d.titre}${enRetard ? ' (en retard)' : ''}`, { type: 'devoir', lien: '/devoirs', schoolId: req.u.schoolId });
  await audit(req.u, 'Dépôt de devoir', { entite: 'devoirs_rendus', entiteId: row.id, apres: row });
  res.json(row);
}));

r.put('/devoirs_rendus/:id/noter', auth, only('enseignant', 'admin'), needSchool, wrap(async (req, res) => {
  const rendu = await one(
    `SELECT r.*, d.enseignant_id, d.titre, d.bareme AS bareme_devoir FROM devoirs_rendus r JOIN devoirs d ON d.id = r.devoir_id
     WHERE r.id = $1 AND r.school_id = $2`, [toId(req.params.id), req.u.schoolId]);
  if (!rendu) fail(404, 'Travail introuvable');
  if (req.u.role === 'enseignant' && +rendu.enseignant_id !== +req.u.id) fail(403, 'Ce devoir ne vous appartient pas');
  const bareme = +(req.body.bareme || rendu.bareme_devoir || 20);
  const note = +req.body.note;
  if (!Number.isFinite(note) || note < 0 || note > bareme) fail(400, `La note doit être comprise entre 0 et ${bareme}`);
  const { rows: [row] } = await pool.query(
    `UPDATE devoirs_rendus SET note = $1, bareme = $2, commentaire_enseignant = $3, statut = 'corrige' WHERE id = $4 RETURNING *`,
    [note, bareme, req.body.commentaire || null, rendu.id]);
  await audit(req.u, 'Notation de devoir', { entite: 'devoirs_rendus', entiteId: rendu.id, avant: { note: rendu.note }, apres: { note } });
  const e = await one(`SELECT parent_id, (SELECT id FROM users WHERE eleve_id = eleves.id AND role = 'eleve' LIMIT 1) AS compte FROM eleves WHERE id = $1`, [rendu.eleve_id]);
  for (const id of [e?.parent_id, e?.compte].filter(Boolean)) {
    await notify(id, 'Devoir corrigé', `${rendu.titre} : ${note}/${bareme}`, { type: 'devoir', lien: '/devoirs', schoolId: req.u.schoolId });
  }
  res.json(row);
}));

r.post('/devoirs_rendus/:id/vu', auth, only('parent'), needSchool, wrap(async (req, res) => {
  const kids = (await childrenOf(req.u)).map(k => k.id);
  const { rows } = await pool.query('UPDATE devoirs_rendus SET vu_par_parent = TRUE WHERE id = $1 AND eleve_id = ANY($2) RETURNING id', [toId(req.params.id), kids]);
  if (!rows.length) fail(404, 'Travail introuvable');
  res.json({ ok: true });
}));

// Publication du corrigé (visible après la date de remise) : notification élèves + parents
r.post('/devoirs/:id/corrige', auth, only('enseignant', 'admin'), needSchool, wrap(async (req, res) => {
  const d = await one('SELECT * FROM devoirs WHERE id = $1 AND school_id = $2 AND deleted = FALSE', [toId(req.params.id), req.u.schoolId]);
  if (!d) fail(404, 'Devoir introuvable');
  if (req.u.role === 'enseignant' && +d.enseignant_id !== +req.u.id) fail(403, 'Ce devoir ne vous appartient pas');
  const { rows: [row] } = await pool.query('UPDATE devoirs SET corrige = $1, corrige_fichier = COALESCE($2, corrige_fichier) WHERE id = $3 RETURNING *',
    [req.body.corrige || d.corrige, req.body.corrige_fichier || null, d.id]);
  const dest = await all(`SELECT parent_id AS id FROM eleves WHERE classe_id = $1 AND deleted = FALSE AND parent_id IS NOT NULL
     UNION SELECT u.id FROM users u JOIN eleves e ON e.id = u.eleve_id WHERE e.classe_id = $1`, [d.classe_id]);
  for (const x of dest) await notify(x.id, 'Correction publiée', d.titre, { type: 'devoir', lien: '/devoirs', schoolId: req.u.schoolId });
  await audit(req.u, 'Publication corrigé', { entite: 'devoirs', entiteId: d.id });
  res.json(row);
}));

/* ============================== Absences ============================= */
r.post('/absences/:id/justifier', auth, only('parent'), needSchool, wrap(async (req, res) => {
  if (!req.body.justification) fail(400, 'Motif de justification obligatoire');
  const kids = (await childrenOf(req.u)).map(k => k.id);
  const { rows } = await pool.query(
    `UPDATE absences SET justification_parent = $1, statut = 'En attente de validation' WHERE id = $2 AND eleve_id = ANY($3) AND deleted = FALSE RETURNING *`,
    [req.body.justification, toId(req.params.id), kids]);
  if (!rows.length) fail(404, 'Absence introuvable');
  await audit(req.u, 'Justification d\'absence', { entite: 'absences', entiteId: rows[0].id, apres: { justification: req.body.justification } });
  res.json(rows[0]);
}));

r.post('/absences/:id/valider', auth, only('admin', 'enseignant', 'directeur'), needSchool, wrap(async (req, res) => {
  const ok = !!req.body.validee;
  const { rows } = await pool.query(
    `UPDATE absences SET justifiee = $1, statut = $2 WHERE id = $3 AND school_id = $4 AND deleted = FALSE RETURNING *`,
    [ok, ok ? 'Justifiée' : 'Rejetée', toId(req.params.id), req.u.schoolId]);
  if (!rows.length) fail(404, 'Absence introuvable');
  await audit(req.u, 'Validation justification', { entite: 'absences', entiteId: rows[0].id, apres: { statut: rows[0].statut } });
  const e = await one('SELECT parent_id FROM eleves WHERE id = $1', [rows[0].eleve_id]);
  if (e?.parent_id) await notify(e.parent_id, `Justification ${ok ? 'acceptée' : 'refusée'}`, `Absence du ${fmt(rows[0].date)}`, { type: 'absence', lien: '/absences', schoolId: req.u.schoolId });
  res.json(rows[0]);
}));

/* ========================= Pré-inscriptions ========================== */
r.post('/preinscriptions', optionalAuth, wrap(async (req, res) => {
  const b = req.body;
  if (!b.nom || !b.prenom || !b.parent_nom || !b.parent_email || !b.niveau_demande) fail(400, 'Champs obligatoires : nom, prénom, niveau, nom et e-mail du parent');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.parent_email)) fail(400, 'Adresse e-mail invalide');
  const sid = toId(b.school_id);
  const school = sid && await one(`SELECT id FROM schools WHERE id = $1 AND status <> 'suspended'`, [sid]);
  if (!school) fail(400, 'Établissement invalide');
  const { rows: [p] } = await pool.query(
    `INSERT INTO preinscriptions (school_id, nom, prenom, naissance, genre, niveau_demande, parent_nom, parent_email, parent_tel, adresse, ville, antecedents_medicaux, annee_scolaire)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [sid, b.nom, b.prenom, b.naissance || null, b.genre === 'F' ? 'F' : 'M', b.niveau_demande, b.parent_nom, b.parent_email.toLowerCase().trim(), b.parent_tel || null, b.adresse || null, b.ville || null, b.antecedents_medicaux || 'Aucun', AN]);
  const admins = await all(`SELECT id FROM users WHERE school_id = $1 AND role IN ('admin','comptable') AND deleted = FALSE`, [sid]);
  for (const a of admins) await notify(a.id, 'Nouvelle pré-inscription', `${b.prenom} ${b.nom} (${b.niveau_demande})`, { type: 'inscription', lien: '/preinscriptions', schoolId: sid });
  await audit(req.u || null, 'Pré-inscription en ligne', { entite: 'preinscriptions', entiteId: p.id, schoolId: sid });
  res.status(201).json({ ok: true, id: p.id });
}));

r.post('/preinscriptions/:id/valider', auth, only('admin', 'comptable'), needSchool, wrap(async (req, res) => {
  const p = await one('SELECT * FROM preinscriptions WHERE id = $1 AND school_id = $2 AND deleted = FALSE', [toId(req.params.id), req.u.schoolId]);
  if (!p) fail(404, 'Demande introuvable');
  if (p.statut !== 'en_attente') fail(409, 'Cette demande a déjà été traitée');

  // Affectation : classe choisie, sinon automatique (classe du niveau demandé la moins remplie)
  let classeId = toId(req.body.classe_id);
  if (!classeId) {
    const c = await one(`SELECT c.id FROM classes c WHERE c.school_id = $1 AND c.niveau = $2 AND c.annee_scolaire = $3 AND c.deleted = FALSE
      AND (SELECT COUNT(*) FROM eleves e WHERE e.classe_id = c.id AND e.deleted = FALSE AND e.statut = 'inscrit') < c.cap
      ORDER BY (SELECT COUNT(*) FROM eleves e WHERE e.classe_id = c.id AND e.deleted = FALSE AND e.statut = 'inscrit') LIMIT 1`,
      [req.u.schoolId, p.niveau_demande, AN]);
    if (!c) fail(409, `Aucune place disponible en ${p.niveau_demande} : créez une classe ou choisissez-en une.`);
    classeId = c.id;
  } else {
    if (!(await one('SELECT id FROM classes WHERE id = $1 AND school_id = $2', [classeId, req.u.schoolId]))) fail(400, 'Classe invalide');
    await checkCapacite(classeId);
  }

  const client = await pool.connect();
  let motDePasse = null;
  try {
    await client.query('BEGIN');
    let parent = (await client.query('SELECT * FROM users WHERE LOWER(email) = $1', [p.parent_email])).rows[0];
    if (parent && +parent.school_id !== +req.u.schoolId) throw Object.assign(new Error('Cet e-mail parent appartient à un autre établissement'), { status: 409 });
    if (!parent) {
      motDePasse = crypto.randomBytes(6).toString('base64url'); // mot de passe temporaire unique
      parent = (await client.query(
        `INSERT INTO users (school_id, nom, email, hash, role, telephone) VALUES ($1,$2,$3,$4,'parent',$5) RETURNING *`,
        [req.u.schoolId, p.parent_nom, p.parent_email, await bcrypt.hash(motDePasse, 10), p.parent_tel])).rows[0];
    }
    const eleve = (await client.query(
      `INSERT INTO eleves (school_id, nom, prenom, matricule, naissance, genre, ville, classe_id, parent_id, parent_nom, parent_email, parent_tel, antecedents_medicaux, annee_entree, annee_scolaire)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
      [req.u.schoolId, p.nom, p.prenom, `EL-${Date.now().toString(36).toUpperCase()}`, p.naissance || '2019-01-01', p.genre, p.ville, classeId, parent.id, p.parent_nom, p.parent_email, p.parent_tel, p.antecedents_medicaux, AN])).rows[0];
    await client.query(`UPDATE preinscriptions SET statut = 'validee', eleve_cree_id = $1 WHERE id = $2`, [eleve.id, p.id]);
    await client.query('COMMIT');
    await audit(req.u, 'Validation pré-inscription', { entite: 'preinscriptions', entiteId: p.id, apres: { eleve: eleve.id, classe: classeId } });
    if (motDePasse) {
      await sendEmail({ to: p.parent_email, subject: 'Inscription validée – vos identifiants',
        text: `Bonjour ${p.parent_nom},\n\nL'inscription de ${p.prenom} est validée.\nIdentifiant : ${p.parent_email}\nMot de passe temporaire : ${motDePasse}\n\nMerci de le modifier à la première connexion.`,
        schoolId: req.u.schoolId, destinataireId: parent.id, reference: `preinscription:${p.id}` });
    }
    res.json({ ok: true, eleve, identifiants: motDePasse ? { email: p.parent_email, motDePasse } : null });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

r.post('/preinscriptions/:id/rejeter', auth, only('admin', 'comptable'), needSchool, wrap(async (req, res) => {
  const { rows } = await pool.query(`UPDATE preinscriptions SET statut = 'rejetee' WHERE id = $1 AND school_id = $2 AND statut = 'en_attente' RETURNING *`, [toId(req.params.id), req.u.schoolId]);
  if (!rows.length) fail(404, 'Demande introuvable ou déjà traitée');
  await audit(req.u, 'Rejet pré-inscription', { entite: 'preinscriptions', entiteId: rows[0].id });
  res.json({ ok: true });
}));

/* ============================== Finances ============================= */
async function nextRecu(schoolId, annee) {
  const n = (await one(`SELECT COUNT(*)::int + 1 AS n FROM paiements WHERE school_id = $1 AND annee_scolaire = $2`, [schoolId, annee])).n;
  return `R${annee.slice(2, 4)}${annee.slice(7, 9)}-${String(n).padStart(5, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/**
 * Enregistrement d'un paiement (§8.2) :
 * 1. mise à jour du solde, 2. reçu PDF disponible dans le dossier de l'élève,
 * 3. message automatique au parent (montant, date, mode, solde, lien du reçu),
 * 4. journalisation de l'envoi.
 */
r.post('/paiements', auth, only('admin', 'comptable'), needSchool, wrap(async (req, res) => {
  const b = req.body;
  const eleve = await one('SELECT * FROM eleves WHERE id = $1 AND school_id = $2 AND deleted = FALSE', [toId(b.eleve_id), req.u.schoolId]);
  if (!eleve) fail(400, 'Élève introuvable dans votre établissement');
  const montant = +b.montant;
  if (!(montant > 0)) fail(400, 'Le montant doit être positif');
  const modes = ['Espèces', 'Virement', 'Mobile money', 'Chèque'];
  if (!modes.includes(b.mode)) fail(400, 'Mode de paiement invalide');
  const date = b.date || new Date().toISOString().slice(0, 10);
  const { rows: [p] } = await pool.query(
    `INSERT INTO paiements (school_id, eleve_id, montant, mode, type, recu_num, date, annee_scolaire) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.u.schoolId, eleve.id, montant, b.mode, b.type || 'Scolarité', await nextRecu(req.u.schoolId, AN), date, AN]);
  await audit(req.u, 'Enregistrement paiement', { entite: 'paiements', entiteId: p.id, apres: p });

  const situation = await situationEleve(eleve, AN);
  if (nextcloud) {
    // Archivage du reçu PDF dans l'espace Nextcloud de l'établissement
    const school = await one('SELECT * FROM schools WHERE id = $1', [req.u.schoolId]);
    const classe = eleve.classe_id ? await one(`SELECT niveau || ' ' || section AS l FROM classes WHERE id = $1`, [eleve.classe_id]) : null;
    pdfBuffer(recuPdf, { school, paiement: p, eleve, classe: classe?.l, situation })
      .then(buf => putFile(`${school.code}/recus/${AN}/${p.recu_num}.pdf`, buf, 'application/pdf'))
      .catch(e => console.error('Archivage Nextcloud du reçu :', e.message));
  }
  const lien = `${PUBLIC_URL}/recu/${p.id}`;
  let envoi = { message: 'aucun parent rattaché', email: null };
  const parent = eleve.parent_id && await one('SELECT id, nom, email, role FROM users WHERE id = $1 AND deleted = FALSE', [eleve.parent_id]);
  if (parent) {
    const corps = [
      `Madame, Monsieur ${parent.nom},`,
      '',
      `Nous accusons réception de votre paiement pour ${eleve.prenom} ${eleve.nom} :`,
      `• Montant payé : ${money(p.montant)}`,
      `• Date : ${fmt(p.date)}`,
      `• Mode de paiement : ${p.mode}`,
      `• Objet : ${p.type}`,
      `• Nouveau solde restant : ${money(situation.reste)}`,
      '',
      `Reçu n° ${p.recu_num} téléchargeable ici : ${lien}`,
      '',
      'Le service financier'
    ].join('\n');
    const r2 = await autoMessage({
      schoolId: req.u.schoolId, from: req.u, to: parent, eleveId: eleve.id, categorie: 'paiement',
      objet: `Paiement reçu – ${money(p.montant)} (${eleve.prenom})`, corps, reference: `paiement:${p.id}`, lien: `/recu/${p.id}`
    });
    envoi = { message: 'envoyé', email: r2.emailStatut };
  }
  res.status(201).json({ paiement: p, situation, envoi });
}));

// Reçu PDF (élève / parent concerné ou personnel financier)
r.get('/paiements/:id/recu.pdf', auth, needSchool, wrap(async (req, res) => {
  const p = await one('SELECT * FROM paiements WHERE id = $1 AND school_id = $2 AND deleted = FALSE', [toId(req.params.id), req.u.schoolId]);
  if (!p) fail(404, 'Paiement introuvable');
  const eleve = await one('SELECT * FROM eleves WHERE id = $1', [p.eleve_id]);
  if (!(await peutVoirEleve(req.u, eleve)) || req.u.role === 'enseignant') fail(403, 'Accès refusé');
  const school = await one('SELECT * FROM schools WHERE id = $1', [p.school_id]);
  const classe = eleve.classe_id ? await one(`SELECT niveau || ' ' || section AS l FROM classes WHERE id = $1`, [eleve.classe_id]) : null;
  const situation = await situationEleve(eleve, p.annee_scolaire);
  recuPdf(res, { school, paiement: p, eleve, classe: classe?.l, situation });
}));

r.get('/eleves/:id/situation', auth, needSchool, wrap(async (req, res) => {
  const eleve = await one('SELECT * FROM eleves WHERE id = $1 AND school_id = $2', [toId(req.params.id), req.u.schoolId]);
  if (!(await peutVoirEleve(req.u, eleve)) || req.u.role === 'enseignant') fail(403, 'Accès refusé');
  const situation = await situationEleve(eleve, AN);
  const paiements = await all('SELECT * FROM paiements WHERE eleve_id = $1 AND deleted = FALSE ORDER BY date DESC', [eleve.id]);
  res.json({ ...situation, paiements });
}));

async function listeImpayes(schoolId) {
  const rows = await all(
    `SELECT e.id, e.nom, e.prenom, e.parent_id, e.parent_nom, e.parent_tel, e.parent_email, c.niveau, c.niveau || ' ' || c.section AS classe,
       COALESCE(f1.inscription, f2.inscription, 0) + COALESCE(f1.scolarite, f2.scolarite, 0) AS du,
       COALESCE((SELECT SUM(montant) FROM paiements p WHERE p.eleve_id = e.id AND p.deleted = FALSE AND p.annee_scolaire = $2), 0) AS paye,
       (SELECT MAX(date) FROM paiements p WHERE p.eleve_id = e.id AND p.deleted = FALSE) AS dernier_paiement,
       (SELECT MAX(created_at) FROM messages m WHERE m.eleve_id = e.id AND m.categorie = 'rappel') AS derniere_relance
     FROM eleves e LEFT JOIN classes c ON c.id = e.classe_id
     LEFT JOIN frais f1 ON f1.school_id = e.school_id AND f1.annee_scolaire = $2 AND f1.niveau = c.niveau AND f1.deleted = FALSE
     LEFT JOIN frais f2 ON f2.school_id = e.school_id AND f2.annee_scolaire = $2 AND f2.niveau = 'Tous' AND f2.deleted = FALSE
     WHERE e.school_id = $1 AND e.deleted = FALSE AND e.statut = 'inscrit' AND e.annee_scolaire = $2`, [schoolId, AN]);
  return rows.map(x => ({ ...x, du: +x.du, paye: +x.paye, reste: Math.max(0, +x.du - +x.paye) })).filter(x => x.reste > 0).sort((a, b) => b.reste - a.reste);
}

r.get('/finances/impayes', auth, only('admin', 'comptable', 'directeur'), needSchool, wrap(async (req, res) => {
  res.json(await listeImpayes(req.u.schoolId));
}));

async function relancer(u, eleve, reste) {
  const parent = await one('SELECT id, nom, email, role FROM users WHERE id = $1 AND deleted = FALSE', [eleve.parent_id]);
  if (!parent) return false;
  const corps = `Madame, Monsieur ${parent.nom},\n\nSauf erreur de notre part, il reste un solde de ${money(reste)} pour la scolarité de ${eleve.prenom} ${eleve.nom} (année ${AN}).\n\nMerci de régulariser la situation auprès du service financier.\n\nCordialement,\nLa direction`;
  await autoMessage({ schoolId: eleve.school_id, from: u, to: parent, eleveId: eleve.id, categorie: 'rappel', objet: `Rappel de paiement – ${eleve.prenom} ${eleve.nom}`, corps, reference: `relance:${eleve.id}` });
  return true;
}

r.post('/finances/relancer/:eleveId', auth, only('admin', 'comptable'), needSchool, wrap(async (req, res) => {
  const eleve = await one('SELECT * FROM eleves WHERE id = $1 AND school_id = $2', [toId(req.params.eleveId), req.u.schoolId]);
  if (!eleve?.parent_id) fail(404, 'Élève ou parent introuvable');
  const { reste } = await situationEleve(eleve, AN);
  if (reste <= 0) fail(409, 'Aucun solde impayé');
  await relancer(req.u, eleve, reste);
  await audit(req.u, 'Relance impayé', { entite: 'eleves', entiteId: eleve.id, data: { reste } });
  res.json({ ok: true });
}));

/**
 * Relances automatiques : un rappel par élève impayé si aucune relance depuis 30 jours.
 * Exécutée chaque jour par le serveur, et déclenchable manuellement.
 */
export async function relancesAutomatiques(schoolId = null) {
  const schools = schoolId ? [{ id: schoolId }] : await all(`SELECT id FROM schools WHERE status <> 'suspended'`);
  let total = 0;
  for (const s of schools) {
    const expediteur = await one(`SELECT id, nom, role FROM users WHERE school_id = $1 AND role IN ('comptable','admin') AND deleted = FALSE ORDER BY role = 'comptable' DESC LIMIT 1`, [s.id]);
    if (!expediteur) continue;
    for (const x of await listeImpayes(s.id)) {
      if (!x.parent_id) continue;
      if (x.derniere_relance && Date.now() - new Date(x.derniere_relance) < 30 * 864e5) continue;
      if (await relancer(expediteur, { ...x, school_id: s.id }, x.reste)) total++;
    }
  }
  return total;
}

r.post('/finances/relances-auto', auth, only('admin', 'comptable'), needSchool, wrap(async (req, res) => {
  const n = await relancesAutomatiques(req.u.schoolId);
  await audit(req.u, 'Relances automatiques', { data: { envoyees: n } });
  res.json({ ok: true, envoyees: n });
}));

/* ============================== Bulletins ============================ */
r.get('/bulletin/:id', auth, needSchool, wrap(async (req, res) => {
  const eleve = await one('SELECT * FROM eleves WHERE id = $1 AND school_id = $2', [toId(req.params.id), req.u.schoolId]);
  if (!(await peutVoirEleve(req.u, eleve)) || req.u.role === 'comptable') fail(404, 'Bulletin introuvable');
  const b = await bulletin(eleve.id, req.u.schoolId, { annee: req.query.annee || AN, trimestre: toId(req.query.trimestre) });
  if (req.query.format === 'pdf') return bulletinPdf(res, b);
  res.json(b);
}));

/* ======================= Import / export CSV ========================= */
const CSV_COLS = ['matricule', 'nom', 'prenom', 'naissance', 'genre', 'ville', 'classe', 'parent_nom', 'parent_email', 'parent_tel', 'antecedents_medicaux', 'annee_entree', 'statut'];
const csvCell = v => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

r.get('/export/eleves.csv', auth, only('admin', 'comptable', 'directeur'), needSchool, wrap(async (req, res) => {
  const rows = await all(
    `SELECT e.*, c.niveau || ' ' || c.section AS classe FROM eleves e LEFT JOIN classes c ON c.id = e.classe_id
     WHERE e.school_id = $1 AND e.deleted = FALSE AND e.annee_scolaire = $2 ORDER BY e.nom`, [req.u.schoolId, AN]);
  const csv = '﻿' + [CSV_COLS.join(';'), ...rows.map(r => CSV_COLS.map(c => csvCell(r[c])).join(';'))].join('\r\n');
  await audit(req.u, 'Export CSV élèves', { data: { lignes: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="eleves-${AN}.csv"`);
  res.send(csv);
}));

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const sep = lines[0].includes(';') ? ';' : ',';
  const split = line => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const head = split(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).map(l => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

r.post('/import/eleves', auth, only('admin'), needSchool, express.text({ type: '*/*', limit: '5mb' }), wrap(async (req, res) => {
  const lignes = parseCsv(String(req.body || ''));
  if (!lignes.length) fail(400, 'Fichier vide ou invalide');
  const classes = await all(`SELECT id, niveau || ' ' || section AS l FROM classes WHERE school_id = $1 AND annee_scolaire = $2 AND deleted = FALSE`, [req.u.schoolId, AN]);
  let crees = 0; const erreurs = [];
  for (const [i, l] of lignes.entries()) {
    try {
      if (!l.nom || !l.prenom || !l.naissance) throw new Error('nom, prénom et naissance obligatoires');
      const classe = classes.find(c => c.l.toLowerCase() === String(l.classe || '').toLowerCase());
      await pool.query(
        `INSERT INTO eleves (school_id, matricule, nom, prenom, naissance, genre, ville, classe_id, parent_nom, parent_email, parent_tel, antecedents_medicaux, annee_entree, annee_scolaire)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [req.u.schoolId, l.matricule || `EL-${Date.now().toString(36).toUpperCase()}${i}`, l.nom, l.prenom, l.naissance, l.genre === 'F' ? 'F' : 'M', l.ville || null, classe?.id || null, l.parent_nom || null, l.parent_email || null, l.parent_tel || null, l.antecedents_medicaux || 'Aucun', l.annee_entree || AN, AN]);
      crees++;
    } catch (e) {
      erreurs.push({ ligne: i + 2, erreur: e.message });
    }
  }
  await audit(req.u, 'Import CSV élèves', { data: { crees, erreurs: erreurs.length } });
  res.json({ crees, erreurs });
}));

/* ================================ RGPD =============================== */
// Portabilité : dossier complet de l'élève au format JSON
r.get('/rgpd/eleves/:id', auth, only('admin', 'parent'), needSchool, wrap(async (req, res) => {
  const eleve = await one('SELECT * FROM eleves WHERE id = $1 AND school_id = $2', [toId(req.params.id), req.u.schoolId]);
  if (!(await peutVoirEleve(req.u, eleve))) fail(404, 'Élève introuvable');
  const [notes, absences, paiements] = await Promise.all([
    all('SELECT * FROM notes WHERE eleve_id = $1 AND deleted = FALSE', [eleve.id]),
    all('SELECT * FROM absences WHERE eleve_id = $1 AND deleted = FALSE', [eleve.id]),
    all('SELECT * FROM paiements WHERE eleve_id = $1 AND deleted = FALSE', [eleve.id])
  ]);
  await audit(req.u, 'Export RGPD (portabilité)', { entite: 'eleves', entiteId: eleve.id });
  res.setHeader('Content-Disposition', `attachment; filename="dossier-${eleve.matricule}.json"`);
  res.json({ eleve, notes, absences, paiements, exporte_le: new Date() });
}));

// Droit à l'effacement : anonymisation des données personnelles (les données comptables restent)
r.post('/rgpd/eleves/:id/anonymiser', auth, only('admin'), needSchool, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE eleves SET nom = 'ANONYME', prenom = 'Élève ' || id, photo = NULL, ville = NULL, parent_nom = NULL, parent_email = NULL, parent_tel = NULL,
       antecedents_medicaux = NULL, statut = 'radie', consentement_rgpd = FALSE WHERE id = $1 AND school_id = $2 RETURNING id`,
    [toId(req.params.id), req.u.schoolId]);
  if (!rows.length) fail(404, 'Élève introuvable');
  await audit(req.u, 'Effacement RGPD (anonymisation)', { entite: 'eleves', entiteId: rows[0].id });
  res.json({ ok: true });
}));

export default r;
