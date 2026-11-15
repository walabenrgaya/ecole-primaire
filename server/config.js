import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Charge server/.env quel que soit le dossier de lancement
export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(SERVER_DIR, '.env') });

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PROD = NODE_ENV === 'production';
export const PORT = +(process.env.PORT || 5000);

// Année scolaire courante (toutes les tables métier portent annee_scolaire)
export const AN = process.env.ANNEE_SCOLAIRE || '2026-2027';

// Le secret JWT est obligatoire en production : jamais de valeur par défaut codée en dur.
let secret = process.env.JWT_SECRET;
if (!secret) {
  if (IS_PROD) {
    console.error('JWT_SECRET manquant : définissez-le dans les variables d\'environnement.');
    process.exit(1);
  }
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[dev] JWT_SECRET absent : secret aléatoire généré (les sessions expirent au redémarrage).');
}
export const JWT_SECRET = secret;

// Origines autorisées (CORS). Vide = même origine uniquement.
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// URL publique de l'application (liens dans les messages et e-mails)
export const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

export const SMTP = {
  host: process.env.SMTP_HOST || '',
  port: +(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'EduPilot <no-reply@edupilot.tn>'
};

export const ROLES = ['superadmin', 'admin', 'directeur', 'enseignant', 'comptable', 'parent', 'eleve'];
// Rôles de pilotage : accès au module BI et aux vues globales de l'établissement
export const PILOTAGE = ['admin', 'directeur'];
