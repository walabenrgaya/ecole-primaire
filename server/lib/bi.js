/* =====================================================================
   MODULE BUSINESS INTELLIGENCE & AIDE À LA DÉCISION
   Calcule les 10 tableaux de bord à partir des données opérationnelles
   d'un établissement (entrepôt logique en mémoire, rafraîchi toutes les 60 s).
   ===================================================================== */
import { AN } from '../config.js';
import { all, one } from './http.js';
import { calculMoyennes } from './metier.js';

/* ----------------------------- Outils ------------------------------- */
export const anneePrec = (a, n = 1) => { const y = +a.slice(0, 4) - n; return `${y}-${y + 1}`; };
const debutAnnee = a => new Date(`${a.slice(0, 4)}-09-01`);
const finAnnee = a => new Date(`${a.slice(5, 9)}-06-30`);
const r1 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const pct = (a, b) => (b ? r1((a / b) * 100) : 0);
const avg = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
const sum = arr => arr.reduce((s, x) => s + (+x || 0), 0);
const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] ||= []).push(x); return m; }, {});
const MOIS = ['Sept', 'Oct', 'Nov', 'Déc', 'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août'];
const moisScolaire = d => (new Date(d).getMonth() + 4) % 12; // septembre = 0
const NIVEAUX = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];

export function regression(points) {
  const n = points.length;
  if (n < 2) return { a: 0, b: points[0]?.[1] || 0 };
  const mx = avg(points.map(p => p[0])), my = avg(points.map(p => p[1]));
  const num = sum(points.map(([x, y]) => (x - mx) * (y - my)));
  const den = sum(points.map(([x]) => (x - mx) ** 2));
  const a = den ? num / den : 0;
  return { a, b: my - a * mx };
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = avg(xs), my = avg(ys);
  const num = sum(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const den = Math.sqrt(sum(xs.map(x => (x - mx) ** 2)) * sum(ys.map(y => (y - my) ** 2)));
  return den ? r2(num / den) : null;
}

/** Jours de classe (lundi–vendredi) écoulés dans une année scolaire. */
function joursEcoules(annee, now = new Date()) {
  const start = new Date(`${annee.slice(0, 4)}-09-15`);
  const end = new Date(Math.min(finAnnee(annee).getTime(), now.getTime()));
  let n = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) if (d.getDay() >= 1 && d.getDay() <= 5) n++;
  return Math.max(n, 1);
}

const poidsAbsence = a => (a.type === 'Retard' ? 0 : a.creneau === 'Journée entière' ? 1 : 0.5);
const heures = e => { const [h1, m1] = String(e.debut).split(':').map(Number); const [h2, m2] = String(e.fin).split(':').map(Number); return (h2 * 60 + m2 - h1 * 60 - m1) / 60; };

/* ---------------------- Chargement des données ---------------------- */
const cache = new Map();

export async function dataset(schoolId) {
  const hit = cache.get(schoolId);
  if (hit && Date.now() - hit.t < 60_000) return hit.d;
  const P = anneePrec(AN);
  const [school, eleves, classes, matieres, notes, absences, paiements, frais, depenses, emplois, users, absEns, salles, messages, notifs, preins] = await Promise.all([
    one('SELECT * FROM schools WHERE id = $1', [schoolId]),
    all('SELECT * FROM eleves WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT * FROM classes WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT * FROM matieres WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT eleve_id, matiere_id, eval, trimestre, note::float AS note, annee_scolaire FROM notes WHERE school_id = $1 AND deleted = FALSE AND annee_scolaire IN ($2, $3)', [schoolId, AN, P]),
    all('SELECT eleve_id, date, type, creneau, justifiee, statut, annee_scolaire FROM absences WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT eleve_id, montant::float AS montant, mode, type, date, annee_scolaire FROM paiements WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT * FROM frais WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT date, categorie, montant::float AS montant, annee_scolaire FROM depenses WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT * FROM emplois WHERE school_id = $1 AND deleted = FALSE AND annee_scolaire = $2', [schoolId, AN]),
    all(`SELECT id, nom, role, specialite, heures_max, last_login, eleve_id FROM users WHERE school_id = $1 AND deleted = FALSE`, [schoolId]),
    all('SELECT * FROM absences_enseignants WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT * FROM salles WHERE school_id = $1 AND deleted = FALSE', [schoolId]),
    all('SELECT id, de_id, de_role, a_id, a_role, categorie, lu, traite, auto, eleve_id, created_at FROM messages WHERE school_id = $1 AND brouillon = FALSE', [schoolId]),
    all(`SELECT n.user_id, n.lu, n.created_at FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.school_id = $1 AND u.role = 'parent'`, [schoolId]),
    all('SELECT statut, niveau_demande, ville, annee_scolaire FROM preinscriptions WHERE school_id = $1 AND deleted = FALSE', [schoolId])
  ]);
  const d = { school, eleves, classes, matieres, notes, absences, paiements, frais, depenses, emplois, users, absEns, salles, messages, notifs, preins };
  d.classeById = new Map(classes.map(c => [c.id, c]));
  d.inscrits = eleves.filter(e => e.statut === 'inscrit' && e.annee_scolaire === AN);
  d.enseignants = users.filter(u => u.role === 'enseignant');
  d.niveauOf = e => d.classeById.get(e.classe_id)?.niveau || null;
  cache.set(schoolId, { t: Date.now(), d });
  return d;
}

export const invalidate = schoolId => cache.delete(schoolId);

/** Années scolaires couvertes par les données (pour les comparaisons). */
function annees() {
  return [anneePrec(AN, 2), anneePrec(AN), AN];
}

/** Effectif d'une année : élèves entrés au plus tard cette année et non partis avant la rentrée. */
function effectifAnnee(d, a) {
  const start = debutAnnee(a);
  return d.eleves.filter(e => e.annee_entree <= a && (!e.date_depart || new Date(e.date_depart) > start)
    && !(e.statut !== 'inscrit' && !e.date_depart));
}

