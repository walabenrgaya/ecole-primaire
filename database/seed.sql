-- =====================================================================
-- JEU DE DONNÉES DE TEST OFFICIEL MULTI-TENANT (seed.sql)
-- Inclut 2 Écoles distinctes + 1 Super-Administrateur SaaS
-- =====================================================================

-- 0. Les 2 Écoles (Tenants)
INSERT INTO schools (id, name, code, status, plan, adresse, telephone, email_contact) VALUES
(1, 'École d''Excellence (Sousse)', 'ecole-sousse', 'active', 'premium', 'Avenue Habib Bourguiba, Sousse', '+216 73 000 111', 'contact@ecole.tn'),
(2, 'École Al-Amal (Tunis)', 'ecole-tunis', 'active', 'standard', 'Rue de la Liberté, Tunis', '+216 71 222 333', 'direction@alamal.tn');

SELECT setval('schools_id_seq', 10);

-- 1. Utilisateurs
-- Super-Admin SaaS (Aucune école rattachée / vue globale)
INSERT INTO users (id, school_id, nom, email, hash, role, telephone) VALUES
(100, NULL, 'Super Administrateur SaaS', 'superadmin@saas.tn', '$2a$10$MDrD5.KZx0zdZtTAhupJqObkbZUCHyE1eaTvLLCtxNQd2aOb99f5y', 'superadmin', '+216 99 999 999');

-- Utilisateurs École 1 (Sousse) - school_id = 1
INSERT INTO users (id, school_id, nom, email, hash, role, telephone) VALUES
(1, 1, 'Direction Générale (M. Hassen)', 'admin@ecole.tn', '$2a$10$9b.lwTbE1fMiKRN.2SbvoeEPSUM8RQCz1sdhYZiWGMbT.z9j1dnou', 'admin', '+216 73 000 111'),
(2, 1, 'M. Sami Ben Salem (Sousse)', 'prof.francais@ecole.tn', '$2a$10$V2JhKtqYqehS23aY4MvGTurGsv.wsWZP8w6Hh4zw9IYxFm332NR7C', 'enseignant', '+216 98 123 456'),
(3, 1, 'Mme Leila Karray (Sousse)', 'prof.maths@ecole.tn', '$2a$10$V2JhKtqYqehS23aY4MvGTurGsv.wsWZP8w6Hh4zw9IYxFm332NR7C', 'enseignant', '+216 97 654 321'),
(4, 1, 'M. Karim Mansour (Comptabilité)', 'comptable@ecole.tn', '$2a$10$M2Uja4BkDQwWjcnudpjqMe.DEwdBZmiqCTYZU5wz/NaC.V68veIlq', 'comptable', '+216 73 222 333'),
(5, 1, 'Mme Sonia Ben Ali (Parent)', 'parent.benali@ecole.tn', '$2a$10$yNICYMXeEuxWGHtY6MhDAuWc1j1fYYCz0nf9KPtEMWFee2eQYq18u', 'parent', '+216 55 444 333'),
(6, 1, 'Yassine Ben Ali (Élève)', 'eleve.yassine@ecole.tn', '$2a$10$kNqA5Q61oP0hlnTqswox7eyz7DikfFkXfDtYPjV9TtqkaJJNSHDjq', 'eleve', NULL);

-- Utilisateurs École 2 (Tunis) - school_id = 2
INSERT INTO users (id, school_id, nom, email, hash, role, telephone) VALUES
(11, 2, 'Direction Al-Amal (Mme Chaabane)', 'admin@alamal.tn', '$2a$10$9b.lwTbE1fMiKRN.2SbvoeEPSUM8RQCz1sdhYZiWGMbT.z9j1dnou', 'admin', '+216 71 222 333'),
(12, 2, 'M. Nizar Bouazizi (Tunis)', 'prof@alamal.tn', '$2a$10$V2JhKtqYqehS23aY4MvGTurGsv.wsWZP8w6Hh4zw9IYxFm332NR7C', 'enseignant', '+216 95 111 222'),
(13, 2, 'Mme Houda Dridi (Comptable Tunis)', 'comptable@alamal.tn', '$2a$10$M2Uja4BkDQwWjcnudpjqMe.DEwdBZmiqCTYZU5wz/NaC.V68veIlq', 'comptable', '+216 71 444 555'),
(14, 2, 'M. Faouzi Gharbi (Parent Tunis)', 'parent@alamal.tn', '$2a$10$yNICYMXeEuxWGHtY6MhDAuWc1j1fYYCz0nf9KPtEMWFee2eQYq18u', 'parent', '+216 50 111 222'),
(15, 2, 'Mohamed Gharbi (Élève Tunis)', 'eleve@alamal.tn', '$2a$10$kNqA5Q61oP0hlnTqswox7eyz7DikfFkXfDtYPjV9TtqkaJJNSHDjq', 'eleve', NULL);

