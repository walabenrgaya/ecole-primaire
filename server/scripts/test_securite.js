/* =====================================================================
   TESTS AUTOMATISÉS : authentification, RBAC, isolation multi-écoles,
   règles métier (paiement, suppression contrôlée, immuabilité) et BI.
   Usage : node scripts/test_securite.js [URL_API]   (défaut http://localhost:5000)
   ===================================================================== */
import { ECOLES, MOTS_DE_PASSE, SUPERADMIN, emailDemo } from '../demo-accounts.js';

const API = (process.argv[2] || 'http://localhost:5000').replace(/\/$/, '') + '/api';
let ok = 0, ko = 0;

async function call(token, method, path, body, extraHeaders = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

function check(nom, cond, detail = '') {
  if (cond) { ok++; console.log(`  ✔ ${nom}`); } else { ko++; console.log(`  ✘ ${nom} ${detail}`); }
}

async function login(email, password) {
  const r = await call(null, 'POST', '/auth/login', { email, password });
  return r.status === 200 ? r.data.token : null;
}

const [A, B] = ECOLES;
console.log(`Tests sur ${API}\n`);

console.log('1. Authentification');
const tok = {};
for (const role of ['admin', 'directeur', 'enseignant', 'comptable', 'parent', 'eleve']) {
  tok[role] = await login(emailDemo(A, role), MOTS_DE_PASSE[role]);
  check(`connexion ${role} (${A.name})`, !!tok[role]);
}
tok.adminB = await login(emailDemo(B, 'admin'), MOTS_DE_PASSE.admin);
tok.super = await login(SUPERADMIN.email, MOTS_DE_PASSE.superadmin);
check('connexion super-admin', !!tok.super);
check('mauvais mot de passe refusé', !(await login(emailDemo(A, 'admin'), 'Admin123!')));
check('ancien mot de passe « porte dérobée » refusé', !(await login('admin@ecole.tn', 'Admin123!')));
check('/api/setup (fuite des comptes) supprimé', (await call(null, 'GET', '/setup')).status !== 200);
check('API protégée sans jeton', (await call(null, 'GET', '/eleves')).status === 401);

console.log('\n2. Isolation multi-écoles');
const elevesA = (await call(tok.admin, 'GET', '/eleves')).data;
const elevesB = (await call(tok.adminB, 'GET', '/eleves')).data;
const idsA = new Set(elevesA.map(e => e.id));
check('les listes des deux écoles sont disjointes', elevesB.every(e => !idsA.has(e.id)));
const eB = elevesB[0];
check('lecture du bulletin d\'une autre école refusée', (await call(tok.admin, 'GET', `/bulletin/${eB.id}`)).status === 404);
check('modification d\'un élève d\'une autre école refusée', (await call(tok.admin, 'PUT', `/eleves/${eB.id}`, { nom: 'PIRATE' })).status === 404);
check('rattachement à une classe d\'une autre école refusé',
  (await call(tok.admin, 'PUT', `/eleves/${elevesA[0].id}`, { classe_id: eB.classe_id })).status === 400);
check('paiement pour un élève d\'une autre école refusé', (await call(tok.admin, 'POST', '/paiements', { eleve_id: eB.id, montant: 10, mode: 'Espèces' })).status === 400);

console.log('\n3. Contrôle d\'accès par rôle (RBAC)');
const monEleve = (await call(tok.eleve, 'GET', '/eleves')).data;
check('un élève ne voit que son propre dossier', monEleve.length === 1);
const rendus = (await call(tok.eleve, 'GET', '/devoirs_rendus')).data;
if (rendus[0]) check('un élève ne peut pas modifier sa note', (await call(tok.eleve, 'PUT', `/devoirs_rendus/${rendus[0].id}`, { note: 20 })).status === 403);
check('un élève ne peut pas créer de note', (await call(tok.eleve, 'POST', '/notes', { eleve_id: monEleve[0].id, matiere_id: 1, eval: 'Examen', trimestre: 1, note: 20 })).status === 403);
const enfants = (await call(tok.parent, 'GET', '/eleves')).data;
check('un parent ne voit que ses enfants', enfants.length >= 1 && enfants.every(e => e.parent_nom));
const autreAbs = (await call(tok.admin, 'GET', '/absences')).data.find(a => !enfants.some(e => e.id === a.eleve_id));
if (autreAbs) check('un parent ne peut pas justifier l\'absence d\'un autre élève', (await call(tok.parent, 'POST', `/absences/${autreAbs.id}/justifier`, { justification: 'x' })).status === 404);
const etranger = elevesA.find(e => !enfants.some(k => k.id === e.id));
check('un parent ne voit pas le bulletin d\'un autre élève', (await call(tok.parent, 'GET', `/bulletin/${etranger.id}`)).status === 404);
check('un enseignant ne peut pas créer de paiement', (await call(tok.enseignant, 'POST', '/paiements', { eleve_id: elevesA[0].id, montant: 10, mode: 'Espèces' })).status === 403);
check('un comptable n\'accède pas au BI pédagogique', (await call(tok.comptable, 'GET', '/bi/pedagogie')).status === 403);
check('un parent n\'accède pas au BI', (await call(tok.parent, 'GET', '/bi/general')).status === 403);
check('un enseignant ne peut pas créer de compte', (await call(tok.enseignant, 'POST', '/users', { nom: 'x', email: 'x@x.tn', password: '12345678', role: 'admin' })).status === 403);
check('injection de colonne SQL ignorée', (await call(tok.admin, 'PUT', `/salles/${(await call(tok.admin, 'GET', '/salles')).data[0].id}`, { 'nom = \'x\', cap': 1 })).status === 400);

console.log('\n4. Règles métier');
const cible = enfants[0];
const pay = await call(tok.comptable, 'POST', '/paiements', { eleve_id: cible.id, montant: 50, mode: 'Mobile money', type: 'Scolarité – acompte' });
check('paiement enregistré', pay.status === 201, JSON.stringify(pay.data));
check('message automatique envoyé au parent', pay.data?.envoi?.message === 'envoyé');
const inbox = (await call(tok.parent, 'GET', '/messages')).data.inbox;
check('le parent reçoit le message (montant, solde, lien du reçu)', inbox.some(m => m.categorie === 'paiement' && m.corps.includes('solde restant') && m.corps.includes('/recu/')));
const recu = await fetch(`${API}/paiements/${pay.data.paiement.id}/recu.pdf`, { headers: { Authorization: `Bearer ${tok.parent}` } });
check('reçu PDF téléchargeable par le parent', recu.status === 200 && recu.headers.get('content-type') === 'application/pdf');
const envois = (await call(tok.comptable, 'GET', '/envois')).data;
check('envoi journalisé (messagerie + e-mail)', envois.filter(e => e.reference === `paiement:${pay.data.paiement.id}`).length === 2);
const bul = await fetch(`${API}/bulletin/${cible.id}?trimestre=1&format=pdf`, { headers: { Authorization: `Bearer ${tok.parent}` } });
check('bulletin PDF téléchargeable par le parent', bul.status === 200);
const classe = (await call(tok.admin, 'GET', '/classes')).data.find(c => c.effectif > 0);
const del = await call(tok.admin, 'DELETE', `/classes/${classe.id}`);
check('suppression d\'une classe avec élèves bloquée sans confirmation', del.status === 409 && del.data.forcable === true);
const mat = (await call(tok.admin, 'GET', '/matieres')).data[0];
check('suppression d\'une matière notée impossible', (await call(tok.admin, 'DELETE', `/matieres/${mat.id}`)).data.forcable === false);
const ann = (await call(tok.admin, 'GET', '/annonces')).data[0];
check('annonce publiée non modifiable', (await call(tok.admin, 'PUT', `/annonces/${ann.id}`, { titre: 'x' })).status === 409);
check('annonce publiée non supprimable', (await call(tok.admin, 'DELETE', `/annonces/${ann.id}`)).status === 409);
const sent = (await call(tok.parent, 'GET', '/messages')).data.sent[0];
if (sent) check('message envoyé immuable', (await call(tok.parent, 'PUT', `/messages/${sent.id}`, { objet: 'x' })).status === 409);
const j = (await call(tok.admin, 'GET', '/journal')).data;
check('journal d\'audit avec anciennes/nouvelles valeurs', j.some(l => l.action.startsWith('Enregistrement paiement')) && j.some(l => l.apres));

console.log('\n5. Business Intelligence');
for (const t of ['general', 'finances', 'pedagogie', 'absences', 'enseignants', 'inscriptions', 'communication', 'ressources', 'risques', 'strategie']) {
  const r = await call(tok.directeur, 'GET', `/bi/${t}`);
  check(`tableau ${t}`, r.status === 200 && r.data.kpis !== undefined || (t === 'strategie' && r.data.recommandations?.length), r.status);
}
check('vue plateforme (super-admin)', (await call(tok.super, 'GET', '/bi/plateforme')).data.ecoles?.length >= 2);
check('super-admin dans le contexte d\'une école', (await call(tok.super, 'GET', '/bi/general', null, { 'x-school-id': '2' })).status === 200);

console.log('\n6. Calendrier scolaire et évaluations');
const evEleve = (await call(tok.eleve, 'GET', '/evenements')).data;
const classeEleve = monEleve[0].classe_id;
check('l\'élève voit les évaluations de sa classe et les événements de l\'école', evEleve.length > 0 && evEleve.every(e => e.classe_id === null || e.classe_id === classeEleve));
check('le calendrier contient contrôles, examens et vacances', ['Contrôle', 'Examen', 'Vacances'].every(c => evEleve.some(e => e.categorie === c)));
const evParent = (await call(tok.parent, 'GET', '/evenements')).data;
const clsEnfants = new Set(enfants.map(e => e.classe_id));
check('le parent ne voit que les classes de ses enfants', evParent.every(e => e.classe_id === null || clsEnfants.has(e.classe_id)));
check('un parent ne peut pas planifier', (await call(tok.parent, 'POST', '/evenements', { categorie: 'Contrôle', titre: 'x', date: '2027-01-20' })).status === 403);
const emploisProf = (await call(tok.enseignant, 'GET', '/emplois')).data;
const meId = (await call(tok.enseignant, 'GET', '/auth/me')).data.id;
const cours = emploisProf.find(e => String(e.enseignant_id) === meId);
const autreClasse = (await call(tok.admin, 'GET', '/classes')).data.find(c => !emploisProf.some(e => e.classe_id === c.id));
const futur = '2027-01-26';
const plan = await call(tok.enseignant, 'POST', '/evenements', { categorie: 'Contrôle', titre: 'Contrôle test', date: futur, debut: '15:45', fin: '16:30', classe_id: cours.classe_id, matiere_id: cours.matiere_id });
check('l\'enseignant planifie un contrôle pour sa classe', plan.status === 201, JSON.stringify(plan.data));
check('chevauchement refusé pour la même classe', (await call(tok.enseignant, 'POST', '/evenements', { categorie: 'Examen', titre: 'x', date: futur, debut: '16:00', fin: '17:00', classe_id: cours.classe_id, matiere_id: cours.matiere_id })).status === 409);
check('évaluation pendant les vacances refusée', (await call(tok.enseignant, 'POST', '/evenements', { categorie: 'Contrôle', titre: 'x', date: '2026-12-23', classe_id: cours.classe_id, matiere_id: cours.matiere_id })).status === 409);
if (autreClasse) check('évaluation dans une autre classe refusée', (await call(tok.enseignant, 'POST', '/evenements', { categorie: 'Contrôle', titre: 'x', date: futur, classe_id: autreClasse.id, matiere_id: cours.matiere_id })).status === 403);
check('un enseignant ne publie pas d\'événement d\'établissement', (await call(tok.enseignant, 'POST', '/evenements', { categorie: 'Événement', titre: 'x', date: futur })).status === 403);
const fete = await call(tok.directeur, 'POST', '/evenements', { categorie: 'Événement', titre: 'Sortie test', date: futur });
check('la direction publie un événement pour tout l\'établissement', fete.status === 201 && fete.data.classe_id === null);
for (const x of [plan.data, fete.data]) if (x?.id) await call(tok.admin, 'DELETE', `/evenements/${x.id}`);

console.log(`\nRésultat : ${ok} réussi(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
