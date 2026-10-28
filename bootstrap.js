/**
 * EcclesiaManager - Initialisation sécurisée au démarrage (production)
 * - Crée les données de base si la base est vide (paramètres, départements, catégories)
 * - En production : exige un mot de passe administrateur, désactive les comptes de démonstration
 */
const { hashPassword, verifyPassword } = require('./database');

const DEFAULT_PASSWORDS = [
  'pasteur123', 'secret123', 'tresor123', 'jeunes123', 'femmes123',
  'hommes123', 'enfants123', 'louange123', 'priere123', 'membre123'
];

function run(db) {
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

  const departments = [
    { id: 1, name: 'Département des Enfants', code: 'ENFANTS', description: 'Éveil spirituel et formation biblique des enfants', color: '#10B981', icon: 'smile' },
    { id: 2, name: 'Département des Jeunes', code: 'JEUNES', description: 'Jeunesse, étudiants et jeunes professionnels', color: '#6366F1', icon: 'zap' },
    { id: 3, name: 'Département des Femmes', code: 'FEMMES', description: 'Fraternité et ministère des femmes et mères de l\'église', color: '#EC4899', icon: 'heart' },
    { id: 4, name: 'Département des Hommes', code: 'HOMMES', description: 'Communauté des hommes, pères et serviteurs', color: '#3B82F6', icon: 'shield' },
    { id: 5, name: 'Département de la Louange', code: 'LOUANGE', description: 'Chantres, musiciens et technique audiovisuelle', color: '#F59E0B', icon: 'music' },
    { id: 6, name: 'Département d\'Intercession & Accueil', code: 'INTERCESSION', description: 'Prière fervente, accueil et protocole', color: '#8B5CF6', icon: 'bell' }
  ];

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

  const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)');
  for (const s of settings) insSetting.run(s[0], s[1], s[2]);

  const deptCount = db.prepare('SELECT count(*) as c FROM departments').get().c;
  if (deptCount === 0) {
    const ins = db.prepare('INSERT INTO departments (id, name, code, description, color, icon) VALUES (?, ?, ?, ?, ?, ?)');
    for (const d of departments) ins.run(d.id, d.name, d.code, d.description, d.color, d.icon);
  }

  const catCount = db.prepare('SELECT count(*) as c FROM financial_categories').get().c;
  if (catCount === 0) {
    const ins = db.prepare('INSERT INTO financial_categories (id, name, type, description) VALUES (?, ?, ?, ?)');
    for (const c of categories) ins.run(c.id, c.name, c.type, c.desc);
  }

  if (process.env.NODE_ENV !== 'production') return;

  // ---- Sécurisation production ----
  const adminEmail = (process.env.ADMIN_EMAIL || 'pasteur@map-ebenezer.org').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const admin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);

  if (!admin) {
    if (adminPassword.length < 10) {
      console.error('ERREUR : définissez la variable ADMIN_PASSWORD (10 caractères minimum) pour créer le compte du Pasteur.');
      process.exit(1);
    }
    const { hash, salt } = hashPassword(adminPassword);
    db.prepare(`INSERT INTO users (email, password_hash, salt, full_name, role, is_active)
                VALUES (?, ?, ?, 'Pasteur Principal', 'admin', 1)`).run(adminEmail, hash, salt);
    console.log('Compte administrateur créé :', adminEmail);
  } else if (adminPassword.length >= 10 &&
             (process.env.RESET_ADMIN_PASSWORD === 'true' ||
              DEFAULT_PASSWORDS.some(p => verifyPassword(p, admin.password_hash, admin.salt)))) {
    const { hash, salt } = hashPassword(adminPassword);
    db.prepare('UPDATE users SET password_hash = ?, salt = ?, is_active = 1 WHERE id = ?').run(hash, salt, admin.id);
    console.log('Mot de passe administrateur réinitialisé.');
  }

  // Désactiver tout compte dont le mot de passe est encore celui du README
  const users = db.prepare('SELECT id, email, password_hash, salt FROM users WHERE is_active = 1').all();
  for (const u of users) {
    if (DEFAULT_PASSWORDS.some(p => verifyPassword(p, u.password_hash, u.salt))) {
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      console.log('Compte avec mot de passe par défaut désactivé :', u.email);
    }
  }
}

module.exports = { run };
