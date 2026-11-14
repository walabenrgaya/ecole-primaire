-- =====================================================================
-- SCHÉMA POSTGRESQL – PLATEFORME SAAS DE GESTION SCOLAIRE MULTI-ÉCOLES
-- Isolation des données par school_id (chaque table métier est rattachée
-- à un établissement). Historique pluriannuel via annee_scolaire.
-- =====================================================================

DROP TABLE IF EXISTS envois CASCADE;
DROP TABLE IF EXISTS absences_enseignants CASCADE;
DROP TABLE IF EXISTS depenses CASCADE;
DROP TABLE IF EXISTS frais CASCADE;
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
DROP TABLE IF EXISTS schools CASCADE;

-- 0. Établissements (tenants)
CREATE TABLE schools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    ville VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('trial', 'active', 'suspended')),
    plan VARCHAR(20) DEFAULT 'standard' CHECK (plan IN ('basic', 'standard', 'premium', 'enterprise')),
    adresse VARCHAR(255),
    telephone VARCHAR(50),
    email_contact VARCHAR(150),
    capacite_accueil INT DEFAULT 300,
    subscription_end DATE DEFAULT (CURRENT_DATE + INTERVAL '1 year'),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 1. Utilisateurs (RBAC). school_id NULL uniquement pour le super-administrateur.
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    nom VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin', 'admin', 'directeur', 'enseignant', 'comptable', 'parent', 'eleve')),
    telephone VARCHAR(30),
    specialite VARCHAR(100),
    heures_max INT DEFAULT 24,
    eleve_id INT,
    actif BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Salles
