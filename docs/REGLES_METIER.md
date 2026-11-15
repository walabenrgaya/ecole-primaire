# Règles métier : qui est responsable de quoi

Les droits ne dépendent pas seulement du rôle : le serveur vérifie aussi **le lien entre l'utilisateur et la donnée** (sa classe, sa matière, son enfant, son devoir). Toutes ces règles sont appliquées côté API (l'interface masque seulement les boutons) et couvertes par les tests automatisés (`npm test`, section 7).

## Matrice des responsabilités

| Action | Élève | Parent | Enseignant | Comptable | Directeur | Administrateur | Éditeur SaaS |
|---|---|---|---|---|---|---|---|
| Attribuer / modifier une note | – | – | **Oui, uniquement dans les matières qu'il enseigne à la classe de l'élève** | – | Consultation | Consultation | Consultation |
| Publier / modifier un devoir | – | – | **Oui, dans ses matières ; seulement ses propres devoirs** | – | Consultation | Consultation | Consultation |
| **Rendre un devoir** | **Oui, uniquement son propre travail** | Non (consulte et marque « vu ») | – | – | – | – | – |
| Noter un devoir rendu, publier le corrigé | – | – | **Oui, uniquement ses devoirs** | – | – | – | – |
| Planifier contrôle / devoir surveillé | – | – | **Oui, dans ses matières et ses classes** | – | Peut retirer (modération) | Peut retirer (modération) | – |
| Planifier examen / oral de synthèse | – | – | – | – | **Oui** | **Oui** | – |
| Événements et vacances | – | – | – | – | **Oui** | **Oui** | – |
| Saisir une absence | – | – | Oui, élèves de ses classes | – | – | Oui | – |
| Justifier une absence | – | **Oui, pour ses enfants** | – | – | – | – | – |
| Valider une justification | – | – | Oui, élèves de ses classes | – | Oui | Oui | – |
| Encaisser un paiement, relancer | – | – | – | **Oui** | Consultation | Oui | – |
| Inscriptions, dossiers élèves | – | Pré-inscription en ligne | – | **Oui** | Consultation | Oui | – |
| Classes, matières, salles, emploi du temps | – | – | – | – | Consultation | **Oui** | – |
| Comptes utilisateurs | – | – | – | – | Consultation | **Oui** | – |
| Annonces | – | – | – | – | **Oui** | **Oui** | – |
| Module BI | – | – | – | Finances | **Oui** | **Oui** | Vue comparative |
| Établissements (SaaS) | – | – | – | – | – | – | **Oui** |

## Règles complémentaires

- **Notes archivées** : les notes d'une année scolaire terminée ne peuvent plus être modifiées.
- **Évaluations** : pas pendant les vacances, pas de chevauchement pour une même classe, au plus 2 par jour et par classe.
- **Devoirs rendus** : remplaçables jusqu'à la date limite ; un travail déjà corrigé n'est plus modifiable.
- **Messages envoyés et annonces publiées** : immuables (correctif publié en cas d'erreur).
- **Éditeur SaaS (super-administrateur)** : gère les établissements et consulte les données d'un établissement en mode assistance (tableaux de bord, journal, impayés), **sans pouvoir rien modifier** (notes, paiements, messages…).
- **Traçabilité** : chaque création, modification et suppression est enregistrée dans le journal d'audit avec les anciennes et nouvelles valeurs.
