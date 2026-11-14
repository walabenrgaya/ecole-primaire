/**
 * Comptes de démonstration (mots de passe temporaires, aucune donnée réelle).
 * Utilisés par le générateur de données et par le document Word des identifiants.
 */
export const MOTS_DE_PASSE = {
  superadmin: 'Demo#Saas2026',
  admin: 'Demo#Admin2026',
  directeur: 'Demo#Direct2026',
  enseignant: 'Demo#Prof2026',
  comptable: 'Demo#Compta2026',
  parent: 'Demo#Parent2026',
  eleve: 'Demo#Eleve2026'
};

export const SUPERADMIN = { nom: 'Équipe EduPilot (éditeur SaaS)', email: 'superadmin@edupilot-demo.tn' };

export const ECOLES = [
  {
    code: 'chebbi-sousse', domaine: 'chebbi.demo.tn',
    name: 'École Primaire Abou El Kacem Chebbi', ville: 'Sousse', plan: 'premium', status: 'active',
    adresse: '12 avenue Habib Bourguiba, Sousse', telephone: '+216 73 000 101', capacite: 280,
    sections: { CP: ['A', 'B'], CE1: ['A', 'B'], CE2: ['A', 'B'], CM1: ['A', 'B'], CM2: ['A', 'B'] }, cap: 26,
    scolarite: 1500, inscription: 180, niveauMoyen: 12.6, villes: [['Sousse', 55], ['Hammam Sousse', 18], ['Msaken', 12], ['Akouda', 9], ['Kalâa Kebira', 6]],
    comptes: {
      admin: 'Mme Rania Trabelsi', directeur: 'M. Hédi Ben Amor', enseignant: 'Mme Leila Karray',
      comptable: 'M. Karim Mansour', parent: 'Mme Sonia Ben Ali', eleve: 'Yassine Ben Ali'
    }
  },
  {
    code: 'ibnkhaldoun-tunis', domaine: 'ibnkhaldoun.demo.tn',
    name: 'École Privée Ibn Khaldoun', ville: 'Tunis', plan: 'standard', status: 'active',
    adresse: '45 rue de Marseille, Tunis', telephone: '+216 71 000 202', capacite: 240,
    sections: { CP: ['A', 'B'], CE1: ['A'], CE2: ['A', 'B'], CM1: ['A'], CM2: ['A', 'B'] }, cap: 28,
    scolarite: 1300, inscription: 150, niveauMoyen: 11.4, villes: [['Tunis', 40], ['Ariana', 22], ['La Marsa', 14], ['Le Bardo', 14], ['Ben Arous', 10]],
    comptes: {
      admin: 'M. Walid Chaabane', directeur: 'Mme Najet Dridi', enseignant: 'M. Nizar Bouazizi',
      comptable: 'Mme Houda Gharsalli', parent: 'M. Faouzi Gharbi', eleve: 'Mohamed Gharbi'
    }
  },
  {
    code: 'oliviers-sfax', domaine: 'oliviers.demo.tn',
    name: 'École Les Oliviers', ville: 'Sfax', plan: 'basic', status: 'trial',
    adresse: 'Route de Tunis km 4, Sfax', telephone: '+216 74 000 303', capacite: 150,
    sections: { CP: ['A'], CE1: ['A'], CE2: ['A'], CM1: ['A'], CM2: ['A'] }, cap: 24,
    scolarite: 1150, inscription: 120, niveauMoyen: 11.9, villes: [['Sfax', 62], ['Sakiet Ezzit', 20], ['Sakiet Eddaier', 18]],
    comptes: {
      admin: 'Mme Amel Kammoun', directeur: 'M. Slim Ellouze', enseignant: 'Mme Ines Frikha',
      comptable: 'M. Anis Chaker', parent: 'Mme Mouna Jallouli', eleve: 'Lina Jallouli'
    }
  }
];

export const emailDemo = (ecole, role) => `${role}@${ecole.domaine}`;
