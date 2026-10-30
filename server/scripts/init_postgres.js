import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDB() {
  const rootClient = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
  });

  await rootClient.connect();
  const dbCheck = await rootClient.query("SELECT 1 FROM pg_database WHERE datname = 'ecole'");
  if (dbCheck.rows.length === 0) {
    console.log("Création de la base de données 'ecole'...");
    await rootClient.query('CREATE DATABASE ecole;');
    console.log("Base 'ecole' créée.");
  } else {
    console.log("La base 'ecole' existe déjà.");
  }
  await rootClient.end();

  const ecoleClient = new pg.Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'ecole'
  });
  await ecoleClient.connect();

  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  console.log(`Exécution du schéma SQL (${schemaPath})...`);
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await ecoleClient.query(schemaSql);
  console.log('✓ Schéma créé avec succès (16 tables).');

  const seedPath = path.resolve(__dirname, '../../database/seed.sql');
  console.log(`Exécution du jeu de données (${seedPath})...`);
  const seedSql = fs.readFileSync(seedPath, 'utf8');
  await ecoleClient.query(seedSql);
  console.log('✓ Données initiales insérées avec succès.');

  const tables = await ecoleClient.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
  );
  console.log('✓ Tables créées :');
  console.log(tables.rows.map(r => '  - ' + r.table_name).join('\n'));

  const users = await ecoleClient.query('SELECT count(*) FROM users;');
  console.log(`✓ Nombre d'utilisateurs de test : ${users.rows[0].count}`);

  await ecoleClient.end();
  console.log('=== INITIALISATION POSTGRESQL TERMINÉE AVEC SUCCÈS ===');
}

initDB().catch(err => {
  console.error('Erreur lors de l’initialisation PostgreSQL :', err);
  process.exit(1);
});