function fraisDu(d, e, annee = AN) {
  const niv = d.niveauOf(e);
  const f = d.frais.find(x => x.annee_scolaire === annee && x.niveau === niv) || d.frais.find(x => x.annee_scolaire === annee && x.niveau === 'Tous');
  return f ? { total: +f.inscription + +f.scolarite, inscription: +f.inscription, scolarite: +f.scolarite, tranches: +f.nb_tranches || 3 } : { total: 0, inscription: 0, scolarite: 0, tranches: 3 };
}

/** Montant exigible à une date selon l'échéancier : inscription en septembre, tranches 15/09, 15/01, 15/04. */
function exigible(f, annee, now = new Date()) {
  const y1 = +annee.slice(0, 4), y2 = y1 + 1;
  const echeances = [new Date(`${y1}-09-15`), new Date(`${y2}-01-15`), new Date(`${y2}-04-15`)].slice(0, f.tranches);
  const passees = echeances.filter(e => e <= now).length;
  return (now >= new Date(`${y1}-09-01`) ? f.inscription : 0) + (f.scolarite / echeances.length) * passees;
}

/* ------------------- Moyennes (réutilisées partout) ------------------ */
function moyennes(d, annee = AN, trimestre = null) {
  const elevesIds = [...new Set(d.notes.filter(n => n.annee_scolaire === annee).map(n => n.eleve_id))];
  const notes = d.notes.filter(n => n.annee_scolaire === annee);
  // Calcul par niveau (les matières dépendent du niveau)
  const out = new Map();
  const byNiveau = groupBy(elevesIds.map(id => d.eleves.find(e => e.id === id)).filter(Boolean), e => d.niveauOf(e) || 'Tous');
  for (const [niv, els] of Object.entries(byNiveau)) {
    const mats = d.matieres.filter(m => m.niveau === niv || m.niveau === 'Tous');
    const res = calculMoyennes(els, mats, notes.filter(n => els.some(e => e.id === n.eleve_id)), trimestre);
    for (const [id, v] of res) out.set(id, v);
  }
  return out;
}

function dernierTrimestre(d, annee = AN) {
  const ts = d.notes.filter(n => n.annee_scolaire === annee).map(n => +n.trimestre);
  return ts.length ? Math.max(...ts) : 1;
}

/* =================== 1. Dashboard général ========================== */
export function general(d) {
  const cls = d.classes.filter(c => c.annee_scolaire === AN);
  const effectifClasse = c => d.inscrits.filter(e => e.classe_id === c.id).length;
  const classes = cls.map(c => {
    const n = effectifClasse(c);
    const taux = pct(n, c.cap);
    return { id: c.id, classe: `${c.niveau} ${c.section}`, niveau: c.niveau, effectif: n, capacite: c.cap, taux,
      alerte: taux > 100 ? 'surcharge' : taux >= 95 ? 'saturée' : taux < 60 ? 'sous-remplie' : null };
  }).sort((a, b) => NIVEAUX.indexOf(a.niveau) - NIVEAUX.indexOf(b.niveau) || a.classe.localeCompare(b.classe));
  const capacite = sum(cls.map(c => c.cap));
  const parNiveau = NIVEAUX.map(n => ({
    niveau: n,
    eleves: classes.filter(c => c.niveau === n).reduce((s, c) => s + c.effectif, 0),
    capacite: classes.filter(c => c.niveau === n).reduce((s, c) => s + c.capacite, 0),
    classes: classes.filter(c => c.niveau === n).length
  }));
  const evolution = annees(d).map(a => ({
    annee: a,
    effectif: effectifAnnee(d, a).length,
    nouveaux: d.eleves.filter(e => e.annee_entree === a).length
  }));
  const filles = d.inscrits.filter(e => e.genre === 'F').length;
  return {
    kpis: {
      eleves: d.inscrits.length,
      enseignants: d.enseignants.length,
      classes: cls.length,
      capaciteClasses: capacite,
      capaciteAccueil: d.school?.capacite_accueil || capacite,
      tauxRemplissage: pct(d.inscrits.length, capacite),
      ratioEleveEnseignant: d.enseignants.length ? r1(d.inscrits.length / d.enseignants.length) : null,
      filles, garcons: d.inscrits.length - filles
    },
    parNiveau, classes, evolution,
    alertes: classes.filter(c => c.alerte).map(c => ({ niveau: c.alerte === 'sous-remplie' ? 'info' : 'warning', message: `${c.classe} : ${c.effectif}/${c.capacite} élèves (${c.taux} %) – classe ${c.alerte}` }))
  };
}

