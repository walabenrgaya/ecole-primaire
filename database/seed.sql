-- =====================================================================
-- JEU DE DONNÉES DE TEST OFFICIEL POSTGRESQL (seed.sql)
-- =====================================================================

-- 1. Utilisateurs
-- Mot de passe par défaut : Admin123! / Prof123! / Parent123! / Eleve123! / Comptable123!
INSERT INTO users (id, nom, email, hash, role, telephone) VALUES
(1, 'Direction Générale (M. Hassen)', 'admin@ecole.tn', '$2a$12$e6/8cTqL8J55GjA1Yx.m7OF8r1Y/CekPzR9r0L/G/rQn2x7zUjCee', 'admin', '+216 73 000 111'),
(2, 'M. Sami Ben Salem', 'prof.francais@ecole.tn', '$2a$12$e6/8cTqL8J55GjA1Yx.m7OF8r1Y/CekPzR9r0L/G/rQn2x7zUjCee', 'enseignant', '+216 98 123 456'),
(3, 'Mme Leila Karray', 'prof.maths@ecole.tn', '$2a$12$e6/8cTqL8J55GjA1Yx.m7OF8r1Y/CekPzR9r0L/G/rQn2x7zUjCee', 'enseignant', '+216 97 654 321'),
(4, 'M. Karim Mansour (Secrétariat)', 'comptable@ecole.tn', '$2a$12$e6/8cTqL8J55GjA1Yx.m7OF8r1Y/CekPzR9r0L/G/rQn2x7zUjCee', 'comptable', '+216 73 222 333'),
(5, 'Mme Sonia Ben Ali', 'parent.benali@ecole.tn', '$2a$12$e6/8cTqL8J55GjA1Yx.m7OF8r1Y/CekPzR9r0L/G/rQn2x7zUjCee', 'parent', '+216 55 444 333'),
(6, 'Yassine Ben Ali', 'eleve.yassine@ecole.tn', '$2a$12$e6/8cTqL8J55GjA1Yx.m7OF8r1Y/CekPzR9r0L/G/rQn2x7zUjCee', 'eleve', NULL);

SELECT setval('users_id_seq', 10);

-- 2. Salles
INSERT INTO salles (id, nom, cap, dispo, batiment) VALUES
(1, 'Salle 101 (RDC)', 30, 'Disponible', 'Bâtiment A'),
(2, 'Salle 102 (1er étage)', 30, 'Disponible', 'Bâtiment A'),
(3, 'Salle Polyvalente', 60, 'Disponible', 'Bâtiment B'),
(4, 'Labo Informatique', 25, 'Disponible', 'Bâtiment C');

SELECT setval('salles_id_seq', 10);

-- 3. Matières
INSERT INTO matieres (id, nom, coef, niveau, enseignant_id) VALUES
(1, 'Français', 3.0, 'CP', 2),
(2, 'Mathématiques', 3.0, 'CP', 3),
(3, 'Langue Arabe', 3.0, 'CP', 2),
(4, 'Éveil Scientifique', 2.0, 'CP', 3),
(5, 'Arts Plastiques', 1.0, 'CP', 2),
(6, 'Éducation Physique', 1.0, 'CP', 2);

SELECT setval('matieres_id_seq', 10);

-- 4. Classes
INSERT INTO classes (id, niveau, section, cap, annee_scolaire, enseignant_titulaire_id) VALUES
(1, 'CP', 'A', 25, '2026-2027', 2),
(2, 'CP', 'B', 25, '2026-2027', 3),
(3, 'CE1', 'A', 28, '2026-2027', NULL),
(4, 'CE2', 'A', 28, '2026-2027', NULL),
(5, 'CM1', 'A', 30, '2026-2027', NULL),
(6, 'CM2', 'A', 30, '2026-2027', NULL);

SELECT setval('classes_id_seq', 10);

-- 5. Élèves
INSERT INTO eleves (id, nom, prenom, naissance, genre, classe_id, parent_id, parent_nom, parent_email, parent_tel, annee_entree, annee_scolaire, statut) VALUES
(1, 'Ben Ali', 'Yassine', '2019-04-12', 'M', 1, 5, 'Mme Sonia Ben Ali', 'parent.benali@ecole.tn', '+216 55 444 333', '2026-2027', '2026-2027', 'inscrit'),
(2, 'Trabelsi', 'Sarah', '2019-08-25', 'F', 1, NULL, 'M. Moncef Trabelsi', 'parent.trabelsi@ecole.tn', '+216 22 111 999', '2026-2027', '2026-2027', 'inscrit');

SELECT setval('eleves_id_seq', 10);

-- 6. Emploi du Temps
INSERT INTO emplois (classe_id, matiere_id, enseignant_id, salle_id, jour, debut, fin, annee_scolaire) VALUES
(1, 1, 2, 1, 'Lundi', '08:30', '10:00', '2026-2027'),
(1, 2, 3, 1, 'Lundi', '10:15', '11:45', '2026-2027'),
(1, 3, 2, 1, 'Mardi', '08:30', '10:00', '2026-2027'),
(1, 4, 3, 1, 'Mardi', '10:15', '11:45', '2026-2027');

-- 7. Notes
INSERT INTO notes (eleve_id, matiere_id, eval, note, commentaire, annee_scolaire) VALUES
(1, 1, 'Contrôle continu', 16.50, 'Très bonne participation', '2026-2027'),
(1, 1, 'Examen T1', 17.00, 'Excellent devoir', '2026-2027'),
(1, 2, 'Contrôle continu', 15.00, 'Bon travail', '2026-2027'),
(1, 2, 'Examen T1', 16.00, 'Bien maîtrisé', '2026-2027'),
(1, 3, 'Examen T1', 18.00, 'Remarquable', '2026-2027');

-- 8. Paiements & Reçus
INSERT INTO paiements (eleve_id, montant, mode, type, recu_num, date, annee_scolaire) VALUES
(1, 600.00, 'Virement', 'Scolarité T1', 'REC-2026-000101', '2026-09-05', '2026-2027'),
(2, 1200.00, 'Espèces', 'Scolarité Annuelle', 'REC-2026-000102', '2026-09-02', '2026-2027');

-- 9. Devoirs
INSERT INTO devoirs (id, titre, desc_devoir, matiere_id, classe_id, enseignant_id, date_remise, bareme, corrige, annee_scolaire) VALUES
(1, 'Exercices de grammaire - Chapitre 3', 'Faire les exercices 1 à 4 page 24 du manuel.', 1, 1, 2, '2026-10-28', 20.0, 'Corrigé officiel : Q1: Minou, Q2: Sous le fauteuil.', '2026-2027');

SELECT setval('devoirs_id_seq', 10);

-- 10. Annonces
INSERT INTO annonces (titre, contenu, cible, auteur_id, auteur_nom, annee_scolaire) VALUES
('Bienvenue pour l’année 2026-2027', 'La direction souhaite une excellente rentrée scolaire à tous les élèves et enseignants.', 'tous', 1, 'Direction Générale', '2026-2027');
