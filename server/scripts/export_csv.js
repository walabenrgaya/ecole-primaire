import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { ENT } from '../models.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecole';

console.log('Connexion à MongoDB...');
await mongoose.connect(MONGO_URI);

const eleves = await ENT.eleves.find({ deleted: { $ne: true } }).lean();
const classes = await ENT.classes.find().lean();

let csv = 'ID;Nom;Prenom;DateNaissance;Genre;Classe;ParentNom;ParentEmail;ParentTel;Statut\n';
for (const e of eleves) {
  const cls = classes.find(c => String(c._id) === String(e.classe));
  const classeNom = cls ? `${cls.niveau} ${cls.section}` : '';
  csv += `"${e._id}";"${e.nom || ''}";"${e.prenom || ''}";"${e.naissance || ''}";"${e.genre || 'M'}";"${classeNom}";"${e.parentNom || ''}";"${e.parentEmail || ''}";"${e.parentTel || ''}";"${e.statut || 'inscrit'}"\n`;
}

const outFile = path.resolve('eleves_export.csv');
fs.writeFileSync(outFile, '\uFEFF' + csv, 'utf8');
console.log(`Exportation terminée avec succès ! ${eleves.length} élèves exportés dans : ${outFile}`);

process.exit(0);