/* =================== 2. Dashboard financier ======================== */
export function finances(d, now = new Date()) {
  const P = anneePrec(AN);
  const lignes = d.inscrits.map(e => {
    const f = fraisDu(d, e);
    const paye = sum(d.paiements.filter(p => p.eleve_id === e.id && p.annee_scolaire === AN).map(p => p.montant));
    const exig = exigible(f, AN, now);
    const derniers = d.paiements.filter(p => p.eleve_id === e.id).map(p => new Date(p.date)).sort((a, b) => b - a);
    return { e, du: f.total, paye, reste: Math.max(0, f.total - paye), exigible: exig, retard: Math.max(0, exig - paye), dernier: derniers[0] || null };
  });
  const attendu = sum(lignes.map(l => l.du));
  const encaisse = sum(lignes.map(l => l.paye));
  const exigibleTotal = sum(lignes.map(l => l.exigible));

  const parMois = annee => {
    const arr = Array(12).fill(0);
    for (const p of d.paiements.filter(x => x.annee_scolaire === annee)) arr[moisScolaire(p.date)] += p.montant;
    return arr;
  };
  const depMois = annee => {
    const arr = Array(12).fill(0);
    for (const x of d.depenses.filter(y => y.annee_scolaire === annee)) arr[moisScolaire(x.date)] += x.montant;
    return arr;
  };
  const cur = parMois(AN), prev = parMois(P), depCur = depMois(AN), depPrev = depMois(P);
  const moisCourant = moisScolaire(now);
  const mensuel = MOIS.map((m, i) => ({ mois: m, annee: r2(i <= moisCourant ? cur[i] : null), precedente: r2(prev[i]), depenses: r2(i <= moisCourant ? depCur[i] : null) }));

  // Prévision : saisonnalité de l'année précédente × coefficient de tendance, plafonnée par le reste à encaisser
  const cumulPrevAuMemeMois = sum(prev.slice(0, moisCourant + 1));
  const tendance = cumulPrevAuMemeMois ? sum(cur.slice(0, moisCourant + 1)) / cumulPrevAuMemeMois : 1;
  let resteAEncaisser = Math.max(0, attendu - encaisse);
  const prevision = [];
  for (let i = moisCourant + 1; i < Math.min(moisCourant + 7, 12); i++) {
    const montant = Math.min(resteAEncaisser, prev[i] * tendance);
    resteAEncaisser -= montant;
    prevision.push({ mois: MOIS[i], prevision: r2(montant), basse: r2(montant * 0.85), haute: r2(montant * 1.1) });
  }

  const retardataires = lignes.filter(l => l.retard > 0).sort((a, b) => b.retard - a.retard).slice(0, 25).map(l => ({
    eleveId: l.e.id, eleve: `${l.e.prenom} ${l.e.nom}`, classe: d.classeById.get(l.e.classe_id) ? `${d.classeById.get(l.e.classe_id).niveau} ${d.classeById.get(l.e.classe_id).section}` : '—',
    parent: l.e.parent_nom, telephone: l.e.parent_tel, retard: r2(l.retard), reste: r2(l.reste),
    joursSansPaiement: l.dernier ? Math.floor((now - l.dernier) / 864e5) : null
  }));
  const parMode = Object.entries(groupBy(d.paiements.filter(p => p.annee_scolaire === AN), p => p.mode)).map(([mode, ps]) => ({ mode, montant: r2(sum(ps.map(p => p.montant))), nb: ps.length }));
  return {
    kpis: {
      attendu: r2(attendu), encaisse: r2(encaisse), reste: r2(attendu - encaisse),
      tauxRecouvrement: pct(encaisse, attendu),
      exigible: r2(exigibleTotal), tauxRecouvrementExigible: pct(sum(lignes.map(l => Math.min(l.paye, l.exigible))), exigibleTotal), // par famille : les avances ne masquent pas les retards
      retardTotal: r2(sum(lignes.map(l => l.retard))), nbRetardataires: lignes.filter(l => l.retard > 0).length,
      depensesAnnee: r2(sum(depCur)), soldeTresorerie: r2(encaisse - sum(depCur))
    },
    mensuel, prevision, retardataires, parMode,
    methodePrevision: `Saisonnalité ${P} × coefficient de tendance ${r2(tendance)}, plafonnée par le reste à encaisser.`
  };
}

/* =================== 3. Dashboard pédagogique ====================== */
export function pedagogie(d, trimestre = null) {
  const T = trimestre || dernierTrimestre(d);
  const moy = moyennes(d, AN, T);
  const ins = d.inscrits.filter(e => moy.get(e.id)?.moyenne != null);
  const m = e => moy.get(e.id).moyenne;
  const label = e => { const c = d.classeById.get(e.classe_id); return c ? `${c.niveau} ${c.section}` : '—'; };

  const parClasse = Object.entries(groupBy(ins, label)).map(([classe, els]) => ({
    classe, moyenne: r2(avg(els.map(m))), reussite: pct(els.filter(e => m(e) >= 10).length, els.length), eleves: els.length
  })).sort((a, b) => a.classe.localeCompare(b.classe));
  const parNiveau = NIVEAUX.map(n => {
    const els = ins.filter(e => d.niveauOf(e) === n);
    return { niveau: n, moyenne: r2(avg(els.map(m))), reussite: pct(els.filter(e => m(e) >= 10).length, els.length) };
  }).filter(x => x.moyenne != null);

  const matStats = {};
  for (const e of ins) for (const l of moy.get(e.id).lignes) {
    if (l.moyenne == null) continue;
    (matStats[l.matiere] ||= []).push(l.moyenne);
  }
  const parMatiere = Object.entries(matStats).map(([matiere, v]) => ({ matiere, moyenne: r2(avg(v)), reussite: pct(v.filter(x => x >= 10).length, v.length) }))
    .sort((a, b) => b.moyenne - a.moyenne);

  // Évolution entre trimestres (année courante et précédente)
  const P = anneePrec(AN);
  const evolution = [1, 2, 3].map(t => {
    const mc = t <= dernierTrimestre(d) ? moyennes(d, AN, t) : null;
    const mp = moyennes(d, P, t);
    const v = map => { const xs = [...map.values()].map(x => x.moyenne).filter(x => x != null); return xs.length ? r2(avg(xs)) : null; };
    return { trimestre: `T${t}`, annee: mc ? v(mc) : null, precedente: v(mp) };
  });

  // Élèves en difficulté / nécessitant un accompagnement
  const precedent = T > 1 ? moyennes(d, AN, T - 1) : null;
  const difficulte = ins.map(e => {
    const mo = m(e);
    const avant = precedent?.get(e.id)?.moyenne ?? null;
    const faibles = moy.get(e.id).lignes.filter(l => l.moyenne != null && l.moyenne < 10).map(l => l.matiere);
    const baisse = avant != null ? r2(mo - avant) : null;
    const raisons = [];
    if (mo < 10) raisons.push('moyenne < 10');
    if (baisse != null && baisse <= -1.5) raisons.push(`baisse de ${Math.abs(baisse)} pt`);
    if (faibles.length >= 3) raisons.push(`${faibles.length} matières < 10`);
    return { eleveId: e.id, eleve: `${e.prenom} ${e.nom}`, classe: label(e), moyenne: mo, evolution: baisse, matieresFaibles: faibles, raisons };
  }).filter(x => x.raisons.length).sort((a, b) => a.moyenne - b.moyenne);

  const moys = ins.map(m);
  const distribution = [[0, 8], [8, 10], [10, 12], [12, 14], [14, 16], [16, 20.01]].map(([a, b]) => ({ tranche: `${a}–${Math.min(b, 20)}`, eleves: moys.filter(x => x >= a && x < b).length }));
  return {
    trimestre: T,
    kpis: {
      moyenneGenerale: r2(avg(moys)), tauxReussite: pct(moys.filter(x => x >= 10).length, moys.length), tauxEchec: pct(moys.filter(x => x < 10).length, moys.length),
      elevesEvalues: moys.length, enDifficulte: difficulte.filter(x => x.moyenne < 10).length, aAccompagner: difficulte.length,
      meilleureMatiere: parMatiere[0]?.matiere || null, matiereFaible: parMatiere[parMatiere.length - 1]?.matiere || null
    },
    parClasse, parNiveau, parMatiere, evolution, distribution, difficulte: difficulte.slice(0, 40)
  };
}

