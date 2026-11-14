import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import pool from './db.js';
import { PORT, NODE_ENV, IS_PROD, CORS_ORIGINS } from './config.js';
import { HttpError } from './lib/http.js';
import { crudRouter } from './lib/crud.js';
import coreRoutes, { UPLOAD_DIR } from './routes/core.js';
import scolariteRoutes, { relancesAutomatiques } from './routes/scolarite.js';
import biRoutes from './routes/bi.js';
import { seedDatabase } from './seed.js';
import { serveUploads, nextcloud } from './lib/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1); // derrière le proxy HTTPS de l'hébergeur (Render, Railway, Nginx)

/* ------------------------------ Sécurité ------------------------------ */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'blob:'],
      objectSrc: ["'self'", 'blob:']
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: CORS_ORIGINS.length ? CORS_ORIGINS : false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' } }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 900, standardHeaders: true, legacyHeaders: false }));

/* ------------------------------ Fichiers ------------------------------ */
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.get('/uploads/:name', serveUploads(UPLOAD_DIR));

/* -------------------------------- API --------------------------------- */
app.use('/api', coreRoutes);
app.use('/api', scolariteRoutes);
app.use('/api', biRoutes);
app.use('/api', crudRouter());
app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

/* ------------------------ Frontend (production) ----------------------- */
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, {
    setHeaders: (res, file) => {
      if (file.endsWith('index.html') || file.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

/* ------------------------ Gestion des erreurs ------------------------- */
const PG_ERRORS = {
  '23505': [409, 'Cette valeur existe déjà (doublon)'],
  '23503': [409, 'Référence invalide ou élément encore utilisé'],
  '23502': [400, 'Un champ obligatoire est manquant'],
  '23514': [400, 'Valeur hors des limites autorisées'],
  '22P02': [400, 'Format de donnée invalide'],
  '22007': [400, 'Date ou heure invalide'],
  '22008': [400, 'Date invalide'],
  '22003': [400, 'Nombre hors limites']
};
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err.code && PG_ERRORS[err.code]) {
    const [status, msg] = PG_ERRORS[err.code];
    return res.status(status).json({ error: msg });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Fichier trop volumineux (10 Mo maximum)' });
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

/* ------------------------------ Démarrage ----------------------------- */
async function ensureDatabase() {
  const { rows } = await pool.query(`SELECT to_regclass('public.schools') AS t, to_regclass('public.envois') AS v`);
  if (!rows[0].t || !rows[0].v) {
    console.log('Base vide ou ancienne version : création du schéma et des données de démonstration...');
    await seedDatabase();
  }
}

try {
  await pool.query('SELECT 1');
  await ensureDatabase();
  app.listen(PORT, () => console.log(`API prête sur le port ${PORT} [${NODE_ENV}] – stockage : ${nextcloud ? 'Nextcloud' : 'disque local'}`));

  // Relances automatiques des impayés : vérification horaire, exécution une fois par jour à 8 h
  if (process.env.AUTO_RELANCES !== 'false') {
    let dernierJour = null;
    setInterval(async () => {
      const now = new Date();
      const jour = now.toISOString().slice(0, 10);
      if (now.getHours() === 8 && dernierJour !== jour) {
        dernierJour = jour;
        try { console.log(`Relances automatiques : ${await relancesAutomatiques()} envoyée(s)`); } catch (e) { console.error('Relances :', e.message); }
      }
    }, 60 * 60 * 1000).unref();
  }
} catch (e) {
  console.error(`Démarrage impossible (${IS_PROD ? 'production' : 'développement'}) :`, e.message);
  process.exit(1);
}