SELECT setval('users_id_seq', 120);

-- 2. Salles
-- École 1 (Sousse)
INSERT INTO salles (id, school_id, nom, cap, dispo, batiment) VALUES
(1, 1, 'Salle 101 (RDC)', 30, 'Disponible', 'Bâtiment A'),
(2, 1, 'Salle 102 (1er étage)', 30, 'Disponible', 'Bâtiment A'),
(3, 1, 'Salle Polyvalente', 60, 'Disponible', 'Bâtiment B'),
(4, 1, 'Labo Informatique Sousse', 25, 'Disponible', 'Bâtiment C');

-- École 2 (Tunis)
INSERT INTO salles (id, school_id, nom, cap, dispo, batiment) VALUES
(11, 2, 'Salle Al-Kindi (RDC)', 28, 'Disponible', 'Pavillon Principal'),
(12, 2, 'Salle Ibn Khaldoun', 32, 'Disponible', 'Pavillon Principal'),
(13, 2, 'Labo Sciences Tunis', 24, 'Disponible', 'Pavillon Scientifique');

SELECT setval('salles_id_seq', 20);

-- 3. Matières
-- École 1 (Sousse)
INSERT INTO matieres (id, school_id, nom, coef, niveau, enseignant_id) VALUES
(1, 1, 'Français', 3.0, 'CP', 2),
(2, 1, 'Mathématiques', 3.0, 'CP', 3),
(3, 1, 'Arabe', 3.0, 'CP', 2),
(4, 1, 'Éveil Scientifique', 1.5, 'CP', 3),
(5, 1, 'Éducation Islamique', 1.0, 'CP', 2),
(6, 1, 'Éducation Physique', 1.0, 'CP', 2);

-- École 2 (Tunis)
INSERT INTO matieres (id, school_id, nom, coef, niveau, enseignant_id) VALUES
(11, 2, 'Français', 3.0, 'CP', 12),
(12, 2, 'Mathématiques', 3.0, 'CP', 12),
(13, 2, 'Langue Arabe', 3.0, 'CP', 12);

SELECT setval('matieres_id_seq', 20);

-- 4. Classes
-- École 1 (Sousse)
INSERT INTO classes (id, school_id, niveau, section, cap, annee_scolaire, enseignant_titulaire_id) VALUES
(1, 1, 'CP', 'A', 25, '2026-2027', 2),
(2, 1, 'CP', 'B', 25, '2026-2027', 3),
(3, 1, 'CE1', 'A', 25, '2026-2027', 2);

-- École 2 (Tunis)
INSERT INTO classes (id, school_id, niveau, section, cap, annee_scolaire, enseignant_titulaire_id) VALUES
(11, 2, 'CP', '1', 22, '2026-2027', 12),
(12, 2, 'CE1', '1', 24, '2026-2027', 12);

SELECT setval('classes_id_seq', 20);

-- 5. Élèves
-- École 1 (Sousse)
INSERT INTO eleves (id, school_id, nom, prenom, matricule, naissance, genre, classe_id, parent_id, parent_nom, parent_email, parent_tel) VALUES
(1, 1, 'Ben Ali', 'Yassine (Sousse)', 'EP-2026-001', '2019-03-15', 'M', 1, 5, 'Sonia Ben Ali', 'parent.benali@ecole.tn', '+216 55 444 333'),
(2, 1, 'Trabelsi', 'Sarah (Sousse)', 'EP-2026-002', '2019-07-22', 'F', 1, 5, 'Sonia Ben Ali', 'parent.benali@ecole.tn', '+216 55 444 333');

-- École 2 (Tunis)
INSERT INTO eleves (id, school_id, nom, prenom, matricule, naissance, genre, classe_id, parent_id, parent_nom, parent_email, parent_tel) VALUES
(11, 2, 'Gharbi', 'Mohamed (Tunis)', 'ALAMAL-001', '2019-05-10', 'M', 11, 14, 'Faouzi Gharbi', 'parent@alamal.tn', '+216 50 111 222'),
(12, 2, 'Jaziri', 'Nour (Tunis)', 'ALAMAL-002', '2019-09-18', 'F', 11, 14, 'Faouzi Gharbi', 'parent@alamal.tn', '+216 50 111 222');