/* ================= 4. Absences et retards =========================== */
export function absences(d, now = new Date()) {
  const abs = d.absences.filter(a => a.annee_scolaire === AN);
  const jours = joursEcoules(AN, now);
  const label = e => { const c = d.classeById.get(e.classe_id); return c ? `${c.niveau} ${c.section}` : '—'; };
  const parEleve = new Map(d.inscrits.map(e => [e.id, { e, abs: [], ret: 0 }]));
  for (const a of abs) { const x = parEleve.get(a.eleve_id); if (!x) continue; if (a.type === 'Retard') x.ret++; else x.abs.push(a); }

  const eleves = [...parEleve.values()].map(x => {
    const jAbs = sum(x.abs.map(poidsAbsence));
    const recentes = x.abs.filter(a => now - new Date(a.date) <= 30 * 864e5).length;
    return { eleveId: x.e.id, eleve: `${x.e.prenom} ${x.e.nom}`, classe: label(x.e), absences: x.abs.length, joursAbsence: r1(jAbs), retards: x.ret,
      taux: pct(jAbs, jours), nonJustifiees: x.abs.filter(a => !a.justifiee).length, recentes };
  });
  const parClasse = Object.entries(groupBy(eleves, e => e.classe)).map(([classe, els]) => ({
    classe, taux: pct(sum(els.map(e => e.joursAbsence)), els.length * jours), absences: sum(els.map(e => e.absences)), retards: sum(els.map(e => e.retards))
  })).sort((a, b) => b.taux - a.taux);

  const mensuel = MOIS.slice(0, 10).map((mois, i) => {
    const c = abs.filter(a => moisScolaire(a.date) === i);
    const p = d.absences.filter(a => a.annee_scolaire === anneePrec(AN) && moisScolaire(a.date) === i);
    return { mois, absences: i <= moisScolaire(now) ? c.filter(a => a.type !== 'Retard').length : null, retards: i <= moisScolaire(now) ? c.filter(a => a.type === 'Retard').length : null, precedente: p.filter(a => a.type !== 'Retard').length };
  });

  // Relation absentéisme / résultats (corrélation de Pearson)
  const moy = moyennes(d, AN, dernierTrimestre(d));
  const nuage = eleves.filter(e => moy.get(e.eleveId)?.moyenne != null).map(e => ({ eleve: e.eleve, taux: e.taux, moyenne: moy.get(e.eleveId).moyenne }));
  const r = pearson(nuage.map(p => p.taux), nuage.map(p => p.moyenne));
  const totalJ = sum(eleves.map(e => e.joursAbsence));
  return {
    kpis: {
      tauxAbsenteisme: pct(totalJ, eleves.length * jours), absences: abs.filter(a => a.type !== 'Retard').length, retards: abs.filter(a => a.type === 'Retard').length,
      justifiees: abs.filter(a => a.type !== 'Retard' && a.justifiee).length, nonJustifiees: abs.filter(a => a.type !== 'Retard' && !a.justifiee).length,
      enAttente: abs.filter(a => a.statut === 'En attente de validation').length,
      repetitives: eleves.filter(e => e.recentes >= 3 || e.absences >= 6).length, joursEcoules: jours
    },
    parClasse, mensuel,
    repetitives: eleves.filter(e => e.recentes >= 3 || e.absences >= 6).sort((a, b) => b.taux - a.taux).slice(0, 30),
    topEleves: [...eleves].sort((a, b) => b.taux - a.taux).slice(0, 10),
    correlation: { r, interpretation: r == null ? 'Données insuffisantes' : r <= -0.5 ? 'Forte relation négative : plus d\'absences, moins bons résultats' : r <= -0.25 ? 'Relation négative modérée' : r < 0.25 ? 'Pas de relation nette' : 'Relation positive (inhabituelle)', points: nuage }
  };
}

/* ================= 5. Enseignants / RH =============================== */
export function enseignants(d) {
  const charge = d.enseignants.map(u => {
    const cr = d.emplois.filter(e => e.enseignant_id === u.id);
    const h = sum(cr.map(heures));
    const max = +u.heures_max || 24;
    const abs = d.absEns.filter(a => a.enseignant_id === u.id && a.annee_scolaire === AN);
    const classes = new Set(cr.map(e => e.classe_id));
    const mats = [...new Set(cr.map(e => d.matieres.find(m => m.id === e.matiere_id)?.nom).filter(Boolean))];
    return { id: u.id, nom: u.nom, specialite: u.specialite, heures: r1(h), max, taux: pct(h, max), classes: classes.size, matieres: mats,
      absences: abs.length, heuresAbsence: r1(sum(abs.map(a => +a.nb_heures))), remplacees: abs.filter(a => a.remplacant_id).length,
      statut: h > max ? 'surcharge' : h < max * 0.6 ? 'sous-charge' : 'équilibré' };
  }).sort((a, b) => b.heures - a.heures);

  const parMatiere = Object.entries(groupBy(d.emplois, e => d.matieres.find(m => m.id === e.matiere_id)?.nom || '—')).map(([matiere, cr]) => ({
    matiere, heures: r1(sum(cr.map(heures))), enseignants: new Set(cr.map(c => c.enseignant_id)).size
  })).sort((a, b) => b.heures - a.heures);
  const parNiveau = NIVEAUX.map(n => {
    const cr = d.emplois.filter(e => d.classeById.get(e.classe_id)?.niveau === n);
    return { niveau: n, enseignants: new Set(cr.map(c => c.enseignant_id)).size, heures: r1(sum(cr.map(heures))) };
  });
  const absAn = d.absEns.filter(a => a.annee_scolaire === AN);
  const mensuelAbs = MOIS.slice(0, 10).map((mois, i) => ({ mois, absences: absAn.filter(a => moisScolaire(a.date) === i).length, remplacees: absAn.filter(a => moisScolaire(a.date) === i && a.remplacant_id).length }));
  return {
    kpis: {
      enseignants: d.enseignants.length, heuresTotales: r1(sum(charge.map(c => c.heures))), chargeMoyenne: r1(avg(charge.map(c => c.heures)) || 0),
      surcharge: charge.filter(c => c.statut === 'surcharge').length, sousCharge: charge.filter(c => c.statut === 'sous-charge').length,
      absences: absAn.length, tauxRemplacement: pct(absAn.filter(a => a.remplacant_id).length, absAn.length)
    },
    charge, parMatiere, parNiveau, mensuelAbs
  };
}

