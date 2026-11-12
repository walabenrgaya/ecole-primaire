import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import pool from '../db.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

// Enveloppe async : toute exception est transmise au gestionnaire d'erreurs central
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

function decode(token) {
  const u = jwt.verify(token, JWT_SECRET);
  return u;
}

/**
 * Authentification JWT. Le super-administrateur peut se placer dans le contexte
 * d'un établissement via l'en-tête x-school-id (lecture/assistance).
 */
export const auth = (req, res, next) => {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.u = decode(token);
  } catch {
    return res.status(401).json({ error: 'Session expirée ou invalide' });
  }
  if (req.u.role === 'superadmin') {
    const sid = parseInt(req.headers['x-school-id'], 10);
    req.u.schoolId = Number.isInteger(sid) && sid > 0 ? sid : null;
  }
  next();
};

export const optionalAuth = (req, res, next) => {
  const token = readToken(req);
  if (token) {
    try { req.u = decode(token); } catch { /* visiteur anonyme */ }
  }
  next();
};

// Restreint une route à certains rôles (le super-admin passe toujours)
export const only = (...roles) => (req, res, next) =>
  (req.u?.role === 'superadmin' || roles.includes(req.u?.role))
    ? next()
    : res.status(403).json({ error: 'Accès refusé pour votre profil' });

// Exige un établissement dans le contexte (tout sauf la console plateforme)
export const needSchool = (req, res, next) =>
  req.u?.schoolId ? next() : res.status(400).json({ error: 'Sélectionnez un établissement' });

export const toId = v => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const one = async (sql, params) => (await pool.query(sql, params)).rows[0] || null;
export const all = async (sql, params) => (await pool.query(sql, params)).rows;

// Identifiants des enfants d'un parent (dans son établissement)
export async function childrenOf(u) {
  const rows = await all('SELECT id, classe_id FROM eleves WHERE parent_id = $1 AND school_id = $2 AND deleted = FALSE', [u.id, u.schoolId]);
  return rows;
}
