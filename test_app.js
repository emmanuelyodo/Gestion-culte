/**
 * EcclesiaManager - Suite de Tests Automatisés de Validation
 */

const http = require('node:http');
const { getDatabase } = require('./database');
const { runAllCronTasks } = require('./cron');

async function runTests() {
  console.log('--- Démarrage de la suite de tests EcclesiaManager ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ SUCCÈS : ${message}`);
      passed++;
    } else {
      console.error(`  ❌ ÉCHEC : ${message}`);
      failed++;
    }
  }

  const db = getDatabase();

  // Test 1: Base de données et paramètres
  const churchName = db.prepare("SELECT value FROM settings WHERE key = 'church_name'").get()?.value;
  assert(churchName === 'Mission Apostolique de Pentecôte (MAP) - Temple Ébénézer', 'Paramètres système initialisés : MAP - Temple Ébénézer');

  // Test 2: Départements par défaut
  const depts = db.prepare('SELECT count(*) as count FROM departments').get().count;
  assert(depts >= 4, `Au moins 4 départements configurés (Trouvé: ${depts})`);

  // Test 2b: Comptes responsables séparés
  const usersCount = db.prepare('SELECT count(*) as count FROM users').get().count;
  assert(usersCount >= 8, `Comptes responsables individuels configurés (Trouvé: ${usersCount})`);

  // Test 3: Membres de démonstration
  const membersCount = db.prepare('SELECT count(*) as count FROM members').get().count;
  assert(membersCount >= 25, `Membres de démonstration présents (Trouvé: ${membersCount})`);

  // Test 4: Cultes et présences
  const servicesCount = db.prepare('SELECT count(*) as count FROM service_events').get().count;
  assert(servicesCount >= 5, `Historique de cultes présent (Trouvé: ${servicesCount})`);

  // Test 5: Finances et devises
  const trxCount = db.prepare('SELECT count(*) as count FROM financial_transactions').get().count;
  assert(trxCount >= 10, `Transactions financières initialisées (Trouvé: ${trxCount})`);

  // Test 6: Moteur de calcul Cron & Alertes
  const cronRes = runAllCronTasks(db);
  assert(cronRes.missingReports.alerts.length > 0, `Détection automatique des départements sans rapport (> 3 semaines) fonctionnelle (Alertes: ${cronRes.missingReports.alerts.length})`);
  assert(cronRes.healthScores.scores.length >= 4, `Calcul automatique des scores de santé des départements fonctionnel (${cronRes.healthScores.scores.length} scores calculés)`);
  assert(cronRes.newMembers.tasksCreated.length > 0, `Génération des relances nouveaux membres fonctionnelle (${cronRes.newMembers.tasksCreated.length} tâches générées)`);

  // Test 7: Candidats et registre des baptêmes
  const candidatesCount = db.prepare('SELECT count(*) as count FROM baptism_candidates').get().count;
  const baptismsCount = db.prepare('SELECT count(*) as count FROM baptism_records').get().count;
  assert(candidatesCount >= 3, `Candidats au baptême en préparation présents (${candidatesCount})`);
  assert(baptismsCount >= 3, `Registre des baptêmes avec certificats présent (${baptismsCount})`);

  // Test 8: Journal d'audit
  const auditCount = db.prepare('SELECT count(*) as count FROM audit_logs').get().count;
  assert(auditCount > 0, `Journal d'audit de sécurité opérationnel (${auditCount} entrées)`);

  console.log(`\n=======================================================`);
  console.log(`  RÉSULTAT GLOBAL : ${passed} passés, ${failed} échoués`);
  console.log(`=======================================================`);

  if (failed > 0) process.exit(1);
}

runTests();