CREATE TABLE salles (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    nom VARCHAR(80) NOT NULL,
    cap INT NOT NULL DEFAULT 30 CHECK (cap > 0),
    dispo VARCHAR(20) DEFAULT 'Disponible' CHECK (dispo IN ('Disponible', 'Indisponible')),
    batiment VARCHAR(80),
    type VARCHAR(30) DEFAULT 'Classe',
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Matières (niveau = CP..CM2 ou 'Tous')
CREATE TABLE matieres (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    nom VARCHAR(100) NOT NULL,
    coef NUMERIC(3,1) NOT NULL DEFAULT 1.0 CHECK (coef > 0),
    niveau VARCHAR(20) NOT NULL DEFAULT 'Tous',
    enseignant_id INT REFERENCES users(id) ON DELETE SET NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Classes
CREATE TABLE classes (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    niveau VARCHAR(20) NOT NULL CHECK (niveau IN ('CP', 'CE1', 'CE2', 'CM1', 'CM2')),
    section VARCHAR(10) NOT NULL,
    cap INT NOT NULL DEFAULT 25 CHECK (cap > 0),
    annee_scolaire VARCHAR(10) NOT NULL,
    enseignant_titulaire_id INT REFERENCES users(id) ON DELETE SET NULL,
    salle_id INT REFERENCES salles(id) ON DELETE SET NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Élèves (dossier complet)
CREATE TABLE eleves (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    matricule VARCHAR(50),
    naissance DATE NOT NULL,
    genre CHAR(1) DEFAULT 'M' CHECK (genre IN ('M', 'F')),
    photo TEXT,
    ville VARCHAR(100),
    classe_id INT REFERENCES classes(id) ON DELETE SET NULL,
    parent_id INT REFERENCES users(id) ON DELETE SET NULL,
    parent_nom VARCHAR(150),
    parent_email VARCHAR(150),
    parent_tel VARCHAR(30),
    antecedents_medicaux TEXT DEFAULT 'Aucun',
    annee_entree VARCHAR(10) NOT NULL,
    annee_scolaire VARCHAR(10) NOT NULL,
    statut VARCHAR(30) DEFAULT 'inscrit' CHECK (statut IN ('inscrit', 'radie', 'abandon')),
    date_depart DATE,
    motif_depart VARCHAR(200),
    consentement_rgpd BOOLEAN DEFAULT TRUE,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_eleve_matricule UNIQUE (school_id, matricule)
);

-- 6. Emploi du temps
CREATE TABLE emplois (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    classe_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id INT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    enseignant_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    salle_id INT REFERENCES salles(id) ON DELETE SET NULL,
    jour VARCHAR(15) NOT NULL CHECK (jour IN ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi')),
    debut TIME NOT NULL,
    fin TIME NOT NULL CHECK (fin > debut),
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Notes (par trimestre : contrôle continu + examen)
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    eleve_id INT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    matiere_id INT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    eval VARCHAR(50) NOT NULL CHECK (eval IN ('Contrôle continu', 'Examen')),
    trimestre SMALLINT NOT NULL DEFAULT 1 CHECK (trimestre BETWEEN 1 AND 3),
    note NUMERIC(4,2) NOT NULL CHECK (note >= 0 AND note <= 20),
    commentaire TEXT,
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Absences et retards des élèves
CREATE TABLE absences (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    eleve_id INT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type VARCHAR(20) DEFAULT 'Absence' CHECK (type IN ('Absence', 'Retard')),
    creneau VARCHAR(30) DEFAULT 'Matinée',
    matiere VARCHAR(100),
    motif TEXT,
    justifiee BOOLEAN DEFAULT FALSE,
    justification_parent TEXT,
    statut VARCHAR(50) DEFAULT 'Non justifiée' CHECK (statut IN ('Non justifiée', 'En attente de validation', 'Justifiée', 'Rejetée')),
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Grille tarifaire par année et par niveau
CREATE TABLE frais (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    annee_scolaire VARCHAR(10) NOT NULL,
    niveau VARCHAR(20) NOT NULL DEFAULT 'Tous',
    inscription NUMERIC(10,2) NOT NULL DEFAULT 0,
    scolarite NUMERIC(10,2) NOT NULL DEFAULT 0,
    nb_tranches SMALLINT NOT NULL DEFAULT 3,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_frais UNIQUE (school_id, annee_scolaire, niveau)
);

-- 10. Paiements
CREATE TABLE paiements (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    eleve_id INT NOT NULL REFERENCES eleves(id) ON DELETE RESTRICT,
    montant NUMERIC(10,2) NOT NULL CHECK (montant > 0),
    mode VARCHAR(30) NOT NULL CHECK (mode IN ('Espèces', 'Virement', 'Mobile money', 'Chèque')),
    type VARCHAR(50) DEFAULT 'Scolarité',
    recu_num VARCHAR(50) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_paiement_recu UNIQUE (school_id, recu_num)
);

-- 11. Dépenses de l'établissement (pour la prévision budgétaire)
CREATE TABLE depenses (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    categorie VARCHAR(50) NOT NULL,
    libelle VARCHAR(200),
    montant NUMERIC(10,2) NOT NULL CHECK (montant > 0),
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. Devoirs
CREATE TABLE devoirs (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    titre VARCHAR(200) NOT NULL,
    desc_devoir TEXT,
    matiere_id INT NOT NULL REFERENCES matieres(id) ON DELETE CASCADE,
    classe_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    enseignant_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_assignation DATE DEFAULT CURRENT_DATE,
    date_remise DATE NOT NULL,
    bareme NUMERIC(4,1) DEFAULT 20.0,
    piece_jointe VARCHAR(255),
    corrige TEXT,
    corrige_fichier VARCHAR(255),
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. Travaux rendus
CREATE TABLE devoirs_rendus (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    devoir_id INT NOT NULL REFERENCES devoirs(id) ON DELETE CASCADE,
    eleve_id INT NOT NULL REFERENCES eleves(id) ON DELETE CASCADE,
    eleve_nom VARCHAR(150),
    contenu TEXT,
    fichier VARCHAR(255),
    date_depot TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    statut VARCHAR(30) DEFAULT 'rendu' CHECK (statut IN ('rendu', 'en_retard', 'corrige')),
    note NUMERIC(4,1),
    bareme NUMERIC(4,1) DEFAULT 20.0,
    commentaire_enseignant TEXT,
    vu_par_parent BOOLEAN DEFAULT FALSE,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_devoir_eleve UNIQUE (devoir_id, eleve_id)
);

-- 14. Pré-inscriptions en ligne
CREATE TABLE preinscriptions (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    naissance DATE,
    genre CHAR(1) DEFAULT 'M',
    niveau_demande VARCHAR(20) NOT NULL,
    parent_nom VARCHAR(150) NOT NULL,
    parent_email VARCHAR(150) NOT NULL,
    parent_tel VARCHAR(30),
    adresse TEXT,
    ville VARCHAR(100),
    antecedents_medicaux TEXT DEFAULT 'Aucun',
    statut VARCHAR(30) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
    annee_scolaire VARCHAR(10) NOT NULL,
    eleve_cree_id INT REFERENCES eleves(id) ON DELETE SET NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. Annonces (immuables une fois publiées)
CREATE TABLE annonces (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    titre VARCHAR(200) NOT NULL,
    contenu TEXT NOT NULL,
    cible VARCHAR(30) DEFAULT 'tous' CHECK (cible IN ('tous', 'parents', 'enseignants', 'eleves')),
    importante BOOLEAN DEFAULT FALSE,
    corrige_annonce_id INT REFERENCES annonces(id),
    auteur_id INT REFERENCES users(id) ON DELETE SET NULL,
    auteur_nom VARCHAR(150),
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. Messagerie interne (messages envoyés immuables)
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    de_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    de_nom VARCHAR(150),
    de_role VARCHAR(20),
    a_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    a_nom VARCHAR(150),
    a_role VARCHAR(20),
    eleve_id INT REFERENCES eleves(id) ON DELETE SET NULL,
    categorie VARCHAR(30) DEFAULT 'information' CHECK (categorie IN ('information', 'pedagogique', 'administratif', 'paiement', 'reclamation', 'demande', 'rappel')),
    objet VARCHAR(200),
    corps TEXT,
    piece_jointe VARCHAR(255),
    brouillon BOOLEAN DEFAULT FALSE,
    auto BOOLEAN DEFAULT FALSE,
    lu BOOLEAN DEFAULT FALSE,
    lu_at TIMESTAMPTZ,
    traite BOOLEAN DEFAULT FALSE,
    masque_par INT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 17. Notifications in-app
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    titre VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) DEFAULT 'info',
    lien VARCHAR(255),
    lu BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 18. Journal des envois automatiques (message / e-mail) – traçabilité §8.2
CREATE TABLE envois (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    canal VARCHAR(20) NOT NULL CHECK (canal IN ('messagerie', 'email', 'push')),
    destinataire_id INT REFERENCES users(id) ON DELETE SET NULL,
    destinataire VARCHAR(150),
    objet VARCHAR(200),
    reference VARCHAR(100),
    statut VARCHAR(20) NOT NULL CHECK (statut IN ('envoye', 'simule', 'echec')),
    erreur TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 19. Absences des enseignants et remplacements (tableau de bord RH)
CREATE TABLE absences_enseignants (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    enseignant_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    nb_heures NUMERIC(4,1) DEFAULT 4,
    motif VARCHAR(150),
    remplacant_id INT REFERENCES users(id) ON DELETE SET NULL,
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 20. Journal d'audit (anciennes / nouvelles valeurs, consultations)
CREATE TABLE logs (
    id SERIAL PRIMARY KEY,
    school_id INT REFERENCES schools(id) ON DELETE CASCADE,
    user_id VARCHAR(50),
    nom VARCHAR(150),
    role VARCHAR(20),
    action VARCHAR(150) NOT NULL,
    entite VARCHAR(50),
    entite_id VARCHAR(50),
    avant JSONB,
    apres JSONB,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- INDEX (isolation par établissement + requêtes analytiques BI)
-- =====================================================================
CREATE INDEX idx_users_school ON users (school_id, role);
CREATE INDEX idx_salles_school ON salles (school_id);
CREATE INDEX idx_matieres_school ON matieres (school_id);
CREATE INDEX idx_classes_school ON classes (school_id, annee_scolaire);
CREATE INDEX idx_eleves_school ON eleves (school_id, annee_scolaire);
CREATE INDEX idx_eleves_parent ON eleves (parent_id);
CREATE INDEX idx_emplois_school ON emplois (school_id, annee_scolaire);
CREATE INDEX idx_emplois_conflit ON emplois (school_id, jour, debut, fin, annee_scolaire) WHERE deleted = FALSE;
CREATE INDEX idx_notes_school ON notes (school_id, annee_scolaire, trimestre);
CREATE INDEX idx_notes_eleve ON notes (eleve_id);
CREATE INDEX idx_absences_school ON absences (school_id, annee_scolaire);
CREATE INDEX idx_absences_eleve ON absences (eleve_id);
CREATE INDEX idx_paiements_school ON paiements (school_id, annee_scolaire);
CREATE INDEX idx_paiements_eleve ON paiements (eleve_id);
CREATE INDEX idx_depenses_school ON depenses (school_id, annee_scolaire);
CREATE INDEX idx_devoirs_school ON devoirs (school_id);
CREATE INDEX idx_devoirs_rendus_school ON devoirs_rendus (school_id);
CREATE INDEX idx_preinscriptions_school ON preinscriptions (school_id);
CREATE INDEX idx_annonces_school ON annonces (school_id);
CREATE INDEX idx_messages_school ON messages (school_id);
CREATE INDEX idx_messages_a ON messages (a_id);
CREATE INDEX idx_messages_de ON messages (de_id);
CREATE INDEX idx_notifications_user ON notifications (user_id, lu);
CREATE INDEX idx_envois_school ON envois (school_id);
CREATE INDEX idx_logs_school ON logs (school_id, created_at DESC);
