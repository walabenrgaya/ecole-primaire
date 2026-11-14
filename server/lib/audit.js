import pool from '../db.js';

const SENSIBLE = ['hash', 'password'];

function clean(obj) {
  if (!obj) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!SENSIBLE.includes(k)) out[k] = v;
  }
  return out;
}

// Ne conserve que les champs réellement modifiés (anciennes / nouvelles valeurs)
export function diff(avant, apres) {
  if (!avant || !apres) return { avant: clean(avant), apres: clean(apres) };
  const a = {}, b = {};
  for (const k of Object.keys(apres)) {
    if (SENSIBLE.includes(k)) continue;
    if (JSON.stringify(avant[k]) !== JSON.stringify(apres[k])) {
      a[k] = avant[k];
      b[k] = apres[k];
    }
  }
  return { avant: a, apres: b };
}

/**
 * Journalise une action : utilisateur, date, entité, anciennes et nouvelles valeurs.
 */
export async function audit(u, action, { entite = null, entiteId = null, avant = null, apres = null, data = null, schoolId } = {}) {
  try {
    await pool.query(
      `INSERT INTO logs (school_id, user_id, nom, role, action, entite, entite_id, avant, apres, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        schoolId ?? u?.schoolId ?? null,
        u?.id ? String(u.id) : null,
        u?.nom || 'Visiteur',
        u?.role || null,
        action,
        entite,
        entiteId != null ? String(entiteId) : null,
        avant ? JSON.stringify(clean(avant)) : null,
        apres ? JSON.stringify(clean(apres)) : null,
        data ? JSON.stringify(data) : null
      ]
    );
  } catch (e) {
    console.error('Journal d\'audit :', e.message);
  }
}
