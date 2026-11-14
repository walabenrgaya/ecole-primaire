# Module Business Intelligence et aide à la décision

Accès : directeur, administrateur (et comptable pour le volet financier). Menu **Aide à la décision**.
Les indicateurs sont calculés côté serveur (`server/lib/bi.js`) à partir des données opérationnelles de l'établissement, regroupées dans un entrepôt logique en mémoire rafraîchi toutes les 60 secondes (bouton *Actualiser* pour forcer). Le super-administrateur dispose d'une vue comparative de tous les établissements (console *Établissements*).

| # | Tableau de bord | Indicateurs | Méthodes |
|---|---|---|---|
| 1 | **Vue générale** | Élèves, enseignants, classes, ratio élèves/enseignant, répartition par niveau et par classe, évolution des inscriptions sur 3 ans, effectifs vs capacité | Alertes : classe saturée ≥ 95 %, sous-remplie < 60 % |
| 2 | **Finances** | Frais attendus, encaissé, reste, taux de recouvrement annuel et **exigible** (échéancier : inscription en septembre, tranches 15/09, 15/01, 15/04), retardataires, recettes mensuelles N vs N-1, dépenses, modes de paiement | Prévision : saisonnalité de N-1 × coefficient de tendance, plafonnée par le reste à encaisser, fourchette ±10–15 % |
| 3 | **Pédagogie** | Moyenne par classe, niveau, matière ; réussite / échec ; distribution ; évolution entre trimestres (N et N-1) ; classement des matières ; élèves à accompagner | Moyenne matière = 40 % CC + 60 % examen ; générale pondérée par coefficients ; accompagnement si moyenne < 10, baisse ≥ 1,5 pt ou ≥ 3 matières < 10 |
| 4 | **Absences et retards** | Taux d'absentéisme (par classe, par élève), justifiées / non justifiées, justifications en attente, absences répétitives, évolution mensuelle | Taux = jours d'absence / (élèves × jours de classe écoulés) ; **corrélation de Pearson** absentéisme / moyenne avec nuage de points |
| 5 | **Enseignants (RH)** | Enseignants par matière et niveau, charge horaire hebdomadaire vs maximum, répartition des heures, absences et taux de remplacement | Surcharge > maximum contractuel, sous-charge < 60 % |
| 6 | **Inscriptions et fidélisation** | Nouvelles inscriptions, réinscriptions, taux de renouvellement, départs et abandons (motifs), origine géographique, pré-inscriptions en attente | Prévision N+1 = (effectif − CM2 sortants) × taux de renouvellement + nouveaux (régression linéaire) |
| 7 | **Communication parents** | Messages envoyés (dont automatiques), taux de lecture des messages et notifications, parents non lecteurs / inactifs, réclamations ouvertes / traitées | Suivi à renforcer : parent peu actif **et** enfant en difficulté (moyenne < 10 ou ≥ 5 absences) |
| 8 | **Emplois du temps et ressources** | Taux d'occupation des salles, salles sous-utilisées, heures par jour et par enseignant, conflits d'horaires, équilibre des emplois du temps | Occupation = heures planifiées / 30 h ; équilibre par écart-type des heures quotidiennes |
| 9 | **Alertes précoces (Early Warning)** | Élèves à risque d'échec, d'abandon, d'impayé ; cumul absences + baisse des résultats ; alertes avec action recommandée | Score 0–100 pondéré (notes, baisse, absentéisme, retard de paiement) ; élevé ≥ 60, modéré ≥ 35 |
| 10 | **Stratégie** | Prévision des effectifs, recettes et dépenses ; besoins en classes, enseignants, salles ; scénarios pessimiste / tendanciel / optimiste ; comparaison pluriannuelle ; **recommandations automatiques** | Simulateur interactif (variation des effectifs, recouvrement, frais, élèves par classe) ; moteur de règles alimenté par les 9 autres tableaux |

## Données de démonstration

`server/seed.js` génère, de façon reproductible, 3 établissements sur 3 années scolaires (≈ 500 élèves inscrits, ≈ 47 000 notes, ≈ 2 600 paiements, absences, messages, dépenses), avec des profils réalistes (élèves en baisse, familles en retard de paiement, parents peu actifs, classes saturées ou sous-remplies) afin que chaque tableau de bord présente des situations exploitables.
