# Documentation des Maquettes & Design System (UI/UX)
## Application Web de Gestion d'École Primaire (Mono-École)
**Conforme aux Livrables du Cahier des Charges (Chapitres 17 & 21)**

---

## 1. Charte Graphique & Tokens de Design

### 1.1 Typographie
- **Police Principale :** `Plus Jakarta Sans`, sans-serif (chargée via Google Fonts).
- **Alternatives système :** `system-ui`, `-apple-system`, `sans-serif`.
- **Hiérarchie :**
  - Titres de section : 22px / 800 (Bold)
  - Sous-titres & Cartes : 16px / 700 (Semi-Bold)
  - Corps de texte : 13.5px / 500 (Regular)
  - Badges & Métadonnées : 11.5px / 700 (Uppercase)

### 1.2 Palette de Couleurs (Light / Dark Mode)
| Rôle / Token | Mode Clair | Mode Sombre | Utilisation |
| :--- | :---: | :---: | :--- |
| **Arrière-plan principal** | `#f8fafc` | `#0b0f19` | Fond de page |
| **Cartes & Conteneurs** | `#ffffff` | `#131b2e` | Blocs, tables, formulaires |
| **Bordures** | `#e2e8f0` | `#22304f` | Séparateurs nets et élégants |
| **Primaire (Action)** | `#2563eb` | `#3b82f6` | Boutons principaux, liens, onglets actifs |
| **Succès (Validation)** | `#10b981` | `#34d399` | Statuts payés, notes excellentes, justifications |
| **Avertissement (Relance)** | `#f59e0b` | `#fbbf24` | Impayés, retards, devoirs en cours |
| **Danger (Suppression)** | `#ef4444` | `#f87171` | Alertes, suppressions, impayés critiques |

---

## 2. Parcours Utilisateurs Critiques

### 2.1 Parcours 1 : Pré-inscription en ligne et Validation
```
[Parent / Public]               [Direction / Secrétariat]
        |                                   |
1. Clic sur "Pré-inscription"               |
2. Saisie nom, niveau, tuteur               |
3. Soumission du dossier                    |
        |-----> [Base: preinscriptions] --->|
                                            4. Notification reçue dans le portail
                                            5. Examen des pièces & choix de la classe
                                            6. Clic "Valider l'inscription"
                                                    |
                                            7. Création auto élève + compte parent
                                            8. Envoi e-mail de confirmation
```

### 2.2 Parcours 2 : Saisie des Notes & Génération de Bulletins
```
[Enseignant]                              [Parent d'Élève]
     |                                           |
1. Sélection de la classe et matière             |
2. Choix de l'évaluation (Contrôle, T1...)       |
3. Saisie de la note /20 et appréciation         |
4. Enregistrement sécurisé                       |
     |                                           |
     +-----> [Calcul moyennes pondérées] ------->+
                                                 5. Consultation temps réel
                                                 6. Clic sur "Bulletin Officiel"
                                                 7. Aperçu complet conforme
                                                 8. Impression / Sauvegarde PDF
```

### 2.3 Parcours 3 : Paiement, Reçu Officiel & Relance d'Impayés
```
[Comptable]                               [Parent]
     |                                       |
1. Saisie montant, mode, type                |
2. Génération n° reçu unique (REC-2026-X)    |
3. Mise à jour instantanée du solde          |
4. Notification automatique générée -------->| 5. Message reçu avec solde restant
                                             6. Téléchargement du reçu PDF
[Cas d'Impayé]                               |
7. Détection automatique dans "Impayés"      |
8. Clic "Relancer le parent" 1-clic -------->| 9. Réception du rappel formel
```

### 2.4 Parcours 4 : Devoirs, Dépôt Élève & Notation
```
[Enseignant]                     [Élève]                     [Parent]
     |                              |                           |
1. Publication devoir               |                           |
   (consignes, date limite)         |                           |
     +----------------------------->+ 2. Notification reçue     |
                                    3. Dépôt devoir             |
     |<-----------------------------+   (texte / PDF)           |
4. Correction & Note                                            |
5. Publication corrigé                                          |
     +----------------------------->+ 6. Consultation note      |
     +--------------------------------------------------------->+ 7. Suivi & clic
                                                                     "Marquer vu"
```

---

## 3. Spécifications de la PWA (Mobile-First)
- **Manifest (`manifest.json`) :** Configuration en mode `standalone` sans barre d'adresse navigateur pour une expérience native sur Android et iOS.
- **Service Worker (`sw.js`) :** Mise en cache du shell applicatif (`index.html`, bundles JS/CSS) pour un lancement ultra-rapide et tolérant aux micro-coupures réseau.
- **Mise en page réactive :** Grille fluide s'adaptant des smartphones (360px) aux écrans 4K (desktop).
