/**
 * EcclesiaManager - Serveur HTTP & API REST Full-Stack
 * Développé sans dépendances npm externes, utilisant le runtime natif Node.js
 */

const http = require('node:http');
const url = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const { getDatabase, initSchema, hashPassword, verifyPassword, logAudit, DB_PATH } = require('./database');
const { runAllCronTasks } = require('./cron');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Initialiser la base de données
const db = getDatabase();
initSchema(db);

// Garantit la présence des paramètres essentiels (sans écraser ceux déjà modifiés)
{
  const ensure = db.prepare('INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)');
  ensure.run('church_name', 'Mission Apostolique de Pentecôte (MAP) - Temple Ébénézer', 'Nom de l\'église');
  ensure.run('report_warning_weeks', '3', 'Semaines sans rapport avant alerte');
  ensure.run('absence_threshold', '3', 'Absences consécutives avant alerte');
}

// Types MIME pour les fichiers statiques
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

// Fonctions utilitaires HTTP
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message, details = null) {
  sendJSON(res, statusCode, { success: false, error: message, details });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) { // Limite 10MB
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve(body);
      }
    });
    req.on('error', reject);
  });
}

// Extraction du token d'authentification
function getAuthUser(req) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['cookie']) {
    const match = req.headers['cookie'].match(/ecclesia_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;

  try {
    const session = db.prepare(`
      SELECT s.token, u.id, u.email, u.full_name, u.role, u.department_id, u.member_id, u.phone
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
    `).get(token);

    return session || null;
  } catch (err) {
    return null;
  }
}

// Vérification des permissions RBAC
function checkPermission(user, requiredRoles) {
  if (!user) return false;
  if (user.role === 'admin') return true; // L'administrateur a tous les droits
  if (Array.isArray(requiredRoles)) {
    return requiredRoles.includes(user.role);
  }
  return user.role === requiredRoles;
}

// Serveur de fichiers statiques
function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Sécurité traversée de répertoire
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Accès refusé');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback SPA vers index.html pour les routes clientes
      if (!pathname.startsWith('/api/')) {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404);
            return res.end('Fichier non trouvé');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Ressource introuvable');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Pas de cache pour les JS/CSS (rechargement immédiat des nouvelles versions)
    const headers = { 'Content-Type': contentType };
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers['Pragma'] = 'no-cache';
    } else if (ext === '.css' || ext === '.js') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers['Pragma'] = 'no-cache';
    } else if (ext === '.svg' || ext === '.png') {
      headers['Cache-Control'] = 'public, max-age=3600';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

// Création du serveur HTTP
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const query = parsedUrl.query;

  // Gérer CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  // Si ce n'est pas une requête API, servir le contenu statique
  if (!pathname.startsWith('/api/')) {
    return serveStatic(req, res, pathname);
  }

  // Utilisateur connecté
  const currentUser = getAuthUser(req);
  const clientIp = req.socket.remoteAddress || '127.0.0.1';

  try {
    // -------------------------------------------------------------
    // 1. AUTHENTIFICATION & RÔLES
    // -------------------------------------------------------------

    // POST /api/auth/login
    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = await parseBody(req);
      if (!email || !password) return sendError(res, 400, 'Email et mot de passe requis');

      const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
      if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
        return sendError(res, 401, 'Identifiants invalides');
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 jours

      db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

      logAudit(db, {
        userId: user.id,
        userName: user.full_name,
        userRole: user.role,
        action: 'CONNEXION',
        entityType: 'auth',
        entityId: user.id,
        details: { email },
        ip: clientIp
      });

      return sendJSON(res, 200, {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          departmentId: user.department_id,
          memberId: user.member_id,
          phone: user.phone
        }
      });
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me' && method === 'GET') {
      if (!currentUser) return sendError(res, 401, 'Non authentifié');
      return sendJSON(res, 200, { success: true, user: currentUser });
    }

    // POST /api/auth/switch-role (Permet aux testeurs de basculer instantanément de rôle ou de compte responsable)
    if (pathname === '/api/auth/switch-role' && method === 'POST') {
      const { role, departmentId, userId } = await parseBody(req);
      let targetUser = null;

      if (userId) {
        targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      } else if (departmentId) {
        targetUser = db.prepare('SELECT * FROM users WHERE department_id = ? LIMIT 1').get(departmentId);
      }

      if (!targetUser && role) {
        targetUser = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(role);
      }

      if (!targetUser) {
        targetUser = currentUser || db.prepare('SELECT * FROM users WHERE id = 1').get();
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, targetUser.id, expiresAt);

      logAudit(db, {
        userId: targetUser.id,
        userName: targetUser.full_name,
        userRole: targetUser.role,
        action: 'CHANGEMENT_ROLE_TEST',
        entityType: 'auth',
        entityId: targetUser.id,
        details: { newRole: targetUser.role, email: targetUser.email, departmentId: targetUser.department_id },
        ip: clientIp
      });

      return sendJSON(res, 200, {
        success: true,
        token,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          fullName: targetUser.full_name,
          role: targetUser.role,
          departmentId: targetUser.department_id || null,
          memberId: targetUser.member_id,
          phone: targetUser.phone
        }
      });
    }

    // POST /api/auth/logout
    if (pathname === '/api/auth/logout' && method === 'POST') {
      if (currentUser) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(currentUser.token);
      }
      return sendJSON(res, 200, { success: true, message: 'Déconnexion réussie' });
    }

    // -------------------------------------------------------------
    // GESTION DES COMPTES RESPONSABLES (IDENTIFIANTS & MOTS DE PASSE)
    // -------------------------------------------------------------

    // GET /api/users
    if (pathname === '/api/users' && method === 'GET') {
      const users = db.prepare(`
        SELECT u.id, u.email, u.full_name, u.role, u.department_id, u.phone, u.is_active, u.created_at, u.last_login,
               d.name as department_name, d.code as department_code
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        ORDER BY u.role ASC, u.id ASC
      `).all();

      return sendJSON(res, 200, { success: true, data: users });
    }

    // POST /api/users (Créer un identifiant et mot de passe pour un responsable)
    if (pathname === '/api/users' && method === 'POST') {
      if (!checkPermission(currentUser, 'admin')) {
        return sendError(res, 403, 'Seul le Pasteur / Administrateur peut créer des comptes responsables');
      }

      const b = await parseBody(req);
      if (!b.email || !b.password || !b.full_name || !b.role) {
        return sendError(res, 400, 'Identifiant (email), mot de passe, nom complet et rôle obligatoires');
      }

      const emailClean = b.email.trim().toLowerCase();
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailClean);
      if (existing) {
        return sendError(res, 400, 'Cet identifiant est déjà utilisé');
      }

      const { hash, salt } = hashPassword(b.password.trim());
      const stmt = db.prepare(`
        INSERT INTO users (email, password_hash, salt, full_name, role, department_id, phone, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);

      const result = stmt.run(
        emailClean, hash, salt, b.full_name.trim(), b.role,
        b.department_id ? parseInt(b.department_id, 10) : null,
        b.phone ? b.phone.trim() : null
      );

      const newId = Number(result.lastInsertRowid);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'CREATION_COMPTE_RESPONSABLE',
        entityType: 'users',
        entityId: newId,
        details: { email: emailClean, name: b.full_name, role: b.role, departmentId: b.department_id },
        ip: clientIp
      });

      return sendJSON(res, 201, { success: true, id: newId, message: 'Compte responsable créé avec succès' });
    }

    // PUT /api/users/:id (Modifier ou réinitialiser le mot de passe)
    if (pathname.match(/^\/api\/users\/\d+$/) && method === 'PUT') {
      if (!checkPermission(currentUser, 'admin')) {
        return sendError(res, 403, 'Permission refusée');
      }

      const id = parseInt(pathname.split('/')[3], 10);
      const b = await parseBody(req);

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!user) return sendError(res, 404, 'Compte responsable introuvable');

      let hash = user.password_hash;
      let salt = user.salt;
      let passChanged = false;

      if (b.password && b.password.trim()) {
        const resHash = hashPassword(b.password.trim());
        hash = resHash.hash;
        salt = resHash.salt;
        passChanged = true;
      }

      db.prepare(`
        UPDATE users SET
          email = COALESCE(?, email),
          password_hash = ?,
          salt = ?,
          full_name = COALESCE(?, full_name),
          role = COALESCE(?, role),
          department_id = ?,
          phone = COALESCE(?, phone),
          is_active = COALESCE(?, is_active)
        WHERE id = ?
      `).run(
        b.email ? b.email.trim().toLowerCase() : null,
        hash,
        salt,
        b.full_name ? b.full_name.trim() : null,
        b.role || null,
        b.department_id !== undefined ? (b.department_id ? parseInt(b.department_id, 10) : null) : user.department_id,
        b.phone !== undefined ? b.phone : user.phone,
        b.is_active !== undefined ? (b.is_active ? 1 : 0) : user.is_active,
        id
      );

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'MODIFICATION_COMPTE_RESPONSABLE',
        entityType: 'users',
        entityId: id,
        details: { email: b.email || user.email, passwordReset: passChanged },
        ip: clientIp
      });

      return sendJSON(res, 200, { success: true, message: passChanged ? 'Compte et mot de passe mis à jour !' : 'Compte responsable mis à jour' });
    }

    // DELETE /api/users/:id
    if (pathname.match(/^\/api\/users\/\d+$/) && method === 'DELETE') {
      if (!checkPermission(currentUser, 'admin')) {
        return sendError(res, 403, 'Permission refusée');
      }

      const id = parseInt(pathname.split('/')[3], 10);
      if (id === 1 || (currentUser && currentUser.id === id)) {
        return sendError(res, 400, 'Impossible de supprimer le compte administrateur principal');
      }

      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'SUPPRESSION_COMPTE_RESPONSABLE',
        entityType: 'users',
        entityId: id,
        details: { userId: id },
        ip: clientIp
      });

      return sendJSON(res, 200, { success: true, message: 'Compte responsable supprimé' });
    }

    // -------------------------------------------------------------
    // 2. TABLEAU DE BORD GÉNÉRAL (KPIs)
    // -------------------------------------------------------------
    if (pathname === '/api/dashboard' && method === 'GET') {
      // Effectif total et répartition
      const memberStats = db.prepare(`
        SELECT 
          count(*) as total,
          sum(CASE WHEN status = 'membre_actif' THEN 1 ELSE 0 END) as actifs,
          sum(CASE WHEN status = 'nouveau_membre' THEN 1 ELSE 0 END) as nouveaux,
          sum(CASE WHEN status = 'ancien' THEN 1 ELSE 0 END) as anciens,
          sum(CASE WHEN status = 'inactif' THEN 1 ELSE 0 END) as inactifs
        FROM members
      `).get();

      // Nouveaux membres ce mois-ci
      const newThisMonth = db.prepare(`
        SELECT count(*) as count 
        FROM members 
        WHERE arrival_date IS NOT NULL
          AND strftime('%Y-%m', arrival_date) = strftime('%Y-%m', 'now')
      `).get().count;

      // Présence moyenne des 3 derniers cultes
      const recentServices = db.prepare(`
        SELECT id, title, date,
          (SELECT count(*) FROM attendances WHERE service_event_id = service_events.id AND status = 'present') as presents,
          (SELECT count(*) FROM attendances WHERE service_event_id = service_events.id) as total_appel
        FROM service_events
        WHERE is_closed = 1
        ORDER BY date DESC LIMIT 4
      `).all();

      let avgAttendanceRate = 0;
      if (recentServices.length > 0) {
        const sumRates = recentServices.reduce((acc, s) => acc + (s.total_appel > 0 ? (s.presents / s.total_appel) * 100 : 0), 0);
        avgAttendanceRate = Math.round(sumRates / recentServices.length);
      }

      // Absents nécessitant relance (tâches pastorales 'a_faire' ou 'en_cours')
      const absentsToFollowUp = db.prepare(`
        SELECT count(*) as count 
        FROM pastoral_tasks 
        WHERE status IN ('a_faire', 'en_cours')
      `).get().count;

      // Alertes de rapports manquants (> 3 semaines)
      const warningWeeks = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'report_warning_weeks'").get()?.value || '3', 10);
      // Sans aucun rapport, on compte les jours depuis la création du département (et non depuis 2020)
      const missingReports = db.prepare(`
        SELECT d.id, d.name, d.code, max(r.date) as last_report_date,
               CASE WHEN max(r.date) IS NULL THEN 1 ELSE 0 END as never_reported,
               CAST((julianday('now') - julianday(COALESCE(max(r.date), date(d.created_at)))) AS INTEGER) as days_since
        FROM departments d
        LEFT JOIN department_reports r ON d.id = r.department_id
        GROUP BY d.id
        HAVING days_since > ?
      `).all(warningWeeks * 7);

      // Situation financière globale (Mois en cours)
      const currentMonthFinances = db.prepare(`
        SELECT 
          sum(CASE WHEN type = 'entree' AND status = 'payee' THEN amount ELSE 0 END) as total_entrees,
          sum(CASE WHEN type = 'sortie' AND status = 'payee' THEN amount ELSE 0 END) as total_sorties
        FROM financial_transactions
        WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
      `).get();

      // Solde de caisse global
      const globalBalance = db.prepare(`
        SELECT 
          sum(CASE WHEN type = 'entree' AND status = 'payee' THEN amount ELSE 0 END) -
          sum(CASE WHEN type = 'sortie' AND status = 'payee' THEN amount ELSE 0 END) as solde_caisse
        FROM financial_transactions
      `).get().solde_caisse || 0;

      // Prochains événements calendrier
      const upcomingEvents = db.prepare(`
        SELECT id, title, event_type, start_datetime, location
        FROM calendar_events
        WHERE date(start_datetime) >= date('now')
        ORDER BY start_datetime ASC
        LIMIT 5
      `).all();

      // Scores de santé récents des départements
      const deptScores = db.prepare(`
        SELECT d.id, d.name, d.code, d.color as dept_color,
          h.score, h.color as health_color, h.calculated_at
        FROM departments d
        LEFT JOIN department_health_history h ON d.id = h.department_id
        WHERE h.id = (SELECT max(id) FROM department_health_history WHERE department_id = d.id)
        ORDER BY d.id ASC
      `).all();

      return sendJSON(res, 200, {
        success: true,
        stats: {
          members: memberStats,
          newThisMonth,
          avgAttendanceRate,
          absentsToFollowUp,
          missingReportsCount: missingReports.length,
          missingReportsList: missingReports,
          finances: {
            soldeGlobal: globalBalance,
            entreesMois: currentMonthFinances.total_entrees || 0,
            sortiesMois: currentMonthFinances.total_sorties || 0,
            soldeMois: (currentMonthFinances.total_entrees || 0) - (currentMonthFinances.total_sorties || 0)
          },
          deptScores,
          recentServices,
          upcomingEvents
        }
      });
    }

    // -------------------------------------------------------------
    // 3. MODULE MEMBRES (CRUD, Recherche, Filtres, Export, Import)
    // -------------------------------------------------------------

    // GET /api/members
    if (pathname === '/api/members' && method === 'GET') {
      let sql = 'SELECT * FROM members WHERE 1=1';
      const params = [];

      if (query.search) {
        sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ? OR neighborhood LIKE ?)';
        const s = `%${query.search}%`;
        params.push(s, s, s, s, s);
      }
      if (query.status) {
        sql += ' AND status = ?';
        params.push(query.status);
      }
      if (query.role) {
        sql += ' AND church_role = ?';
        params.push(query.role);
      }
      if (query.department) {
        sql += ' AND department_ids LIKE ?';
        params.push(`%${query.department}%`);
      }
      if (query.neighborhood) {
        sql += ' AND neighborhood LIKE ?';
        params.push(`%${query.neighborhood}%`);
      }

      sql += ' ORDER BY last_name ASC, first_name ASC';

      // Pagination
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '50', 10);
      const offset = (page - 1) * limit;

      const countSql = sql.replace('SELECT *', 'SELECT count(*) as count');
      const totalCount = db.prepare(countSql).get(...params).count;

      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const members = db.prepare(sql).all(...params);

      // Si l'utilisateur connecté n'est pas Admin/Pasteur, masquer les notes pastorales
      const canViewPastoralNotes = currentUser && (currentUser.role === 'admin');
      const sanitizedMembers = members.map(m => {
        if (!canViewPastoralNotes) {
          const { pastoral_notes, ...rest } = m;
          return rest;
        }
        return m;
      });

      return sendJSON(res, 200, {
        success: true,
        data: sanitizedMembers,
        pagination: { page, limit, total: totalCount, totalPages: Math.ceil(totalCount / limit) }
      });
    }

    // GET /api/members/:id
    if (pathname.startsWith('/api/members/') && method === 'GET' && !pathname.includes('export')) {
      const id = parseInt(pathname.split('/')[3], 10);
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
      if (!member) return sendError(res, 404, 'Membre non trouvé');

      if (currentUser && currentUser.role !== 'admin') {
        delete member.pastoral_notes;
      }

      // Historique de présence de ce membre
      const attendances = db.prepare(`
        SELECT a.status, a.check_in_time, s.title as service_title, s.date as service_date, s.event_type
        FROM attendances a
        JOIN service_events s ON a.service_event_id = s.id
        WHERE a.member_id = ?
        ORDER BY s.date DESC LIMIT 10
      `).all(id);

      // Tâches pastorales liées
      const tasks = db.prepare(`
        SELECT * FROM pastoral_tasks WHERE member_id = ? ORDER BY created_at DESC
      `).all(id);

      return sendJSON(res, 200, { success: true, member, attendances, tasks });
    }

    // POST /api/members
    if (pathname === '/api/members' && method === 'POST') {
      if (!checkPermission(currentUser, ['admin', 'secretaire'])) {
        return sendError(res, 403, 'Permission refusée. Seul le Pasteur ou la Secrétaire peut créer un membre.');
      }

      const b = await parseBody(req);
      if (!b.first_name || !b.last_name) {
        return sendError(res, 400, 'Le nom et le prénom sont obligatoires');
      }

      // Générer le code membre unique
      const year = new Date().getFullYear();
      const count = db.prepare('SELECT count(*) as count FROM members').get().count + 1;
      const code = b.code || `MEM-${year}-${String(count).padStart(3, '0')}`;

      const stmt = db.prepare(`
        INSERT INTO members (
          code, first_name, last_name, gender, birth_date, birth_place, photo_url,
          phone, whatsapp, email, address, neighborhood, marital_status, profession,
          arrival_date, status, department_ids, church_role, baptism_status,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
          pastoral_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        code, b.first_name, b.last_name, b.gender || 'M', b.birth_date || null, b.birth_place || null, b.photo_url || null,
        b.phone || null, b.whatsapp || b.phone || null, b.email || null, b.address || null, b.neighborhood || null,
        b.marital_status || 'celibataire', b.profession || null, b.arrival_date || new Date().toISOString().split('T')[0],
        b.status || 'nouveau_membre', typeof b.department_ids === 'object' ? JSON.stringify(b.department_ids) : b.department_ids || '[]',
        b.church_role || 'membre', b.baptism_status || 'non_baptise', b.emergency_contact_name || null,
        b.emergency_contact_phone || null, b.emergency_contact_relation || null, b.pastoral_notes || null
      );

      const newId = result.lastInsertRowid;

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'CREATION_MEMBRE',
        entityType: 'members',
        entityId: Number(newId),
        details: { code, name: `${b.first_name} ${b.last_name}` },
        ip: clientIp
      });

      return sendJSON(res, 201, { success: true, id: Number(newId), code, message: 'Membre créé avec succès' });
    }

    // PUT /api/members/:id
    if (pathname.startsWith('/api/members/') && method === 'PUT') {
      if (!checkPermission(currentUser, ['admin', 'secretaire'])) {
        return sendError(res, 403, 'Permission refusée');
      }

      const id = parseInt(pathname.split('/')[3], 10);
      const b = await parseBody(req);

      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
      if (!member) return sendError(res, 404, 'Membre introuvable');

      const stmt = db.prepare(`
        UPDATE members SET
          first_name = ?, last_name = ?, gender = ?, birth_date = ?, birth_place = ?, photo_url = ?,
          phone = ?, whatsapp = ?, email = ?, address = ?, neighborhood = ?, marital_status = ?,
          profession = ?, arrival_date = ?, status = ?, department_ids = ?, church_role = ?,
          baptism_status = ?, emergency_contact_name = ?, emergency_contact_phone = ?,
          emergency_contact_relation = ?, pastoral_notes = COALESCE(?, pastoral_notes),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(
        b.first_name || member.first_name, b.last_name || member.last_name, b.gender || member.gender,
        b.birth_date !== undefined ? b.birth_date : member.birth_date,
        b.birth_place !== undefined ? b.birth_place : member.birth_place,
        b.photo_url !== undefined ? b.photo_url : member.photo_url,
        b.phone !== undefined ? b.phone : member.phone,
        b.whatsapp !== undefined ? b.whatsapp : member.whatsapp,
        b.email !== undefined ? b.email : member.email,
        b.address !== undefined ? b.address : member.address,
        b.neighborhood !== undefined ? b.neighborhood : member.neighborhood,
        b.marital_status || member.marital_status,
        b.profession !== undefined ? b.profession : member.profession,
        b.arrival_date || member.arrival_date,
        b.status || member.status,
        typeof b.department_ids === 'object' ? JSON.stringify(b.department_ids) : b.department_ids || member.department_ids,
        b.church_role || member.church_role,
        b.baptism_status || member.baptism_status,
        b.emergency_contact_name !== undefined ? b.emergency_contact_name : member.emergency_contact_name,
        b.emergency_contact_phone !== undefined ? b.emergency_contact_phone : member.emergency_contact_phone,
        b.emergency_contact_relation !== undefined ? b.emergency_contact_relation : member.emergency_contact_relation,
        b.pastoral_notes !== undefined ? b.pastoral_notes : member.pastoral_notes,
        id
      );

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'MODIFICATION_MEMBRE',
        entityType: 'members',
        entityId: id,
        details: { name: `${b.first_name || member.first_name} ${b.last_name || member.last_name}` },
        ip: clientIp
      });

      return sendJSON(res, 200, { success: true, message: 'Membre mis à jour' });
    }

    // DELETE /api/members/:id
    if (pathname.startsWith('/api/members/') && method === 'DELETE') {
      if (!checkPermission(currentUser, 'admin')) {
        return sendError(res, 403, 'Seul l\'administrateur principal peut supprimer un membre');
      }

      const id = parseInt(pathname.split('/')[3], 10);
      const member = db.prepare('SELECT first_name, last_name FROM members WHERE id = ?').get(id);
      if (!member) return sendError(res, 404, 'Membre non trouvé');

      db.prepare('DELETE FROM members WHERE id = ?').run(id);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'SUPPRESSION_MEMBRE',
        entityType: 'members',
        entityId: id,
        details: { name: `${member.first_name} ${member.last_name}` },
        ip: clientIp
      });

      return sendJSON(res, 200, { success: true, message: 'Membre supprimé avec succès' });
    }

    // GET /api/members/export/csv
    if (pathname === '/api/members/export/csv' && method === 'GET') {
      const members = db.prepare('SELECT code, first_name, last_name, gender, phone, email, neighborhood, status, church_role, baptism_status FROM members ORDER BY last_name ASC').all();
      
      // UTF-8 BOM pour compatibilité Excel
      let csv = '\uFEFFCode;Nom;Prénoms;Sexe;Téléphone;Email;Quartier;Statut;Responsabilité;Baptême\n';
      members.forEach(m => {
        csv += `"${m.code || ''}";"${m.last_name || ''}";"${m.first_name || ''}";"${m.gender || ''}";"${m.phone || ''}";"${m.email || ''}";"${m.neighborhood || ''}";"${m.status || ''}";"${m.church_role || ''}";"${m.baptism_status || ''}"\n`;
      });

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="membres_assemblee.csv"'
      });
      return res.end(csv);
    }

    // POST /api/members/import
    if (pathname === '/api/members/import' && method === 'POST') {
      if (!checkPermission(currentUser, ['admin', 'secretaire'])) {
        return sendError(res, 403, 'Permission refusée pour l\'import');
      }

      const { records } = await parseBody(req);
      if (!Array.isArray(records) || records.length === 0) {
        return sendError(res, 400, 'Aucune donnée à importer');
      }

      let imported = 0;
      let skipped = 0;

      const stmtCheck = db.prepare('SELECT id FROM members WHERE phone = ? OR (first_name = ? AND last_name = ?)');
      const stmtInsert = db.prepare(`
        INSERT INTO members (code, first_name, last_name, gender, phone, email, neighborhood, status, church_role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const year = new Date().getFullYear();
      let currentTotal = db.prepare('SELECT count(*) as count FROM members').get().count;

      for (const r of records) {
        if (!r.first_name || !r.last_name) {
          skipped++;
          continue;
        }

        const existing = r.phone ? stmtCheck.get(r.phone, r.first_name, r.last_name) : stmtCheck.get('', r.first_name, r.last_name);
        if (existing) {
          skipped++;
          continue;
        }

        currentTotal++;
        const code = `MEM-${year}-${String(currentTotal).padStart(3, '0')}`;
        stmtInsert.run(
          code, r.first_name, r.last_name, r.gender || 'M',
          r.phone || null, r.email || null, r.neighborhood || null,
          r.status || 'nouveau_membre', r.church_role || 'membre'
        );
        imported++;
      }

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'IMPORT_MEMBRES',
        entityType: 'members',
        entityId: null,
        details: { imported, skipped, total: records.length },
        ip: clientIp
      });

      return sendJSON(res, 200, { success: true, imported, skipped, message: `${imported} membres importés avec succès (${skipped} ignorés car déjà présents)` });
    }

    // -------------------------------------------------------------
    // 4. MODULE PRÉSENCES & NOTIFICATIONS
    // -------------------------------------------------------------

    // GET /api/services
    if (pathname === '/api/services' && method === 'GET') {
      const services = db.prepare(`
        SELECT s.*, 
          (SELECT count(*) FROM attendances a WHERE a.service_event_id = s.id AND a.status = 'present') as count_presents,
          (SELECT count(*) FROM attendances a WHERE a.service_event_id = s.id AND a.status = 'absent') as count_absents,
          (SELECT count(*) FROM attendances a WHERE a.service_event_id = s.id AND a.status = 'excuse') as count_excuses,
          (SELECT count(*) FROM attendances a WHERE a.service_event_id = s.id) as total_appel
        FROM service_events s
        ORDER BY s.date DESC, s.id DESC
      `).all();

      return sendJSON(res, 200, { success: true, data: services });
    }

    // GET /api/services/:id
    if (pathname.startsWith('/api/services/') && method === 'GET' && !pathname.endsWith('/notify-absents')) {
      const id = parseInt(pathname.split('/')[3], 10);
      const service = db.prepare('SELECT * FROM service_events WHERE id = ?').get(id);
      if (!service) return sendError(res, 404, 'Culte non trouvé');

      // Liste des membres avec leur statut d'appel pour ce culte
      const attendances = db.prepare(`
        SELECT m.id as member_id, m.code, m.first_name, m.last_name, m.phone, m.whatsapp,
               m.neighborhood, m.status as member_status, m.church_role,
               COALESCE(a.status, 'absent') as attendance_status,
               a.notes as attendance_notes,
               a.check_in_time
        FROM members m
        LEFT JOIN attendances a ON m.id = a.member_id AND a.service_event_id = ?
        WHERE m.status IN ('membre_actif', 'nouveau_membre', 'ancien')
        ORDER BY m.last_name ASC, m.first_name ASC
      `).all(id);

      return sendJSON(res, 200, { success: true, service, attendances });
    }

    // POST /api/services
    if (pathname === '/api/services' && method === 'POST') {
      if (!checkPermission(currentUser, ['admin', 'secretaire'])) {
        return sendError(res, 403, 'Permission refusée pour créer un culte');
      }

      const b = await parseBody(req);
      if (!b.title || !b.date) return sendError(res, 400, 'Titre et date requis');

      const stmt = db.prepare(`
        INSERT INTO service_events (title, event_type, department_id, date, start_time, end_time, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        b.title, b.event_type || 'culte_dimanche', b.department_id || null,
        b.date, b.start_time || '09:00', b.end_time || '11:30',
        b.location || 'Temple Principal', b.notes || null
      );

      const serviceId = Number(result.lastInsertRowid);

      // Initialiser automatiquement la feuille de présence avec tous les membres actifs
      const activeMembers = db.prepare("SELECT id FROM members WHERE status IN ('membre_actif', 'nouveau_membre', 'ancien')").all();
      const stmtAtt = db.prepare('INSERT OR IGNORE INTO attendances (service_event_id, member_id, status) VALUES (?, ?, "absent")');
      for (const m of activeMembers) {
        stmtAtt.run(serviceId, m.id);
      }

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'CREATION_CULTE',
        entityType: 'service_events',
        entityId: serviceId,
        details: { title: b.title, date: b.date },
        ip: clientIp
      });

      return sendJSON(res, 201, { success: true, id: serviceId, message: 'Culte créé avec feuille de présence' });
    }

    // POST /api/services/:id/attendance (Enregistrement en masse des présences)
    if (pathname.match(/^\/api\/services\/\d+\/attendance$/) && method === 'POST') {
      const id = parseInt(pathname.split('/')[3], 10);
      const { attendances } = await parseBody(req);

      if (!Array.isArray(attendances)) return sendError(res, 400, 'Format invalide');

      const stmt = db.prepare(`
        INSERT INTO attendances (service_event_id, member_id, status, notes)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(service_event_id, member_id) DO UPDATE SET
          status = excluded.status,
          notes = excluded.notes,
          check_in_time = CURRENT_TIMESTAMP
      `);

      for (const a of attendances) {
        stmt.run(id, a.member_id, a.status || 'present', a.notes || null);
      }

      return sendJSON(res, 200, { success: true, count: attendances.length, message: 'Présences enregistrées' });
    }

    // POST /api/services/:id/close (Clôture de l'appel et déclenchement des notifications/alertes)
    if (pathname.match(/^\/api\/services\/\d+\/close$/) && method === 'POST') {
      if (!checkPermission(currentUser, ['admin', 'secretaire'])) {
        return sendError(res, 403, 'Permission refusée pour clôturer l\'appel');
      }

      const id = parseInt(pathname.split('/')[3], 10);
      const service = db.prepare('SELECT * FROM service_events WHERE id = ?').get(id);
      if (!service) return sendError(res, 404, 'Culte introuvable');

      db.prepare(`
        UPDATE service_events 
        SET is_closed = 1, closed_at = CURRENT_TIMESTAMP, closed_by_user_id = ?
        WHERE id = ?
      `).run(currentUser?.id || null, id);

      // Récupérer les absents
      const absents = db.prepare(`
        SELECT m.id, m.first_name, m.last_name, m.phone, m.whatsapp, m.email
        FROM attendances a
        JOIN members m ON a.member_id = m.id
        WHERE a.service_event_id = ? AND a.status = 'absent'
      `).all(id);

      // Générer les notifications automatiques d'absence
      const churchName = db.prepare("SELECT value FROM settings WHERE key = 'church_name'").get()?.value || 'Assemblée de la Grâce';
      const templateRaw = db.prepare("SELECT value FROM settings WHERE key = 'template_absent'").get()?.value || 'Bonjour {prenom}, vous nous avez manqué au culte du {date}.';

      const stmtNotif = db.prepare(`
        INSERT INTO notifications_log (recipient_member_id, channel, recipient_address, template_key, message_content, status)
        VALUES (?, ?, ?, 'template_absent', ?, 'envoye')
      `);

      const notificationsSent = [];
      for (const abs of absents) {
        const msg = templateRaw
          .replace('{prenom}', abs.first_name)
          .replace('{nom}', abs.last_name)
          .replace('{date}', service.date)
          .replace('{culte}', service.title)
          .replace('{eglise}', churchName);

        const recipientAddr = abs.whatsapp || abs.phone || abs.email || '';
        stmtNotif.run(abs.id, 'whatsapp', recipientAddr, msg);

        // Lien direct WhatsApp pour contact en 1 clic
        const cleanPhone = (abs.whatsapp || abs.phone || '').replace(/[^0-9]/g, '');
        const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}` : null;

        notificationsSent.push({
          memberId: abs.id,
          name: `${abs.first_name} ${abs.last_name}`,
          phone: abs.phone,
          waLink,
          message: msg
        });
      }

      // Exécuter la vérification des 3 absences consécutives
      const cronResults = runAllCronTasks(db);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'CLOTURE_CULTE',
        entityType: 'service_events',
        entityId: id,
        details: { serviceTitle: service.title, absentsCount: absents.length },
        ip: clientIp
      });

      return sendJSON(res, 200, {
        success: true,
        message: `Appel clôturé avec succès. ${absents.length} absents notifiés.`,
        absentsCount: absents.length,
        notificationsSent,
        cronAlerts: cronResults.absences
      });
    }

    // -------------------------------------------------------------
    // 5. MODULE FINANCES (Entrées, Sorties, Budgets, Reçus, Clôtures)
    // -------------------------------------------------------------

    // GET /api/finances/summary
    if (pathname === '/api/finances/summary' && method === 'GET') {
      if (!checkPermission(currentUser, ['admin', 'tresorier'])) {
        return sendError(res, 403, 'Accès réservé au Trésorier et au Pasteur');
      }

      // Solde de caisse total
      const soldeTotal = db.prepare(`
        SELECT 
          COALESCE(sum(CASE WHEN type = 'entree' AND status = 'payee' THEN amount ELSE 0 END), 0) -
          COALESCE(sum(CASE WHEN type = 'sortie' AND status = 'payee' THEN amount ELSE 0 END), 0) as solde
        FROM financial_transactions
      `).get().solde;

      // Entrées / Sorties par mois (6 derniers mois)
      const monthlyStats = db.prepare(`
        SELECT 
          strftime('%Y-%m', date) as month,
          sum(CASE WHEN type = 'entree' AND status = 'payee' THEN amount ELSE 0 END) as total_entrees,
          sum(CASE WHEN type = 'sortie' AND status = 'payee' THEN amount ELSE 0 END) as total_sorties
        FROM financial_transactions
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
      `).all().reverse();

      // Répartition des entrées par catégorie
      const inByCategory = db.prepare(`
        SELECT category_name, sum(amount) as total
        FROM financial_transactions
        WHERE type = 'entree' AND status = 'payee'
        GROUP BY category_name
        ORDER BY total DESC
      `).all();

      // Répartition des dépenses par catégorie
      const outByCategory = db.prepare(`
        SELECT category_name, sum(amount) as total
        FROM financial_transactions
        WHERE type = 'sortie' AND status = 'payee'
        GROUP BY category_name
        ORDER BY total DESC
      `).all();

      // Dépenses en attente d'approbation
      const pendingExpenses = db.prepare(`
        SELECT count(*) as count, COALESCE(sum(amount), 0) as total_amount
        FROM financial_transactions
        WHERE type = 'sortie' AND status = 'demandee'
      `).get();

      return sendJSON(res, 200, {
        success: true,
        summary: {
          soldeTotal,
          monthlyStats,
          inByCategory,
          outByCategory,
          pendingExpenses
        }
      });
    }

    // GET /api/finances/transactions
    if (pathname === '/api/finances/transactions' && method === 'GET') {
      if (!checkPermission(currentUser, ['admin', 'tresorier'])) {
        return sendError(res, 403, 'Accès réservé au Trésorier');
      }

      let sql = 'SELECT * FROM financial_transactions WHERE 1=1';
      const params = [];

      if (query.type) {
        sql += ' AND type = ?';
        params.push(query.type);
      }
      if (query.status) {
        sql += ' AND status = ?';
        params.push(query.status);
      }
      if (query.category_id) {
        sql += ' AND category_id = ?';
        params.push(query.category_id);
      }
      if (query.month) {
        sql += ' AND strftime("%Y-%m", date) = ?';
        params.push(query.month);
      }

      sql += ' ORDER BY date DESC, id DESC';

      const transactions = db.prepare(sql).all(...params);
      return sendJSON(res, 200, { success: true, data: transactions });
    }

    // POST /api/finances/transactions
    if (pathname === '/api/finances/transactions' && method === 'POST') {
      if (!checkPermission(currentUser, ['admin', 'tresorier'])) {
        return sendError(res, 403, 'Accès réservé au Trésorier');
      }

      const b = await parseBody(req);
      if (!b.type || !b.category_id || !b.amount || !b.date) {
        return sendError(res, 400, 'Champs obligatoires manquants (type, category_id, amount, date)');
      }

      const cat = db.prepare('SELECT name FROM financial_categories WHERE id = ?').get(b.category_id);
      const catName = cat ? cat.name : (b.category_name || 'Divers');

      const year = new Date().getFullYear();
      const count = db.prepare('SELECT count(*) as count FROM financial_transactions').get().count + 1;
      const prefix = b.type === 'entree' ? 'REC' : 'DEP';
      const num = `${prefix}-${year}-${String(count).padStart(4, '0')}`;

      // Statut initial : payée pour une entrée ou payée direct si admin/trésorier, demandée si soumise
      const initialStatus = b.status || (b.type === 'entree' ? 'payee' : 'payee');

      const stmt = db.prepare(`
        INSERT INTO financial_transactions (
          transaction_number, type, category_id, category_name, amount, currency,
          payment_method, payment_reference, donor_member_id, donor_name, is_anonymous,
          service_event_id, project_id, beneficiary, receipt_proof_url, status,
          requested_by_user_id, validated_by_user_id, validated_at, date, notes
        ) VALUES (?, ?, ?, ?, ?, 'XOF', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        num, b.type, b.category_id, catName, parseFloat(b.amount),
        b.payment_method || 'especes', b.payment_reference || null,
        b.donor_member_id || null, b.donor_name || null, b.is_anonymous ? 1 : 0,
        b.service_event_id || null, b.project_id || null, b.beneficiary || null,
        b.receipt_proof_url || null, initialStatus,
        currentUser?.id || null, initialStatus === 'payee' ? currentUser?.id : null,
        initialStatus === 'payee' ? new Date().toISOString() : null,
        b.date, b.notes || null
      );

      const newId = Number(result.lastInsertRowid);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: b.type === 'entree' ? 'SAISIE_RECETTE' : 'SAISIE_DEPENSE',
        entityType: 'financial_transactions',
        entityId: newId,
        details: { number: num, amount: b.amount, category: catName, type: b.type },
        ip: clientIp
      });

      return sendJSON(res, 201, { success: true, id: newId, transactionNumber: num, message: 'Transaction enregistrée' });
    }

    // PUT /api/finances/transactions/:id/status (Validation de dépenses)
    if (pathname.match(/^\/api\/finances\/transactions\/\d+\/status$/) && method === 'PUT') {
      if (!checkPermission(currentUser, ['admin', 'tresorier'])) {
        return sendError(res, 403, 'Permission refusée');
      }

      const id = parseInt(pathname.split('/')[4], 10);
      const { status } = await parseBody(req);
      if (!['demandee', 'approuvee', 'payee', 'rejetee'].includes(status)) {
        return sendError(res, 400, 'Statut invalide');
      }

      db.prepare(`
        UPDATE financial_transactions 
        SET status = ?, validated_by_user_id = ?, validated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, currentUser?.id || null, id);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'CHANGEMENT_STATUT_DEPENSE',
        entityType: 'financial_transactions',
        entityId: id,
        details: { newStatus: status },
        ip: clientIp
      });

      return sendJSON(res, 200, { success: true, message: `Statut mis à jour vers: ${status}` });
    }

    // GET /api/finances/budgets (Suivi de budget avec alerte dépassement)
    if (pathname === '/api/finances/budgets' && method === 'GET') {
      const year = parseInt(query.year || String(new Date().getFullYear()), 10);
      
      const budgets = db.prepare(`
        SELECT b.*, c.name as category_name, c.type as category_type,
          (
            SELECT COALESCE(sum(amount), 0)
            FROM financial_transactions t
            WHERE t.category_id = b.category_id 
              AND strftime('%Y', t.date) = CAST(b.year AS TEXT)
              AND t.status = 'payee'
          ) as consumed_amount
        FROM financial_budgets b
        JOIN financial_categories c ON b.category_id = c.id
        WHERE b.year = ?
      `).all(year);

      const analyzedBudgets = budgets.map(b => {
        const percent = b.allocated_amount > 0 ? Math.round((b.consumed_amount / b.allocated_amount) * 100) : 0;
        let alertStatus = 'normal';
        if (percent >= 100) alertStatus = 'depassement_critique'; // Rouge
        else if (percent >= 80) alertStatus = 'alerte_seuil'; // Orange
        return { ...b, percentConsumed: percent, alertStatus };
      });

      return sendJSON(res, 200, { success: true, year, budgets: analyzedBudgets });
    }

    // GET /api/finances/receipt/:id (Reçu officiel de don avec impression)
    if (pathname.startsWith('/api/finances/receipt/') && method === 'GET') {
      const id = parseInt(pathname.split('/')[4], 10);
      const trx = db.prepare(`
        SELECT t.*, m.first_name, m.last_name, m.address, m.phone, m.code as member_code
        FROM financial_transactions t
        LEFT JOIN members m ON t.donor_member_id = m.id
        WHERE t.id = ? AND t.type = 'entree'
      `).get(id);

      if (!trx) return sendError(res, 404, 'Reçu non trouvé');

      const settings = db.prepare('SELECT key, value FROM settings').all();
      const settingsMap = {};
      settings.forEach(s => settingsMap[s.key] = s.value);

      return sendJSON(res, 200, {
        success: true,
        receipt: trx,
        church: {
          name: settingsMap.church_name || 'Mission Apostolique de Pentecôte (MAP) - Temple Ébénézer',
          address: settingsMap.church_address || 'Temple Ébénézer, Abidjan, Côte d\'Ivoire',
          phone: settingsMap.church_phone || '+225 07 00 11 22 33',
          email: settingsMap.church_email || 'contact@map-ebenezer.org'
        }
      });
    }

    // POST /api/finances/closures (Clôture de période verrouillée)
    if (pathname === '/api/finances/closures' && method === 'POST') {
      if (!checkPermission(currentUser, ['admin', 'tresorier'])) {
        return sendError(res, 403, 'Permission refusée pour clôturer une période');
      }

      const { period_label, notes } = await parseBody(req);
      if (!period_label) return sendError(res, 400, 'Label de période requis (ex. 2026-10)');

      // Calculer totaux
      const totals = db.prepare(`
        SELECT 
          COALESCE(sum(CASE WHEN type = 'entree' AND status = 'payee' THEN amount ELSE 0 END), 0) as total_in,
          COALESCE(sum(CASE WHEN type = 'sortie' AND status = 'payee' THEN amount ELSE 0 END), 0) as total_out
        FROM financial_transactions
        WHERE strftime('%Y-%m', date) = ?
      `).get(period_label);

      const net = totals.total_in - totals.total_out;

      // Verrouiller les écritures
      db.prepare(`
        UPDATE financial_transactions 
        SET is_locked = 1 
        WHERE strftime('%Y-%m', date) = ?
      `).run(period_label);

      db.prepare(`
        INSERT INTO financial_closures (period_type, period_label, closed_by_user_id, total_in, total_out, net_balance, notes)
        VALUES ('mensuel', ?, ?, ?, ?, ?, ?)
      `).run(period_label, currentUser?.id || null, totals.total_in, totals.total_out, net, notes || null);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'CLOTURE_FINANCIERE_VERROUILLEE',
        entityType: 'financial_closures',
        entityId: null,
        details: { period: period_label, netBalance: net },
        ip: clientIp
      });

      return sendJSON(res, 201, { success: true, message: `Période ${period_label} clôturée et verrouillée.` });
    }

    // -------------------------------------------------------------
    // 6. MODULE DÉPARTEMENTS & HEALTH SCORE
    // -------------------------------------------------------------

    // GET /api/departments
    if (pathname === '/api/departments' && method === 'GET') {
      const depts = db.prepare(`
        SELECT d.*,
          (
            SELECT count(*) 
            FROM members m 
            WHERE m.department_ids LIKE '%' || d.id || '%'
          ) as member_count,
          (
            SELECT count(*) 
            FROM department_reports r 
            WHERE r.department_id = d.id
          ) as report_count,
          (
            SELECT max(date) 
            FROM department_reports r 
            WHERE r.department_id = d.id
          ) as last_report_date,
          h.score as health_score,
          h.color as health_color,
          h.details_json as health_details
        FROM departments d
        LEFT JOIN department_health_history h ON d.id = h.department_id 
          AND h.id = (SELECT max(id) FROM department_health_history WHERE department_id = d.id)
        ORDER BY d.id ASC
      `).all();

      // Vérifier les alertes de 3 semaines de retard pour chaque département
      const warningWeeks = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'report_warning_weeks'").get()?.value || '3', 10);
      const warningDays = warningWeeks * 7;

      const enriched = depts.map(d => {
        let isLate = false;
        const neverReported = !d.last_report_date;
        const refDate = d.last_report_date || (d.created_at ? d.created_at.substring(0, 10) : null);
        let daysSince = 0;
        if (refDate) {
          daysSince = Math.max(0, Math.floor((Date.now() - new Date(refDate).getTime()) / 86400000));
        }
        if (daysSince > warningDays) isLate = true;
        return { ...d, isLate, daysSince, neverReported, warningDays };
      });

      return sendJSON(res, 200, { success: true, data: enriched });
    }

    // POST /api/departments/:id/reports (Soumettre un rapport)
    if (pathname.match(/^\/api\/departments\/\d+\/reports$/) && method === 'POST') {
      const deptId = parseInt(pathname.split('/')[3], 10);
      const b = await parseBody(req);

      if (!b.date || !b.activities_done) {
        return sendError(res, 400, 'Date et activités réalisées requises');
      }

      const stmt = db.prepare(`
        INSERT INTO department_reports (department_id, submitted_by_user_id, date, attendees_count, activities_done, difficulties, needs, testimonies, general_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        deptId, currentUser?.id || null, b.date, parseInt(b.attendees_count || '0', 10),
        b.activities_done, b.difficulties || null, b.needs || null,
        b.testimonies || null, b.general_notes || null
      );

      // Recalculer immédiatement les scores de santé
      runAllCronTasks(db);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'DEPOT_RAPPORT_DEPARTEMENT',
        entityType: 'department_reports',
        entityId: Number(result.lastInsertRowid),
        details: { departmentId: deptId, date: b.date },
        ip: clientIp
      });

      return sendJSON(res, 201, { success: true, message: 'Rapport soumis et score de santé actualisé' });
    }

    // GET /api/departments/:id/reports
    if (pathname.match(/^\/api\/departments\/\d+\/reports$/) && method === 'GET') {
      const deptId = parseInt(pathname.split('/')[3], 10);
      const reports = db.prepare(`
        SELECT r.*, u.full_name as submitter_name
        FROM department_reports r
        LEFT JOIN users u ON r.submitted_by_user_id = u.id
        WHERE r.department_id = ?
        ORDER BY r.date DESC
      `).all(deptId);

      return sendJSON(res, 200, { success: true, data: reports });
    }

    // -------------------------------------------------------------
    // 7. MODULE PROJETS & CALENDRIER
    // -------------------------------------------------------------

    // GET /api/projects
    if (pathname === '/api/projects' && method === 'GET') {
      const projects = db.prepare(`
        SELECT p.*, d.name as department_name, m.first_name || ' ' || m.last_name as leader_name,
          (SELECT count(*) FROM project_tasks t WHERE t.project_id = p.id) as total_tasks,
          (SELECT count(*) FROM project_tasks t WHERE t.project_id = p.id AND t.is_completed = 1) as completed_tasks
        FROM projects p
        LEFT JOIN departments d ON p.department_id = d.id
        LEFT JOIN members m ON p.leader_id = m.id
        ORDER BY p.id DESC
      `).all();

      return sendJSON(res, 200, { success: true, data: projects });
    }

    // POST /api/projects
    if (pathname === '/api/projects' && method === 'POST') {
      const b = await parseBody(req);
      if (!b.title) return sendError(res, 400, 'Titre requis');

      const stmt = db.prepare(`
        INSERT INTO projects (title, description, department_id, leader_id, start_date, end_date, location, estimated_budget, status, participants_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        b.title, b.description || null, b.department_id || null, b.leader_id || null,
        b.start_date || null, b.end_date || null, b.location || null,
        parseFloat(b.estimated_budget || '0'), b.status || 'planifie',
        parseInt(b.participants_count || '0', 10)
      );

      return sendJSON(res, 201, { success: true, id: Number(result.lastInsertRowid), message: 'Projet créé' });
    }

    // GET /api/calendar
    if (pathname === '/api/calendar' && method === 'GET') {
      const events = db.prepare(`
        SELECT c.*, d.name as department_name, d.color as dept_color
        FROM calendar_events c
        LEFT JOIN departments d ON c.department_id = d.id
        ORDER BY c.start_datetime ASC
      `).all();

      return sendJSON(res, 200, { success: true, data: events });
    }

    // POST /api/calendar
    if (pathname === '/api/calendar' && method === 'POST') {
      const b = await parseBody(req);
      if (!b.title || !b.start_datetime) return sendError(res, 400, 'Titre et date de début requis');

      const stmt = db.prepare(`
        INSERT INTO calendar_events (title, description, event_type, department_id, project_id, start_datetime, end_datetime, location, reminder_before_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        b.title, b.description || null, b.event_type || 'culte',
        b.department_id || null, b.project_id || null, b.start_datetime,
        b.end_datetime || null, b.location || 'Temple Principal',
        parseInt(b.reminder_before_hours || '24', 10)
      );

      return sendJSON(res, 201, { success: true, id: Number(result.lastInsertRowid), message: 'Événement ajouté au calendrier' });
    }

    // -------------------------------------------------------------
    // 8. MODULE BAPTISÉS (Candidats, Registre, Certificat PDF)
    // -------------------------------------------------------------

    // GET /api/baptisms/candidates
    if (pathname === '/api/baptisms/candidates' && method === 'GET') {
      const candidates = db.prepare(`
        SELECT c.*, m.code as member_code, m.first_name, m.last_name, m.phone, m.neighborhood, m.birth_date
        FROM baptism_candidates c
        JOIN members m ON c.member_id = m.id
        ORDER BY c.created_at DESC
      `).all();

      return sendJSON(res, 200, { success: true, data: candidates });
    }

    // POST /api/baptisms/candidates
    if (pathname === '/api/baptisms/candidates' && method === 'POST') {
      const b = await parseBody(req);
      if (!b.member_id) return sendError(res, 400, 'Membre requis');

      const stmt = db.prepare(`
        INSERT INTO baptism_candidates (member_id, preparation_class_name, preparation_status, attendance_sessions_count, total_sessions, mentor_name, scheduled_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        b.member_id, b.preparation_class_name || 'Classe des Fondements de la Foi',
        b.preparation_status || 'en_cours', parseInt(b.attendance_sessions_count || '0', 10),
        parseInt(b.total_sessions || '8', 10), b.mentor_name || null,
        b.scheduled_date || null, b.notes || null
      );

      // Mettre à jour le statut du membre
      db.prepare("UPDATE members SET baptism_status = 'candidat' WHERE id = ?").run(b.member_id);

      return sendJSON(res, 201, { success: true, id: Number(result.lastInsertRowid), message: 'Candidat inscrit' });
    }

    // GET /api/baptisms/registry
    if (pathname === '/api/baptisms/registry' && method === 'GET') {
      const records = db.prepare(`
        SELECT r.*, m.first_name, m.last_name, m.gender, m.birth_date, m.birth_place, m.phone, m.code as member_code
        FROM baptism_records r
        JOIN members m ON r.member_id = m.id
        ORDER BY r.baptism_date DESC
      `).all();

      return sendJSON(res, 200, { success: true, data: records });
    }

    // POST /api/baptisms/registry (Enregistrement officiel d'un baptême)
    if (pathname === '/api/baptisms/registry' && method === 'POST') {
      if (!checkPermission(currentUser, ['admin', 'secretaire'])) {
        return sendError(res, 403, 'Permission refusée');
      }

      const b = await parseBody(req);
      if (!b.member_id || !b.baptism_date || !b.officiant_name) {
        return sendError(res, 400, 'Champs obligatoires manquants');
      }

      const year = new Date(b.baptism_date).getFullYear();
      const count = db.prepare('SELECT count(*) as count FROM baptism_records').get().count + 1;
      const certNum = b.certificate_number || `BAPT-${year}-${String(count).padStart(3, '0')}`;

      const stmt = db.prepare(`
        INSERT INTO baptism_records (certificate_number, member_id, baptism_date, baptism_place, officiant_name, baptism_type, witnesses, photo_url, bible_verse)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        certNum, b.member_id, b.baptism_date, b.baptism_place || 'Baptistère du Sanctuaire',
        b.officiant_name, b.baptism_type || 'eau_immersion', b.witnesses || null,
        b.photo_url || null, b.bible_verse || '« Nous avons donc été ensevelis avec lui par le baptême en sa mort... » — Romains 6:4'
      );

      // Mettre à jour le membre en 'baptise_eau'
      db.prepare("UPDATE members SET baptism_status = 'baptise_eau' WHERE id = ?").run(b.member_id);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'ENREGISTREMENT_BAPTEME',
        entityType: 'baptism_records',
        entityId: Number(result.lastInsertRowid),
        details: { certNumber: certNum, memberId: b.member_id },
        ip: clientIp
      });

      return sendJSON(res, 201, { success: true, certificateNumber: certNum, message: 'Baptême enregistré avec succès' });
    }

    // GET /api/baptisms/certificate/:id (Génération du certificat de baptême prêt à imprimer)
    if (pathname.startsWith('/api/baptisms/certificate/') && method === 'GET') {
      const id = parseInt(pathname.split('/')[4], 10);
      const record = db.prepare(`
        SELECT r.*, m.first_name, m.last_name, m.gender, m.birth_date, m.birth_place
        FROM baptism_records r
        JOIN members m ON r.member_id = m.id
        WHERE r.id = ?
      `).get(id);

      if (!record) return sendError(res, 404, 'Enregistrement de baptême introuvable');

      const church = db.prepare("SELECT value FROM settings WHERE key = 'church_name'").get()?.value || 'Mission Apostolique de Pentecôte (MAP) - Temple Ébénézer';

      return sendJSON(res, 200, {
        success: true,
        certificate: record,
        churchName: church
      });
    }

    // -------------------------------------------------------------
    // 9. MODULE SUIVI PASTORAL & RELANCES
    // -------------------------------------------------------------

    // GET /api/pastoral/tasks
    if (pathname === '/api/pastoral/tasks' && method === 'GET') {
      const tasks = db.prepare(`
        SELECT t.*, m.first_name, m.last_name, m.phone, m.whatsapp, m.neighborhood,
               u.full_name as assigned_to_name
        FROM pastoral_tasks t
        JOIN members m ON t.member_id = m.id
        LEFT JOIN users u ON t.assigned_to_user_id = u.id
        ORDER BY t.status ASC, t.due_date ASC
      `).all();

      return sendJSON(res, 200, { success: true, data: tasks });
    }

    // PUT /api/pastoral/tasks/:id (Mise à jour statut / résolution de tâche)
    if (pathname.match(/^\/api\/pastoral\/tasks\/\d+$/) && method === 'PUT') {
      const id = parseInt(pathname.split('/')[4], 10);
      const { status, resolution_notes } = await parseBody(req);

      db.prepare(`
        UPDATE pastoral_tasks 
        SET status = ?, resolution_notes = COALESCE(?, resolution_notes),
            completed_at = CASE WHEN ? = 'termine' THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE id = ?
      `).run(status, resolution_notes || null, status, id);

      return sendJSON(res, 200, { success: true, message: 'Tâche pastorale mise à jour' });
    }

    // GET /api/notifications
    if (pathname === '/api/notifications' && method === 'GET') {
      const notifs = db.prepare(`
        SELECT n.*, m.first_name, m.last_name, m.phone as member_phone
        FROM notifications_log n
        LEFT JOIN members m ON n.recipient_member_id = m.id
        ORDER BY n.sent_at DESC
        LIMIT 100
      `).all();

      return sendJSON(res, 200, { success: true, data: notifs });
    }

    // -------------------------------------------------------------
    // 10. PARAMÈTRES, AUDIT, CRON & SAUVEGARDE
    // -------------------------------------------------------------

    // GET /api/settings
    if (pathname === '/api/settings' && method === 'GET') {
      const settings = db.prepare('SELECT key, value, description FROM settings').all();
      const map = {};
      settings.forEach(s => map[s.key] = s.value);
      return sendJSON(res, 200, { success: true, settings: map, raw: settings });
    }

    // PUT /api/settings
    if (pathname === '/api/settings' && method === 'PUT') {
      if (!checkPermission(currentUser, 'admin')) {
        return sendError(res, 403, 'Seul le Pasteur Administrateur peut modifier les paramètres');
      }

      const body = await parseBody(req);
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

      for (const [key, value] of Object.entries(body)) {
        stmt.run(key, String(value));
      }

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'MODIFICATION_PARAMETRES',
        entityType: 'settings',
        entityId: null,
        details: body,
        ip: clientIp
      });

      return sendJSON(res, 200, { success: true, message: 'Paramètres enregistrés avec succès' });
    }

    // POST /api/cron/run (Déclenchement manuel des calculs et alertes)
    if (pathname === '/api/cron/run' && method === 'POST') {
      const results = runAllCronTasks(db);

      logAudit(db, {
        userId: currentUser?.id,
        userName: currentUser?.fullName,
        userRole: currentUser?.role,
        action: 'EXECUTION_CRON_MANUEL',
        entityType: 'cron',
        entityId: null,
        details: results,
        ip: clientIp
      });

      return sendJSON(res, 200, { success: true, results, message: 'Tâches planifiées et calculs exécutés avec succès' });
    }

    // GET /api/audit-logs
    if (pathname === '/api/audit-logs' && method === 'GET') {
      if (!checkPermission(currentUser, 'admin')) {
        return sendError(res, 403, 'Journal d\'audit réservé à l\'administrateur');
      }

      const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all();
      return sendJSON(res, 200, { success: true, data: logs });
    }

    // GET /api/backup (Téléchargement de la base de données SQLite)
    if (pathname === '/api/backup' && method === 'GET') {
      if (!checkPermission(currentUser, 'admin')) {
        return sendError(res, 403, 'Sauvegarde réservée à l\'administrateur');
      }

      if (!fs.existsSync(DB_PATH)) {
        return sendError(res, 404, 'Fichier de base de données non trouvé');
      }

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="assemblee_backup.db"'
      });
      return fs.createReadStream(DB_PATH).pipe(res);
    }

    // Route API inconnue
    return sendError(res, 404, `Endpoint API non trouvé: ${pathname}`);

  } catch (err) {
    console.error('Server internal error on', pathname, err);
    return sendError(res, 500, 'Erreur interne du serveur', err.message);
  }
});

// Lancer le serveur
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`  EcclesiaManager - Serveur démarré avec succès !`);
  console.log(`  URL locale    : http://localhost:${PORT}`);
  console.log(`  Environnement : Node.js ${process.version}`);
  console.log(`  Base SQLite   : ${DB_PATH}`);
  console.log(`=======================================================`);
});