/* ============== 6. Inscriptions & fidélisation ======================= */
export function inscriptions(d) {
  const P = anneePrec(AN);
  const effPrev = effectifAnnee(d, P);
  const finCycle = e => (e.motif_depart || '').toLowerCase().includes('fin de cycle');
  const sortantsCM2 = effPrev.filter(e => finCycle(e) && e.date_depart && new Date(e.date_depart) <= finAnnee(P));
  const eligibles = effPrev.filter(e => !sortantsCM2.includes(e));
  const reinscrits = eligibles.filter(e => e.statut === 'inscrit' && e.annee_scolaire === AN);
  const nouveaux = d.inscrits.filter(e => e.annee_entree === AN);
  const departsAnnee = a => d.eleves.filter(e => e.date_depart && e.date_depart >= debutAnnee(a) && new Date(e.date_depart) <= new Date(`${a.slice(5, 9)}-08-31`) && !finCycle(e));
  const tauxRenouv = pct(reinscrits.length, eligibles.length);

  const historique = annees(d).map(a => ({
    annee: a, nouveaux: d.eleves.filter(e => e.annee_entree === a).length, effectif: effectifAnnee(d, a).length,
    departs: departsAnnee(a).filter(e => e.statut === 'radie').length, abandons: departsAnnee(a).filter(e => e.statut === 'abandon').length
  }));

  // Prévision N+1 : réinscriptions attendues + nouveaux (tendance linéaire)
  const cm2 = d.inscrits.filter(e => d.niveauOf(e) === 'CM2').length;
  const reg = regression(historique.map((h, i) => [i, h.nouveaux]));
  const nouveauxPrevus = Math.max(0, Math.round(reg.a * historique.length + reg.b));
  const reinscritsPrevus = Math.round((d.inscrits.length - cm2) * (tauxRenouv / 100 || 0.9));
  const villes = Object.entries(groupBy(d.inscrits, e => e.ville || 'Non renseignée')).map(([ville, els]) => ({ ville, eleves: els.length })).sort((a, b) => b.eleves - a.eleves);
  const motifs = Object.entries(groupBy(departsAnnee(AN).concat(departsAnnee(P)), e => e.motif_depart || 'Non précisé')).map(([motif, els]) => ({ motif, nb: els.length })).sort((a, b) => b.nb - a.nb);
  return {
    kpis: {
      nouvelles: nouveaux.length, reinscriptions: reinscrits.length, tauxRenouvellement: tauxRenouv,
      departs: departsAnnee(AN).filter(e => e.statut === 'radie').length + departsAnnee(P).filter(e => e.statut === 'radie').length,
      abandons: departsAnnee(AN).filter(e => e.statut === 'abandon').length + departsAnnee(P).filter(e => e.statut === 'abandon').length,
      preinscriptionsEnAttente: d.preins.filter(p => p.statut === 'en_attente').length,
      previsionN1: reinscritsPrevus + nouveauxPrevus
    },
    historique, villes, motifs,
    prevision: { annee: anneePrec(AN, -1), reinscritsPrevus, nouveauxPrevus, total: reinscritsPrevus + nouveauxPrevus, sortantsCM2: cm2,
      methode: `Réinscriptions = (effectif − ${cm2} CM2 sortants) × taux de renouvellement ${tauxRenouv} % ; nouveaux = tendance linéaire des ${historique.length} dernières années.` }
  };
}

/* ============== 7. Communication avec les parents ==================== */
export function communication(d, now = new Date()) {
  const parents = d.users.filter(u => u.role === 'parent');
  const versParents = d.messages.filter(m => m.a_role === 'parent');
  const depuisParents = d.messages.filter(m => m.de_role === 'parent');
  const parParent = new Map(parents.map(p => [p.id, { p, recus: 0, nonLus: 0 }]));
  for (const m of versParents) { const x = parParent.get(m.a_id); if (x) { x.recus++; if (!m.lu) x.nonLus++; } }
  const inactif = p => !p.last_login || now - new Date(p.last_login) > 30 * 864e5;
  const nonLecteurs = [...parParent.values()].filter(x => x.recus > 0 && (x.nonLus / x.recus >= 0.5 || inactif(x.p)));
  const reclam = depuisParents.filter(m => ['reclamation', 'demande'].includes(m.categorie));
  const mensuel = MOIS.slice(0, 10).map((mois, i) => ({
    mois,
    envoyes: versParents.filter(m => moisScolaire(m.created_at) === i && new Date(m.created_at) >= debutAnnee(AN)).length,
    recus: depuisParents.filter(m => moisScolaire(m.created_at) === i && new Date(m.created_at) >= debutAnnee(AN)).length
  }));
  const categories = Object.entries(groupBy(d.messages, m => m.categorie)).map(([categorie, ms]) => ({ categorie, nb: ms.length }));

  // Renforcement du suivi : parent peu actif + enfant en difficulté (moyenne < 10 ou absences répétées)
  const moy = moyennes(d, AN, dernierTrimestre(d));
  const absParEleve = groupBy(d.absences.filter(a => a.annee_scolaire === AN && a.type !== 'Retard'), a => a.eleve_id);
  const suivi = [];
  for (const x of nonLecteurs) {
    for (const e of d.inscrits.filter(e => e.parent_id === x.p.id)) {
      const mo = moy.get(e.id)?.moyenne;
      const nAbs = (absParEleve[e.id] || []).length;
      if ((mo != null && mo < 10) || nAbs >= 5) suivi.push({ parent: x.p.nom, eleve: `${e.prenom} ${e.nom}`, moyenne: mo, absences: nAbs, messagesNonLus: x.nonLus, derniereConnexion: x.p.last_login });
    }
  }
  return {
    kpis: {
      messagesEnvoyes: versParents.length, messagesAuto: versParents.filter(m => m.auto).length,
      tauxLectureMessages: pct(versParents.filter(m => m.lu).length, versParents.length),
      tauxLectureNotifications: pct(d.notifs.filter(n => n.lu).length, d.notifs.length),
      parentsNonLecteurs: nonLecteurs.length, parentsInactifs: parents.filter(inactif).length, parents: parents.length,
      reclamations: reclam.length, reclamationsOuvertes: reclam.filter(m => !m.traite).length
    },
    mensuel, categories,
    nonLecteurs: nonLecteurs.sort((a, b) => b.nonLus - a.nonLus).slice(0, 25).map(x => ({ parent: x.p.nom, recus: x.recus, nonLus: x.nonLus, derniereConnexion: x.p.last_login })),
    reclamations: { traitees: reclam.filter(m => m.traite).length, ouvertes: reclam.filter(m => !m.traite).length, parType: Object.entries(groupBy(reclam, m => m.categorie)).map(([type, ms]) => ({ type, nb: ms.length })) },
    suivi: suivi.slice(0, 25)
  };
}

