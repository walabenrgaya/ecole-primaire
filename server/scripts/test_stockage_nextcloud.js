/* Test du stockage Nextcloud contre un faux serveur WebDAV (MKCOL / PUT / GET + Basic Auth).
   Usage : node scripts/test_stockage_nextcloud.js */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';

const fichiers = new Map(), dossiers = new Set();
const AUTH = 'Basic ' + Buffer.from('admin:secret').toString('base64');
const dav = http.createServer((req, res) => {
  if (req.headers.authorization !== AUTH) { res.writeHead(401); return res.end(); }
  const p = decodeURIComponent(req.url.replace('/remote.php/dav/files/admin', ''));
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    if (req.method === 'MKCOL') { const ok = !dossiers.has(p); dossiers.add(p); res.writeHead(ok ? 201 : 405); return res.end(); }
    if (req.method === 'PUT') {
      if (!dossiers.has(path.posix.dirname(p))) { res.writeHead(409); return res.end(); }
      fichiers.set(p, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); res.writeHead(201); return res.end();
    }
    if (req.method === 'GET') { const f = fichiers.get(p); if (!f) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.type }); return res.end(f.body); }
    res.writeHead(405); res.end();
  });
});
await new Promise(r => dav.listen(0, r));
process.env.NEXTCLOUD_URL = `http://127.0.0.1:${dav.address().port}`;
process.env.NEXTCLOUD_USER = 'admin';
process.env.NEXTCLOUD_PASSWORD = 'secret';

const S = await import('../lib/storage.js');
const { recuPdf } = await import('../lib/pdf.js');
let ok = 0, ko = 0;
const check = (n, c) => { if (c) { ok++; console.log('  ✔', n); } else { ko++; console.log('  ✘', n); } };

check('Nextcloud détecté comme actif', S.nextcloud === true);

// Dépôt d'un fichier (comme après multer)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-'));
const nom = 'a'.repeat(32) + '.pdf';
fs.writeFileSync(path.join(tmp, nom), 'contenu du devoir');
await S.persistUpload({ path: path.join(tmp, nom), filename: nom, mimetype: 'application/pdf' });
check('fichier envoyé dans EduPilot/depots/', fichiers.has(`/EduPilot/depots/${nom}`));
check('copie locale supprimée', !fs.existsSync(path.join(tmp, nom)));

// Lecture via la route /uploads/:name
const app = express();
app.get('/uploads/:name', S.serveUploads(tmp));
const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
const base = `http://127.0.0.1:${srv.address().port}`;
const r1 = await fetch(`${base}/uploads/${nom}`);
check('fichier relu depuis Nextcloud via /uploads', r1.status === 200 && (await r1.text()) === 'contenu du devoir');
check('fichier inexistant → 404', (await fetch(`${base}/uploads/${'b'.repeat(32)}.pdf`)).status === 404);
check('nom de fichier suspect refusé', (await fetch(`${base}/uploads/..%2F.env`)).status === 404);

// Archivage d'un reçu PDF
const buf = await S.pdfBuffer(recuPdf, {
  school: { name: 'École test', code: 'test' }, eleve: { nom: 'Ben Ali', prenom: 'Yassine', matricule: 'M1' }, classe: 'CM1 A',
  paiement: { recu_num: 'R2627-00001', montant: 500, mode: 'Espèces', type: 'Scolarité', date: '2026-11-14', annee_scolaire: '2026-2027' },
  situation: { du: 1680, paye: 500, reste: 1180 }
});
await S.putFile('test/recus/2026-2027/R2627-00001.pdf', buf, 'application/pdf');
const recu = fichiers.get('/EduPilot/test/recus/2026-2027/R2627-00001.pdf');
check('reçu PDF archivé (dossiers créés automatiquement)', recu && recu.body.subarray(0, 4).toString() === '%PDF');

srv.close(); dav.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nRésultat : ${ok} réussi(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
