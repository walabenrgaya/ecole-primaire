import nodemailer from 'nodemailer';
import pool from '../db.js';
import { SMTP } from '../config.js';

let transporter = null;
if (SMTP.host) {
  transporter = nodemailer.createTransport({
    host: SMTP.host,
    port: SMTP.port,
    secure: SMTP.port === 465,
    auth: SMTP.user ? { user: SMTP.user, pass: SMTP.pass } : undefined
  });
}

export async function logEnvoi({ schoolId, canal, destinataireId, destinataire, objet, reference, statut, erreur }) {
  try {
    await pool.query(
      `INSERT INTO envois (school_id, canal, destinataire_id, destinataire, objet, reference, statut, erreur)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [schoolId || null, canal, destinataireId || null, destinataire || null, objet || null, reference || null, statut, erreur || null]
    );
  } catch (e) {
    console.error('Journal des envois :', e.message);
  }
}

/** Notification in-app (cloche) */
export async function notify(userId, titre, message, { type = 'info', lien = '', schoolId = null } = {}) {
  if (!userId) return;
  try {
    await pool.query(
      'INSERT INTO notifications (school_id, user_id, titre, message, type, lien) VALUES ($1,$2,$3,$4,$5,$6)',
      [schoolId, userId, titre, message, type, lien]
    );
  } catch (e) {
    console.error('Notification :', e.message);
  }
}

/**
 * Envoi d'e-mail via SMTP (SendGrid ou autre). Sans configuration SMTP,
 * l'envoi est simulé et journalisé avec le statut « simule ».
 */
export async function sendEmail({ to, subject, text, schoolId, destinataireId, reference }) {
  if (!to) return 'echec';
  if (!transporter) {
    await logEnvoi({ schoolId, canal: 'email', destinataireId, destinataire: to, objet: subject, reference, statut: 'simule' });
    return 'simule';
  }
  try {
    await transporter.sendMail({ from: SMTP.from, to, subject, text });
    await logEnvoi({ schoolId, canal: 'email', destinataireId, destinataire: to, objet: subject, reference, statut: 'envoye' });
    return 'envoye';
  } catch (e) {
    await logEnvoi({ schoolId, canal: 'email', destinataireId, destinataire: to, objet: subject, reference, statut: 'echec', erreur: e.message });
    return 'echec';
  }
}

/**
 * Message automatique de l'établissement vers un utilisateur (messagerie interne)
 * + notification + e-mail, avec journalisation de chaque canal.
 */
export async function autoMessage({ schoolId, from, to, objet, corps, categorie = 'information', eleveId = null, reference = null, lien = '' }) {
  const { rows } = await pool.query(
    `INSERT INTO messages (school_id, de_id, de_nom, de_role, a_id, a_nom, a_role, eleve_id, categorie, objet, corps, brouillon, auto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,TRUE) RETURNING id`,
    [schoolId, from.id, from.nom, from.role, to.id, to.nom, to.role, eleveId, categorie, objet, corps]
  );
  await logEnvoi({ schoolId, canal: 'messagerie', destinataireId: to.id, destinataire: to.nom, objet, reference, statut: 'envoye' });
  await notify(to.id, objet, corps.split('\n').find(l => l.trim()) || objet, { type: categorie, lien: lien || '/messages', schoolId });
  const emailStatut = await sendEmail({ to: to.email, subject: objet, text: corps, schoolId, destinataireId: to.id, reference });
  return { messageId: rows[0].id, emailStatut };
}