/* ======= 8. Emplois du temps & utilisation des ressources ============ */
export function ressources(d) {
  const CRENEAUX_SEMAINE = 5 * 4 * 1.5; // 5 jours × 4 créneaux de 1h30
  const salles = d.salles.map(s => {
    const cr = d.emplois.filter(e => e.salle_id === s.id);
    const h = sum(cr.map(heures));
    const taux = pct(h, CRENEAUX_SEMAINE);
    return { id: s.id, salle: s.nom, type: s.type, capacite: s.cap, heures: r1(h), taux, statut: taux < 40 ? 'sous-utilisée' : taux > 90 ? 'saturée' : 'normale' };
  }).sort((a, b) => b.taux - a.taux);

  // Détection des conflits d'horaires (même enseignant / salle / classe sur créneaux qui se chevauchent)
  const conflits = [];
  const em = d.emplois;
  for (let i = 0; i < em.length; i++) for (let j = i + 1; j < em.length; j++) {
    const a = em[i], b = em[j];
    if (a.jour !== b.jour || !(a.debut < b.fin && b.debut < a.fin)) continue;
    const lbl = c => { const x = d.classeById.get(c.classe_id); return x ? `${x.niveau} ${x.section}` : '?'; };
    const quoi = a.enseignant_id === b.enseignant_id ? 'enseignant' : a.salle_id && a.salle_id === b.salle_id ? 'salle' : a.classe_id === b.classe_id ? 'classe' : null;
    if (quoi) conflits.push({ type: quoi, jour: a.jour, horaire: `${String(a.debut).slice(0, 5)}–${String(a.fin).slice(0, 5)}`, details: `${lbl(a)} / ${lbl(b)}` });
  }

  // Équilibre des emplois du temps : heures par jour et par classe
  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const equilibre = d.classes.filter(c => c.annee_scolaire === AN).map(c => {
    const parJour = JOURS.map(j => sum(d.emplois.filter(e => e.classe_id === c.id && e.jour === j).map(heures)));
    const actifs = parJour.filter(h => h > 0);
    const m = avg(actifs) || 0;
    const ecart = actifs.length ? Math.sqrt(avg(actifs.map(h => (h - m) ** 2))) : 0;
    return { classe: `${c.niveau} ${c.section}`, total: r1(sum(parJour)), max: r1(Math.max(...parJour)), min: r1(Math.min(...actifs.length ? actifs : [0])), ecartType: r2(ecart), statut: ecart > 1.6 ? 'déséquilibré' : 'équilibré' };
  });
  const parJour = JOURS.slice(0, 6).map(j => ({ jour: j, heures: r1(sum(d.emplois.filter(e => e.jour === j).map(heures))) }));
  const parEnseignant = d.enseignants.map(u => ({ nom: u.nom, heures: r1(sum(d.emplois.filter(e => e.enseignant_id === u.id).map(heures))) })).sort((a, b) => b.heures - a.heures);
  return {
    kpis: {
      salles: salles.length, occupationMoyenne: r1(avg(salles.map(s => s.taux)) || 0), sousUtilisees: salles.filter(s => s.statut === 'sous-utilisée').length,
      conflits: conflits.length, creneaux: d.emplois.length, classesDesequilibrees: equilibre.filter(e => e.statut === 'déséquilibré').length
    },
    salles, conflits, equilibre, parJour, parEnseignant
  };
}

