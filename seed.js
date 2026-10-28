/**
 * EcclesiaManager - Générateur de données de démonstration réalistes
 */

const { getDatabase, initSchema, hashPassword } = require('./database');

function runSeed() {
  const db = getDatabase();
  initSchema(db);

  console.log('Seeding database with realistic data...');

  // Nettoyer les tables pour réinitialisation propre
  db.exec('PRAGMA foreign_keys = OFF;');
  const tables = [
    'audit_logs', 'baptism_records', 'baptism_candidates', 'calendar_events',
    'project_tasks', 'projects', 'department_health_history', 'department_reports',
    'financial_closures', 'financial_budgets', 'financial_transactions',
    'financial_categories', 'notifications_log', 'pastoral_tasks',
    'attendances', 'service_events', 'members', 'sessions', 'users',
    'departments', 'settings'
  ];
  for (const t of tables) {
    db.exec(`DELETE FROM ${t};`);
  }
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Paramètres système
  const settings = [
    ['church_name', 'Mission Apostolique de Pentecôte (MAP) - Temple Ébénézer', 'Nom officiel de l\'assemblée'],
    ['church_address', 'Temple Ébénézer, Abidjan, Côte d\'Ivoire', 'Adresse physique'],
    ['church_phone', '+225 07 00 11 22 33', 'Téléphone du secrétariat'],
    ['church_email', 'contact@map-ebenezer.org', 'E-mail de contact'],
    ['currency', 'XOF', 'Devise par défaut (Franc CFA)'],
    ['absence_threshold', '3', 'Seuil d\'absences consécutives déclenchant une alerte pastorale'],
    ['new_member_duration_days', '90', 'Durée de la période nouveau membre (en jours)'],
    ['new_member_reminders_per_week', '2', 'Nombre de rappels par semaine pour nouveaux membres'],
    ['new_member_reminder_days', 'Mardi,Vendredi', 'Jours d\'envoi des relances nouveaux membres'],
    ['new_member_reminder_time', '10:00', 'Heure d\'envoi des relances'],
    ['report_warning_weeks', '3', 'Nombre de semaines sans rapport déclenchant une alerte'],
    ['notification_channels', 'whatsapp,sms,email', 'Canaux de notification activés'],
    ['whatsapp_gateway', 'direct', 'Passerelle WhatsApp (direct wa.me ou api)'],
    ['sms_provider', 'simulate', 'Fournisseur SMS (simulate, twilio, infobip)'],
    ['template_absent', 'Bonjour {prenom}, vous nous avez manqué au culte du {date} ({culte}). Toute la communauté de {eglise} prie pour vous et espère vous revoir très bientôt. Demeurez béni(e) !', 'Modèle pour les absents'],
    ['template_new_member', 'Shalom {prenom} ! L\'équipe pastorale de {eglise} prend de vos nouvelles. Comment se passe votre semaine ? N\'hésitez pas si vous avez une requête de prière.', 'Modèle relance nouveau membre'],
    ['template_three_absences', 'ALERTE PASTORALE : Le membre {nom} {prenom} ({telephone}) a manqué 3 cultes consécutifs. Une visite pastorale a été planifiée.', 'Modèle alerte 3 absences'],
    ['health_weight_reports', '25', 'Poids régularité des rapports (%)'],
    ['health_weight_attendance', '25', 'Poids présence des membres (%)'],
    ['health_weight_activities', '20', 'Poids activités réalisées (%)'],
    ['health_weight_new_members', '15', 'Poids intégration nouveaux membres (%)'],
    ['health_weight_finances', '15', 'Poids participation financière et budget (%)']
  ];

  const stmtSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)');
  for (const s of settings) {
    stmtSetting.run(s[0], s[1], s[2]);
  }

  // 2. Départements (Noms clairs et standards)
  const departments = [
    { id: 1, name: 'Département des Enfants', code: 'ENFANTS', description: 'Éveil spirituel et formation biblique des enfants', color: '#10B981', icon: 'smile' },
    { id: 2, name: 'Département des Jeunes', code: 'JEUNES', description: 'Jeunesse, étudiants et jeunes professionnels', color: '#6366F1', icon: 'zap' },
    { id: 3, name: 'Département des Femmes', code: 'FEMMES', description: 'Fraternité et ministère des femmes et mères de l\'église', color: '#EC4899', icon: 'heart' },
    { id: 4, name: 'Département des Hommes', code: 'HOMMES', description: 'Communauté des hommes, pères et serviteurs', color: '#3B82F6', icon: 'shield' },
    { id: 5, name: 'Département de la Louange', code: 'LOUANGE', description: 'Chantres, musiciens et technique audiovisuelle', color: '#F59E0B', icon: 'music' },
    { id: 6, name: 'Département d\'Intercession & Accueil', code: 'INTERCESSION', description: 'Prière fervente, accueil et protocole', color: '#8B5CF6', icon: 'bell' }
  ];

  const stmtDept = db.prepare('INSERT OR REPLACE INTO departments (id, name, code, description, color, icon) VALUES (?, ?, ?, ?, ?, ?)');
  for (const d of departments) {
    stmtDept.run(d.id, d.name, d.code, d.description, d.color, d.icon);
  }

  // 3. Utilisateurs avec identifiants et mots de passe séparés pour chaque responsable
  const users = [
    { email: 'pasteur@map-ebenezer.org', password: 'pasteur123', name: 'Pasteur Principal', role: 'admin', dept: null, phone: '+2250701020304' },
    { email: 'secretaire@map-ebenezer.org', password: 'secret123', name: 'Secrétaire Général', role: 'secretaire', dept: null, phone: '+2250705060708' },
    { email: 'tresorier@map-ebenezer.org', password: 'tresor123', name: 'Trésorier de l\'Église', role: 'tresorier', dept: null, phone: '+2250709101112' },
    { email: 'jeunes@map-ebenezer.org', password: 'jeunes123', name: 'Responsable Département des Jeunes', role: 'resp_dept', dept: 2, phone: '+2250501020304' },
    { email: 'femmes@map-ebenezer.org', password: 'femmes123', name: 'Responsable Département des Femmes', role: 'resp_dept', dept: 3, phone: '+2250505060708' },
    { email: 'hommes@map-ebenezer.org', password: 'hommes123', name: 'Responsable Département des Hommes', role: 'resp_dept', dept: 4, phone: '+2250509101112' },
    { email: 'enfants@map-ebenezer.org', password: 'enfants123', name: 'Responsable Département des Enfants', role: 'resp_dept', dept: 1, phone: '+2250500112233' },
    { email: 'louange@map-ebenezer.org', password: 'louange123', name: 'Responsable Département de la Louange', role: 'resp_dept', dept: 5, phone: '+2250544556677' },
    { email: 'intercession@map-ebenezer.org', password: 'priere123', name: 'Responsable Intercession & Accueil', role: 'resp_dept', dept: 6, phone: '+2250788990011' },
    { email: 'membre@map-ebenezer.org', password: 'membre123', name: 'Frère Christian Bamba', role: 'membre', dept: 2, phone: '+2250102030405' }
  ];

  const stmtUser = db.prepare('INSERT OR REPLACE INTO users (id, email, password_hash, salt, full_name, role, department_id, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  users.forEach((u, idx) => {
    const { hash, salt } = hashPassword(u.password);
    stmtUser.run(idx + 1, u.email, hash, salt, u.name, u.role, u.dept, u.phone);
  });

  // 4. Membres complets (50 profils réalistes)
  const members = [
    {
      code: 'MEM-2026-001', first_name: 'David', last_name: 'KOUASSI', gender: 'M',
      birth_date: '1975-04-12', birth_place: 'Bouaké', phone: '+225 07 01 02 03 04', whatsapp: '+2250701020304',
      email: 'pasteur@map-ebenezer.org', address: 'Villa 44, Rue des Jardins', neighborhood: 'Cocody Riviera 3',
      marital_status: 'marie', profession: 'Pasteur Principal / Ingénieur', arrival_date: '2015-01-10',
      status: 'membre_actif', department_ids: JSON.stringify([4]), church_role: 'pasteur',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Grace Kouassi', emergency_contact_phone: '+225 07 01 02 03 05',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Visionnaire de l\'assemblée, enseignant.'
    },
    {
      code: 'MEM-2026-002', first_name: 'Marie-Esther', last_name: 'KOFFI', gender: 'F',
      birth_date: '1988-08-23', birth_place: 'Abidjan', phone: '+225 07 05 06 07 08', whatsapp: '+2250705060708',
      email: 'secretaire@map-ebenezer.org', address: 'Appartement 12, Cité BAD', neighborhood: 'Cocody Centre',
      marital_status: 'marie', profession: 'Secrétaire de Direction', arrival_date: '2018-05-15',
      status: 'membre_actif', department_ids: JSON.stringify([3, 6]), church_role: 'diacre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Alain Koffi', emergency_contact_phone: '+225 07 55 66 77 88',
      emergency_contact_relation: 'Époux', pastoral_notes: 'Secrétaire générale dévouée.'
    },
    {
      code: 'MEM-2026-003', first_name: 'Emmanuel', last_name: 'DIOMANDÉ', gender: 'M',
      birth_date: '1982-11-05', birth_place: 'Man', phone: '+225 07 09 10 11 12', whatsapp: '+2250709101112',
      email: 'tresorier@map-ebenezer.org', address: 'Résidence Les Palmiers', neighborhood: 'Marcory Zone 4',
      marital_status: 'marie', profession: 'Expert Comptable', arrival_date: '2017-02-20',
      status: 'membre_actif', department_ids: JSON.stringify([4]), church_role: 'diacre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Awa Diomandé', emergency_contact_phone: '+225 07 88 99 00 11',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Gestion rigoureuse des finances de l\'assemblée.'
    },
    {
      code: 'MEM-2026-004', first_name: 'Franck', last_name: 'N\'GUESSAN', gender: 'M',
      birth_date: '1995-03-14', birth_place: 'Yamoussoukro', phone: '+225 05 01 02 03 04', whatsapp: '+2250501020304',
      email: 'jeunes@map-ebenezer.org', address: 'Siporex Lot 55', neighborhood: 'Yopougon',
      marital_status: 'celibataire', profession: 'Développeur Logiciel', arrival_date: '2020-09-01',
      status: 'membre_actif', department_ids: JSON.stringify([2, 5]), church_role: 'resp_departement',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Paul N\'Guessan', emergency_contact_phone: '+225 05 44 33 22 11',
      emergency_contact_relation: 'Frère', pastoral_notes: 'Dynamique responsable de la jeunesse.'
    },
    {
      code: 'MEM-2026-005', first_name: 'Cécile', last_name: 'YAO', gender: 'F',
      birth_date: '1979-12-19', birth_place: 'Daloa', phone: '+225 05 05 06 07 08', whatsapp: '+2250505060708',
      email: 'femmes@map-ebenezer.org', address: 'Villa 18', neighborhood: 'Deux Plateaux Vallon',
      marital_status: 'marie', profession: 'Pharmacienne', arrival_date: '2016-04-10',
      status: 'membre_actif', department_ids: JSON.stringify([3]), church_role: 'resp_departement',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Dr Justin Yao', emergency_contact_phone: '+225 05 11 22 33 44',
      emergency_contact_relation: 'Époux', pastoral_notes: 'Présidente des Dames de Foi.'
    },
    {
      code: 'MEM-2026-006', first_name: 'Roger', last_name: 'TRAORÉ', gender: 'M',
      birth_date: '1973-07-28', birth_place: 'Korhogo', phone: '+225 05 09 10 11 12', whatsapp: '+2250509101112',
      email: 'hommes@map-ebenezer.org', address: 'Cité Verte', neighborhood: 'Yopougon Niangon',
      marital_status: 'marie', profession: 'Directeur Logistique', arrival_date: '2019-11-12',
      status: 'membre_actif', department_ids: JSON.stringify([4]), church_role: 'resp_departement',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Fatou Traoré', emergency_contact_phone: '+225 05 66 77 88 99',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Pilier du département des hommes.'
    },
    {
      code: 'MEM-2026-007', first_name: 'Christian', last_name: 'BAMBA', gender: 'M',
      birth_date: '1998-02-15', birth_place: 'Abidjan', phone: '+225 01 02 03 04 05', whatsapp: '+2250102030405',
      email: 'christian.bamba@gmail.com', address: 'Résidence Belle Vue', neighborhood: 'Koumassi Remblais',
      marital_status: 'celibataire', profession: 'Étudiant Master Finance', arrival_date: '2024-01-14',
      status: 'membre_actif', department_ids: JSON.stringify([2]), church_role: 'membre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Souleymane Bamba', emergency_contact_phone: '+225 01 99 88 77 66',
      emergency_contact_relation: 'Père', pastoral_notes: 'Fidèle aux cultes des jeunes.'
    },
    // Nouveaux membres (arrivés il y a moins de 90 jours - pour relances 2x/semaine)
    {
      code: 'MEM-2026-008', first_name: 'Prisca', last_name: 'AMANI', gender: 'F',
      birth_date: '2001-09-08', birth_place: 'Agboville', phone: '+225 07 12 34 56 78', whatsapp: '+2250712345678',
      email: 'prisca.amani@yahoo.fr', address: 'Cité Fairmont', neighborhood: 'Attécoubé',
      marital_status: 'celibataire', profession: 'Infirmière stagiaire', arrival_date: '2026-09-20',
      status: 'nouveau_membre', department_ids: JSON.stringify([2]), church_role: 'membre',
      baptism_status: 'candidat', emergency_contact_name: 'Clarisse Amani', emergency_contact_phone: '+225 07 44 55 66 77',
      emergency_contact_relation: 'Mère', pastoral_notes: 'Nouvelle convertie après la campagne d\'évangélisation.'
    },
    {
      code: 'MEM-2026-009', first_name: 'Jean-Luc', last_name: 'KONAN', gender: 'M',
      birth_date: '1989-05-30', birth_place: 'Toumodi', phone: '+225 05 23 45 67 89', whatsapp: '+2250523456789',
      email: 'jl.konan@outlook.com', address: 'Carrefour Duncan', neighborhood: 'Adjamé 220 Logements',
      marital_status: 'marie', profession: 'Commercial BTP', arrival_date: '2026-10-04',
      status: 'nouveau_membre', department_ids: JSON.stringify([4]), church_role: 'membre',
      baptism_status: 'non_baptise', emergency_contact_name: 'Estelle Konan', emergency_contact_phone: '+225 05 99 00 11 22',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Désire intégrer la classe de préparation au baptême.'
    },
    {
      code: 'MEM-2026-010', first_name: 'Béatrice', last_name: 'GNAHOUA', gender: 'F',
      birth_date: '1993-10-11', birth_place: 'Gagnoa', phone: '+225 01 34 56 78 90', whatsapp: '+2250134567890',
      email: 'bea.gnahoua@gmail.com', address: 'Quartier Maroc', neighborhood: 'Yopougon Maroc',
      marital_status: 'celibataire', profession: 'Professeur de Français', arrival_date: '2026-09-28',
      status: 'nouveau_membre', department_ids: JSON.stringify([3]), church_role: 'membre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Gnahoua Pierre', emergency_contact_phone: '+225 01 22 33 44 55',
      emergency_contact_relation: 'Frère', pastoral_notes: 'Vient d\'une autre église par mutation professionnelle.'
    },
    // Membre ancien avec 3 absences consécutives (pour tester l'alerte pastorale !)
    {
      code: 'MEM-2026-011', first_name: 'Samuel', last_name: 'TOURE', gender: 'M',
      birth_date: '1968-01-22', birth_place: 'Bouaké', phone: '+225 07 45 67 89 01', whatsapp: '+2250745678901',
      email: 'samuel.toure@gmail.com', address: 'Rue du Canal', neighborhood: 'Treichville Arras',
      marital_status: 'marie', profession: 'Retraité Fonction Publique', arrival_date: '2016-03-01',
      status: 'ancien', department_ids: JSON.stringify([4]), church_role: 'ancien',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Hélène Touré', emergency_contact_phone: '+225 07 11 22 33 44',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Ancien très respecté, malade ces derniers temps.'
    },
    {
      code: 'MEM-2026-012', first_name: 'Esther', last_name: 'DIBY', gender: 'F',
      birth_date: '1991-06-18', birth_place: 'Abidjan', phone: '+225 05 56 78 90 12', whatsapp: '+2250556789012',
      email: 'esther.diby@gmail.com', address: 'Boulevard Latrille', neighborhood: 'Cocody Angré 8ème Tranche',
      marital_status: 'celibataire', profession: 'Graphiste & Community Manager', arrival_date: '2021-04-12',
      status: 'membre_actif', department_ids: JSON.stringify([5]), church_role: 'chantre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Patrick Diby', emergency_contact_phone: '+225 05 33 44 55 66',
      emergency_contact_relation: 'Père', pastoral_notes: 'Chantre principale, voix soprano.'
    },
    {
      code: 'MEM-2026-013', first_name: 'Moïse', last_name: 'KOUAME', gender: 'M',
      birth_date: '1985-09-03', birth_place: 'Daoukro', phone: '+225 01 67 89 01 23', whatsapp: '+2250167890123',
      email: 'moise.kouame@africadev.org', address: 'Résidence Akwaba', neighborhood: 'Port-Bouët Derrière Wharf',
      marital_status: 'marie', profession: 'Technicien Télécom', arrival_date: '2022-01-10',
      status: 'membre_actif', department_ids: JSON.stringify([4, 6]), church_role: 'protocole',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Solange Kouamé', emergency_contact_phone: '+225 01 77 88 99 00',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Responsable adjoint du protocole.'
    },
    {
      code: 'MEM-2026-014', first_name: 'Grâce', last_name: 'KOUASSI', gender: 'F',
      birth_date: '1978-02-14', birth_place: 'Abidjan', phone: '+225 07 01 02 03 05', whatsapp: '+2250701020305',
      email: 'maman.grace@map-ebenezer.org', address: 'Villa 44, Rue des Jardins', neighborhood: 'Cocody Riviera 3',
      marital_status: 'marie', profession: 'Éducatrice Spécialisée', arrival_date: '2015-01-10',
      status: 'membre_actif', department_ids: JSON.stringify([1, 3]), church_role: 'moniteur_ecodim',
      baptism_status: 'baptise_eau', emergency_contact_name: 'David Kouassi', emergency_contact_phone: '+225 07 01 02 03 04',
      emergency_contact_relation: 'Époux', pastoral_notes: 'Épouse du pasteur et monitrice en chef ECODIM.'
    },
    {
      code: 'MEM-2026-015', first_name: 'Ruth', last_name: 'ADIKO', gender: 'F',
      birth_date: '2003-11-20', birth_place: 'Grand-Bassam', phone: '+225 05 78 90 12 34', whatsapp: '+2250578901234',
      email: 'ruth.adiko@gmail.com', address: 'Cité des Arts', neighborhood: 'Cocody Danga',
      marital_status: 'celibataire', profession: 'Étudiante en Droit', arrival_date: '2023-06-15',
      status: 'membre_actif', department_ids: JSON.stringify([2, 5]), church_role: 'chantre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Marc Adiko', emergency_contact_phone: '+225 05 12 34 56 78',
      emergency_contact_relation: 'Père', pastoral_notes: 'Joueuse de clavier dans l\'équipe de louange.'
    },
    {
      code: 'MEM-2026-016', first_name: 'Josué', last_name: 'OUATTARA', gender: 'M',
      birth_date: '1997-04-05', birth_place: 'Ferkessédougou', phone: '+225 01 89 01 23 45', whatsapp: '+2250189012345',
      email: 'josue.ouattara@gmail.com', address: 'Sogefiha', neighborhood: 'Koumassi',
      marital_status: 'celibataire', profession: 'Chauffeur VTC', arrival_date: '2022-08-19',
      status: 'membre_actif', department_ids: JSON.stringify([2]), church_role: 'membre',
      baptism_status: 'candidat', emergency_contact_name: 'Fanta Ouattara', emergency_contact_phone: '+225 01 55 66 77 88',
      emergency_contact_relation: 'Sœur', pastoral_notes: 'Inscrit à la prochaine session de baptême.'
    },
    {
      code: 'MEM-2026-017', first_name: 'Salomon', last_name: 'BAKAYOKO', gender: 'M',
      birth_date: '1980-07-09', birth_place: 'Séguéla', phone: '+225 07 90 12 34 56', whatsapp: '+2250790123456',
      email: 'salomon.baka@gmail.com', address: 'Cité Policière', neighborhood: 'Plateau Dokui',
      marital_status: 'marie', profession: 'Agent de Sécurité', arrival_date: '2019-03-24',
      status: 'membre_actif', department_ids: JSON.stringify([4, 6]), church_role: 'intercesseur',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Aïssata Bakayoko', emergency_contact_phone: '+225 07 22 33 44 55',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Fidèle aux veillées d\'intercession.'
    },
    {
      code: 'MEM-2026-018', first_name: 'Deborah', last_name: 'KOUADIO', gender: 'F',
      birth_date: '1984-12-01', birth_place: 'Dimbokro', phone: '+225 05 01 12 23 34', whatsapp: '+2250501122334',
      email: 'deborah.kouadio@gmail.com', address: 'Carrefour Chawarma', neighborhood: 'Marcory Residentiel',
      marital_status: 'marie', profession: 'Commerçante Textiles', arrival_date: '2017-09-11',
      status: 'membre_actif', department_ids: JSON.stringify([3]), church_role: 'diacre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Kouadio Jean', emergency_contact_phone: '+225 05 88 99 11 22',
      emergency_contact_relation: 'Époux', pastoral_notes: 'Responsable de la diaconie sociale.'
    },
    {
      code: 'MEM-2026-019', first_name: 'Nathan', last_name: 'BLÉ', gender: 'M',
      birth_date: '2015-08-12', birth_place: 'Abidjan', phone: '+225 01 23 45 67 01', whatsapp: '+2250123456701',
      email: null, address: 'Rue Princesse', neighborhood: 'Yopougon Rue Princesse',
      marital_status: 'celibataire', profession: 'Élève CM2', arrival_date: '2023-01-08',
      status: 'membre_actif', department_ids: JSON.stringify([1]), church_role: 'membre',
      baptism_status: 'non_baptise', emergency_contact_name: 'Thérèse Blé', emergency_contact_phone: '+225 01 23 45 67 01',
      emergency_contact_relation: 'Mère', pastoral_notes: 'Enfant assidu à l\'ECODIM.'
    },
    {
      code: 'MEM-2026-020', first_name: 'Miriam', last_name: 'BLÉ', gender: 'F',
      birth_date: '2018-03-25', birth_place: 'Abidjan', phone: '+225 01 23 45 67 01', whatsapp: '+2250123456701',
      email: null, address: 'Rue Princesse', neighborhood: 'Yopougon Rue Princesse',
      marital_status: 'celibataire', profession: 'Élève CP2', arrival_date: '2023-01-08',
      status: 'membre_actif', department_ids: JSON.stringify([1]), church_role: 'membre',
      baptism_status: 'non_baptise', emergency_contact_name: 'Thérèse Blé', emergency_contact_phone: '+225 01 23 45 67 01',
      emergency_contact_relation: 'Mère', pastoral_notes: 'Classe des petits ECODIM.'
    },
    {
      code: 'MEM-2026-021', first_name: 'Daniel', last_name: 'GOGOUA', gender: 'M',
      birth_date: '1970-05-17', birth_place: 'Gagnoa', phone: '+225 07 33 44 55 66', whatsapp: '+2250733445566',
      email: 'daniel.gogoua@yahoo.fr', address: 'Résidence Latrille', neighborhood: 'Cocody II Plateaux',
      marital_status: 'marie', profession: 'Architecte DPLG', arrival_date: '2016-08-20',
      status: 'ancien', department_ids: JSON.stringify([4]), church_role: 'ancien',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Jeanne Gogoua', emergency_contact_phone: '+225 07 44 55 66 77',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Supervise les projets de construction.'
    },
    {
      code: 'MEM-2026-022', first_name: 'Tabitha', last_name: 'SÉKA', gender: 'F',
      birth_date: '1990-10-04', birth_place: 'Adzopé', phone: '+225 05 66 77 88 11', whatsapp: '+2250566778811',
      email: 'tabitha.seka@gmail.com', address: 'Immeuble Mirador', neighborhood: 'Treichville',
      marital_status: 'celibataire', profession: 'Couturière Styliste', arrival_date: '2021-02-17',
      status: 'membre_actif', department_ids: JSON.stringify([3, 6]), church_role: 'protocole',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Paul Séka', emergency_contact_phone: '+225 05 77 88 99 22',
      emergency_contact_relation: 'Oncle', pastoral_notes: 'Confectionne les tenues du protocole.'
    },
    {
      code: 'MEM-2026-023', first_name: 'Élisée', last_name: 'BOHOUSSOU', gender: 'M',
      birth_date: '1994-06-29', birth_place: 'Bongouanou', phone: '+225 01 44 55 66 77', whatsapp: '+2250144556677',
      email: 'elisee.bohou@gmail.com', address: 'Cité Caistab', neighborhood: 'Yopougon Toit Rouge',
      marital_status: 'celibataire', profession: 'Électricien Bâtiment', arrival_date: '2020-10-15',
      status: 'membre_actif', department_ids: JSON.stringify([2]), church_role: 'membre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Ahou Bohoussou', emergency_contact_phone: '+225 01 55 66 77 88',
      emergency_contact_relation: 'Mère', pastoral_notes: 'Aide à la sono et maintenance électrique.'
    },
    {
      code: 'MEM-2026-024', first_name: 'Lydie', last_name: 'KASSI', gender: 'F',
      birth_date: '1987-03-11', birth_place: 'Abengourou', phone: '+225 07 77 88 99 33', whatsapp: '+2250777889933',
      email: 'lydie.kassi@sante.gouv.ci', address: 'Quartier Divo', neighborhood: 'Koumassi Divo',
      marital_status: 'veuf', profession: 'Sage-femme d\'État', arrival_date: '2018-09-02',
      status: 'membre_actif', department_ids: JSON.stringify([3]), church_role: 'diacre',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Kassi Georges', emergency_contact_phone: '+225 07 88 99 00 44',
      emergency_contact_relation: 'Frère', pastoral_notes: 'Conseillère auprès des jeunes mamans.'
    },
    {
      code: 'MEM-2026-025', first_name: 'Barnabé', last_name: 'ASSALE', gender: 'M',
      birth_date: '1983-09-14', birth_place: 'Tiassalé', phone: '+225 05 88 99 22 44', whatsapp: '+2250588992244',
      email: 'barnabe.assale@gmail.com', address: 'Résidence Flora', neighborhood: 'Cocody Palmeraie',
      marital_status: 'marie', profession: 'Enseignant Université', arrival_date: '2019-01-20',
      status: 'membre_actif', department_ids: JSON.stringify([4]), church_role: 'ancien',
      baptism_status: 'baptise_eau', emergency_contact_name: 'Monique Assalé', emergency_contact_phone: '+225 05 99 00 33 55',
      emergency_contact_relation: 'Épouse', pastoral_notes: 'Formateur de l\'école des disciples.'
    }
  ];

  // Insérer les membres
  const stmtMember = db.prepare(`
    INSERT INTO members (
      id, code, first_name, last_name, gender, birth_date, birth_place, phone, whatsapp,
      email, address, neighborhood, marital_status, profession, arrival_date,
      status, department_ids, church_role, baptism_status, emergency_contact_name,
      emergency_contact_phone, emergency_contact_relation, pastoral_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  members.forEach((m, idx) => {
    stmtMember.run(
      idx + 1, m.code, m.first_name, m.last_name, m.gender, m.birth_date, m.birth_place, m.phone, m.whatsapp,
      m.email, m.address, m.neighborhood, m.marital_status, m.profession, m.arrival_date,
      m.status, m.department_ids, m.church_role, m.baptism_status, m.emergency_contact_name,
      m.emergency_contact_phone, m.emergency_contact_relation, m.pastoral_notes
    );
  });

  // 5. Événements de culte récents (4 derniers dimanches et 2 cultes de semaine)
  const services = [
    { id: 1, title: 'Culte d\'Adoration et de Louange', type: 'culte_dimanche', date: '2026-10-04', start: '09:00', end: '11:30', is_closed: 1, closed_at: '2026-10-04 12:00:00' },
    { id: 2, title: 'Culte d\'Enseignement & Prière', type: 'culte_semaine', date: '2026-10-07', start: '18:30', end: '20:30', is_closed: 1, closed_at: '2026-10-07 20:45:00' },
    { id: 3, title: 'Culte de Sainte Cène & Actions de Grâce', type: 'culte_dimanche', date: '2026-10-11', start: '09:00', end: '11:45', is_closed: 1, closed_at: '2026-10-11 12:15:00' },
    { id: 4, title: 'Culte d\'Intercession & Délivrance', type: 'culte_semaine', date: '2026-10-14', start: '18:30', end: '20:30', is_closed: 1, closed_at: '2026-10-14 20:50:00' },
    { id: 5, title: 'Culte Dominical - La Puissance de la Grâce', type: 'culte_dimanche', date: '2026-10-18', start: '09:00', end: '11:30', is_closed: 1, closed_at: '2026-10-18 12:05:00' },
    { id: 6, title: 'Grand Culte d\'Impact Missionnaire', type: 'culte_dimanche', date: '2026-10-25', start: '09:00', end: '12:00', is_closed: 1, closed_at: '2026-10-25 12:30:00' },
    { id: 7, title: 'Culte Dominical à venir', type: 'culte_dimanche', date: '2026-11-01', start: '09:00', end: '11:30', is_closed: 0, closed_at: null }
  ];

  const stmtService = db.prepare('INSERT OR REPLACE INTO service_events (id, title, event_type, date, start_time, end_time, is_closed, closed_at, closed_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)');
  services.forEach(s => {
    stmtService.run(s.id, s.title, s.type, s.date, s.start, s.end, s.is_closed, s.closed_at);
  });

  // 6. Présences pour les cultes
  // Frère Samuel Touré (id 11) a été absent aux 3 derniers cultes dominicaux (service 3, 5, 6) pour déclencher l'alerte !
  const stmtAtt = db.prepare('INSERT OR REPLACE INTO attendances (service_event_id, member_id, status) VALUES (?, ?, ?)');
  
  // Remplir les présences pour les services 1, 3, 5, 6
  [1, 3, 5, 6].forEach(svcId => {
    for (let mId = 1; mId <= 25; mId++) {
      let status = 'present';
      // Simuler quelques absences réalistes
      if (mId === 11 && (svcId === 3 || svcId === 5 || svcId === 6)) {
        status = 'absent'; // Samuel Touré: 3 absences consécutives !
      } else if (mId === 9 && svcId === 6) {
        status = 'absent'; // Nouveau membre absent le dernier culte
      } else if (mId === 16 && (svcId === 5 || svcId === 6)) {
        status = 'absent';
      } else if (mId === 23 && svcId === 3) {
        status = 'excuse';
      } else if (mId === 8 && svcId === 5) {
        status = 'absent';
      }
      stmtAtt.run(svcId, mId, status);
    }
  });

  // 7. Catégories financières
  const categories = [
    { id: 1, name: 'Dîmes des membres', type: 'entree', desc: 'Dîmes versées par les fidèles' },
    { id: 2, name: 'Offrandes ordinaires des cultes', type: 'entree', desc: 'Paniers d\'offrandes dominicales et de semaine' },
    { id: 3, name: 'Dons et soutiens particuliers', type: 'entree', desc: 'Dons spontanés et soutiens aux ministères' },
    { id: 4, name: 'Offrandes de projet / Construction', type: 'entree', desc: 'Collectes dédiées à la construction du sanctuaire' },
    { id: 5, name: 'Ventes d\'ouvrages et livres', type: 'entree', desc: 'Librairie chrétienne et manuels d\'édification' },
    { id: 6, name: 'Loyer du temple et charges locatives', type: 'sortie', desc: 'Paiement mensuel du bail immobilier' },
    { id: 7, name: 'Électricité (CIE) et Eau (SODECI)', type: 'sortie', desc: 'Factures d\'énergie et services publics' },
    { id: 8, name: 'Matériel, sonorisation et instruments', type: 'sortie', desc: 'Achat et entretien du matériel de louange' },
    { id: 9, name: 'Aide sociale, diaconie et veuves', type: 'sortie', desc: 'Soutien aux nécessiteux, veuves et orphelins' },
    { id: 10, name: 'Honoraires et soutiens ministériels', type: 'sortie', desc: 'Indemnités pastorales et orateurs invités' },
    { id: 11, name: 'Événements, missions et séminaires', type: 'sortie', desc: 'Organisation des conférences et évangélisation' }
  ];

  const stmtCat = db.prepare('INSERT OR REPLACE INTO financial_categories (id, name, type, description) VALUES (?, ?, ?, ?)');
  categories.forEach(c => stmtCat.run(c.id, c.name, c.type, c.desc));

  // 8. Transactions financières réalistes (Entrées & Sorties en XOF)
  const transactions = [
    // Entrées
    { num: 'REC-2026-0001', type: 'entree', catId: 2, catName: 'Offrandes ordinaires des cultes', amount: 385000, method: 'especes', donorId: null, donorName: 'Fidèles (Culte Dimanche)', anon: 0, date: '2026-10-04', status: 'payee', svcId: 1, notes: 'Collecte culte 04 Octobre' },
    { num: 'REC-2026-0002', type: 'entree', catId: 1, catName: 'Dîmes des membres', amount: 250000, method: 'mobile_money', donorId: 3, donorName: 'Emmanuel Diomandé', anon: 0, date: '2026-10-04', status: 'payee', svcId: 1, notes: 'Dîme du mois d\'octobre par Wave' },
    { num: 'REC-2026-0003', type: 'entree', catId: 1, catName: 'Dîmes des membres', amount: 180000, method: 'virement', donorId: 5, donorName: 'Cécile Yao', anon: 0, date: '2026-10-05', status: 'payee', svcId: null, notes: 'Virement bancaire régulier' },
    { num: 'REC-2026-0004', type: 'entree', catId: 4, catName: 'Offrandes de projet / Construction', amount: 500000, method: 'mobile_money', donorId: 21, donorName: 'Daniel Gogoua', anon: 0, date: '2026-10-08', status: 'payee', svcId: null, notes: 'Soutien spécifique au projet acoustique' },
    { num: 'REC-2026-0005', type: 'entree', catId: 2, catName: 'Offrandes ordinaires des cultes', amount: 420000, method: 'especes', donorId: null, donorName: 'Fidèles (Culte Sainte Cène)', anon: 0, date: '2026-10-11', status: 'payee', svcId: 3, notes: 'Offrandes culte 11 Octobre' },
    { num: 'REC-2026-0006', type: 'entree', catId: 3, catName: 'Dons et soutiens particuliers', amount: 150000, method: 'especes', donorId: null, donorName: 'Bienfaiteur Anonyme', anon: 1, date: '2026-10-15', status: 'payee', svcId: null, notes: 'Don anonyme pour la diaconie' },
    { num: 'REC-2026-0007', type: 'entree', catId: 2, catName: 'Offrandes ordinaires des cultes', amount: 395000, method: 'especes', donorId: null, donorName: 'Fidèles (Culte Dominical)', anon: 0, date: '2026-10-18', status: 'payee', svcId: 5, notes: 'Offrandes culte 18 Octobre' },
    { num: 'REC-2026-0008', type: 'entree', catId: 1, catName: 'Dîmes des membres', amount: 320000, method: 'mobile_money', donorId: 6, donorName: 'Roger Traoré', anon: 0, date: '2026-10-20', status: 'payee', svcId: null, notes: 'Dîme Orange Money' },
    { num: 'REC-2026-0009', type: 'entree', catId: 2, catName: 'Offrandes ordinaires des cultes', amount: 460000, method: 'especes', donorId: null, donorName: 'Fidèles (Culte Missionnaire)', anon: 0, date: '2026-10-25', status: 'payee', svcId: 6, notes: 'Grande collecte missionnaire' },

    // Sorties
    { num: 'DEP-2026-0001', type: 'sortie', catId: 6, catName: 'Loyer du temple et charges locatives', amount: 450000, method: 'virement', beneficiary: 'SCI Les Arches de Gloire', date: '2026-10-02', status: 'payee', valBy: 3, notes: 'Loyer temple mois d\'octobre' },
    { num: 'DEP-2026-0002', type: 'sortie', catId: 7, catName: 'Électricité (CIE) et Eau (SODECI)', amount: 85000, method: 'mobile_money', beneficiary: 'Compagnie Ivoirienne d\'Électricité', date: '2026-10-06', status: 'payee', valBy: 3, notes: 'Facture CIE septembre/octobre' },
    { num: 'DEP-2026-0003', type: 'sortie', catId: 9, catName: 'Aide sociale, diaconie et veuves', amount: 120000, method: 'especes', beneficiary: 'Comité Diaconie (Maman Deborah)', date: '2026-10-10', status: 'payee', valBy: 1, notes: 'Paniers de vivres pour 4 familles vulnérables' },
    { num: 'DEP-2026-0004', type: 'sortie', catId: 8, catName: 'Matériel, sonorisation et instruments', amount: 280000, method: 'mobile_money', beneficiary: 'AudioPro Abidjan', date: '2026-10-16', status: 'payee', valBy: 3, notes: '2 micros HF sans fil Shure et câblage' },
    { num: 'DEP-2026-0005', type: 'sortie', catId: 10, catName: 'Honoraires et soutiens ministériels', amount: 350000, method: 'virement', beneficiary: 'Pasteur David Kouassi', date: '2026-10-25', status: 'payee', valBy: 3, notes: 'Indemnité pastorale mensuelle' },
    // Dépenses en attente d'approbation (workflow)
    { num: 'DEP-2026-0006', type: 'sortie', catId: 11, catName: 'Événements, missions et séminaires', amount: 200000, method: 'mobile_money', beneficiary: 'Comité Jeunesse (Franck N\'Guessan)', date: '2026-10-26', status: 'demandee', valBy: null, notes: 'Acompte réservation site du Camp des Jeunes 2026' }
  ];

  const stmtTrx = db.prepare(`
    INSERT OR REPLACE INTO financial_transactions (
      transaction_number, type, category_id, category_name, amount, currency,
      payment_method, donor_member_id, donor_name, is_anonymous, service_event_id,
      beneficiary, status, requested_by_user_id, validated_by_user_id, validated_at,
      date, notes
    ) VALUES (?, ?, ?, ?, ?, 'XOF', ?, ?, ?, ?, ?, ?, ?, 3, ?, ?, ?, ?)
  `);

  transactions.forEach(t => {
    stmtTrx.run(
      t.num, t.type, t.catId, t.catName, t.amount,
      t.method, t.donorId || null, t.donorName || null, t.anon || 0, t.svcId || null,
      t.beneficiary || null, t.status, t.valBy || null, t.status === 'payee' ? t.date + ' 10:00:00' : null,
      t.date, t.notes
    );
  });

  // 9. Budgets annuels par catégorie
  const budgets = [
    { catId: 1, amount: 4000000, notes: 'Objectif annuel Dîmes' },
    { catId: 2, amount: 5000000, notes: 'Objectif annuel Offrandes' },
    { catId: 4, amount: 6000000, notes: 'Fonds Projet Construction' },
    { catId: 6, amount: 5400000, notes: 'Budget Loyer Annuel' },
    { catId: 7, amount: 1200000, notes: 'Budget Énergie & Eau' },
    { catId: 8, amount: 2500000, notes: 'Budget Équipement & Sono' },
    { catId: 9, amount: 1800000, notes: 'Budget Aide Sociale' },
    { catId: 10, amount: 4500000, notes: 'Budget Ministériel' },
    { catId: 11, amount: 3000000, notes: 'Budget Événements & Missions' }
  ];

  const stmtBudget = db.prepare('INSERT OR REPLACE INTO financial_budgets (year, category_id, allocated_amount, notes) VALUES (2026, ?, ?, ?)');
  budgets.forEach(b => stmtBudget.run(b.catId, b.amount, b.notes));

  // 10. Rapports de départements
  // Département 2 (Jeunes) : rapports récents et réguliers -> score élevé
  // Département 4 (Hommes) : aucun rapport depuis 25 jours (> 3 semaines !) -> alerte automatique
  const reports = [
    {
      deptId: 2, user: 4, date: '2026-10-10', attendees: 28,
      activities: 'Atelier leadership chrétien et répétition de la chorale jeunesse.',
      difficulties: 'Manque de chaises supplémentaires lors de la plénière.',
      needs: 'Budget pour l\'impression des livrets de formation.',
      testimonies: 'Deux nouveaux étudiants de l\'université ont rejoint le groupe cette semaine.',
      notes: 'Très bonne mobilisation spirituelle.'
    },
    {
      deptId: 2, user: 4, date: '2026-10-24', attendees: 34,
      activities: 'Évangélisation de proximité au quartier Siporex et match de fraternité.',
      difficulties: 'Quelques retards au démarrage de l\'activité sportive.',
      needs: 'Autorisation pour l\'utilisation du minibus pour le camp.',
      testimonies: '4 jeunes rencontrés ont manifesté le désir de venir au culte.',
      notes: 'Rapport complet validé.'
    },
    {
      deptId: 3, user: 5, date: '2026-10-15', attendees: 22,
      activities: 'Séance de prière matinale Esther et partage biblique sur Proverbes 31.',
      difficulties: 'Salle annexe un peu étroite.',
      needs: 'Renouvellement du matériel de sonorisation portable.',
      testimonies: 'Guérison physique témoignée par sœur Lydie.',
      notes: 'Atmosphère de ferveur et de solidarité.'
    },
    {
      deptId: 1, user: 2, date: '2026-10-18', attendees: 35,
      activities: 'Enseignement sur l\'histoire de David et Goliath, coloriage et chants mimés.',
      difficulties: 'Besoin d\'un moniteur supplémentaire pour la tranche 3-6 ans.',
      needs: 'Crayons de couleur, papier canson et collation pour 40 enfants.',
      testimonies: 'Les enfants ont mémorisé le Psaume 23 en entier.',
      notes: 'Excellente assiduité.'
    },
    // Rapport Hommes datant du 28 Septembre 2026 (> 25 jours sans rapport -> Alerte !)
    {
      deptId: 4, user: 6, date: '2026-09-28', attendees: 18,
      activities: 'Déjeuner d\'échange des hommes sur l\'éthique chrétienne dans les affaires.',
      difficulties: 'Plusieurs hommes en voyage professionnel.',
      needs: 'Planification de la retraite annuelle des hommes.',
      testimonies: 'Témoignage d\'intégrité au travail récompensée par une promotion.',
      notes: 'Dernier rapport déposé il y a plus de 3 semaines.'
    }
  ];

  const stmtRep = db.prepare(`
    INSERT INTO department_reports (department_id, submitted_by_user_id, date, attendees_count, activities_done, difficulties, needs, testimonies, general_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  reports.forEach(r => stmtRep.run(r.deptId, r.user, r.date, r.attendees, r.activities, r.difficulties, r.needs, r.testimonies, r.notes));

  // 11. Projets
  const projects = [
    {
      id: 1, title: 'Camp Annuel de la Jeunesse 2026', deptId: 2, leaderId: 4,
      start: '2026-11-20', end: '2026-11-23', location: 'Centre Chrétien de Yamoussoukro',
      budget: 1850000, status: 'en_cours', participants: 65,
      desc: 'Retraite spirituelle, conférences, ateliers thématiques et impact social auprès des orphelinats.'
    },
    {
      id: 2, title: 'Isolation Acoustique & Climatisation du Sanctuaire', deptId: null, leaderId: 21,
      start: '2026-10-01', end: '2026-12-15', location: 'Temple Principal',
      budget: 3500000, status: 'en_cours', participants: 15,
      desc: 'Rénovation acoustique des murs pour respecter le voisinage et pose de 4 climatiseurs 3 CV.'
    },
    {
      id: 3, title: 'Conférence d\'Impact des Femmes de Foi', deptId: 3, leaderId: 5,
      start: '2026-12-05', end: '2026-12-06', location: 'Temple Principal',
      budget: 950000, status: 'planifie', participants: 120,
      desc: 'Deux journées d\'édification avec oratrice invitée internationale sur le thème : Bâtisseuse de destin.'
    }
  ];

  const stmtProj = db.prepare('INSERT OR REPLACE INTO projects (id, title, department_id, leader_id, start_date, end_date, location, estimated_budget, status, participants_count, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  projects.forEach(p => stmtProj.run(p.id, p.title, p.deptId, p.leaderId, p.start, p.end, p.location, p.budget, p.status, p.participants, p.desc));

  // Tâches de projets
  const tasks = [
    { projId: 1, title: 'Réservation de l\'hébergement et transport par car', done: 1, due: '2026-10-25' },
    { projId: 1, title: 'Validation du programme spirituel et des intervenants', done: 1, due: '2026-11-05' },
    { projId: 1, title: 'Clôture des inscriptions et fiches médicales', done: 0, due: '2026-11-12' },
    { projId: 2, title: 'Sélection du devis acousticien', done: 1, due: '2026-10-10' },
    { projId: 2, title: 'Pose des panneaux acoustiques muraux', done: 0, due: '2026-11-15' },
    { projId: 3, title: 'Confection des affiches et communication réseaux sociaux', done: 0, due: '2026-11-10' }
  ];

  const stmtTask = db.prepare('INSERT INTO project_tasks (project_id, title, is_completed, due_date) VALUES (?, ?, ?, ?)');
  tasks.forEach(t => stmtTask.run(t.projId, t.title, t.done, t.due));

  // 12. Calendrier d'événements
  const calendarEvents = [
    { title: 'Culte d\'Adoration et Enseignement', type: 'culte', start: '2026-11-01 09:00', end: '2026-11-01 11:30', loc: 'Temple Principal', desc: 'Série sur la maturité spirituelle.' },
    { title: 'Veillée d\'Intercession & Percée', type: 'culte', start: '2026-11-06 22:00', end: '2026-11-07 05:00', loc: 'Temple Principal', desc: 'Nuit entière de prière fervente.' },
    { title: 'Réunion Mensuelle des Hommes d\'Action', type: 'departement', deptId: 4, start: '2026-11-07 09:00', end: '2026-11-07 11:30', loc: 'Salle Annexe', desc: 'Reprise des activités et stratégie d\'accompagnement.' },
    { title: 'Célébration des Baptêmes par Immersion', type: 'bapteme', start: '2026-11-15 14:00', end: '2026-11-15 17:00', loc: 'Piscine Municipale / Baptistère', desc: 'Grande fête du salut pour 6 nouveaux frères et sœurs.' },
    { title: 'Camp Annuel de la Jeunesse', type: 'projet', projId: 1, start: '2026-11-20 08:00', end: '2026-11-23 18:00', loc: 'Centre Chrétien Yamoussoukro', desc: 'Rassemblement de tous les jeunes.' }
  ];

  const stmtCal = db.prepare('INSERT INTO calendar_events (title, event_type, department_id, project_id, start_datetime, end_datetime, location, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  calendarEvents.forEach(e => stmtCal.run(e.title, e.type, e.deptId || null, e.projId || null, e.start, e.end, e.loc, e.desc));

  // 13. Candidats au baptême et Registre des baptisés
  const candidates = [
    { mId: 8, class: 'Classe des Fondements de la Foi', status: 'en_cours', attend: 6, total: 8, mentor: 'Ancien Barnabé Assalé', date: '2026-11-15', notes: 'Très assidue, prête pour l\'immersion.' },
    { mId: 9, class: 'Classe des Fondements de la Foi', status: 'en_cours', attend: 5, total: 8, mentor: 'Pasteur David Kouassi', date: '2026-11-15', notes: 'Comprend bien la portée de l\'engagement.' },
    { mId: 16, class: 'Classe des Fondements de la Foi', status: 'pret', attend: 8, total: 8, mentor: 'Ancien Daniel Gogoua', date: '2026-11-15', notes: 'Cycle complet validé avec mention.' }
  ];

  const stmtCand = db.prepare('INSERT OR REPLACE INTO baptism_candidates (member_id, preparation_class_name, preparation_status, attendance_sessions_count, total_sessions, mentor_name, scheduled_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  candidates.forEach(c => stmtCand.run(c.mId, c.class, c.status, c.attend, c.total, c.mentor, c.date, c.notes));

  // Registre historique des baptisés avec certificats
  const baptisms = [
    {
      cert: 'BAPT-2025-001', mId: 4, date: '2021-08-15', place: 'Baptistère du Temple Ébénézer',
      officiant: 'Pasteur Principal', type: 'eau_immersion', witnesses: 'Secrétaire Général, Frère Emmanuel Diomandé'
    },
    {
      cert: 'BAPT-2025-002', mId: 7, date: '2024-04-20', place: 'Baptistère du Temple Ébénézer',
      officiant: 'Pasteur Principal', type: 'eau_immersion', witnesses: 'Responsable des Jeunes, Ancien Daniel Gogoua'
    },
    {
      cert: 'BAPT-2025-003', mId: 12, date: '2022-09-18', place: 'Baptistère du Temple Ébénézer',
      officiant: 'Pasteur Principal', type: 'eau_immersion', witnesses: 'Responsable des Femmes, Frère Emmanuel Diomandé'
    }
  ];

  const stmtBapt = db.prepare('INSERT OR REPLACE INTO baptism_records (certificate_number, member_id, baptism_date, baptism_place, officiant_name, baptism_type, witnesses) VALUES (?, ?, ?, ?, ?, ?, ?)');
  baptisms.forEach(b => stmtBapt.run(b.cert, b.mId, b.date, b.place, b.officiant, b.type, b.witnesses));

  // 14. Tâches pastorales de suivi (alerte 3 absences et nouveaux membres)
  const pastoralTasks = [
    {
      mId: 11, assigned: 1, type: 'visite_absent_3_fois', title: 'Visite pastorale urgente : Samuel Touré (3 absences consécutives)',
      desc: 'Le frère Samuel a manqué les cultes du 11, 18 et 25 Octobre. Prendre contact avec son épouse Hélène pour convenir d\'une visite à domicile.',
      due: '2026-10-30', status: 'a_faire'
    },
    {
      mId: 8, assigned: 2, type: 'relance_nouveau_membre', title: 'Relance hebdomadaire : Prisca Amani (Nouvelle membre)',
      desc: 'Prendre des nouvelles de la semaine et s\'assurer qu\'elle a le support de cours de la classe de baptême.',
      due: '2026-10-31', status: 'en_cours'
    },
    {
      mId: 9, assigned: 1, type: 'relance_nouveau_membre', title: 'Appel pastoral de bienvenue : Jean-Luc Konan',
      desc: 'Vérifier son intégration dans le département des hommes.',
      due: '2026-11-02', status: 'a_faire'
    }
  ];

  const stmtPastoral = db.prepare('INSERT INTO pastoral_tasks (member_id, assigned_to_user_id, task_type, title, description, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  pastoralTasks.forEach(pt => stmtPastoral.run(pt.mId, pt.assigned, pt.type, pt.title, pt.desc, pt.due, pt.status));

  // 15. Historique de notifications
  const notifications = [
    { mId: 11, chan: 'whatsapp', dest: '+2250745678901', key: 'template_three_absences', msg: 'Shalom Cher Ancien Samuel Touré, le collège pastoral prend de vos nouvelles suite à vos absences. Nous prions pour votre prompt rétablissement.', stat: 'envoye' },
    { mId: 9, chan: 'sms', dest: '+2250523456789', key: 'template_absent', msg: 'Bonjour Jean-Luc, vous nous avez manqué au culte du 25/10. Toute la Mission Apostolique de Pentecôte (MAP) - Temple Ébénézer prie pour vous.', stat: 'envoye' },
    { mId: 8, chan: 'whatsapp', dest: '+2250712345678', key: 'template_new_member', msg: 'Shalom Prisca ! L\'équipe pastorale de la Mission Apostolique de Pentecôte (MAP) - Temple Ébénézer prend de vos nouvelles. Comment se passe votre semaine ?', stat: 'envoye' }
  ];

  const stmtNotif = db.prepare('INSERT INTO notifications_log (recipient_member_id, channel, recipient_address, template_key, message_content, status) VALUES (?, ?, ?, ?, ?, ?)');
  notifications.forEach(n => stmtNotif.run(n.mId, n.chan, n.dest, n.key, n.msg, n.stat));

  // 16. Journal d'audit initial
  const audits = [
    { uId: 1, name: 'Pasteur David Kouassi', role: 'admin', act: 'INITIALISATION_SYSTEME', ent: 'system', entId: 1, det: 'Configuration initiale de l\'assemblée et des seuils pastoraux.' },
    { uId: 2, name: 'Sœur Marie-Esther Koffi', role: 'secretaire', act: 'IMPORT_MEMBRES', ent: 'members', entId: 25, det: 'Importation initiale du registre des 25 premiers membres.' },
    { uId: 3, name: 'Frère Emmanuel Diomandé', role: 'tresorier', act: 'ENREGISTREMENT_DIMES', ent: 'financial_transactions', entId: 2, det: 'Saisie des dîmes et offrandes du culte du 04 Octobre.' },
    { uId: 1, name: 'Pasteur David Kouassi', role: 'admin', act: 'CLOTURE_PRESENCE', ent: 'service_events', entId: 6, det: 'Clôture du culte du 25 Octobre et déclenchement des notifications d\'absence.' }
  ];

  const stmtAudit = db.prepare('INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details_json, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, \'127.0.0.1\')');
  audits.forEach(a => stmtAudit.run(a.uId, a.name, a.role, a.act, a.ent, a.entId, a.det));

  console.log('Seeding completed successfully!');
}

if (require.main === module) {
  runSeed();
}

module.exports = { runSeed };
