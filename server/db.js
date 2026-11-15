// Pool de connexions PostgreSQL (une seule base, isolation par school_id)
import pg from 'pg';
import { IS_PROD } from './config.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ecole';
const local = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(connectionString);
const ssl = process.env.PGSSL === 'false' || (local && process.env.PGSSL !== 'true') ? false : (IS_PROD || connectionString.includes('sslmode=require')) ? { rejectUnauthorized: false } : false;

const pool = new pg.Pool({ connectionString, ssl, max: +(process.env.PG_POOL_MAX || 10) });
pool.on('error', err => console.error('PostgreSQL :', err.message));

export default pool;
