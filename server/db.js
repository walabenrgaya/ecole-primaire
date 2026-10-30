// =====================================================================
// Module de connexion PostgreSQL (pg Pool)
// =====================================================================
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ecole';
const isProduction = process.env.NODE_ENV === 'production' || connectionString.includes('render.com') || connectionString.includes('sslmode=require');

const pool = new pg.Pool({
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Erreur inattendue du pool PostgreSQL :', err);
});

export default pool;
