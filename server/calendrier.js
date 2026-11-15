/* =====================================================================
   Migrations idempotentes + génération du calendrier de démonstration
   (contrôles, devoirs surveillés, examens, oraux de synthèse, vacances,
   événements). Le calendrier est construit à partir des données
   existantes : classes, matières et emploi du temps de l'année.
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';
import { AN } from './config.js';

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database/migrations');

export async function runMigrations(client = pool) {
  if (!fs.existsSync(MIGRATIONS)) return;
  for (const f of fs.readdirSync(MIGRATIONS).filter(x => x.endsWith('.sql')).sort()) {
    await client.query(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  }
}

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const trimestreDe = date => { const m = new Date(date).getUTCMonth(); return m >= 8 ? 1 : m <= 2 ? 2 : 3; };

/** Calendrier type de l'année scolaire (dates en UTC). */
function calendrierAnnee(annee) {
  const y = +annee.slice(0, 4);
  const d = s => new Date(`${s}T00:00:00Z`);
  return {
    debut: d(`${y}-09-15`),
    fin: d(`${y + 1}-06-12`),
    vacances: [
      { titre: 'Vacances d\'automne', du: d(`${y}-10-26`), au: d(`${y}-11-01`) },
      { titre: 'Vacances d\'hiver', du: d(`${y}-12-21`), au: d(`${y + 1}-01-03`) },
      { titre: 'Vacances de printemps', du: d(`${y + 1}-03-22`), au: d(`${y + 1}-04-04`) }
    ],
    examens: [
      { t: 1, du: d(`${y}-12-01`) },
      { t: 2, du: d(`${y + 1}-03-08`) },
      { t: 3, du: d(`${y + 1}-06-01`) }
    ],
    oraux: d(`${y + 1}-06-14`),
    evenements: [
      { titre: 'Rentrée scolaire', date: d(`${y}-09-15`), description: 'Accueil des élèves et des familles.' },
      { titre: 'Réunion parents-enseignants', date: d(`${y}-11-21`), debut: '09:00', fin: '12:00', description: 'Rencontres individuelles avec les enseignants.' },
      { titre: 'Conseils de classe du 1er trimestre', date: d(`${y}-12-16`), debut: '14:00', fin: '17:00' },
      { titre: 'Journée portes ouvertes', date: d(`${y + 1}-02-13`), debut: '09:00', fin: '13:00', description: 'Présentation de l\'établissement aux futures familles.' },
      { titre: 'Conseils de classe du 2e trimestre', date: d(`${y + 1}-03-18`), debut: '14:00', fin: '17:00' },
      { titre: 'Fête de fin d\'année', date: d(`${y + 1}-06-25`), debut: '16:00', fin: '19:00', description: 'Spectacle des élèves et remise des prix.' }
    ]
  };
}

