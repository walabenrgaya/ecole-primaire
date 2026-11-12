import { AN } from '../config.js';
import { one, all } from './http.js';

/* ------------------------------ Finances ------------------------------ */

/** Frais dus pour un élève (grille tarifaire de son niveau, sinon « Tous »). */
export async function fraisEleve(eleve, annee = AN) {
  const niveau = eleve.classe_id ? (await one('SELECT niveau FROM classes WHERE id = $1', [eleve.classe_id]))?.niveau : null;
  const grille = await one(
    `SELECT * FROM frais WHERE school_id = $1 AND annee_scolaire = $2 AND deleted = FALSE AND niveau IN ($3, 'Tous')
     ORDER BY CASE WHEN niveau = $3 THEN 0 ELSE 1 END LIMIT 1`,
    [eleve.school_id, annee, niveau || 'Tous']
  );
  const inscription = +(grille?.inscription || 0);
  const scolarite = +(grille?.scolarite || 0);
  return { inscription, scolarite, total: inscription + scolarite, nbTranches: grille?.nb_tranches || 3, grille: !!grille };
}

export async function situationEleve(eleve, annee = AN) {
  const frais = await fraisEleve(eleve, annee);
  const paye = +((await one(
    'SELECT COALESCE(SUM(montant), 0) AS s FROM paiements WHERE eleve_id = $1 AND annee_scolaire = $2 AND deleted = FALSE',
    [eleve.id, annee]
  ))?.s || 0);
  return { du: frais.total, paye, reste: Math.max(0, +(frais.total - paye).toFixed(2)), frais };
}

/* ------------------------------ Bulletins ----------------------------- */

const POIDS_CC = 0.4;
const POIDS_EXAM = 0.6;
const avg = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
const r2 = x => (x == null ? null : Math.round(x * 100) / 100);

export function mention(m) {
  if (m == null) return '—';
  if (m >= 16) return 'Félicitations';
  if (m >= 14) return 'Tableau d\'honneur';
  if (m >= 12) return 'Encouragements';
  if (m >= 10) return 'Passable';
  return 'Doit redoubler d\'efforts';
}

/**
 * Moyenne d'une matière sur un trimestre : 40 % contrôle continu + 60 % examen
 * (si une seule composante existe, elle compte pour 100 %).
 */
export function moyenneMatiere(notes) {
  const cc = avg(notes.filter(n => n.eval === 'Contrôle continu').map(n => +n.note));
  const ex = avg(notes.filter(n => n.eval === 'Examen').map(n => +n.note));
  if (cc != null && ex != null) return cc * POIDS_CC + ex * POIDS_EXAM;
  return cc ?? ex;
}

/** Calcule les moyennes (par matière, générale) d'un ensemble d'élèves. */
export function calculMoyennes(eleves, matieres, notes, trimestre = null) {
  const parEleve = new Map(eleves.map(e => [e.id, []]));
  for (const n of notes) if (parEleve.has(n.eleve_id) && (!trimestre || +n.trimestre === +trimestre)) parEleve.get(n.eleve_id).push(n);
  const res = new Map();
  for (const e of eleves) {
    const ns = parEleve.get(e.id);
    let pts = 0, coefs = 0;
    const lignes = matieres.map(m => {
      const nm = ns.filter(n => n.matiere_id === m.id);
      let moy;
      if (trimestre) moy = moyenneMatiere(nm);
      else moy = avg([1, 2, 3].map(t => moyenneMatiere(nm.filter(n => +n.trimestre === t))).filter(x => x != null));
      if (moy != null) { pts += moy * +m.coef; coefs += +m.coef; }
      return { matiere_id: m.id, matiere: m.nom, coef: +m.coef, notes: nm.map(n => ({ eval: n.eval, trimestre: n.trimestre, note: +n.note })), moyenne: r2(moy) };
    });
    res.set(e.id, { lignes, moyenne: coefs ? r2(pts / coefs) : null });
  }
  return res;
}

export async function bulletin(eleveId, schoolId, { annee = AN, trimestre = null } = {}) {
  const eleve = await one('SELECT * FROM eleves WHERE id = $1 AND school_id = $2', [eleveId, schoolId]);
  if (!eleve) return null;
  const classe = eleve.classe_id ? await one('SELECT * FROM classes WHERE id = $1', [eleve.classe_id]) : null;
  const school = await one('SELECT name, adresse, telephone, ville FROM schools WHERE id = $1', [schoolId]);
  const matieres = await all(
    `SELECT * FROM matieres WHERE school_id = $1 AND deleted = FALSE AND niveau IN ($2, 'Tous') ORDER BY coef DESC, nom`,
    [schoolId, classe?.niveau || 'Tous']
  );
  const camarades = classe
    ? await all(`SELECT id FROM eleves WHERE classe_id = $1 AND deleted = FALSE AND statut = 'inscrit'`, [classe.id])
    : [{ id: eleve.id }];
  const ids = camarades.map(c => c.id);
  if (!ids.includes(eleve.id)) ids.push(eleve.id);
  const notes = await all(
    'SELECT eleve_id, matiere_id, eval, trimestre, note FROM notes WHERE eleve_id = ANY($1) AND annee_scolaire = $2 AND deleted = FALSE',
    [ids, annee]
  );
  const moy = calculMoyennes(ids.map(id => ({ id })), matieres, notes, trimestre);
  const moi = moy.get(eleve.id);
  const classement = [...moy.entries()].filter(([, v]) => v.moyenne != null).sort((a, b) => b[1].moyenne - a[1].moyenne);
  const rang = classement.findIndex(([id]) => id === eleve.id) + 1;
  const moyennesClasse = classement.map(([, v]) => v.moyenne);
  const absences = await all(
    'SELECT justifiee, type FROM absences WHERE eleve_id = $1 AND annee_scolaire = $2 AND deleted = FALSE',
    [eleve.id, annee]
  );
  return {
    school,
    eleve: { id: eleve.id, nom: eleve.nom, prenom: eleve.prenom, matricule: eleve.matricule, naissance: eleve.naissance },
    classe: classe ? `${classe.niveau} ${classe.section}` : 'Non affecté',
    annee,
    trimestre: trimestre ? +trimestre : null,
    lignes: moi.lignes,
    moyenneGenerale: moi.moyenne,
    mention: mention(moi.moyenne),
    rang: rang || null,
    effectif: classement.length,
    moyenneClasse: moyennesClasse.length ? r2(avg(moyennesClasse)) : null,
    plusHaute: moyennesClasse[0] ?? null,
    plusBasse: moyennesClasse[moyennesClasse.length - 1] ?? null,
    absences: {
      total: absences.filter(a => a.type !== 'Retard').length,
      retards: absences.filter(a => a.type === 'Retard').length,
      justifiees: absences.filter(a => a.justifiee).length,
      injustifiees: absences.filter(a => !a.justifiee).length
    },
    ponderation: { controleContinu: POIDS_CC, examen: POIDS_EXAM }
  };
}
