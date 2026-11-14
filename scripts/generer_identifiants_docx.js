// Génère docs/Identifiants_EduPilot.docx : URL + comptes de démonstration par établissement.
// Usage : APP_URL=https://edupilot.onrender.com npm run docs
import fs from 'fs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType } from 'docx';
import { ECOLES, SUPERADMIN, MOTS_DE_PASSE, emailDemo } from '../server/demo-accounts.js';

const URL = process.env.APP_URL || 'https://edupilot.onrender.com (à compléter après déploiement)';
const ROLES = [['admin', 'Administrateur de l\'établissement'], ['directeur', 'Directeur'], ['enseignant', 'Enseignant'], ['comptable', 'Comptable'], ['parent', 'Parent'], ['eleve', 'Élève']];
const cell = (t, bold) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold, size: 20 })] })] });
const table = rows => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r, i) => new TableRow({ children: r.map(c => cell(c, i === 0)) })) });

const children = [
  new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun('EduPilot – Identifiants de démonstration')] }),
  new Paragraph({ children: [new TextRun({ text: 'Projet pratique Cloud & Big Data – Application SaaS de gestion scolaire avec module BI', italics: true })] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Accès à l\'application')] }),
  new Paragraph({ children: [new TextRun({ text: 'URL : ', bold: true }), new TextRun(URL)] }),
  new Paragraph({ children: [new TextRun('Comptes de démonstration uniquement, mots de passe temporaires, aucune donnée personnelle réelle.')] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Éditeur de la plateforme (super-administrateur SaaS)')] }),
  table([['Rôle', 'Identifiant', 'Mot de passe'], ['Super-administrateur', SUPERADMIN.email, MOTS_DE_PASSE.superadmin]])
];
for (const E of ECOLES) {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${E.name} (${E.ville})`)] }));
  children.push(table([['Rôle', 'Nom', 'Identifiant', 'Mot de passe'], ...ROLES.map(([r, l]) => [l, E.comptes[r], emailDemo(E, r), MOTS_DE_PASSE[r]])]));
}
fs.writeFileSync('docs/Identifiants_EduPilot.docx', await Packer.toBuffer(new Document({ sections: [{ children }] })));
console.log('docs/Identifiants_EduPilot.docx généré');
