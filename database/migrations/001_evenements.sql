-- =====================================================================
-- Migration 001 : calendrier scolaire et évaluations planifiées
-- Idempotente : peut être rejouée à chaque démarrage sans perte de données.
--   categorie : Contrôle, Devoir surveillé, Examen, Oral de synthèse
--               (évaluations rattachées à une classe et une matière),
--               Événement, Vacances (classe_id NULL = tout l'établissement)
-- =====================================================================
CREATE TABLE IF NOT EXISTS evenements (
    id SERIAL PRIMARY KEY,
    school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    categorie VARCHAR(30) NOT NULL CHECK (categorie IN ('Contrôle', 'Devoir surveillé', 'Examen', 'Oral de synthèse', 'Événement', 'Vacances')),
    titre VARCHAR(200) NOT NULL,
    description TEXT,
    classe_id INT REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id INT REFERENCES matieres(id) ON DELETE SET NULL,
    enseignant_id INT REFERENCES users(id) ON DELETE SET NULL,
    salle_id INT REFERENCES salles(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    date_fin DATE,
    debut TIME,
    fin TIME,
    trimestre SMALLINT CHECK (trimestre BETWEEN 1 AND 3),
    annee_scolaire VARCHAR(10) NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_evenement_dates CHECK (date_fin IS NULL OR date_fin >= date),
    CONSTRAINT ck_evenement_heures CHECK (fin IS NULL OR debut IS NULL OR fin > debut)
);

CREATE INDEX IF NOT EXISTS idx_evenements_school ON evenements (school_id, annee_scolaire, date);
CREATE INDEX IF NOT EXISTS idx_evenements_classe ON evenements (classe_id, date);