/* ========== 9. Détection des risques – Early Warning System ========== */
export function risques(d, now = new Date()) {
  const T = dernierTrimestre(d);
  const moy = moyennes(d, AN, T);
  const moyPrec = T > 1 ? moyennes(d, AN, T - 1) : moyennes(d, anneePrec(AN), 3);
  const jours = joursEcoules(AN, now);
  const absParEleve = groupBy(d.absences.filter(a => a.annee_scolaire === AN), a => a.eleve_id);
  const fin = finances(d, now);
  const retardFin = new Map(d.inscrits.map(e => {
    const f = fraisDu(d, e);
    const paye = sum(d.paiements.filter(p => p.eleve_id === e.id && p.annee_scolaire === AN).map(p => p.montant));
    return [e.id, { retard: Math.max(0, exigible(f, AN, now) - paye), du: f.total }];
  }));
  const label = e => { const c = d.classeById.get(e.classe_id); return c ? `${c.niveau} ${c.section}` : '—'; };

  const eleves = d.inscrits.map(e => {
    const mo = moy.get(e.id)?.moyenne ?? null;
    const avant = moyPrec.get(e.id)?.moyenne ?? null;
    const baisse = mo != null && avant != null ? avant - mo : 0;
    const a = absParEleve[e.id] || [];
    const tauxAbs = pct(sum(a.map(poidsAbsence)), jours);
    const nonJust = a.filter(x => x.type !== 'Retard' && !x.justifiee).length;
    const fi = retardFin.get(e.id);
    const ratioRetard = fi?.du ? fi.retard / fi.du : 0;

    // Scores normalisés 0–100
    const sNotes = mo == null ? 0 : Math.min(100, Math.max(0, (12 - mo) * 15));
    const sBaisse = Math.min(100, Math.max(0, baisse * 30));
    const sAbs = Math.min(100, tauxAbs * 8);
    const sFin = Math.min(100, ratioRetard * 200);
    const echec = Math.round(0.55 * sNotes + 0.25 * sBaisse + 0.2 * sAbs);
    const abandon = Math.round(0.4 * sAbs + 0.25 * sBaisse + 0.2 * sFin + 0.15 * sNotes);
    const impaye = Math.round(sFin);
    const score = Math.round(Math.max(echec, abandon, impaye * 0.8));
    const signaux = [];
    if (mo != null && mo < 10) signaux.push(`Moyenne ${mo}`);
    if (baisse >= 1.5) signaux.push(`Baisse de ${r1(baisse)} pt`);
    if (tauxAbs >= 8) signaux.push(`Absentéisme ${tauxAbs} %`);
    if (nonJust >= 3) signaux.push(`${nonJust} absences non justifiées`);
    if (fi?.retard > 0) signaux.push(`Retard de paiement ${Math.round(fi.retard)} TND`);
    return { eleveId: e.id, eleve: `${e.prenom} ${e.nom}`, classe: label(e), moyenne: mo, baisse: r1(baisse), tauxAbsence: tauxAbs, retardPaiement: r2(fi?.retard || 0),
      risqueEchec: echec, risqueAbandon: abandon, risqueImpaye: impaye, score, niveau: score >= 60 ? 'élevé' : score >= 35 ? 'modéré' : 'faible', signaux,
      cumul: tauxAbs >= 8 && baisse >= 1.5 };
  });

  const alertes = [];
  for (const e of eleves.filter(x => x.niveau === 'élevé').sort((a, b) => b.score - a.score).slice(0, 15)) {
    const action = e.risqueImpaye >= e.risqueEchec && e.risqueImpaye >= e.risqueAbandon ? 'Proposer un échéancier au parent'
      : e.risqueAbandon >= e.risqueEchec ? 'Entretien famille + suivi de l\'assiduité' : 'Mettre en place un soutien pédagogique';
    alertes.push({ gravite: e.score >= 75 ? 'critique' : 'élevée', eleve: e.eleve, classe: e.classe, message: e.signaux.join(' · '), action });
  }
  const dist = ['faible', 'modéré', 'élevé'].map(n => ({ niveau: n, eleves: eleves.filter(e => e.niveau === n).length }));
  return {
    kpis: {
      risqueEleve: eleves.filter(e => e.niveau === 'élevé').length, risqueModere: eleves.filter(e => e.niveau === 'modéré').length,
      echec: eleves.filter(e => e.risqueEchec >= 50).length, abandon: eleves.filter(e => e.risqueAbandon >= 50).length,
      impaye: eleves.filter(e => e.risqueImpaye >= 50).length, cumul: eleves.filter(e => e.cumul).length, montantARisque: fin.kpis.retardTotal
    },
    distribution: dist,
    eleves: eleves.filter(e => e.score >= 35).sort((a, b) => b.score - a.score).slice(0, 60),
    cumul: eleves.filter(e => e.cumul).sort((a, b) => b.score - a.score),
    alertes,
    methode: 'Score = combinaison pondérée (notes, baisse entre trimestres, taux d\'absentéisme, retard de paiement) normalisée sur 100. Seuils : ≥ 60 élevé, ≥ 35 modéré.'
  };
}

