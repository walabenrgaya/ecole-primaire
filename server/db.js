// =====================================================================
// Module de connexion PostgreSQL (pg Pool)
// =====================================================================
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ecole'
});

pool.on('error', (err) => {
  console.error('Erreur inattendue du pool PostgreSQL :', err);
});

export default pool;
