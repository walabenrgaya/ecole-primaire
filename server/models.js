import mongoose from 'mongoose';
const {Schema, model} = mongoose;
const loose = () => new Schema({}, {strict: false, timestamps: true});

export const ENTITES = [
  'classes',
  'matieres',
  'salles',
  'eleves',
  'notes',
  'absences',
  'emplois',
  'paiements',
  'devoirs',
  'devoirs_rendus',
  'annonces',
  'preinscriptions',
  'notifications'
];

export const ENT = Object.fromEntries(ENTITES.map(k => [k, model(k, loose())]));

export const User = model('User', new Schema({
  nom: String,
  email: { type: String, unique: true, lowercase: true, trim: true },
  hash: String,
  role: { type: String, enum: ['admin', 'enseignant', 'comptable', 'parent', 'eleve'] },
  telephone: String,
  eleveId: String,
  classe: String,
  enfants: [String]
}, { timestamps: true }));

export const Msg = model('Message', loose());
export const Log = model('Log', loose());