const plusMinutes = (hhmm, n) => { const [h, m] = hhmm.split(':').map(Number); const t = h * 60 + m + n; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const enVacances =(date, cal) => cal.vacances.some(v => date >= v.du && date <= v.au);
const prochainJour = (from, jourNom) => { let x = new Date(from); for (let i = 0; i < 7 && JOURS[x.getUTCDay()] !== jourNom; i++) x = addDays(x, 1); return x; };

/**
 * Génère le calendrier de démonstration d'un établissement pour l'année courante.
 * Ne fait rien si l'établissement a déjà des événements.
 */
export async function genererCalendrier(schoolId, client = pool, annee = AN) {
  const deja = (await client.query('SELECT COUNT(*)::int AS n FROM evenements WHERE school_id = $1 AND annee_scolaire = $2', [schoolId, annee])).rows[0].n;
  if (deja) return 0;
  const cal = calendrierAnnee(annee);
  const classes = (await client.query(`SELECT * FROM classes WHERE school_id = $1 AND annee_scolaire = $2 AND deleted = FALSE ORDER BY niveau, section`, [schoolId, annee])).rows;
  const matieres = (await client.query(`SELECT * FROM matieres WHERE school_id = $1 AND deleted = FALSE`, [schoolId])).rows;
  const emplois = (await client.query(`SELECT * FROM emplois WHERE school_id = $1 AND annee_scolaire = $2 AND deleted = FALSE`, [schoolId, annee])).rows;
  const mat = nom => matieres.find(m => m.nom === nom);
  const rows = [];
  const push = e => rows.push({ school_id: schoolId, annee_scolaire: annee, description: null, classe_id: null, matiere_id: null, enseignant_id: null, salle_id: null, date_fin: null, debut: null, fin: null, ...e, trimestre: e.trimestre ?? (e.classe_id ? trimestreDe(e.date) : null) });

  // Vacances et événements de l'établissement
  for (const v of cal.vacances) push({ categorie: 'Vacances', titre: v.titre, date: iso(v.du), date_fin: iso(v.au) });
  for (const e of cal.evenements) push({ categorie: 'Événement', titre: e.titre, description: e.description || null, date: iso(e.date), debut: e.debut || null, fin: e.fin || null });

  const PRINCIPALES = ['Mathématiques', 'Français', 'Arabe', 'Éveil scientifique', 'Anglais'];
  classes.forEach((c, ci) => {
    for (const [mi, nom] of PRINCIPALES.entries()) {
      const m = mat(nom);
      if (!m) continue;
      // Créneau habituel de la matière pour cette classe (contrôle passé pendant le cours)
      const cr = emplois.filter(e => e.classe_id === c.id && e.matiere_id === m.id).sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour))[0];
      const ens = cr?.enseignant_id || m.enseignant_id || c.enseignant_titulaire_id;
      const debut = cr ? String(cr.debut).slice(0, 5) : '10:15';
      const finCour = plusMinutes(debut, 45);

      // Contrôles : toutes les 3 semaines environ (décalés selon la classe et la matière)
      let d = addDays(cal.debut, 14 + ((ci + mi * 2) % 10));
      let n = 1;
      while (d < cal.fin) {
        const jour = cr ? prochainJour(d, cr.jour) : d;
        const exam = cal.examens.some(x => jour >= x.du && jour <= addDays(x.du, 11));
        if (jour < cal.examens[2].du && !enVacances(jour, cal) && !exam && jour.getUTCDay() >= 1 && jour.getUTCDay() <= 5) {
          push({ categorie: 'Contrôle', titre: `Contrôle n°${n++} – ${nom}`, description: 'Contrôle de 45 minutes sur les dernières leçons.', classe_id: c.id, matiere_id: m.id, enseignant_id: ens, salle_id: c.salle_id, date: iso(jour), debut, fin: finCour });
        }
        d = addDays(d, 21);
      }

      // Examens trimestriels : une matière par jour pendant la semaine d'examens
      for (const x of cal.examens) {
        const jour = addDays(x.du, mi + (mi >= 4 ? 3 : 0)); // lundi→vendredi, Anglais la semaine suivante
        push({ categorie: 'Examen', titre: `Examen du ${x.t === 1 ? '1er' : `${x.t}e`} trimestre – ${nom}`, description: 'Épreuve écrite d\'1h30. Apporter le matériel habituel.', classe_id: c.id, matiere_id: m.id, enseignant_id: ens, salle_id: c.salle_id, date: iso(jour), debut: '08:30', fin: '10:00', trimestre: x.t });
      }
    }

    // Devoirs surveillés : Mathématiques et Français, milieu de chaque trimestre (samedi matin)
    const ds = [[`${cal.debut.getUTCFullYear()}-11-14`, 1], [`${cal.fin.getUTCFullYear()}-02-20`, 2], [`${cal.fin.getUTCFullYear()}-05-08`, 3]];
    for (const [date, t] of ds) {
      for (const [k, nom] of ['Mathématiques', 'Français'].entries()) {
        const m = mat(nom);
        if (!m) continue;
        push({ categorie: 'Devoir surveillé', titre: `Devoir surveillé – ${nom}`, description: 'Épreuve de 2 heures en conditions d\'examen.', classe_id: c.id, matiere_id: m.id, enseignant_id: c.enseignant_titulaire_id, salle_id: c.salle_id, date, debut: k ? '10:30' : '08:30', fin: k ? '12:30' : '10:30', trimestre: t });
      }
    }

    // Oraux de synthèse : fin de cycle (CM2), un oral par matière principale
    if (c.niveau === 'CM2') {
      ['Français', 'Arabe', 'Éveil scientifique'].forEach((nom, k) => {
        const m = mat(nom);
        if (m) push({ categorie: 'Oral de synthèse', titre: `Oral de synthèse – ${nom}`, description: 'Présentation orale d\'un projet de l\'année (10 minutes) suivie de questions.', classe_id: c.id, matiere_id: m.id, enseignant_id: c.enseignant_titulaire_id, salle_id: c.salle_id, date: iso(addDays(cal.oraux, k)), debut: '09:00', fin: '12:00', trimestre: 3 });
      });
    }
  });

  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const vals = [];
    const ph = chunk.map(r => `(${cols.map(c => { vals.push(r[c]); return `$${vals.length}`; }).join(',')})`);
    await client.query(`INSERT INTO evenements (${cols.join(',')}) VALUES ${ph.join(',')}`, vals);
  }
  return rows.length;
}
