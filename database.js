/**
 * EcclesiaManager - Schéma de Base de Données et Initialisation
 * Utilise le module natif SQLite de Node.js (node:sqlite)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, 'assemblee.db');

function getDatabase() {
  const db = new DatabaseSync(DB_PATH);
  // Activer les clés étrangères et le mode WAL pour la performance
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

// Fonction de hachage de mot de passe sécurisé PBKDF2
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return testHash === hash;
}

function initSchema(db) {
  db.exec(`
    -- Paramètres système
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Départements
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT DEFAULT '#3B82F6',
      icon TEXT DEFAULT 'users',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Utilisateurs du système
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'secretaire', 'tresorier', 'resp_dept', 'membre')),
      department_id INTEGER,
      member_id INTEGER,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    );

    -- Sessions actives
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Membres de l'assemblée
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      gender TEXT CHECK(gender IN ('M', 'F')),
      birth_date TEXT,
      birth_place TEXT,
      photo_url TEXT,
      phone TEXT,
      whatsapp TEXT,
      email TEXT,
      address TEXT,
      neighborhood TEXT,
      marital_status TEXT CHECK(marital_status IN ('celibataire', 'marie', 'veuf', 'divorce')),
      profession TEXT,
      arrival_date TEXT,
      status TEXT CHECK(status IN ('nouveau_membre', 'membre_actif', 'ancien', 'inactif')) DEFAULT 'nouveau_membre',
      department_ids TEXT, -- JSON Array: [1, 2]
      church_role TEXT DEFAULT 'membre', -- pasteur, ancien, diacre, resp_departement, chantre, etc.
      baptism_status TEXT CHECK(baptism_status IN ('non_baptise', 'candidat', 'baptise_eau', 'baptise_saint_esprit')) DEFAULT 'non_baptise',
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      emergency_contact_relation TEXT,
      pastoral_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Événements de culte et activités (pour les présences)
    CREATE TABLE IF NOT EXISTS service_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_type TEXT CHECK(event_type IN ('culte_dimanche', 'culte_semaine', 'priere_veillee', 'reunion_departement', 'activite_speciale')) DEFAULT 'culte_dimanche',
      department_id INTEGER,
      date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      location TEXT DEFAULT 'Temple Principal',
      notes TEXT,
      is_closed INTEGER DEFAULT 0,
      closed_at DATETIME,
      closed_by_user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Présences
    CREATE TABLE IF NOT EXISTS attendances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_event_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      status TEXT CHECK(status IN ('present', 'absent', 'excuse')) DEFAULT 'present',
      check_in_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      UNIQUE(service_event_id, member_id),
      FOREIGN KEY (service_event_id) REFERENCES service_events(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    -- Tâches et alertes de suivi pastoral
    CREATE TABLE IF NOT EXISTS pastoral_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      assigned_to_user_id INTEGER,
      task_type TEXT CHECK(task_type IN ('relance_nouveau_membre', 'visite_absent_3_fois', 'suivi_pastoral', 'visite_malade', 'contact_telephonique')),
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      status TEXT CHECK(status IN ('a_faire', 'en_cours', 'termine', 'annule')) DEFAULT 'a_faire',
      resolution_notes TEXT,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Historique des notifications
    CREATE TABLE IF NOT EXISTS notifications_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_member_id INTEGER,
      channel TEXT CHECK(channel IN ('whatsapp', 'sms', 'email', 'in_app')),
      recipient_address TEXT,
      template_key TEXT,
      message_content TEXT NOT NULL,
      status TEXT CHECK(status IN ('envoye', 'en_attente', 'echoue', 'simule')) DEFAULT 'envoye',
      error_message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT,
      FOREIGN KEY (recipient_member_id) REFERENCES members(id) ON DELETE SET NULL
    );

    -- Catégories financières
    CREATE TABLE IF NOT EXISTS financial_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('entree', 'sortie')) NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1
    );

    -- Transactions financières (Entrées / Sorties)
    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_number TEXT UNIQUE,
      type TEXT CHECK(type IN ('entree', 'sortie')) NOT NULL,
      category_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'XOF',
      payment_method TEXT CHECK(payment_method IN ('especes', 'mobile_money', 'virement', 'cheque')) DEFAULT 'especes',
      payment_reference TEXT,
      donor_member_id INTEGER,
      donor_name TEXT,
      is_anonymous INTEGER DEFAULT 0,
      service_event_id INTEGER,
      project_id INTEGER,
      beneficiary TEXT,
      receipt_proof_url TEXT,
      status TEXT CHECK(status IN ('demandee', 'approuvee', 'payee', 'rejetee')) DEFAULT 'payee',
      requested_by_user_id INTEGER,
      validated_by_user_id INTEGER,
      validated_at DATETIME,
      date TEXT NOT NULL,
      notes TEXT,
      is_locked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES financial_categories(id),
      FOREIGN KEY (donor_member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY (service_event_id) REFERENCES service_events(id) ON DELETE SET NULL,
      FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (validated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Budgets prévisionnels
    CREATE TABLE IF NOT EXISTS financial_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      category_id INTEGER,
      project_id INTEGER,
      allocated_amount REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY (category_id) REFERENCES financial_categories(id) ON DELETE CASCADE
    );

    -- Clôtures de périodes financières
    CREATE TABLE IF NOT EXISTS financial_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_type TEXT CHECK(period_type IN ('mensuel', 'annuel')),
      period_label TEXT NOT NULL UNIQUE,
      closed_by_user_id INTEGER,
      closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_in REAL NOT NULL,
      total_out REAL NOT NULL,
      net_balance REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Rapports d'activité des départements
    CREATE TABLE IF NOT EXISTS department_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      submitted_by_user_id INTEGER,
      date TEXT NOT NULL,
      attendees_count INTEGER DEFAULT 0,
      activities_done TEXT,
      difficulties TEXT,
      needs TEXT,
      testimonies TEXT,
      general_notes TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
      FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- Historique des scores de santé des départements
    CREATE TABLE IF NOT EXISTS department_health_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      score INTEGER NOT NULL,
      color TEXT NOT NULL,
      details_json TEXT,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
    );

    -- Projets et programmes
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      department_id INTEGER,
      leader_id INTEGER,
      start_date TEXT,
      end_date TEXT,
      location TEXT,
      estimated_budget REAL DEFAULT 0,
      status TEXT CHECK(status IN ('idee', 'planifie', 'en_cours', 'termine', 'annule')) DEFAULT 'planifie',
      participants_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (leader_id) REFERENCES members(id) ON DELETE SET NULL
    );

    -- Tâches de projet
    CREATE TABLE IF NOT EXISTS project_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      assigned_to_user_id INTEGER,
      due_date TEXT,
      is_completed INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- Événements du calendrier
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT CHECK(event_type IN ('culte', 'departement', 'projet', 'bapteme', 'autre')) DEFAULT 'culte',
      department_id INTEGER,
      project_id INTEGER,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT,
      location TEXT,
      reminder_before_hours INTEGER DEFAULT 24,
      is_all_day INTEGER DEFAULT 0,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    -- Candidats au baptême
    CREATE TABLE IF NOT EXISTS baptism_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      preparation_class_name TEXT DEFAULT 'Classe des Fondements de la Foi',
      preparation_status TEXT CHECK(preparation_status IN ('inscrit', 'en_cours', 'pret', 'reporte')) DEFAULT 'en_cours',
      attendance_sessions_count INTEGER DEFAULT 0,
      total_sessions INTEGER DEFAULT 8,
      mentor_name TEXT,
      scheduled_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    -- Registre officiel des baptisés
    CREATE TABLE IF NOT EXISTS baptism_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_number TEXT NOT NULL UNIQUE,
      member_id INTEGER NOT NULL,
      baptism_date TEXT NOT NULL,
      baptism_place TEXT DEFAULT 'Baptistère du Temple Principal',
      officiant_name TEXT NOT NULL,
      baptism_type TEXT CHECK(baptism_type IN ('eau_immersion', 'saint_esprit', 'autre')) DEFAULT 'eau_immersion',
      witnesses TEXT,
      photo_url TEXT,
      bible_verse TEXT DEFAULT '« Nous avons donc été ensevelis avec lui par le baptême en sa mort, afin que, comme Christ est ressuscité des morts par la gloire du Père, de même nous aussi nous marchions en nouveauté de vie. » — Romains 6:4',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    -- Journal d'audit pour traçabilité de toutes les actions sensibles
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details_json TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Index pour accélération des requêtes
    CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
    CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
    CREATE INDEX IF NOT EXISTS idx_attendances_event ON attendances(service_event_id);
    CREATE INDEX IF NOT EXISTS idx_attendances_member ON attendances(member_id);
    CREATE INDEX IF NOT EXISTS idx_finances_date ON financial_transactions(date);
    CREATE INDEX IF NOT EXISTS idx_finances_type ON financial_transactions(type);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);
}

function logAudit(db, { userId, userName, userRole, action, entityType, entityId, details, ip = '127.0.0.1' }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details_json, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      userId || null,
      userName || 'Système',
      userRole || 'system',
      action,
      entityType,
      entityId || null,
      typeof details === 'object' ? JSON.stringify(details) : details,
      ip
    );
  } catch (err) {
    console.error('Audit logging error:', err);
  }
}

module.exports = {
  DB_PATH,
  getDatabase,
  initSchema,
  hashPassword,
  verifyPassword,
  logAudit
};
