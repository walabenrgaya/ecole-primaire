import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AN = process.env.ANNEE_SCOLAIRE || '2026-2027';

async function seed() {
  console.log('Connexion à PostgreSQL...');
  const client = await pool.connect();

  try {
    // 1. Run schema.sql to drop and recreate tables
    const schemaPath = path.resolve(__dirname, '../database/schema.sql');
    console.log('Exécution du schéma SQL...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
    console.log('✓ Schéma recréé.');

    // 2. Generate proper bcrypt hashes
    console.log('Création des utilisateurs avec mots de passe hashés...');
    const passHash = await bcrypt.hash('Admin123!', 12);
    const profHash = await bcrypt.hash('Prof123!', 12);
    const parentHash = await bcrypt.hash('Parent123!', 12);
    const eleveHash = await bcrypt.hash('Eleve123!', 12);
    const compHash = await bcrypt.hash('Comptable123!', 12);

    // Users
    await client.query(`
      INSERT INTO users (id, nom, email, hash, role, telephone) VALUES
      (1, 'Direction Générale (M. Hassen)', 'admin@ecole.tn', $1, 'admin', '+216 73 000 111'),
      (2, 'M. Sami Ben Salem', 'prof.francais@ecole.tn', $2, 'enseignant', '+216 98 123 456'),
      (3, 'Mme Leila Karray', 'prof.maths@ecole.tn', $3, 'enseignant', '+216 97 654 321'),
      (4, 'M. Karim Mansour (Secrétariat)', 'comptable@ecole.tn', $4, 'comptable', '+216 73 222 333'),
      (5, 'Mme Sonia Ben Ali', 'parent.benali@ecole.tn', $5, 'parent', '+216 55 444 333'),
      (6, 'Yassine Ben Ali', 'eleve.yassine@ecole.tn', $6, 'eleve', NULL)
    `, [passHash, profHash, profHash, compHash, parentHash, eleveHash]);
    await client.query("SELECT setval('users_id_seq', 10)");
    console.log('✓ 6 utilisateurs créés.');

    // Salles
    await client.query(`
      INSERT INTO salles (id, nom, cap, dispo, batiment) VALUES
      (1, 'Salle 101 (RDC)', 30, 'Disponible', 'Bâtiment A'),
      (2, 'Salle 102 (1er étage)', 30, 'Disponible', 'Bâtiment A'),
      (3, 'Salle Polyvalente', 60, 'Disponible', 'Bâtiment B'),
      (4, 'Labo Informatique', 25, 'Disponible', 'Bâtiment C')
    `);
    await client.query("SELECT setval('salles_id_seq', 10)");
    console.log('✓ 4 salles créées.');

    // Matières
    await client.query(`
      INSERT INTO matieres (id, nom, coef, niveau, enseignant_id) VALUES
      (1, 'Français', 3.0, 'CP', 2),
      (2, 'Mathématiques', 3.0, 'CP', 3),
      (3, 'Langue Arabe', 3.0, 'CP', 2),
      (4, 'Éveil Scientifique', 2.0, 'CP', 3),
      (5, 'Arts Plastiques', 1.0, 'CP', 2),
      (6, 'Éducation Physique', 1.0, 'CP', 2)
    `);
    await client.query("SELECT setval('matieres_id_seq', 10)");
    console.log('✓ 6 matières créées.');

    // Classes
    await client.query(`
      INSERT INTO classes (id, niveau, section, cap, annee_scolaire, enseignant_titulaire_id) VALUES
      (1, 'CP', 'A', 25, '2026-2027', 2),
      (2, 'CP', 'B', 25, '2026-2027', 3),
      (3, 'CE1', 'A', 28, '2026-2027', NULL),
      (4, 'CE2', 'A', 28, '2026-2027', NULL),
      (5, 'CM1', 'A', 30, '2026-2027', NULL),
      (6, 'CM2', 'A', 30, '2026-2027', NULL)
    `);
    await client.query("SELECT setval('classes_id_seq', 10)");
    console.log('✓ 6 classes créées.');

    // Élèves
    await client.query(`
      INSERT INTO eleves (id, nom, prenom, naissance, genre, classe_id, parent_id, parent_nom, parent_email, parent_tel, annee_entree, annee_scolaire, statut) VALUES
      (1, 'Ben Ali', 'Yassine', '2019-04-12', 'M', 1, 5, 'Mme Sonia Ben Ali', 'parent.benali@ecole.tn', '+216 55 444 333', '2026-2027', '2026-2027', 'inscrit'),
      (2, 'Trabelsi', 'Sarah', '2019-08-25', 'F', 1, NULL, 'M. Moncef Trabelsi', 'parent.trabelsi@ecole.tn', '+216 22 111 999', '2026-2027', '2026-2027', 'inscrit')
    `);
    await client.query("SELECT setval('eleves_id_seq', 10)");
    console.log('✓ 2 élèves créés.');

    // Emploi du temps
    await client.query(`
      INSERT INTO emplois (classe_id, matiere_id, enseignant_id, salle_id, jour, debut, fin, annee_scolaire) VALUES
      (1, 1, 2, 1, 'Lundi', '08:30', '10:00', '2026-2027'),
      (1, 2, 3, 1, 'Lundi', '10:15', '11:45', '2026-2027'),
      (1, 3, 2, 1, 'Mardi', '08:30', '10:00', '2026-2027'),
      (1, 4, 3, 1, 'Mardi', '10:15', '11:45', '2026-2027')
    `);
    console.log('✓ 4 créneaux d emploi du temps.');

    // Notes
    await client.query(`
      INSERT INTO notes (eleve_id, matiere_id, eval, note, commentaire, annee_scolaire) VALUES
      (1, 1, 'Contrôle continu', 16.50, 'Très bonne participation', '2026-2027'),
      (1, 1, 'Examen T1', 17.00, 'Excellent devoir', '2026-2027'),
      (1, 2, 'Contrôle continu', 15.00, 'Bon travail', '2026-2027'),
      (1, 2, 'Examen T1', 16.00, 'Bien maîtrisé', '2026-2027'),
      (1, 3, 'Examen T1', 18.00, 'Remarquable', '2026-2027')
    `);
    console.log('✓ 5 notes créées.');

    // Paiements
    await client.query(`
      INSERT INTO paiements (eleve_id, montant, mode, type, recu_num, date, annee_scolaire) VALUES
      (1, 600.00, 'Virement', 'Scolarité T1', 'REC-2026-000101', '2026-09-05', '2026-2027'),
      (2, 1200.00, 'Espèces', 'Scolarité Annuelle', 'REC-2026-000102', '2026-09-02', '2026-2027')
    `);
    console.log('✓ 2 paiements créés.');

    // Devoirs
    await client.query(`
      INSERT INTO devoirs (id, titre, desc_devoir, matiere_id, classe_id, enseignant_id, date_remise, bareme, corrige, annee_scolaire) VALUES
      (1, 'Exercices de grammaire - Chapitre 3', 'Faire les exercices 1 à 4 page 24 du manuel.', 1, 1, 2, '2026-10-28', 20.0, 'Corrigé officiel : Q1: Minou, Q2: Sous le fauteuil.', '2026-2027')
    `);
    await client.query("SELECT setval('devoirs_id_seq', 10)");
    console.log('✓ 1 devoir créé.');

    // Annonce
    await client.query(`
      INSERT INTO annonces (titre, contenu, cible, auteur_id, auteur_nom, annee_scolaire) VALUES
      ('Bienvenue pour l''année 2026-2027', 'La direction souhaite une excellente rentrée scolaire à tous les élèves et enseignants.', 'tous', 1, 'Direction Générale', '2026-2027')
    `);
    console.log('✓ 1 annonce créée.');

    console.log('\n============================================');
    console.log(' SEED POSTGRESQL TERMINÉ AVEC SUCCÈS');
    console.log('============================================');
    console.log('\n📌 Comptes de connexion :');
    console.log('  Admin      : admin@ecole.tn       / Admin123!');
    console.log('  Enseignant : prof.francais@ecole.tn / Prof123!');
    console.log('  Enseignant : prof.maths@ecole.tn    / Prof123!');
    console.log('  Comptable  : comptable@ecole.tn     / Comptable123!');
    console.log('  Parent     : parent.benali@ecole.tn / Parent123!');
    console.log('  Élève      : eleve.yassine@ecole.tn / Eleve123!\n');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Erreur seed :', err);
  process.exit(1);
});
