import { all, childrenOf } from './http.js';

/** Classes dans lesquelles un enseignant intervient (titulaire ou emploi du temps). */
export async function teacherClassIds(u, annee) {
  const rows = await all(
    `SELECT id FROM classes WHERE school_id = $1 AND enseignant_titulaire_id = $2 AND deleted = FALSE AND annee_scolaire = $3
     UNION
     SELECT DISTINCT classe_id FROM emplois WHERE school_id = $1 AND enseignant_id = $2 AND deleted = FALSE AND annee_scolaire = $3`,
    [u.schoolId, u.id, annee]
  );
  return rows.map(r => r.id);
}

/** Identifiant de l'élève lié au compte élève connecté. */
export const eleveIdOf = u => (u.eleveId ? +u.eleveId : -1);

export async function eleveClasseId(eleveId) {
  const rows = await all('SELECT classe_id FROM eleves WHERE id = $1', [eleveId]);
  return rows[0]?.classe_id || null;
}

/**
 * Restriction de lecture par rôle. Retourne un fragment SQL (alias « t »)
 * construit avec le collecteur de paramètres q.
 */
export async function readScope(table, u, q, annee) {
  const role = u.role;
  if (['superadmin', 'admin', 'directeur'].includes(role)) return '';
  const open = ['classes', 'matieres', 'salles'];

  if (table === 'annonces') {
    const cible = { enseignant: 'enseignants', parent: 'parents', eleve: 'eleves', comptable: 'tous' }[role] || 'tous';
    return ` AND t.cible IN ('tous', ${q.add(cible)})`;
  }

  if (role === 'comptable') {
    const ok = [...open, 'eleves', 'paiements', 'frais', 'depenses', 'preinscriptions'];
    return ok.includes(table) ? '' : ' AND FALSE';
  }

  if (role === 'enseignant') {
    if (open.includes(table)) return '';
    const cls = await teacherClassIds(u, annee);
    // Construction paresseuse : n'ajoute les paramètres que s'ils sont utilisés dans la requête
    const inCls = () => (cls.length ? `(${cls.map(c => q.add(c)).join(',')})` : '(NULL)');
    if (table === 'eleves') return ` AND t.classe_id IN ${inCls()}`;
    if (['notes', 'absences'].includes(table)) return ` AND t.eleve_id IN (SELECT id FROM eleves WHERE classe_id IN ${inCls()})`;
    if (table === 'devoirs') return ` AND t.enseignant_id = ${q.add(+u.id)}`;
    if (table === 'emplois') return ` AND (t.enseignant_id = ${q.add(+u.id)} OR t.classe_id IN ${inCls()})`;
    if (table === 'absences_enseignants') return ` AND t.enseignant_id = ${q.add(+u.id)}`;
    return ' AND FALSE';
  }

  if (role === 'parent') {
    if (open.includes(table) || table === 'frais') return '';
    const kids = await childrenOf(u);
    const ids = kids.map(k => k.id);
    const cls = kids.map(k => k.classe_id).filter(Boolean);
    const inIds = () => (ids.length ? `(${ids.map(i => q.add(i)).join(',')})` : '(NULL)');
    const inCls = () => (cls.length ? `(${cls.map(c => q.add(c)).join(',')})` : '(NULL)');
    if (table === 'eleves') return ` AND t.id IN ${inIds()}`;
    if (['notes', 'absences', 'paiements', 'devoirs_rendus'].includes(table)) return ` AND t.eleve_id IN ${inIds()}`;
    if (['devoirs', 'emplois'].includes(table)) return ` AND t.classe_id IN ${inCls()}`;
    return ' AND FALSE';
  }

  if (role === 'eleve') {
    if (open.includes(table)) return '';
    const eid = eleveIdOf(u);
    if (table === 'eleves') return ` AND t.id = ${q.add(eid)}`;
    if (['notes', 'absences', 'devoirs_rendus'].includes(table)) return ` AND t.eleve_id = ${q.add(eid)}`;
    if (['devoirs', 'emplois'].includes(table)) {
      const cid = await eleveClasseId(eid);
      return ` AND t.classe_id = ${q.add(cid || -1)}`;
    }
    return ' AND FALSE';
  }
  return ' AND FALSE';
}

/** Collecteur de paramètres positionnels ($1, $2, ...) */
export class Params {
  constructor(initial = []) { this.list = [...initial]; }
  add(v) { this.list.push(v); return `$${this.list.length}`; }
}
