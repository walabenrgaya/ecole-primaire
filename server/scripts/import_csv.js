import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { ENT } from '../models.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecole';
const AN = process.env.ANNEE_SCOLAIRE || '2026-2027';

const csvFilePath = process.argv[2] || path.resolve('eleves_import.csv');

if (!fs.existsSync(csvFilePath)) {
  console.log(`Fichier introuvable : ${csvFilePath}`);
  console.log('Usage: node scripts/import_csv.js [chemin_vers_fichier.csv]');
  process.exit(1);
}

console.log('Connexion à MongoDB...');
await mongoose.connect(MONGO_URI);

const content = fs.readFileSync(csvFilePath, 'utf8').replace(/^\uFEFF/, '');
const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

if (lines.length <= 1) {
  console.log('Le fichier CSV ne contient aucune donnée.');
  process.exit(0);
}

const header = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim());
console.log('Colonnes détectées :', header);

let importedCount = 0;
for (let i = 1; i < lines.length; i++) {
  const row = lines[i].split(';').map(col => col.replace(/^"|"$/g, '').trim());
  if (row.length < 2) continue;

  const nom = row[1] || row[0];
  const prenom = row[2] || '';
  const naissance = row[3] || '2019-01-01';
  const genre = row[4] || 'M';
  const parentNom = row[6] || '';
  const parentEmail = row[7] || '';
  const parentTel = row[8] || '';

  if (nom) {
    await ENT.eleves.create({
      nom,
      prenom,
      naissance,
      genre,
      parentNom,
      parentEmail,
      parentTel,
      anneeEntree: AN,
      annee_scolaire: AN,
      statut: 'inscrit'
    });
    importedCount++;
  }
}

console.log(`Importation réussie ! ${importedCount} élèves importés avec succès.`);
process.exit(0);
