-- =====================================================================
-- SCHÉMA RELATIONNEL POSTGRESQL OFFICIEL (Chapitres 1.4, 16, 18 du CDC)
-- Application Web de Gestion d'École Primaire (Mono-École)
-- Auteur : Dr Hamdi Hassen - ISG Sousse
-- Année scolaire de référence : 2026-2027
-- =====================================================================

-- Suppression préalable si reconstruction
DROP TABLE IF EXISTS devoirs_rendus CASCADE;
DROP TABLE IF EXISTS devoirs CASCADE;
DROP TABLE IF EXISTS absences CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS paiements CASCADE;
DROP TABLE IF EXISTS emplois CASCADE;
DROP TABLE IF EXISTS eleves CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS matieres CASCADE;
DROP TABLE IF EXISTS salles CASCADE;
DROP TABLE IF EXISTS preinscriptions CASCADE;
DROP TABLE IF EXISTS annonces CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Table Utilisateurs (RBAC)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'enseignant', 'comptable', 'parent', 'eleve')),
    telephone VARCHAR(30),
    eleve_id INT,
    classe VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table Salles
CREATE TABLE salles (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(80) NOT NULL,
    cap INT NOT NULL DEFAULT 30,
    dispo VARCHAR(20) DEFAULT 'Disponible' CHECK (dispo IN ('Disponible', 'Indisponible')),
    batiment VARCHAR(80),
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table Matières
CREATE TABLE matieres (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    coef NUMERIC(3,1) NOT NULL DEFAULT 1.0,
    niveau VARCHAR(20) NOT NULL,
    enseignant_id INT REFERENCES users(id) ON DELETE SET NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Table Classes (avec annee_scolaire)
CREATE TABLE classes (
    id SERIAL PRIMARY KEY,
    niveau VARCHAR(20) NOT NULL CHECK (niveau IN ('CP', 'CE1', 'CE2', 'CM1', 'CM2')),
    section VARCHAR(10) NOT NULL,
    cap INT NOT NULL DEFAULT 25,
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    enseignant_titulaire_id INT REFERENCES users(id) ON DELETE SET NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table Élèves (Dossier complet & coordonnées parent)
CREATE TABLE eleves (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    naissance DATE NOT NULL,
    genre CHAR(1) DEFAULT 'M' CHECK (genre IN ('M', 'F')),
    photo TEXT,
    classe_id INT REFERENCES classes(id) ON DELETE RESTRICT,
    parent_id INT REFERENCES users(id) ON DELETE SET NULL,
    parent_nom VARCHAR(150),
    parent_email VARCHAR(150),
    parent_tel VARCHAR(30),
    antecedents_medicaux TEXT DEFAULT 'Aucun',
    annee_entree VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    statut VARCHAR(30) DEFAULT 'inscrit' CHECK (statut IN ('inscrit', 'pre-inscription', 'radie')),
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Table Emploi du Temps (avec détection de conflits & annee_scolaire)
CREATE TABLE emplois (
    id SERIAL PRIMARY KEY,
    classe_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id INT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    enseignant_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    salle_id INT NOT NULL REFERENCES salles(id) ON DELETE CASCADE,
    jour VARCHAR(15) NOT NULL CHECK (jour IN ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi')),
    debut TIME NOT NULL,
    fin TIME NOT NULL,
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour détection rapide des conflits
CREATE INDEX idx_emplois_conflit ON emplois (jour, debut, fin, annee_scolaire) WHERE deleted = FALSE;

-- 7. Table Notes & Évaluations (avec annee_scolaire)
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    eleve_id INT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    matiere_id INT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    eval VARCHAR(50) NOT NULL CHECK (eval IN ('Contrôle continu', 'Examen T1', 'Examen T2', 'Examen T3')),
    note NUMERIC(4,2) NOT NULL CHECK (note >= 0 AND note <= 20),
    commentaire TEXT,
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Table Absences & Justifications (avec annee_scolaire)
CREATE TABLE absences (
    id SERIAL PRIMARY KEY,
    eleve_id INT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    creneau VARCHAR(30) DEFAULT 'Matinée',
    matiere VARCHAR(100),
    motif TEXT,
    justifiee BOOLEAN DEFAULT FALSE,
    justification_parent TEXT,
    statut VARCHAR(50) DEFAULT 'Non justifiée' CHECK (statut IN ('Non justifiée', 'En attente de validation', 'Justifiée', 'Rejetée')),
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Table Paiements & Reçus (avec annee_scolaire)
CREATE TABLE paiements (
    id SERIAL PRIMARY KEY,
    eleve_id INT NOT NULL REFERENCES eleves(id) ON DELETE RESTRICT,
    montant NUMERIC(10,2) NOT NULL CHECK (montant > 0),
    mode VARCHAR(30) NOT NULL CHECK (mode IN ('Espèces', 'Virement', 'Mobile money')),
    type VARCHAR(50) DEFAULT 'Scolarité',
    recu_num VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Table Devoirs (Homework)
CREATE TABLE devoirs (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(200) NOT NULL,
    desc_devoir TEXT,
    matiere_id INT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    classe_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    enseignant_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_assignation DATE DEFAULT CURRENT_DATE,
    date_remise DATE NOT NULL,
    bareme NUMERIC(4,2) DEFAULT 20.0,
    corrige TEXT,
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Table Devoirs Rendus (Submissions élèves)
CREATE TABLE devoirs_rendus (
    id SERIAL PRIMARY KEY,
    devoir_id INT NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
    eleve_id INT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    eleve_nom VARCHAR(150),
    contenu TEXT,
    fichier VARCHAR(255),
    date_depot TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    statut VARCHAR(30) DEFAULT 'rendu' CHECK (statut IN ('rendu', 'en_retard', 'corrige')),
    note NUMERIC(4,2),
    bareme NUMERIC(4,2) DEFAULT 20.0,
    commentaire_enseignant TEXT,
    vu_par_parent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_devoir_eleve UNIQUE (devoir_id, eleve_id)
);

-- 12. Table Pré-inscriptions en Ligne
CREATE TABLE preinscriptions (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    naissance DATE NOT NULL,
    genre CHAR(1) DEFAULT 'M',
    niveau_demande VARCHAR(20) NOT NULL,
    parent_nom VARCHAR(150) NOT NULL,
    parent_email VARCHAR(150) NOT NULL,
    parent_tel VARCHAR(30),
    adresse TEXT,
    antecedents_medicaux TEXT DEFAULT 'Aucun',
    statut VARCHAR(30) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    eleve_cree_id INT REFERENCES eleves(id) ON DELETE SET NULL,
    date_demande TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Table Annonces Officielles (Immuables)
CREATE TABLE annonces (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(200) NOT NULL,
    contenu TEXT NOT NULL,
    cible VARCHAR(30) DEFAULT 'tous' CHECK (cible IN ('tous', 'parents', 'enseignants', 'eleves')),
    auteur_id INT REFERENCES users(id) ON DELETE SET NULL,
    auteur_nom VARCHAR(150),
    annee_scolaire VARCHAR(10) NOT NULL DEFAULT '2026-2027',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Table Messages (Messagerie Interne Traçable)
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    de_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    de_nom VARCHAR(150),
    de_role VARCHAR(20),
    a_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    a_nom VARCHAR(150),
    a_role VARCHAR(20),
    objet VARCHAR(200) NOT NULL,
    corps TEXT NOT NULL,
    brouillon BOOLEAN DEFAULT FALSE,
    auto BOOLEAN DEFAULT FALSE,
    masque_par INT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. Table Notifications In-App
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    titre VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) DEFAULT 'info',
    lien VARCHAR(255),
    lu BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Table Journal d'Audit & Sécurité
CREATE TABLE logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    nom VARCHAR(150),
    action VARCHAR(150) NOT NULL,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
