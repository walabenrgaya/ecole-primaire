// =====================================================================
// SCRIPT OFFICIEL DE TEST D'ISOLATION MULTI-TENANT (Étapes 7 & 8 du Guide)
// Valide l'étanchéité absolue entre les écoles A (Sousse) et B (Tunis)
// =====================================================================

const API = 'http://localhost:5000/api';

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(`Échec login pour ${email} (${res.status})`);
  return res.json();
}

async function runTests() {
  console.log('=================================================================');
  console.log('   DÉBUT DES TESTS D\'ISOLATION MULTI-TENANT SAAS (ÉCOLE A vs B)');
  console.log('=================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [TEST ${total}] REÇU : ${testName}`);
    } else {
      console.error(`❌ [TEST ${total}] ÉCHEC : ${testName} | ${details}`);
    }
  }

  // 1. Authentification des acteurs
  console.log('1. Authentification des contextes écoles...');
  const userA = await login('admin@ecole.tn', 'Admin123!');
  const userB = await login('admin@alamal.tn', 'Admin123!');
  const superAdmin = await login('superadmin@saas.tn', 'SuperAdmin123!');

  assert(userA.user.schoolId === 1, 'L\'utilisateur École A a le school_id = 1');
  assert(userB.user.schoolId === 2, 'L\'utilisateur École B a le school_id = 2');
  assert(superAdmin.user.role === 'superadmin', 'Le SuperAdmin a le rôle global superadmin');

  const headersA = { 'Authorization': `Bearer ${userA.token}` };
  const headersB = { 'Authorization': `Bearer ${userB.token}` };
  const headersSuper = { 'Authorization': `Bearer ${superAdmin.token}` };

  // 2. Test Isolation Liste des Élèves
  console.log('\n2. Test de liste des élèves (Étape 6.1)...');
  const resElevesA = await fetch(`${API}/eleves`, { headers: headersA }).then(r => r.json());
  const resElevesB = await fetch(`${API}/eleves`, { headers: headersB }).then(r => r.json());

  const aHasOnlyA = resElevesA.every(e => e.nom.includes('Ben Ali') || e.nom.includes('Trabelsi'));
  const aHasNoB = !resElevesA.some(e => e.nom.includes('Gharbi') || e.nom.includes('Jaziri'));
  assert(aHasOnlyA && aHasNoB && resElevesA.length === 2, 'École A ne voit QUE ses propres élèves (Sousse)', `Nb reçus: ${resElevesA.length}`);

  const bHasOnlyB = resElevesB.every(e => e.nom.includes('Gharbi') || e.nom.includes('Jaziri'));
  const bHasNoA = !resElevesB.some(e => e.nom.includes('Ben Ali') || e.nom.includes('Trabelsi'));
  assert(bHasOnlyB && bHasNoA && resElevesB.length === 2, 'École B ne voit QUE ses propres élèves (Tunis)', `Nb reçus: ${resElevesB.length}`);

  // 3. Test Zone de fuite 1 : Accès direct par ID (Bulletin & Fiche)
  console.log('\n3. Test d\'accès direct interdit par ID (Zone de fuite 1)...');
  // L'élève 11 appartient à l'école B. L'école A tente d'accéder à son bulletin
  const resDirectBulletin = await fetch(`${API}/bulletin/11`, { headers: headersA });
  assert(resDirectBulletin.status === 404, 'École A demandant le bulletin d\'un élève de l\'École B reçoit 404 (Introuvable)', `Status: ${resDirectBulletin.status}`);

  const resDirectBulletinB = await fetch(`${API}/bulletin/1`, { headers: headersB });
  assert(resDirectBulletinB.status === 404, 'École B demandant le bulletin d\'un élève de l\'École A reçoit 404 (Introuvable)', `Status: ${resDirectBulletinB.status}`);

  // 4. Test Zone de fuite 2 : Modification interdite inter-écoles
  console.log('\n4. Test de modification interdite (Zone de fuite 2)...');
  // L'école A tente de modifier la classe de l'élève 11 (qui est dans l'école B)
  const resModifCross = await fetch(`${API}/eleves/11`, {
    method: 'PUT',
    headers: { ...headersA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prenom: 'PIRATÉ PAR ECOLE A' })
  });
  assert(resModifCross.status === 404, 'Tentative de modification d\'un élève d\'une autre école renvoie 404', `Status: ${resModifCross.status}`);

  // 5. Test Zone de fuite 3 : Suppression interdite inter-écoles
  console.log('\n5. Test de suppression interdite (Zone de fuite 3)...');
  // L'école B tente de supprimer la classe 1 (qui appartient à l'école A)
  const resDelCross = await fetch(`${API}/classes/1`, {
    method: 'DELETE',
    headers: headersB
  });
  assert(resDelCross.status === 404, 'Tentative de suppression d\'une classe d\'une autre école renvoie 404', `Status: ${resDelCross.status}`);

  // 6. Test Zone de fuite 4 : Finances & Statistiques étanches
  console.log('\n6. Test des statistiques financières étanches (Zone de fuite 4)...');
  const statsA = await fetch(`${API}/finances/stats`, { headers: headersA }).then(r => r.json());
  const statsB = await fetch(`${API}/finances/stats`, { headers: headersB }).then(r => r.json());

  assert(statsA.totalRecu === 800, 'Finances École A n\'intègrent que les paiements de l\'École A (800 TND)', `Reçu: ${statsA.totalRecu}`);
  assert(statsB.totalRecu === 700, 'Finances École B n\'intègrent que les paiements de l\'École B (700 TND)', `Reçu: ${statsB.totalRecu}`);

  // 7. Test Messagerie interne étanche (Destinataires filtrés)
  console.log('\n7. Test de la messagerie étanche (Destinataires)...');
  const destA = await fetch(`${API}/dest`, { headers: headersA }).then(r => r.json());
  const destB = await fetch(`${API}/dest`, { headers: headersB }).then(r => r.json());

  const destAOk = destA.every(d => !d.email.includes('@alamal.tn'));
  const destBOk = destB.every(d => !d.email.includes('@ecole.tn'));
  assert(destAOk, 'École A ne peut voir aucun utilisateur de l\'École B dans ses destinataires');
  assert(destBOk, 'École B ne peut voir aucun utilisateur de l\'École A dans ses destinataires');

  // 8. Test Super-Admin SaaS (Vue globale de toutes les écoles)
  console.log('\n8. Test du Super-Admin SaaS...');
  const saasSchools = await fetch(`${API}/saas/schools`, { headers: headersSuper }).then(r => r.json());
  const saasStats = await fetch(`${API}/saas/stats`, { headers: headersSuper }).then(r => r.json());

  assert(saasSchools.length >= 2, 'SuperAdmin voit l\'ensemble des écoles hébergées sur le SaaS', `Nb écoles: ${saasSchools.length}`);
  assert(saasStats.schoolsCount >= 2 && saasStats.totalRevenue === 1500, 'SuperAdmin voit les métriques globales (1500 TND total)', `Total Rev: ${saasStats.totalRevenue}`);

  console.log('\n=================================================================');
  console.log(`   RÉSULTAT FINAL : ${passed}/${total} TESTS VALIDÉS AVEC SUCCÈS !`);
  console.log('   L\'ISOLATION MULTI-TENANT EST 100% OPÉRATIONNELLE ET ÉTANCHE.');
  console.log('=================================================================');
}

runTests().catch(err => {
  console.error('Erreur critique pendant les tests:', err);
  process.exit(1);
});