SELECT setval('eleves_id_seq', 20);

-- 6. Paiements
-- École 1 (Sousse)
INSERT INTO paiements (id, school_id, eleve_id, montant, mode, type, recu_num, date, annee_scolaire) VALUES
(1, 1, 1, 400.00, 'Virement', '1er Trimestre (Sousse)', 'REC-2026-001', '2026-09-05', '2026-2027'),
(2, 1, 2, 400.00, 'Espèces', '1er Trimestre (Sousse)', 'REC-2026-002', '2026-09-10', '2026-2027');

-- École 2 (Tunis)
INSERT INTO paiements (id, school_id, eleve_id, montant, mode, type, recu_num, date, annee_scolaire) VALUES
(11, 2, 11, 350.00, 'Virement', 'Frais Inscription (Tunis)', 'REC-TUNIS-001', '2026-09-02', '2026-2027'),
(12, 2, 12, 350.00, 'Mobile money', 'Frais Inscription (Tunis)', 'REC-TUNIS-002', '2026-09-03', '2026-2027');

SELECT setval('paiements_id_seq', 20);

-- 7. Notes
-- École 1 (Sousse)
INSERT INTO notes (id, school_id, eleve_id, matiere_id, eval, note, commentaire, annee_scolaire) VALUES
(1, 1, 1, 1, 'Contrôle continu', 17.50, 'Très bonne expression orale', '2026-2027'),
(2, 1, 1, 2, 'Contrôle continu', 18.00, 'Excellent en calcul mental', '2026-2027');

-- École 2 (Tunis)
INSERT INTO notes (id, school_id, eleve_id, matiere_id, eval, note, commentaire, annee_scolaire) VALUES
(11, 2, 11, 11, 'Contrôle continu', 16.00, 'Bonne maîtrise de lecture', '2026-2027'),
(12, 2, 11, 12, 'Contrôle continu', 15.50, 'Très attentif en classe', '2026-2027');

SELECT setval('notes_id_seq', 20);

-- 8. Emploi du Temps
-- École 1
INSERT INTO emplois (id, school_id, classe_id, matiere_id, enseignant_id, salle_id, jour, debut, fin, annee_scolaire) VALUES
(1, 1, 1, 1, 2, 1, 'Lundi', '08:00', '10:00', '2026-2027'),
(2, 1, 1, 2, 3, 1, 'Lundi', '10:15', '12:15', '2026-2027');

-- École 2
INSERT INTO emplois (id, school_id, classe_id, matiere_id, enseignant_id, salle_id, jour, debut, fin, annee_scolaire) VALUES
(11, 2, 11, 11, 12, 11, 'Mardi', '08:30', '10:30', '2026-2027');

SELECT setval('emplois_id_seq', 20);

-- 9. Devoirs
-- École 1
INSERT INTO devoirs (id, school_id, titre, desc_devoir, matiere_id, classe_id, enseignant_id, date_remise, bareme) VALUES
(1, 1, 'Lecture chap. 1 & 2', 'Lire attentivement et répondre aux 3 questions', 1, 1, 2, CURRENT_DATE + 3, 20.0);

-- École 2
INSERT INTO devoirs (id, school_id, titre, desc_devoir, matiere_id, classe_id, enseignant_id, date_remise, bareme) VALUES
(11, 2, 'Exercices de géométrie p.15', 'Tracer les figures indiquées au cahier d''activités', 12, 11, 12, CURRENT_DATE + 4, 20.0);

SELECT setval('devoirs_id_seq', 20);

-- 10. Annonces
-- École 1
INSERT INTO annonces (id, school_id, titre, contenu, cible, auteur_id, auteur_nom) VALUES
(1, 1, 'Bienvenue à l''École d''Excellence (Sousse)', 'Bonne rentrée scolaire 2026-2027 à tous nos élèves et parents !', 'tous', 1, 'Direction Sousse');

-- École 2
INSERT INTO annonces (id, school_id, titre, contenu, cible, auteur_id, auteur_nom) VALUES
(11, 2, 'Rentrée scolaire École Al-Amal (Tunis)', 'Réunion des parents d''élèves ce samedi à 10h00.', 'tous', 11, 'Direction Tunis');

SELECT setval('annonces_id_seq', 20);
