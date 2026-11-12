/* =====================================================================
   GÉNÉRATEUR DE DONNÉES DE DÉMONSTRATION (déterministe)
   3 établissements × 3 années scolaires : élèves, notes, absences,
   paiements, dépenses, messages... pour alimenter le module BI.
   Usage : npm run seed   (recrée entièrement la base)
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pool from './db.js';
import { AN } from './config.js';
import { ECOLES, SUPERADMIN, MOTS_DE_PASSE, emailDemo } from './demo-accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NIVEAUX = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];
const Y = n => { const y = +AN.slice(0, 4) - n; return `${y}-${y + 1}`; }; // Y(0)=courante, Y(1)=précédente
const Y2 = Y(0), Y1 = Y(1), Y0 = Y(2);
const startYear = a => +a.slice(0, 4);

/* ------------------------ Aléatoire reproductible -------------------- */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let R = rng(2026);
const rand = (a, b) => a + R() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(R() * arr.length)];
const chance = p => R() < p;
const gauss = (m = 0, s = 1) => { const u = 1 - R(), v = R(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const weighted = pairs => { const t = pairs.reduce((s, p) => s + p[1], 0); let x = R() * t; for (const [v, w] of pairs) { if ((x -= w) <= 0) return v; } return pairs[0][0]; };
const iso = d => d.toISOString().slice(0, 10);
function weekday(d) { const x = new Date(d); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1); return x; }
const dateEntre = (a, b) => weekday(new Date(a.getTime() + R() * (b.getTime() - a.getTime())));

const PRENOMS_M = ['Yassine', 'Mohamed', 'Ahmed', 'Youssef', 'Adam', 'Omar', 'Amine', 'Ilyes', 'Aziz', 'Rayen', 'Skander', 'Hamza', 'Iheb', 'Malek', 'Fares', 'Elyes', 'Anas', 'Karim', 'Taha', 'Zied', 'Wassim', 'Selim', 'Nour', 'Mehdi'];
const PRENOMS_F = ['Lina', 'Yasmine', 'Mariem', 'Eya', 'Nour', 'Sarra', 'Rania', 'Ines', 'Lilia', 'Farah', 'Malak', 'Amira', 'Salma', 'Chaima', 'Rim', 'Asma', 'Emna', 'Hiba', 'Aya', 'Jinene', 'Meriem', 'Dorra', 'Safa', 'Ranim'];
const NOMS = ['Ben Ali', 'Trabelsi', 'Gharbi', 'Hammami', 'Jebali', 'Ben Salah', 'Mejri', 'Ayari', 'Chaabane', 'Bouazizi', 'Karray', 'Kammoun', 'Mansouri', 'Sassi', 'Dridi', 'Ferchichi', 'Khelifi', 'Ben Amor', 'Zouari', 'Masmoudi', 'Ellouze', 'Frikha', 'Jallouli', 'Rekik', 'Baccar', 'Haddad', 'Toumi', 'Abidi', 'Hajji', 'Saidi', 'Ouni', 'Riahi'];
const PRENOMS_ADULTES = ['Sami', 'Nabil', 'Hichem', 'Lotfi', 'Mourad', 'Riadh', 'Sonia', 'Samia', 'Naima', 'Hela', 'Olfa', 'Imen', 'Kais', 'Moez', 'Faten', 'Wafa'];

const MATIERES = [
  { nom: 'Arabe', coef: 3, slots: 5, offset: 0.2 },
  { nom: 'Français', coef: 3, slots: 4, offset: -0.4 },
  { nom: 'Mathématiques', coef: 3, slots: 5, offset: -0.2 },
  { nom: 'Éveil scientifique', coef: 2, slots: 2, offset: 0.3 },
  { nom: 'Anglais', coef: 1.5, slots: 1, offset: -0.6, specialiste: 'Anglais' },
  { nom: 'Éducation islamique', coef: 1, slots: 1, offset: 0.8 },
  { nom: 'Informatique', coef: 1, slots: 1, offset: 0.6, specialiste: 'Informatique', salle: 'Laboratoire informatique' },
  { nom: 'Éducation physique', coef: 1, slots: 1, offset: 1.4, specialiste: 'Éducation physique', salle: 'Gymnase' }
];
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const CRENEAUX = [['08:30', '10:00'], ['10:15', '11:45'], ['14:00', '15:30'], ['15:45', '17:15']];

/* ---------------------------- Insertion en lot ------------------------ */
async function insertMany(client, table, rows, returning = false) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const out = [];
  const size = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const vals = [];
    const ph = chunk.map(r => `(${cols.map(c => { vals.push(r[c] === undefined ? null : r[c]); return `$${vals.length}`; }).join(',')})`);
    const res = await client.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${ph.join(',')}${returning ? ' RETURNING id' : ''}`, vals);
    if (returning) out.push(...res.rows.map(r => r.id));
  }
  return out;
}

/* ----------------------------- Génération ----------------------------- */
async function genererEcole(client, E, idx, hashes, now) {
  R = rng(1000 + idx * 97);
  const school = (await client.query(
    `INSERT INTO schools (name, code, ville, plan, status, adresse, telephone, email_contact, capacite_accueil, subscription_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [E.name, E.code, E.ville, E.plan, E.status, E.adresse, E.telephone, `contact@${E.domaine}`, E.capacite, E.status === 'trial' ? iso(new Date(now.getTime() + 30 * 864e5)) : `${startYear(Y2) + 1}-08-31`]
  )).rows[0];
  const sid = school.id;
  const mkUser = (nom, email, role, extra = {}) => ({ school_id: sid, nom, email, hash: hashes[role], role, telephone: `+216 ${randInt(20, 99)} ${randInt(100, 999)} ${randInt(100, 999)}`, specialite: null, heures_max: 24, eleve_id: null, last_login: null, ...extra });

  /* --- Personnel --- */
  const staff = [
    mkUser(E.comptes.admin, emailDemo(E, 'admin'), 'admin', { last_login: now }),
    mkUser(E.comptes.directeur, emailDemo(E, 'directeur'), 'directeur', { last_login: now }),
    mkUser(E.comptes.comptable, emailDemo(E, 'comptable'), 'comptable', { last_login: now })
  ];
  const [adminId, directeurId, comptableId] = await insertMany(client, 'users', staff, true);

  /* --- Salles et classes --- */
  const classesDef = NIVEAUX.flatMap(n => E.sections[n].map(s => ({ niveau: n, section: s })));
  const sallesRows = classesDef.map((c, i) => ({ school_id: sid, nom: `Salle ${String(i + 1).padStart(2, '0')}`, cap: E.cap + 4, batiment: i < classesDef.length / 2 ? 'Bâtiment A' : 'Bâtiment B', type: 'Classe' }));
  sallesRows.push(
    { school_id: sid, nom: 'Laboratoire informatique', cap: 24, batiment: 'Bâtiment B', type: 'Laboratoire' },
    { school_id: sid, nom: 'Gymnase', cap: 60, batiment: 'Extérieur', type: 'Sport' },
    { school_id: sid, nom: 'Bibliothèque', cap: 30, batiment: 'Bâtiment A', type: 'Polyvalente' },
    { school_id: sid, nom: 'Salle polyvalente', cap: 80, batiment: 'Bâtiment A', type: 'Polyvalente' }
  );
  const salleIds = await insertMany(client, 'salles', sallesRows, true);
  const salleSpe = { 'Laboratoire informatique': salleIds[classesDef.length], Gymnase: salleIds[classesDef.length + 1] };

  /* --- Enseignants : un titulaire par classe + spécialistes --- */
  const titulaires = classesDef.map((c, i) => {
    const demo = c.niveau === 'CM1' && c.section === 'A';
    const nom = demo ? E.comptes.enseignant : `${chance(0.6) ? 'Mme' : 'M.'} ${pick(PRENOMS_ADULTES)} ${pick(NOMS)}`;
    return mkUser(nom, demo ? emailDemo(E, 'enseignant') : `prof.${c.niveau.toLowerCase()}${c.section.toLowerCase()}@${E.domaine}`, 'enseignant',
      { specialite: 'Enseignant généraliste', heures_max: i % 4 === 1 ? 24 : 27, last_login: now });
  });
  const specialistes = ['Anglais', 'Informatique', 'Éducation physique'].map(sp => mkUser(`${chance(0.5) ? 'Mme' : 'M.'} ${pick(PRENOMS_ADULTES)} ${pick(NOMS)}`, `prof.${sp.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()}@${E.domaine}`, 'enseignant', { specialite: sp, heures_max: 24, last_login: now }));
  const titIds = await insertMany(client, 'users', titulaires, true);
  const speIds = await insertMany(client, 'users', specialistes, true);
  const speId = { Anglais: speIds[0], Informatique: speIds[1], 'Éducation physique': speIds[2] };

  const matIds = await insertMany(client, 'matieres', MATIERES.map(m => ({ school_id: sid, nom: m.nom, coef: m.coef, niveau: 'Tous', enseignant_id: m.specialiste ? speId[m.specialiste] : null })), true);
  const matiereId = Object.fromEntries(MATIERES.map((m, i) => [m.nom, matIds[i]]));

  const classesY2 = await insertMany(client, 'classes', classesDef.map((c, i) => ({ school_id: sid, niveau: c.niveau, section: c.section, cap: E.cap, annee_scolaire: Y2, enseignant_titulaire_id: titIds[i], salle_id: salleIds[i] })), true);
  const classesY1 = await insertMany(client, 'classes', classesDef.map((c, i) => ({ school_id: sid, niveau: c.niveau, section: c.section, cap: E.cap, annee_scolaire: Y1, enseignant_titulaire_id: titIds[i], salle_id: salleIds[i] })), true);
  const classes = classesDef.map((c, i) => ({ ...c, cap: E.cap, id: classesY2[i], idY1: classesY1[i], tit: titIds[i], salle: salleIds[i] }));

  /* --- Grille tarifaire --- */
  const fraisRows = [];
  for (const [a, k] of [[Y1, 0.95], [Y2, 1]]) {
    fraisRows.push({ school_id: sid, annee_scolaire: a, niveau: 'Tous', inscription: E.inscription, scolarite: Math.round(E.scolarite * k), nb_tranches: 3 });
    fraisRows.push({ school_id: sid, annee_scolaire: a, niveau: 'CM2', inscription: E.inscription, scolarite: Math.round(E.scolarite * k * 1.1), nb_tranches: 3 });
  }
  await insertMany(client, 'frais', fraisRows);
  const fraisDe = (niveau, a) => { const k = a === Y1 ? 0.95 : 1; return { inscription: E.inscription, scolarite: Math.round(E.scolarite * k * (niveau === 'CM2' ? 1.1 : 1)) }; };

  /* --- Élèves (actuels + sortants) --- */
  const eleves = [];
  const mkEleve = (niveauIdx, anneeEntree, extra = {}) => {
    const genre = chance(0.5) ? 'F' : 'M';
    const ability = clamp(gauss(E.niveauMoyen, 2.6), 4, 18.5);
    const assiduite = clamp(gauss(0, 1) + (ability - E.niveauMoyen) * 0.25, -3, 3);
    const age = 6 + niveauIdx;
    return {
      genre, nom: pick(NOMS), prenom: pick(genre === 'F' ? PRENOMS_F : PRENOMS_M),
      naissance: iso(new Date(startYear(extra.annee || Y2) - age, randInt(0, 11), randInt(1, 28))),
      ville: weighted(E.villes), ability, assiduite,
      payeur: weighted([['bon', 68], ['tardif', 22], ['mauvais', 10]]),
      lecture: weighted([['actif', 70], ['moyen', 18], ['inactif', 12]]),
      declin: chance(0.12) ? rand(1.5, 3.5) : 0,
      annee_entree: anneeEntree, niveauIdx, ...extra
    };
  };
  // Effectifs cibles par classe (quelques classes saturées / sous-remplies pour les alertes)
  classes.forEach((c, i) => {
    let fill = rand(0.74, 0.97);
    if (i === 1) fill = 1; // saturée
    if (i === classes.length - 3) fill = 0.55; // sous-remplie
    const n = Math.round(c.cap * fill);
    const k = NIVEAUX.indexOf(c.niveau);
    for (let j = 0; j < n; j++) {
      let entree;
      if (k === 0) entree = chance(0.04) ? Y1 : Y2; // quelques redoublants
      else entree = chance(0.86) ? Y(k) : Y(randInt(0, k - 1));
      eleves.push(mkEleve(k, entree, { classe: c, annee: Y2, statut: 'inscrit' }));
    }
  });
  // Sortants fin de cycle (CM2 de l'année précédente et de l'avant-dernière)
  const nbParNiveau = Math.round(eleves.length / 5);
  const cm2Y1 = classes.filter(c => c.niveau === 'CM2');
  for (let j = 0; j < Math.round(nbParNiveau * 0.95); j++) {
    eleves.push(mkEleve(4, Y(5), { classeY1: pick(cm2Y1), annee: Y1, statut: 'radie', date_depart: `${startYear(Y1) + 1}-06-30`, motif_depart: 'Fin de cycle (CM2)' }));
  }
  for (let j = 0; j < Math.round(nbParNiveau * 0.88); j++) {
    eleves.push(mkEleve(4, Y(6), { annee: Y0, statut: 'radie', date_depart: `${startYear(Y0) + 1}-06-30`, motif_depart: 'Fin de cycle (CM2)' }));
  }
  // Départs et abandons (année précédente et année en cours)
  const motifs = [['Déménagement', 'radie'], ['Changement d\'établissement', 'radie'], ['Difficultés financières', 'abandon'], ['Raisons familiales', 'abandon']];
  for (let j = 0; j < randInt(7, 11); j++) {
    const [motif, statut] = pick(motifs);
    const k = randInt(0, 3);
    const c = pick(classes.filter(x => NIVEAUX.indexOf(x.niveau) === k));
    eleves.push(mkEleve(k, Y(randInt(1, k + 1)), { classeY1: c, annee: Y1, statut, motif_depart: motif, date_depart: iso(dateEntre(new Date(`${startYear(Y1)}-11-01`), new Date(`${startYear(Y1) + 1}-08-20`))), ability: clamp(gauss(E.niveauMoyen - 2, 2.5), 4, 17) }));
  }
  for (let j = 0; j < randInt(2, 4); j++) {
    const [motif, statut] = pick(motifs);
    const c = pick(classes);
    eleves.push(mkEleve(NIVEAUX.indexOf(c.niveau), Y(randInt(0, 2)), { classe: c, annee: Y2, statut, motif_depart: motif, date_depart: iso(dateEntre(new Date(`${startYear(Y2)}-10-01`), new Date(Math.min(now, new Date(`${startYear(Y2)}-11-10`))))) }));
  }

  // Comptes parents (fratries : ~12 % partagent un parent)
  const parentsRows = [];
  const parentIndex = [];
  let demoParentIdx = null;
  eleves.forEach((e, i) => {
    if (i > 0 && chance(0.12) && eleves[i - 1].statut === e.statut && e.statut === 'inscrit') {
      e.nom = eleves[i - 1].nom; parentIndex.push(parentIndex[i - 1]); e.lecture = eleves[i - 1].lecture; e.payeur = eleves[i - 1].payeur; return;
    }
    const pere = chance(0.45);
    const nomParent = `${pere ? 'M.' : 'Mme'} ${pick(PRENOMS_ADULTES)} ${e.nom}`;
    const lastLogin = e.lecture === 'actif' ? new Date(now - rand(0, 6) * 864e5) : e.lecture === 'moyen' ? new Date(now - rand(8, 28) * 864e5) : chance(0.5) ? null : new Date(now - rand(45, 160) * 864e5);
    parentsRows.push(mkUser(nomParent, `parent${parentsRows.length + 1}@${E.domaine}`, 'parent', { last_login: lastLogin }));
    parentIndex.push(parentsRows.length - 1);
  });

  // Famille de démonstration : un enfant performant (élève démo, CM1 A) et un enfant à risque (CE1)
  const [prenomEleveDemo, ...nomFamille] = E.comptes.eleve.split(' ');
  const famille = nomFamille.join(' ');
  const cm1a = classes.find(c => c.niveau === 'CM1' && c.section === 'A');
  const ce1 = classes.find(c => c.niveau === 'CE1');
  const iDemo = eleves.findIndex(e => e.classe === cm1a && e.statut === 'inscrit');
  const iFrere = eleves.findIndex(e => e.classe === ce1 && e.statut === 'inscrit');
  Object.assign(eleves[iDemo], { prenom: prenomEleveDemo, nom: famille, genre: ['Lina', 'Yasmine'].includes(prenomEleveDemo) ? 'F' : 'M', ability: 14.8, assiduite: 1.5, declin: 0, payeur: 'bon', lecture: 'actif', demo: true });
  Object.assign(eleves[iFrere], { nom: famille, ability: 9.2, assiduite: -2.2, declin: 2.4, payeur: 'tardif', lecture: 'actif' });
  // Compte parent dédié : la famille de démonstration ne partage son parent avec aucun autre élève
  parentsRows.push(mkUser(E.comptes.parent, emailDemo(E, 'parent'), 'parent', { last_login: now }));
  demoParentIdx = parentsRows.length - 1;
  parentIndex[iDemo] = demoParentIdx;
  parentIndex[iFrere] = demoParentIdx;

  const parentIds = await insertMany(client, 'users', parentsRows, true);
  const eleveRows = eleves.map((e, i) => {
    const classeId = e.classe ? e.classe.id : e.classeY1 ? e.classeY1.idY1 : null;
    const parent = parentsRows[parentIndex[i]];
    return {
      school_id: sid, nom: e.nom, prenom: e.prenom, matricule: `${E.code.slice(0, 3).toUpperCase()}-${startYear(e.annee_entree)}-${String(i + 1).padStart(4, '0')}`,
      naissance: e.naissance, genre: e.genre, ville: e.ville, classe_id: classeId, parent_id: parentIds[parentIndex[i]],
      parent_nom: parent.nom, parent_email: parent.email, parent_tel: parent.telephone,
      antecedents_medicaux: chance(0.08) ? pick(['Asthme léger', 'Allergie aux arachides', 'Port de lunettes', 'Diabète type 1 (suivi)']) : 'Aucun',
      annee_entree: e.annee_entree, annee_scolaire: e.annee, statut: e.statut, date_depart: e.date_depart || null, motif_depart: e.motif_depart || null
    };
  });
  const eleveIds = await insertMany(client, 'eleves', eleveRows, true);
  eleves.forEach((e, i) => { e.id = eleveIds[i]; e.parentId = parentIds[parentIndex[i]]; });

  // Compte élève de démonstration
  const demoEleve = eleves[iDemo];
  const [eleveUserId] = await insertMany(client, 'users', [mkUser(E.comptes.eleve, emailDemo(E, 'eleve'), 'eleve', { eleve_id: demoEleve.id, last_login: now })], true);

  /* --- Emplois du temps (année en cours, sans conflit) --- */
  const emplois = [];
  const occSpe = {}; // créneaux déjà pris par chaque spécialiste
  for (const c of classes) {
    const grille = [];
    for (const j of JOURS) for (let s = 0; s < CRENEAUX.length; s++) grille.push([j, s]);
    const libres = [...grille];
    for (const m of MATIERES.filter(x => x.specialiste)) {
      const pris = (occSpe[m.specialiste] ||= new Set());
      const idx = libres.findIndex(([j, s]) => !pris.has(`${j}${s}`) && s !== 0);
      const [j, s] = libres.splice(idx >= 0 ? idx : 0, 1)[0];
      pris.add(`${j}${s}`);
      emplois.push({ c, m, j, s, ens: speId[m.specialiste], salle: m.salle ? salleSpe[m.salle] : c.salle });
    }
    const restants = MATIERES.filter(x => !x.specialiste).flatMap(m => Array(m.slots).fill(m));
    libres.forEach(([j, s], i) => { if (restants[i]) emplois.push({ c, m: restants[i], j, s, ens: c.tit, salle: c.salle }); });
  }
  await insertMany(client, 'emplois', emplois.map(x => ({ school_id: sid, classe_id: x.c.id, matiere_id: matiereId[x.m.nom], enseignant_id: x.ens, salle_id: x.salle, jour: x.j, debut: CRENEAUX[x.s][0], fin: CRENEAUX[x.s][1], annee_scolaire: Y2 })));

  /* --- Notes : année précédente (T1–T3) et trimestre 1 de l'année en cours --- */
  const notes = [];
  const presentEn = (e, a) => e.annee_entree <= a && (!e.date_depart || new Date(e.date_depart) > new Date(`${startYear(a)}-09-01`)) && !(a === Y2 && e.statut !== 'inscrit' && new Date(e.date_depart) < new Date(`${startYear(Y2)}-10-15`));
  const note = (e, m, a, t, ev) => {
    const tendance = a === Y2 ? -e.declin : -e.declin * (t - 1) / 4;
    const v = e.ability + m.offset + tendance + gauss(0, ev === 'Examen' ? 1.8 : 1.4) + (ev === 'Examen' ? -0.3 : 0.2);
    return Math.round(clamp(v, 0, 20) * 4) / 4;
  };
  for (const e of eleves) {
    for (const [a, trims] of [[Y1, [1, 2, 3]], [Y2, [1]]]) {
      if (!presentEn(e, a)) continue;
      if (a === Y1 && e.annee === Y0) continue;
      for (const t of trims) {
        if (a === Y1 && e.date_depart && new Date(e.date_depart) < new Date(`${startYear(Y1) + (t === 1 ? 0 : 1)}-${t === 1 ? '12' : t === 2 ? '03' : '06'}-01`)) continue;
        for (const m of MATIERES) {
          const nbCC = a === Y2 ? 2 : 2;
          for (let k = 0; k < nbCC; k++) notes.push({ school_id: sid, eleve_id: e.id, matiere_id: matiereId[m.nom], eval: 'Contrôle continu', trimestre: t, note: note(e, m, a, t, 'CC'), annee_scolaire: a });
          if (!(a === Y2 && chance(0.0))) notes.push({ school_id: sid, eleve_id: e.id, matiere_id: matiereId[m.nom], eval: 'Examen', trimestre: t, note: note(e, m, a, t, 'Examen'), annee_scolaire: a });
        }
      }
    }
  }
  await insertMany(client, 'notes', notes);

  /* --- Absences et retards --- */
  const absences = [];
  const genAbs = (e, a, debut, fin) => {
    const jours = (fin - debut) / 864e5 * (5 / 7);
    const lambda = clamp(0.012 - e.assiduite * 0.006 + (e.declin ? 0.055 : 0), 0.002, 0.09) * jours;
    const n = Math.max(0, Math.round(gauss(lambda, Math.sqrt(lambda) * 0.8)));
    for (let k = 0; k < n; k++) {
      const d = dateEntre(debut, fin);
      const justifiee = chance(0.6);
      const attente = !justifiee && chance(0.15);
      absences.push({ school_id: sid, eleve_id: e.id, date: iso(d), type: 'Absence', creneau: weighted([['Journée entière', 45], ['Matinée', 30], ['Après-midi', 25]]),
        motif: justifiee ? pick(['Maladie', 'Rendez-vous médical', 'Événement familial']) : null, justifiee,
        justification_parent: justifiee || attente ? pick(['Certificat médical fourni', 'Fièvre, enfant gardé à la maison', 'Déplacement familial']) : null,
        statut: justifiee ? 'Justifiée' : attente ? 'En attente de validation' : 'Non justifiée', annee_scolaire: a });
    }
    const nr = Math.max(0, Math.round(lambda * 0.7 + gauss(0, 1)));
    for (let k = 0; k < nr; k++) absences.push({ school_id: sid, eleve_id: e.id, date: iso(dateEntre(debut, fin)), type: 'Retard', creneau: 'Matinée', motif: null, justifiee: false, justification_parent: null, statut: 'Non justifiée', annee_scolaire: a });
  };
  for (const e of eleves) {
    if (presentEn(e, Y1) && e.annee !== Y0) genAbs(e, Y1, new Date(`${startYear(Y1)}-09-15`), new Date(Math.min(new Date(`${startYear(Y1) + 1}-06-25`), e.date_depart ? new Date(e.date_depart) : Infinity)));
    if (e.annee === Y2) genAbs(e, Y2, new Date(`${startYear(Y2)}-09-15`), new Date(Math.min(now, e.date_depart ? new Date(e.date_depart) : Infinity)));
  }
  await insertMany(client, 'absences', absences);

  /* --- Paiements --- */
  const paiements = [];
  let recu = 0;
  const pay = (e, a, montant, date, type) => {
    if (date > now) return;
    recu++;
    paiements.push({ school_id: sid, eleve_id: e.id, montant: Math.round(montant), mode: weighted([['Espèces', 45], ['Virement', 25], ['Mobile money', 20], ['Chèque', 10]]), type, recu_num: `R${a.slice(2, 4)}${a.slice(7, 9)}-${String(recu).padStart(5, '0')}`, date: iso(date), annee_scolaire: a });
  };
  for (const e of eleves) {
    for (const a of [Y1, Y2]) {
      const present = a === Y2 ? e.annee === Y2 : (presentEn(e, Y1) && e.annee !== Y0);
      if (!present) continue;
      const niv = a === Y2 ? NIVEAUX[e.niveauIdx] : NIVEAUX[Math.max(0, e.niveauIdx - (e.annee === Y2 ? 1 : 0))];
      const f = fraisDe(niv, a);
      const y = startYear(a);
      const tranche = f.scolarite / 3;
      const ech = [new Date(`${y}-09-15`), new Date(`${y + 1}-01-15`), new Date(`${y + 1}-04-15`)];
      const depart = e.date_depart ? new Date(e.date_depart) : null;
      const ok = d => !depart || d < depart;
      if (e.payeur === 'bon') {
        pay(e, a, f.inscription, dateEntre(new Date(`${y}-09-01`), new Date(`${y}-09-12`)), 'Frais d\'inscription');
        if (chance(0.2)) pay(e, a, f.scolarite, dateEntre(new Date(`${y}-09-05`), new Date(`${y}-09-25`)), 'Scolarité complète');
        else ech.forEach((d, k) => ok(d) && pay(e, a, tranche, dateEntre(new Date(d.getTime() - 10 * 864e5), new Date(d.getTime() + 8 * 864e5)), `Scolarité – tranche ${k + 1}`));
      } else if (e.payeur === 'tardif') {
        pay(e, a, f.inscription, dateEntre(new Date(`${y}-09-05`), new Date(`${y}-09-28`)), 'Frais d\'inscription');
        ech.forEach((d, k) => { if (ok(d) && chance(k === 2 ? 0.7 : 0.9)) pay(e, a, tranche, dateEntre(new Date(d.getTime() + 25 * 864e5), new Date(d.getTime() + 70 * 864e5)), `Scolarité – tranche ${k + 1}`); });
      } else {
        if (chance(0.8)) pay(e, a, f.inscription, dateEntre(new Date(`${y}-09-10`), new Date(`${y}-10-20`)), 'Frais d\'inscription');
        if (chance(0.5)) pay(e, a, tranche * rand(0.4, 1), dateEntre(new Date(`${y}-11-01`), new Date(`${y + 1}-02-20`)), 'Scolarité – acompte');
      }
    }
  }
  paiements.sort((a, b) => a.date.localeCompare(b.date));
  const paiementIds = await insertMany(client, 'paiements', paiements, true);
  paiements.forEach((p, i) => { p.id = paiementIds[i]; });

  /* --- Dépenses --- */
  const depenses = [];
  const nbEns = titIds.length + speIds.length;
  for (const a of [Y1, Y2]) {
    const y = startYear(a);
    for (let m = 0; m < 12; m++) {
      const d = new Date(y, 8 + m, 28);
      if (d > now) break;
      const k = a === Y2 ? 1.05 : 1;
      depenses.push({ school_id: sid, date: iso(d), categorie: 'Salaires', libelle: `Salaires ${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`, montant: Math.round((nbEns * 1350 + 3 * 1050) * k), annee_scolaire: a });
      depenses.push({ school_id: sid, date: iso(new Date(y, 8 + m, 5)), categorie: 'Loyer et charges', libelle: 'Loyer, eau, électricité', montant: Math.round((2200 + rand(-200, 600)) * k), annee_scolaire: a });
      if (m % 3 === 0) depenses.push({ school_id: sid, date: iso(new Date(y, 8 + m, 15)), categorie: 'Fournitures', libelle: 'Fournitures pédagogiques', montant: Math.round(rand(900, 2600) * k), annee_scolaire: a });
      if (chance(0.35)) depenses.push({ school_id: sid, date: iso(new Date(y, 8 + m, 20)), categorie: 'Maintenance', libelle: pick(['Réparation climatisation', 'Peinture', 'Matériel informatique', 'Plomberie']), montant: Math.round(rand(400, 3500)), annee_scolaire: a });
    }
  }
  await insertMany(client, 'depenses', depenses.filter(d => new Date(d.date) <= now));

  /* --- Absences des enseignants --- */
  const absEns = [];
  const tousEns = [...titIds, ...speIds];
  for (const a of [Y1, Y2]) {
    const y = startYear(a);
    const fin = a === Y2 ? now : new Date(`${y + 1}-06-25`);
    const n = a === Y2 ? randInt(6, 11) : randInt(18, 28);
    for (let k = 0; k < n; k++) {
      const ens = pick(tousEns);
      absEns.push({ school_id: sid, enseignant_id: ens, date: iso(dateEntre(new Date(`${y}-09-20`), fin)), nb_heures: pick([3, 4.5, 6]), motif: pick(['Maladie', 'Formation', 'Congé exceptionnel', 'Raison familiale']), remplacant_id: chance(0.68) ? pick(tousEns.filter(x => x !== ens)) : null, annee_scolaire: a });
    }
  }
  await insertMany(client, 'absences_enseignants', absEns);

  /* --- Messagerie, notifications, envois --- */
  const messages = [];
  const lu = e => (e.lecture === 'actif' ? chance(0.92) : e.lecture === 'moyen' ? chance(0.6) : chance(0.15));
  const msg = (o) => messages.push({ school_id: sid, brouillon: false, auto: false, traite: false, eleve_id: null, categorie: 'information', lu: false, ...o });
  const staffInfo = { [adminId]: [E.comptes.admin, 'admin'], [directeurId]: [E.comptes.directeur, 'directeur'], [comptableId]: [E.comptes.comptable, 'comptable'] };
  const eleveById = new Map(eleves.map(e => [e.id, e]));
  // Message automatique après chaque paiement de l'année en cours
  for (const p of paiements.filter(x => x.annee_scolaire === Y2)) {
    const e = eleveById.get(p.eleve_id);
    const isLu = lu(e);
    msg({ de_id: comptableId, de_nom: E.comptes.comptable, de_role: 'comptable', a_id: e.parentId, a_nom: parentsRows[parentIndex[eleves.indexOf(e)]].nom, a_role: 'parent', eleve_id: e.id, categorie: 'paiement', auto: true,
      objet: `Paiement reçu – ${p.montant.toLocaleString('fr-FR')} TND (${e.prenom})`, corps: `Nous accusons réception de votre paiement de ${p.montant} TND (${p.mode}) du ${new Date(p.date).toLocaleDateString('fr-FR')}. Reçu n° ${p.recu_num}.`,
      lu: isLu, lu_at: isLu ? new Date(new Date(p.date).getTime() + rand(1, 72) * 3600e3) : null, created_at: new Date(p.date) });
  }
  const actuels = eleves.filter(e => e.annee === Y2 && e.statut === 'inscrit');
  const debutY2 = new Date(`${startYear(Y2)}-09-10`);
  // Échanges enseignants -> parents
  for (let k = 0; k < Math.round(actuels.length * 0.3); k++) {
    const e = pick(actuels);
    const d = dateEntre(debutY2, now);
    const isLu = lu(e);
    msg({ de_id: e.classe.tit, de_nom: titulaires[classes.indexOf(e.classe)].nom, de_role: 'enseignant', a_id: e.parentId, a_nom: e.nom, a_role: 'parent', eleve_id: e.id, categorie: 'pedagogique',
      objet: pick(['Suivi du travail en classe', 'Résultats du contrôle', 'Comportement en classe', 'Devoirs non rendus', 'Félicitations']), corps: `Bonjour, je souhaitais vous informer du suivi de ${e.prenom}. N'hésitez pas à me répondre.`,
      lu: isLu, lu_at: isLu ? new Date(d.getTime() + 5 * 3600e3) : null, created_at: d });
  }
  // Parents -> établissement (demandes et réclamations)
  for (let k = 0; k < Math.round(actuels.length * 0.12); k++) {
    const e = pick(actuels);
    const d = dateEntre(debutY2, now);
    const cat = weighted([['reclamation', 35], ['demande', 45], ['information', 20]]);
    const dest = cat === 'reclamation' ? pick([adminId, directeurId, comptableId]) : pick([adminId, e.classe.tit]);
    const [destNom, destRole] = staffInfo[dest] || [titulaires[classes.indexOf(e.classe)].nom, 'enseignant'];
    msg({ de_id: e.parentId, de_nom: e.nom, de_role: 'parent', a_id: dest, a_nom: destNom, a_role: destRole, eleve_id: e.id, categorie: cat,
      objet: cat === 'reclamation' ? pick(['Erreur sur le solde', 'Transport scolaire', 'Note contestée', 'Retard de communication']) : pick(['Demande de rendez-vous', 'Certificat de scolarité', 'Absence prévue', 'Question sur les devoirs']),
      corps: 'Bonjour, merci de bien vouloir prendre en compte ma demande.', lu: true, lu_at: new Date(d.getTime() + 3600e3), traite: chance(0.62), created_at: d });
  }
  // Informations administratives
  for (let k = 0; k < Math.round(actuels.length * 0.15); k++) {
    const e = pick(actuels);
    const d = dateEntre(debutY2, now);
    const isLu = lu(e);
    msg({ de_id: adminId, de_nom: E.comptes.admin, de_role: 'admin', a_id: e.parentId, a_nom: e.nom, a_role: 'parent', eleve_id: e.id, categorie: 'administratif',
      objet: pick(['Réunion parents-enseignants', 'Sortie pédagogique', 'Calendrier des examens', 'Dossier incomplet']), corps: 'Madame, Monsieur, veuillez trouver ci-dessous les informations utiles.',
      lu: isLu, lu_at: isLu ? new Date(d.getTime() + 7200e3) : null, created_at: d });
  }
  // Rappels de paiement envoyés en octobre aux retardataires
  for (const e of actuels.filter(x => x.payeur !== 'bon').slice(0, 40)) {
    const d = new Date(`${startYear(Y2)}-10-${randInt(18, 28)}T09:00:00`);
    if (d > now) continue;
    const isLu = lu(e);
    msg({ de_id: comptableId, de_nom: E.comptes.comptable, de_role: 'comptable', a_id: e.parentId, a_nom: e.nom, a_role: 'parent', eleve_id: e.id, categorie: 'rappel', auto: true,
      objet: `Rappel de paiement – ${e.prenom} ${e.nom}`, corps: 'Sauf erreur de notre part, une échéance de scolarité reste impayée.', lu: isLu, lu_at: isLu ? new Date(d.getTime() + 86400e3) : null, created_at: d });
  }
  // Fil de démonstration pour le compte enseignant et le compte parent
  const demoE = eleves[iDemo];
  const frere = eleves[iFrere];
  msg({ de_id: frere.classe.tit, de_nom: titulaires[classes.indexOf(frere.classe)].nom, de_role: 'enseignant', a_id: demoE.parentId, a_nom: E.comptes.parent, a_role: 'parent', eleve_id: frere.id, categorie: 'pedagogique',
    objet: `Baisse des résultats de ${frere.prenom}`, corps: `Bonjour, ${frere.prenom} a des difficultés ce trimestre, notamment en mathématiques, et plusieurs absences. Pouvons-nous convenir d'un rendez-vous ?`, lu: false, created_at: new Date(now.getTime() - 2 * 864e5) });
  msg({ de_id: cm1a.tit, de_nom: E.comptes.enseignant, de_role: 'enseignant', a_id: demoE.parentId, a_nom: E.comptes.parent, a_role: 'parent', eleve_id: demoE.id, categorie: 'pedagogique',
    objet: `Félicitations pour ${demoE.prenom}`, corps: `${demoE.prenom} fait un excellent premier trimestre. Bravo !`, lu: true, lu_at: new Date(now.getTime() - 4 * 864e5), created_at: new Date(now.getTime() - 5 * 864e5) });
  msg({ de_id: demoE.parentId, de_nom: E.comptes.parent, de_role: 'parent', a_id: cm1a.tit, a_nom: E.comptes.enseignant, a_role: 'enseignant', eleve_id: demoE.id, categorie: 'information',
    objet: `Re: Félicitations pour ${demoE.prenom}`, corps: 'Merci beaucoup pour votre suivi !', lu: false, created_at: new Date(now.getTime() - 4 * 864e5) });

  await insertMany(client, 'messages', messages.map(m => ({ ...m, lu_at: m.lu_at || null })));
  await insertMany(client, 'notifications', messages.filter(m => m.a_role === 'parent').map(m => ({ school_id: sid, user_id: m.a_id, titre: m.objet, message: m.categorie === 'paiement' ? 'Votre paiement a été enregistré.' : 'Nouveau message dans votre messagerie.', type: m.categorie, lien: '/messages', lu: m.lu, created_at: m.created_at })));
  await insertMany(client, 'envois', messages.filter(m => m.auto).flatMap(m => [
    { school_id: sid, canal: 'messagerie', destinataire_id: m.a_id, destinataire: m.a_nom, objet: m.objet, reference: m.categorie, statut: 'envoye', created_at: m.created_at },
    { school_id: sid, canal: 'email', destinataire_id: m.a_id, destinataire: m.a_nom, objet: m.objet, reference: m.categorie, statut: 'simule', created_at: m.created_at }
  ]));

  /* --- Devoirs et travaux rendus --- */
  const devoirs = [];
  for (const c of classes) {
    const sujets = [['Mathématiques', 'Problèmes sur les fractions'], ['Français', 'Rédaction : mes vacances'], ['Arabe', 'Lecture et compréhension'], ['Éveil scientifique', 'Le cycle de l\'eau'], ['Mathématiques', 'Tables de multiplication'], ['Anglais', 'My family']];
    sujets.forEach(([mat, titre], k) => {
      const assign = new Date(startYear(Y2), 8, 20 + k * 10);
      const remise = new Date(assign.getTime() + 7 * 864e5);
      if (assign > now) return;
      devoirs.push({ c, mat, row: { school_id: sid, titre, desc_devoir: `Consignes : ${titre.toLowerCase()}. Travail à rendre sur feuille ou en photo.`, matiere_id: matiereId[mat], classe_id: c.id, enseignant_id: mat === 'Anglais' ? speId.Anglais : c.tit, date_assignation: iso(assign), date_remise: iso(remise), bareme: 20, corrige: remise < now - 3 * 864e5 ? 'Corrigé détaillé disponible en classe et ci-joint.' : null, annee_scolaire: Y2 } });
    });
  }
  const devoirIds = await insertMany(client, 'devoirs', devoirs.map(d => d.row), true);
  const rendus = [];
  devoirs.forEach((d, k) => {
    const remise = new Date(d.row.date_remise);
    for (const e of actuels.filter(x => x.classe === d.c)) {
      const probaRendu = clamp(0.85 + e.assiduite * 0.05 - (e.declin ? 0.15 : 0), 0.4, 0.99);
      if (!chance(probaRendu)) continue;
      const retard = chance(0.1);
      const depot = new Date(remise.getTime() + (retard ? rand(1, 3) : -rand(0, 4)) * 864e5);
      if (depot > now) continue;
      const corrige = remise < now - 2 * 864e5 && chance(0.85);
      rendus.push({ school_id: sid, devoir_id: devoirIds[k], eleve_id: e.id, eleve_nom: `${e.nom} ${e.prenom}`, contenu: 'Travail réalisé et déposé en ligne.', date_depot: depot, statut: corrige ? 'corrige' : retard ? 'en_retard' : 'rendu',
        note: corrige ? Math.round(clamp(e.ability + gauss(0.5, 2), 0, 20) * 2) / 2 : null, bareme: 20, commentaire_enseignant: corrige ? pick(['Bon travail', 'Peut mieux faire', 'Excellent', 'Attention aux erreurs de calcul', 'Soigner la présentation']) : null, vu_par_parent: corrige && lu(e) });
    }
  });
  await insertMany(client, 'devoirs_rendus', rendus);

  /* --- Annonces --- */
  const ann = [
    { titre: 'Bienvenue pour la rentrée scolaire', contenu: `L'équipe pédagogique souhaite une excellente année ${Y2} à tous les élèves et à leurs familles.`, cible: 'tous', importante: true, created_at: new Date(`${startYear(Y2)}-09-14`) },
    { titre: 'Réunion parents-enseignants', contenu: 'Les rencontres parents-enseignants auront lieu le samedi 22 novembre de 9 h à 12 h.', cible: 'parents', importante: true, created_at: new Date(`${startYear(Y2)}-11-03`) },
    { titre: 'Conseil pédagogique', contenu: 'Conseil pédagogique du premier trimestre : mercredi à 15 h en salle polyvalente.', cible: 'enseignants', importante: false, created_at: new Date(`${startYear(Y2)}-10-21`) },
    { titre: 'Calendrier des examens du 1er trimestre', contenu: 'Les examens du premier trimestre se dérouleront du 1er au 12 décembre.', cible: 'tous', importante: false, created_at: new Date(`${startYear(Y2)}-10-28`) }
  ];
  await insertMany(client, 'annonces', ann.filter(a => a.created_at <= now).map(a => ({ school_id: sid, ...a, auteur_id: directeurId, auteur_nom: E.comptes.directeur, annee_scolaire: Y2 })));

  /* --- Pré-inscriptions en ligne --- */
  const pre = [];
  for (let k = 0; k < randInt(5, 9); k++) {
    const genre = chance(0.5) ? 'F' : 'M';
    const nom = pick(NOMS);
    pre.push({ school_id: sid, nom, prenom: pick(genre === 'F' ? PRENOMS_F : PRENOMS_M), naissance: iso(new Date(startYear(Y2) - 6, randInt(0, 11), randInt(1, 28))), genre, niveau_demande: weighted([['CP', 60], ['CE1', 15], ['CE2', 10], ['CM1', 10], ['CM2', 5]]),
      parent_nom: `${chance(0.5) ? 'M.' : 'Mme'} ${pick(PRENOMS_ADULTES)} ${nom}`, parent_email: `famille.${nom.toLowerCase().replace(/\s/g, '')}${k}@exemple-demo.tn`, parent_tel: `+216 ${randInt(20, 99)} ${randInt(100, 999)} ${randInt(100, 999)}`,
      ville: weighted(E.villes), statut: k < 4 ? 'en_attente' : pick(['validee', 'rejetee']), annee_scolaire: Y2, created_at: dateEntre(new Date(`${startYear(Y2)}-06-01`), now) });
  }
  await insertMany(client, 'preinscriptions', pre);

  return { school, nbEleves: actuels.length, nbNotes: notes.length, nbPaiements: paiements.length, nbMessages: messages.length };
}

export async function seedDatabase({ log = console.log } = {}) {
  const client = await pool.connect();
  const now = new Date();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.resolve(__dirname, '../database/schema.sql'), 'utf8'));
    const hashes = {};
    for (const [role, pwd] of Object.entries(MOTS_DE_PASSE)) hashes[role] = await bcrypt.hash(pwd, 10);
    await client.query(`INSERT INTO users (school_id, nom, email, hash, role, last_login) VALUES (NULL, $1, $2, $3, 'superadmin', NOW())`, [SUPERADMIN.nom, SUPERADMIN.email, hashes.superadmin]);
    for (const [i, E] of ECOLES.entries()) {
      const r = await genererEcole(client, E, i, hashes, now);
      log(`✓ ${r.school.name} : ${r.nbEleves} élèves, ${r.nbNotes} notes, ${r.nbPaiements} paiements, ${r.nbMessages} messages`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Exécution directe : node seed.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = Date.now();
  seedDatabase()
    .then(() => { console.log(`Base initialisée en ${((Date.now() - t) / 1000).toFixed(1)} s`); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}