/* ========== 10. Stratégie : prévisions, scénarios, recommandations ==== */
export function strategie(d, params = {}) {
  const ins = inscriptions(d);
  const fin = finances(d);
  const gen = general(d);
  const ped = pedagogie(d);
  const abs = absences(d);
  const ens = enseignants(d);
  const ress = ressources(d);
  const P = anneePrec(AN);

  const croissance = Number.isFinite(+params.croissance) ? +params.croissance : 0; // % appliqué à la prévision
  const tauxRecouv = Number.isFinite(+params.recouvrement) ? +params.recouvrement : (fin.kpis.tauxRecouvrement > 0 ? Math.min(98, Math.max(85, fin.kpis.tauxRecouvrement + 10)) : 92);
  const capClasse = +params.capacite || 25;
  const hausseFrais = +params.hausseFrais || 0;

  const base = ins.prevision.total;
  const effectifPrevu = Math.round(base * (1 + croissance / 100));
  const fraisMoyen = d.inscrits.length ? sum(d.inscrits.map(e => fraisDu(d, e).total)) / d.inscrits.length : 0;
  const recettes = effectifPrevu * fraisMoyen * (1 + hausseFrais / 100) * (tauxRecouv / 100);
  const depPrev = sum(d.depenses.filter(x => x.annee_scolaire === P).map(x => x.montant));
  const enseignantsSupp = Math.max(0, Math.ceil(effectifPrevu / capClasse) - gen.kpis.classes);
  const depenses = depPrev * 1.05 + enseignantsSupp * 14000;

  // Scénarios comparés
  const scenarios = [['Pessimiste', -10], ['Tendanciel', 0], ['Optimiste', 10]].map(([nom, c]) => {
    const eff = Math.round(base * (1 + (croissance + c) / 100));
    const classes = NIVEAUX.reduce((s, n) => {
      const part = gen.parNiveau.find(x => x.niveau === n)?.eleves || 0;
      return s + Math.max(1, Math.ceil((eff * (part / Math.max(1, gen.kpis.eleves))) / capClasse));
    }, 0);
    const rec = eff * fraisMoyen * (1 + hausseFrais / 100) * (tauxRecouv / 100);
    const dep = depPrev * 1.05 + Math.max(0, classes - gen.kpis.classes) * 14000;
    return { scenario: nom, effectif: eff, classes, enseignants: classes + Math.ceil(classes / 4), salles: classes + 2, recettes: Math.round(rec), depenses: Math.round(dep), resultat: Math.round(rec - dep) };
  });

  // Comparaison pluriannuelle
  const comparaison = [P, AN].map(a => {
    const notes = d.notes.filter(n => n.annee_scolaire === a);
    const absA = d.absences.filter(x => x.annee_scolaire === a && x.type !== 'Retard');
    const eff = effectifAnnee(d, a).length;
    return { annee: a, effectif: eff, moyenne: notes.length ? r2(avg(notes.map(n => n.note))) : null,
      recettes: Math.round(sum(d.paiements.filter(p => p.annee_scolaire === a).map(p => p.montant))),
      depenses: Math.round(sum(d.depenses.filter(x => x.annee_scolaire === a).map(x => x.montant))),
      absencesParEleve: eff ? r1(absA.length / eff) : null };
  });

  // Recommandations automatiques (moteur de règles)
  const reco = [];
  const add = (priorite, domaine, texte) => reco.push({ priorite, domaine, texte });
  const sat = gen.classes.filter(c => c.taux >= 95);
  if (sat.length) add('haute', 'Capacité', `${sat.length} classe(s) saturée(s) (${sat.map(c => c.classe).join(', ')}) : ouvrir une section ou plafonner les admissions.`);
  const sous = gen.classes.filter(c => c.taux < 60);
  if (sous.length) add('moyenne', 'Capacité', `${sous.length} classe(s) sous-remplie(s) : envisager une fusion ou une campagne d'inscription ciblée.`);
  if (fin.kpis.tauxRecouvrementExigible < 85) add('haute', 'Finances', `Recouvrement à ${fin.kpis.tauxRecouvrementExigible} % des sommes exigibles : lancer les relances et proposer des échéanciers (${fin.kpis.nbRetardataires} familles concernées).`);
  if (ped.kpis.tauxEchec > 20) add('haute', 'Pédagogie', `Taux d'échec de ${ped.kpis.tauxEchec} % : renforcer le soutien en ${ped.kpis.matiereFaible}.`);
  if (ped.kpis.aAccompagner) add('moyenne', 'Pédagogie', `${ped.kpis.aAccompagner} élève(s) à accompagner : planifier des séances de remédiation.`);
  if (abs.correlation.r != null && abs.correlation.r <= -0.3) add('moyenne', 'Assiduité', `Corrélation absences/résultats de ${abs.correlation.r} : prioriser le suivi de l'assiduité (${abs.kpis.repetitives} élèves à absences répétées).`);
  if (ens.kpis.surcharge) add('moyenne', 'Ressources humaines', `${ens.kpis.surcharge} enseignant(s) en surcharge horaire : redistribuer ${ens.charge.filter(c => c.statut === 'surcharge').map(c => c.nom).join(', ')}.`);
  if (ens.kpis.tauxRemplacement < 70 && ens.kpis.absences) add('moyenne', 'Ressources humaines', `Seulement ${ens.kpis.tauxRemplacement} % des absences enseignants sont remplacées : constituer un vivier de remplaçants.`);
  if (ress.kpis.sousUtilisees) add('basse', 'Infrastructures', `${ress.kpis.sousUtilisees} salle(s) sous-utilisée(s) : les ouvrir aux activités périscolaires ou au soutien.`);
  if (ress.kpis.conflits) add('haute', 'Emplois du temps', `${ress.kpis.conflits} conflit(s) d'horaires détecté(s) à corriger.`);
  if (enseignantsSupp > 0) add('moyenne', 'Prévision', `La prévision ${anneePrec(AN, -1)} (${effectifPrevu} élèves) nécessite ${enseignantsSupp} classe(s) et enseignant(s) supplémentaire(s).`);
  if (recettes - depenses < 0) add('haute', 'Budget', `Déficit prévisionnel de ${Math.round(depenses - recettes).toLocaleString('fr-FR')} TND : revoir la grille tarifaire ou maîtriser les dépenses.`);
  if (!reco.length) add('basse', 'Synthèse', 'Aucun signal critique : maintenir le pilotage actuel.');
  const ordre = { haute: 0, moyenne: 1, basse: 2 };
  reco.sort((a, b) => ordre[a.priorite] - ordre[b.priorite]);

  return {
    hypotheses: { croissance, tauxRecouvrement: r1(tauxRecouv), capaciteClasse: capClasse, hausseFrais, fraisMoyen: Math.round(fraisMoyen) },
    prevision: {
      annee: anneePrec(AN, -1), effectif: effectifPrevu, recettes: Math.round(recettes), depenses: Math.round(depenses), resultat: Math.round(recettes - depenses),
      classesNecessaires: Math.ceil(effectifPrevu / capClasse), enseignantsSupplementaires: enseignantsSupp,
      sallesNecessaires: Math.ceil(effectifPrevu / capClasse) + 2
    },
    scenarios, comparaison, recommandations: reco
  };
}

/* ======================= Vue plateforme (SaaS) ======================= */
export async function plateforme() {
  const schools = await all(`SELECT id, name, ville, plan, status FROM schools ORDER BY id`);
  const out = [];
  for (const s of schools) {
    const d = await dataset(s.id);
    const g = general(d), f = finances(d), p = pedagogie(d), a = absences(d);
    out.push({ id: s.id, ecole: s.name, ville: s.ville, plan: s.plan, status: s.status, eleves: g.kpis.eleves, enseignants: g.kpis.enseignants, classes: g.kpis.classes,
      remplissage: g.kpis.tauxRemplissage, encaisse: f.kpis.encaisse, recouvrement: f.kpis.tauxRecouvrement, moyenne: p.kpis.moyenneGenerale, reussite: p.kpis.tauxReussite, absenteisme: a.kpis.tauxAbsenteisme });
  }
  return {
    kpis: { ecoles: schools.length, actives: schools.filter(s => s.status === 'active').length, eleves: sum(out.map(o => o.eleves)), enseignants: sum(out.map(o => o.enseignants)), encaisse: r2(sum(out.map(o => o.encaisse))) },
    ecoles: out
  };
}
