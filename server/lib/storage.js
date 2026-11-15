/* =====================================================================
   Stockage des fichiers : Nextcloud (WebDAV) ou disque local.
   Si NEXTCLOUD_URL, NEXTCLOUD_USER et NEXTCLOUD_PASSWORD sont définis,
   les fichiers déposés et les reçus PDF sont stockés dans Nextcloud,
   dans le dossier NEXTCLOUD_DIR (par défaut « EduPilot »).
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import { PassThrough, Readable } from 'stream';

const URL_NC = (process.env.NEXTCLOUD_URL || '').replace(/\/$/, '');
const USER = process.env.NEXTCLOUD_USER || '';
const PASS = process.env.NEXTCLOUD_PASSWORD || '';
const ROOT = (process.env.NEXTCLOUD_DIR || 'EduPilot').replace(/^\/|\/$/g, '');
// URL interne (ex. http://nextcloud) pour le serveur, URL publique pour les liens affichés
const PUBLIC_NC = (process.env.NEXTCLOUD_PUBLIC_URL || URL_NC).replace(/\/$/, '');

export const nextcloud = Boolean(URL_NC && USER && PASS);
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const dav = rel => `${URL_NC}/remote.php/dav/files/${encodeURIComponent(USER)}/${[ROOT, ...rel.split('/')].map(encodeURIComponent).join('/')}`;

const dossiersCrees = new Set();
async function ensureDir(relDir) {
  const parts = relDir.split('/').filter(Boolean);
  let cur = '';
  for (const p of ['', ...parts]) {
    cur = cur ? `${cur}/${p}` : p;
    if (dossiersCrees.has(cur)) continue;
    const res = await fetch(cur ? dav(cur) : dav('').replace(/\/$/, ''), { method: 'MKCOL', headers: { Authorization: AUTH } });
    // 201 = créé, 405 = existe déjà
    if (![201, 405].includes(res.status)) throw new Error(`Nextcloud MKCOL ${cur || ROOT} : HTTP ${res.status}`);
    dossiersCrees.add(cur);
  }
}

/** Envoie un contenu (Buffer) vers Nextcloud. relPath ex. « depots/abc.pdf ». */
export async function putFile(relPath, buffer, contentType = 'application/octet-stream') {
  await ensureDir(path.posix.dirname(relPath) === '.' ? '' : path.posix.dirname(relPath));
  const res = await fetch(dav(relPath), { method: 'PUT', headers: { Authorization: AUTH, 'Content-Type': contentType }, body: buffer });
  if (![200, 201, 204].includes(res.status)) throw new Error(`Nextcloud PUT ${relPath} : HTTP ${res.status}`);
}

/** Récupère un fichier depuis Nextcloud (réponse fetch) ou null s'il n'existe pas. */
export async function getFile(relPath) {
  const res = await fetch(dav(relPath), { headers: { Authorization: AUTH } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Nextcloud GET ${relPath} : HTTP ${res.status}`);
  return res;
}

/**
 * Après un dépôt multer (fichier écrit dans UPLOAD_DIR) : transfère le fichier
 * vers Nextcloud puis supprime la copie locale. Sans Nextcloud, ne fait rien.
 */
export async function persistUpload(file) {
  if (!nextcloud || !file) return;
  const buffer = await fs.promises.readFile(file.path);
  await putFile(`depots/${file.filename}`, buffer, file.mimetype);
  await fs.promises.unlink(file.path).catch(() => {});
}

/** Middleware Express : sert /uploads/:name depuis le disque, sinon depuis Nextcloud. */
export function serveUploads(uploadDir) {
  return async (req, res, next) => {
    const name = path.basename(req.params.name || '');
    if (!/^[a-f0-9]{32}\.[a-z0-9]+$/i.test(name)) return res.status(404).end();
    const local = path.join(uploadDir, name);
    if (fs.existsSync(local)) return res.sendFile(local, { headers: { 'X-Content-Type-Options': 'nosniff' } });
    if (!nextcloud) return res.status(404).end();
    try {
      const r = await getFile(`depots/${name}`);
      if (!r) return res.status(404).end();
      res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      Readable.fromWeb(r.body).pipe(res);
    } catch (e) {
      next(e);
    }
  };
}

/** Exécute une fonction de génération PDF (qui écrit dans un flux) et renvoie un Buffer. */
export function pdfBuffer(generer, data) {
  return new Promise((resolve, reject) => {
    const out = new PassThrough();
    const chunks = [];
    out.on('data', c => chunks.push(c));
    out.on('end', () => resolve(Buffer.concat(chunks)));
    out.on('error', reject);
    generer(out, data);
  });
}

/** Lien public vers le dossier de l'établissement dans Nextcloud (pour l'administration). */
export const nextcloudInfo = () => (nextcloud ? { actif: true, url: `${PUBLIC_NC}/apps/files/?dir=/${encodeURIComponent(ROOT)}` } : { actif: false });
