/**
 * EcclesiaManager - Moteur de Tâches Planifiées (Cron) & Alertes Pastorales
 * Automatise :
 * 1. La détection des 3 absences consécutives (alerte + tâche pastorale)
 * 2. Le suivi hebdomadaire des nouveaux membres (2 rappels/semaine)
 * 3. La détection des départements sans rapport depuis 3 semaines
 * 4. Le calcul automatique et pondéré des scores de santé des départements (0-100)
 */

function getAssignee(db, roles) {
  const ph = roles.map(() => '?').join(',');
  const row = db.prepare(`SELECT id FROM users WHERE is_active = 1 AND role IN (${ph}) ORDER BY CASE role WHEN ? THEN 0 ELSE 1 END, id LIMIT 1`).get(...roles, roles[0]);
  return row ? row.id : null;
}

function getSettingsMap(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

/**
 * 1. Vérifie les absences consécutives (seuil configurable, ex. 3)
 */
function checkConsecutiveAbsences(db) {
  const settings = getSettingsMap(db);
  const threshold = parseInt(settings.absence_threshold || '3', 10);

  // Récupérer les N derniers cultes dominicaux ou généraux clôturés
  const lastServices = db.prepare(`
    SELECT id, title, date 
    FROM service_events 
    WHERE is_closed = 1 
    ORDER BY date DESC, id DESC 
    LIMIT ?
  `).all(threshold);

  if (lastServices.length < threshold) {
    return { checked: false, reason: 'Pas assez de cultes clôturés pour évaluer le seuil' };
  }

  const serviceIds = lastServices.map(s => s.id);
  const placeholders = serviceIds.map(() => '?').join(',');

  // Récupérer tous les membres actifs ou anciens
  const members = db.prepare(`
    SELECT id, first_name, last_name, phone, whatsapp, email, status, church_role
    FROM members
    WHERE status IN ('membre_actif', 'ancien', 'nouveau_membre')
  `).all();

  const alertsCreated = [];

  for (const member of members) {
    // Vérifier les statuts de présence pour ces N cultes
    const atts = db.prepare(`
      SELECT service_event_id, status 
      FROM attendances 
      WHERE member_id = ? AND service_event_id IN (${placeholders})
    `).all(member.id, ...serviceIds);

    // Si le membre a une entrée pour chaque culte et que le statut est 'absent' à chacun d'eux
    const allAbsent = serviceIds.every(sId => {
      const found = atts.find(a => a.service_event_id === sId);
      return found && found.status === 'absent';
    });

    if (allAbsent) {
      // Vérifier si une tâche pastorale active existe déjà pour ce membre
      const existingTask = db.prepare(`
        SELECT id FROM pastoral_tasks 
        WHERE member_id = ? AND task_type = 'visite_absent_3_fois' AND status IN ('a_faire', 'en_cours')
      `).get(member.id);

      if (!existingTask) {
        // Créer la tâche de visite pastorale
        const title = `Visite pastorale urgente : ${member.first_name} ${member.last_name} (${threshold} absences consécutives)`;
        const desc = `Le membre a manqué les cultes du ${lastServices.map(s => s.date).join(', ')}. Alerte envoyée au collège pastoral pour visite ou appel d'encouragement.`;
        
        // Assigner au pasteur principal (user_id 1) ou responsable de suivi
        db.prepare(`
          INSERT INTO pastoral_tasks (member_id, assigned_to_user_id, task_type, title, description, due_date, status)
          VALUES (?, ?, 'visite_absent_3_fois', ?, ?, date('now', '+3 days'), 'a_faire')
        `).run(member.id, getAssignee(db, ['admin']), title, desc);

        // Enregistrer une notification
        let template = settings.template_three_absences || 'Alerte 3 absences : {nom} {prenom} ({telephone})';
        template = template
          .replace('{nom}', member.last_name)
          .replace('{prenom}', member.first_name)
          .replace('{telephone}', member.phone || 'Non renseigné')
          .replace('{eglise}', settings.church_name || 'L\'église');

        db.prepare(`
          INSERT INTO notifications_log (recipient_member_id, channel, recipient_address, template_key, message_content, status)
          VALUES (?, 'whatsapp', ?, 'template_three_absences', ?, 'envoye')
        `).run(member.id, member.whatsapp || member.phone || '', template);

        alertsCreated.push({ memberId: member.id, name: `${member.first_name} ${member.last_name}` });
      }
    }
  }

  return { checked: true, alertsCreated };
}

/**
 * 2. Suivi des nouveaux membres (2 rappels/semaine pendant la durée paramétrée)
 */
function checkNewMemberFollowUps(db) {
  const settings = getSettingsMap(db);
  const durationDays = parseInt(settings.new_member_duration_days || '90', 10);
  const remindersPerWeek = parseInt(settings.new_member_reminders_per_week || '2', 10);

  // Trouver tous les membres enregistrés depuis moins de durationDays ou avec le statut 'nouveau_membre'
  const newMembers = db.prepare(`
    SELECT id, first_name, last_name, phone, whatsapp, email, arrival_date, created_at
    FROM members
    WHERE status = 'nouveau_membre' 
       OR (arrival_date IS NOT NULL AND julianday('now') - julianday(arrival_date) <= ?)
  `).all(durationDays);

  const tasksCreated = [];

  for (const m of newMembers) {
    // Vérifier les tâches de relance créées au cours des 7 derniers jours pour ce membre
    const recentTasks = db.prepare(`
      SELECT count(*) as count 
      FROM pastoral_tasks 
      WHERE member_id = ? 
        AND task_type = 'relance_nouveau_membre' 
        AND julianday('now') - julianday(created_at) <= 7
    `).get(m.id);

    if (recentTasks.count < remindersPerWeek) {
      const title = `Relance nouveau membre : ${m.first_name} ${m.last_name} (Suivi régulier)`;
      const desc = `Prendre des nouvelles fraternelles par appel ou WhatsApp. Recueillir des requêtes de prière et vérifier l'intégration dans un groupe d'impact.`;

      db.prepare(`
        INSERT INTO pastoral_tasks (member_id, assigned_to_user_id, task_type, title, description, due_date, status)
        VALUES (?, ?, 'relance_nouveau_membre', ?, ?, date('now', '+2 days'), 'a_faire')
      `).run(m.id, getAssignee(db, ['secretaire', 'admin']), title, desc);

      tasksCreated.push({ memberId: m.id, name: `${m.first_name} ${m.last_name}` });
    }
  }

  return { checked: true, tasksCreated };
}

/**
 * 3. Vérification des rapports de départements (> 3 semaines sans rapport)
 */
function checkMissingDepartmentReports(db) {
  const settings = getSettingsMap(db);
  const warningWeeks = parseInt(settings.report_warning_weeks || '3', 10);
  const warningDays = warningWeeks * 7;

  const departments = db.prepare('SELECT id, name, code FROM departments').all();
  const alerts = [];

  for (const dept of departments) {
    // Récupérer le dernier rapport
    const lastReport = db.prepare(`
      SELECT id, date, submitted_at, julianday('now') - julianday(date) as days_since
      FROM department_reports
      WHERE department_id = ?
      ORDER BY date DESC
      LIMIT 1
    `).get(dept.id);

    // Sans rapport : on compte depuis la création du département
    let daysSince;
    if (lastReport) {
      daysSince = Math.round(lastReport.days_since);
    } else {
      const created = db.prepare("SELECT julianday('now') - julianday(date(created_at)) as d FROM departments WHERE id = ?").get(dept.id);
      daysSince = Math.max(0, Math.round(created ? created.d : 0));
    }
    const isMissing = daysSince > warningDays;

    if (isMissing) {
      alerts.push({
        departmentId: dept.id,
        departmentName: dept.name,
        daysSince,
        lastReportDate: lastReport ? lastReport.date : 'Aucun rapport enregistré'
      });
    }
  }

  return { checked: true, warningDays, alerts };
}

/**
 * 4. Calcul automatique du score de santé (0-100) de chaque département
 * Pondération paramétrable :
 * - Régularité des rapports (25%)
 * - Taux de présence des membres (25%)
 * - Activités / Projets réalisés (20%)
 * - Nouveaux membres intégrés (15%)
 * - Discipline financière & budget (15%)
 */
function calculateDepartmentHealthScores(db) {
  const settings = getSettingsMap(db);
  const wReports = parseFloat(settings.health_weight_reports || '25') / 100;
  const wAtt = parseFloat(settings.health_weight_attendance || '25') / 100;
  const wAct = parseFloat(settings.health_weight_activities || '20') / 100;
  const wNew = parseFloat(settings.health_weight_new_members || '15') / 100;
  const wFin = parseFloat(settings.health_weight_finances || '15') / 100;

  const departments = db.prepare('SELECT id, name, code FROM departments').all();
  const scores = [];

  for (const dept of departments) {
    // A. Régularité des rapports (sur les 4 dernières semaines, attendu: au moins 2 à 4 rapports)
    const reportCountRow = db.prepare(`
      SELECT count(*) as count 
      FROM department_reports 
      WHERE department_id = ? AND julianday('now') - julianday(date) <= 30
    `).get(dept.id);
    const reportCount = reportCountRow ? reportCountRow.count : 0;
    // 3+ rapports dans le mois = 100%, 2 = 75%, 1 = 45%, 0 = 10%
    let subReport = 10;
    if (reportCount >= 3) subReport = 100;
    else if (reportCount === 2) subReport = 80;
    else if (reportCount === 1) subReport = 45;

    // B. Taux de présence des membres du département
    // Chercher les membres affiliés au département
    const allMembers = db.prepare('SELECT id, department_ids FROM members').all();
    const deptMemberIds = allMembers.filter(m => {
      try {
        const ids = JSON.parse(m.department_ids || '[]');
        return Array.isArray(ids) && ids.includes(dept.id);
      } catch (e) {
        return false;
      }
    }).map(m => m.id);

    let subAttendance = 70; // valeur par défaut
    if (deptMemberIds.length > 0) {
      const placeholders = deptMemberIds.map(() => '?').join(',');
      const attStats = db.prepare(`
        SELECT 
          sum(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as presents,
          count(*) as total
        FROM attendances
        WHERE member_id IN (${placeholders})
      `).get(...deptMemberIds);

      if (attStats && attStats.total > 0) {
        subAttendance = Math.round((attStats.presents / attStats.total) * 100);
      }
    }

    // C. Activités et projets réalisés
    const projStats = db.prepare(`
      SELECT 
        sum(CASE WHEN status = 'termine' THEN 1 ELSE 0 END) as done,
        count(*) as total
      FROM projects
      WHERE department_id = ?
    `).get(dept.id);

    let subActivities = 75;
    if (projStats && projStats.total > 0) {
      subActivities = Math.round(((projStats.done + 1) / (projStats.total + 1)) * 100);
    }

    // D. Nouveaux membres intégrés
    const newMemberRows = db.prepare("SELECT department_ids FROM members WHERE status = 'nouveau_membre'").all();
    const newCount = newMemberRows.filter(m => {
      try {
        const ids = JSON.parse(m.department_ids || '[]');
        return Array.isArray(ids) && ids.includes(dept.id);
      } catch (e) { return false; }
    }).length;
    const subNewMembers = Math.min(100, 50 + (newCount * 25));

    // E. Participation financière / Projets
    // Valeur neutre par défaut (à brancher sur les budgets par département ultérieurement)
    const subFinances = 80;

    // Score global calculé
    const finalScore = Math.min(100, Math.max(0, Math.round(
      (subReport * wReports) +
      (subAttendance * wAtt) +
      (subActivities * wAct) +
      (subNewMembers * wNew) +
      (subFinances * wFin)
    )));

    let color = 'vert';
    if (finalScore < 50) color = 'rouge';
    else if (finalScore < 80) color = 'orange';

    const details = {
      subReport: { value: subReport, weight: Math.round(wReports * 100), label: 'Régularité des rapports' },
      subAttendance: { value: subAttendance, weight: Math.round(wAtt * 100), label: 'Présence des membres' },
      subActivities: { value: subActivities, weight: Math.round(wAct * 100), label: 'Activités & projets' },
      subNewMembers: { value: subNewMembers, weight: Math.round(wNew * 100), label: 'Intégration nouveaux' },
      subFinances: { value: subFinances, weight: Math.round(wFin * 100), label: 'Discipline budgétaire' }
    };

    // Sauvegarder dans l'historique
    db.prepare(`
      INSERT INTO department_health_history (department_id, score, color, details_json)
      VALUES (?, ?, ?, ?)
    `).run(dept.id, finalScore, color, JSON.stringify(details));

    scores.push({
      departmentId: dept.id,
      departmentName: dept.name,
      score: finalScore,
      color,
      details
    });
  }

  return { calculated: true, scores };
}

/**
 * Exécute l'ensemble des tâches planifiées
 */
function runAllCronTasks(db) {
  const absences = checkConsecutiveAbsences(db);
  const newMembers = checkNewMemberFollowUps(db);
  const missingReports = checkMissingDepartmentReports(db);
  const healthScores = calculateDepartmentHealthScores(db);

  return {
    timestamp: new Date().toISOString(),
    absences,
    newMembers,
    missingReports,
    healthScores
  };
}

module.exports = {
  checkConsecutiveAbsences,
  checkNewMemberFollowUps,
  checkMissingDepartmentReports,
  calculateDepartmentHealthScores,
  runAllCronTasks
};
