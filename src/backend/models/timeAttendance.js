const db = require('./dbmgr');

const TimeAttendance = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS time_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        clock_in DATETIME NOT NULL,
        clock_out DATETIME,
        break_minutes INTEGER DEFAULT 0,
        work_type TEXT DEFAULT 'regular',
        status TEXT DEFAULT 'active',
        notes TEXT,
        approved_by TEXT,
        approved_at DATETIME,
        linked_payroll_run_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS attendance_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        regular_hours_per_day REAL DEFAULT 8,
        overtime_multiplier REAL DEFAULT 1.5,
        double_time_after REAL DEFAULT 12,
        double_time_multiplier REAL DEFAULT 2.0,
        weekly_overtime_threshold REAL DEFAULT 40,
        active INTEGER DEFAULT 1
      )
    `).run();

    try {
      const cnt = db.prepare(`SELECT COUNT(1) AS c FROM attendance_policies`).get().c;
      if (!cnt) {
        db.prepare(`INSERT INTO attendance_policies (name, regular_hours_per_day, overtime_multiplier, weekly_overtime_threshold, active) VALUES ('Default', 8, 1.5, 40, 1)`).run();
      }
    } catch {}
  },

  clockIn(employeeId, workType, notes) {
    const res = db.prepare(`
      INSERT INTO time_attendance (employee_id, clock_in, work_type, notes, status)
      VALUES (?, datetime('now'), ?, ?, 'active')
    `).run(employeeId, workType || 'regular', notes || null);
    return { success: true, id: res.lastInsertRowid };
  },

  clockOut(id) {
    const res = db.prepare(`
      UPDATE time_attendance SET clock_out = datetime('now'), status = 'completed' WHERE id = ? AND clock_out IS NULL
    `).run(id);
    return { success: res.changes > 0 };
  },

  getActiveClockIn(employeeId) {
    return db.prepare(`SELECT * FROM time_attendance WHERE employee_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`).get(employeeId);
  },

  listByEmployee(employeeId, startDate, endDate) {
    let sql = `SELECT ta.*, e.first_name || ' ' || e.last_name AS employee_name
               FROM time_attendance ta
               LEFT JOIN employees e ON e.id = ta.employee_id
               WHERE ta.employee_id = ?`;
    const params = [employeeId];
    if (startDate) { sql += ` AND ta.clock_in >= ?`; params.push(startDate); }
    if (endDate) { sql += ` AND ta.clock_in <= ?`; params.push(endDate + ' 23:59:59'); }
    sql += ` ORDER BY ta.clock_in DESC`;
    return db.prepare(sql).all(...params);
  },

  listAll(startDate, endDate) {
    let sql = `SELECT ta.*, e.first_name || ' ' || e.last_name AS employee_name
               FROM time_attendance ta
               LEFT JOIN employees e ON e.id = ta.employee_id WHERE 1=1`;
    const params = [];
    if (startDate) { sql += ` AND ta.clock_in >= ?`; params.push(startDate); }
    if (endDate) { sql += ` AND ta.clock_in <= ?`; params.push(endDate + ' 23:59:59'); }
    sql += ` ORDER BY ta.clock_in DESC`;
    return db.prepare(sql).all(...params);
  },

  approve(id, approvedBy) {
    db.prepare(`UPDATE time_attendance SET approved_by = ?, approved_at = datetime('now') WHERE id = ?`)
      .run(approvedBy || 'system', id);
    return { success: true };
  },

  calculateHours(employeeId, startDate, endDate) {
    const records = this.listByEmployee(employeeId, startDate, endDate).filter(r => r.clock_out);
    const policy = db.prepare(`SELECT * FROM attendance_policies WHERE active = 1 ORDER BY id DESC LIMIT 1`).get() || {};

    let totalRegular = 0;
    let totalOvertime = 0;
    let totalDoubleTime = 0;

    for (const r of records) {
      const cin = new Date(r.clock_in);
      const cout = new Date(r.clock_out);
      const totalMin = (cout - cin) / 60000 - (r.break_minutes || 0);
      const totalHrs = Math.max(0, totalMin / 60);
      const regThreshold = policy.regular_hours_per_day || 8;
      const dtThreshold = policy.double_time_after || 12;

      if (totalHrs <= regThreshold) {
        totalRegular += totalHrs;
      } else if (totalHrs <= dtThreshold) {
        totalRegular += regThreshold;
        totalOvertime += totalHrs - regThreshold;
      } else {
        totalRegular += regThreshold;
        totalOvertime += dtThreshold - regThreshold;
        totalDoubleTime += totalHrs - dtThreshold;
      }
    }

    return {
      employee_id: employeeId,
      period: { start: startDate, end: endDate },
      regular_hours: Number(totalRegular.toFixed(2)),
      overtime_hours: Number(totalOvertime.toFixed(2)),
      double_time_hours: Number(totalDoubleTime.toFixed(2)),
      total_hours: Number((totalRegular + totalOvertime + totalDoubleTime).toFixed(2)),
      record_count: records.length,
      policy: {
        overtime_multiplier: policy.overtime_multiplier || 1.5,
        double_time_multiplier: policy.double_time_multiplier || 2.0,
      }
    };
  },

  linkToPayroll(employeeId, payrollRunId, startDate, endDate) {
    db.prepare(`
      UPDATE time_attendance SET linked_payroll_run_id = ?
      WHERE employee_id = ? AND clock_in >= ? AND clock_in <= ? AND clock_out IS NOT NULL
    `).run(payrollRunId, employeeId, startDate, endDate + ' 23:59:59');
    return { success: true };
  },

  getPolicy() {
    return db.prepare(`SELECT * FROM attendance_policies WHERE active = 1 ORDER BY id DESC LIMIT 1`).get();
  },

  savePolicy(policy) {
    if (policy.id) {
      db.prepare(`UPDATE attendance_policies SET name=?, regular_hours_per_day=?, overtime_multiplier=?, double_time_after=?, double_time_multiplier=?, weekly_overtime_threshold=? WHERE id=?`)
        .run(policy.name || 'Default', policy.regular_hours_per_day || 8, policy.overtime_multiplier || 1.5, policy.double_time_after || 12, policy.double_time_multiplier || 2.0, policy.weekly_overtime_threshold || 40, policy.id);
    } else {
      db.prepare(`INSERT INTO attendance_policies (name, regular_hours_per_day, overtime_multiplier, double_time_after, double_time_multiplier, weekly_overtime_threshold, active) VALUES (?,?,?,?,?,?,1)`)
        .run(policy.name || 'Default', policy.regular_hours_per_day || 8, policy.overtime_multiplier || 1.5, policy.double_time_after || 12, policy.double_time_multiplier || 2.0, policy.weekly_overtime_threshold || 40);
    }
    return { success: true };
  },

  delete(id) {
    return db.prepare(`DELETE FROM time_attendance WHERE id = ?`).run(id);
  }
};

TimeAttendance.createTable();

module.exports = TimeAttendance;
