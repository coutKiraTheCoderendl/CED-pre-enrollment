const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth');

// ============================================================
//  REGISTER NEW STUDENT (admin only)
// ============================================================
router.post('/new', protect, restrictTo('admin'), (req, res) => {
    const { student_number, first_name, last_name, age, address, department_id, course, year_level, type } = req.body;

    // --- Input Validation ---
    const studentNumRegex = /^\d{2}-\d{1}-\d{5}$/;
    if (!studentNumRegex.test(student_number)) {
        return res.status(400).json({ message: 'Invalid student number format. Expected: XX-X-XXXXX (e.g. 26-1-00001)' });
    }
    const nameRegex = /^[a-zA-Z\s\-'.]+$/;
    if (!nameRegex.test(first_name) || !nameRegex.test(last_name)) {
        return res.status(400).json({ message: 'Names must only contain letters, spaces, hyphens, apostrophes, or periods.' });
    }
    if (!student_number || !first_name || !last_name || !age || !address || !department_id || !course || !year_level || !type) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    const insertStudent = `INSERT INTO students 
        (student_number, first_name, last_name, age, address, department_id, course, year_level, type) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(insertStudent, [student_number, first_name, last_name, age, address, department_id, course, year_level, type], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Student number already exists.' });
            return res.status(500).json({ message: 'Database error', error: err });
        }

        const student_id = result.insertId;

        // Shiftee — skip auto enroll, create f2f notice
        if (type === 'shiftee') {
            const noticeSQL = `INSERT INTO notices (student_id, type, message) VALUES (?, 'f2f_required', ?)`;
            const msg = `Shiftee student ${first_name} ${last_name} requires face-to-face consultation with advisor before enrollment can proceed.`;
            db.query(noticeSQL, [student_id, msg], (err) => {
                if (err) console.error(err);
            });

            const bcrypt = require('bcrypt');
            bcrypt.hash(student_number, 10, (err, hash) => {
                if (err) return res.status(500).json({ message: 'Error hashing password' });
                const userSQL = `INSERT INTO users (username, password, role, student_id) VALUES (?, ?, 'student', ?)`;
                db.query(userSQL, [student_number, hash, student_id], (err) => {
                    if (err) return res.status(500).json({ message: 'Error creating user account' });
                    res.status(201).json({
                        message: 'Shiftee registered. Face-to-face consultation required before enrollment.',
                        student_id
                    });
                });
            });
            return;
        }

        // Non-freshman old students — just register, no auto-enroll
        if (type !== 'new' || parseInt(year_level) !== 1) {
            const bcrypt = require('bcrypt');
            bcrypt.hash(student_number, 10, (err, hash) => {
                if (err) return res.status(500).json({ message: 'Error hashing password' });
                const userSQL = `INSERT INTO users (username, password, role, student_id) VALUES (?, ?, 'student', ?)`;
                db.query(userSQL, [student_number, hash, student_id], (err) => {
                    if (err) return res.status(500).json({ message: 'Error creating user account' });
                    res.status(201).json({
                        message: 'Student registered successfully. They will enroll through the enrollment period.',
                        student_id
                    });
                });
            });
            return;
        }

        // Freshman auto-enrollment
        const curriculumSQL = `
            SELECT s.id as subject_id, s.units, s.code, s.name
            FROM curriculum c
            JOIN subjects s ON c.subject_id = s.id
            WHERE c.department_id = ? AND c.year_level = ? AND c.semester = 1
        `;
        db.query(curriculumSQL, [department_id, year_level], (err, subjects) => {
            if (err) return res.status(500).json({ message: 'Error fetching curriculum', error: err });

            if (subjects.length === 0) {
                return res.status(201).json({
                    message: 'Student registered but no curriculum found for this department/year.',
                    student_id
                });
            }

            const currentYear = new Date().getFullYear();
            const school_year = `${currentYear}-${currentYear + 1}`;

            const enrollmentValues = subjects.map(sub => [
                student_id, sub.subject_id, school_year, 1, 'auto_enrolled', null
            ]);

            db.query(
                'INSERT INTO enrollments (student_id, subject_id, school_year, semester, status, section_id) VALUES ?',
                [enrollmentValues],
                (err) => {
                    if (err) return res.status(500).json({ message: 'Error auto-enrolling subjects', error: err });

                    const bcrypt = require('bcrypt');
                    bcrypt.hash(student_number, 10, (err, hash) => {
                        if (err) return res.status(500).json({ message: 'Error creating user account' });

                        db.query(
                            'INSERT INTO users (username, password, role, student_id) VALUES (?, ?, "student", ?)',
                            [student_number, hash, student_id],
                            (err) => {
                                if (err) return res.status(500).json({ message: 'Error creating user account' });
                                res.status(201).json({
                                    message: 'Student registered and auto-enrolled successfully',
                                    student_id,
                                    school_year,
                                    enrolled_subjects: subjects.map(s => `${s.code} - ${s.name}`)
                                });
                            }
                        );
                    });
                }
            );
        });
    });
});

// ============================================================
//  GET ALL STUDENTS (admin only)
// ============================================================
router.get('/all', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT s.id, s.student_number, s.first_name, s.last_name, 
               s.course, s.year_level, s.type, s.status, s.ok_to_enroll,
               d.name as department_name
        FROM students s
        JOIN departments d ON s.department_id = d.id
        ORDER BY s.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  STUDENT VIEWS OWN PROFILE
// ============================================================
router.get('/me', protect, restrictTo('student'), (req, res) => {
    const userSQL = `
        SELECT s.id, s.student_number, s.first_name, s.last_name,
               s.course, s.year_level, s.type, s.status, s.ok_to_enroll,
               d.name as department_name
        FROM students s
        JOIN departments d ON s.department_id = d.id
        JOIN users u ON u.student_id = s.id
        WHERE u.id = ?
    `;
    db.query(userSQL, [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Student not found' });

        const student = results[0];

        const enrollSQL = `
            SELECT s.id as subject_id, s.code, s.name, s.units, s.type, e.status, e.school_year, e.semester,
                   e.id as enrollment_id,
                   sec.id as section_id, sec.section_code, sec.day, sec.time_start, sec.time_end, sec.room
            FROM enrollments e
            JOIN subjects s ON e.subject_id = s.id
            LEFT JOIN sections sec ON e.section_id = sec.id
            WHERE e.student_id = ?
            ORDER BY e.semester, s.code
        `;
        db.query(enrollSQL, [student.id], (err, subjects) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });

            const sectionsSQL = `
                SELECT sec.id as section_id, sec.subject_id, sec.section_code,
                       sec.day, sec.time_start, sec.time_end, sec.room,
                       sec.school_year, sec.semester, sec.capacity,
                       (SELECT COUNT(*)
                        FROM enrollments active
                        WHERE active.section_id = sec.id
                          AND active.status IN ('auto_enrolled', 'pre_enlisted', 'submitted_for_advising', 'officially_enrolled', 'manually_added')) as enrolled
                FROM sections sec
                WHERE EXISTS (
                    SELECT 1
                    FROM enrollments e
                    WHERE e.student_id = ?
                      AND e.subject_id = sec.subject_id
                      AND e.school_year = sec.school_year
                      AND e.semester = sec.semester
                      AND e.status IN ('auto_enrolled', 'pre_enlisted')
                )
                ORDER BY sec.subject_id, sec.section_code
            `;
            db.query(sectionsSQL, [student.id], (err, availableSections) => {
                if (err) return res.status(500).json({ message: 'Database error', error: err });

                db.query('SELECT * FROM notices WHERE student_id = ? AND resolved = 0', [student.id], (err, notices) => {
                    if (err) return res.status(500).json({ message: 'Database error', error: err });
                    res.json({ student, subjects, availableSections, notices });
                });
            });
        });
    });
});

router.patch('/enrollments/:enrollment_id/section', protect, restrictTo('student'), (req, res) => {
    const sectionId = req.body.section_id ? Number(req.body.section_id) : null;
    if (req.body.section_id && (!Number.isInteger(sectionId) || sectionId < 1)) {
        return res.status(400).json({ message: 'A valid section_id is required.' });
    }

    const enrollmentSQL = `
        SELECT e.id, e.student_id, e.subject_id, e.school_year, e.semester, e.status, e.section_id
        FROM enrollments e
        JOIN users u ON u.student_id = e.student_id
        WHERE e.id = ? AND u.id = ? AND e.status IN ('auto_enrolled', 'pre_enlisted')
    `;
    db.query(enrollmentSQL, [req.params.enrollment_id, req.user.id], (err, enrollments) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (!enrollments.length) return res.status(404).json({ message: 'Editable enrollment not found.' });

        const enrollment = enrollments[0];
        if (!sectionId) {
            return db.query(
                'UPDATE enrollments SET section_id = NULL WHERE id = ? AND student_id = ?',
                [enrollment.id, enrollment.student_id],
                (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: 'Database error', error: updateErr });
                    res.json({ message: 'Section selection cleared.' });
                }
            );
        }

        db.query(
            'SELECT id, subject_id, school_year, semester, day, time_start, time_end, capacity FROM sections WHERE id = ?',
            [sectionId],
            (err, sections) => {
                if (err) return res.status(500).json({ message: 'Database error', error: err });
                if (!sections.length) return res.status(404).json({ message: 'Section not found.' });

                const section = sections[0];
                if (section.subject_id !== enrollment.subject_id ||
                    section.school_year !== enrollment.school_year ||
                    Number(section.semester) !== Number(enrollment.semester)) {
                    return res.status(400).json({ message: 'Choose a section offered for this subject and semester.' });
                }

                db.query(
                    `SELECT COUNT(*) as enrolled FROM enrollments
                     WHERE section_id = ?
                       AND status IN ('auto_enrolled', 'pre_enlisted', 'submitted_for_advising', 'officially_enrolled', 'manually_added')`,
                    [section.id],
                    (err, counts) => {
                        if (err) return res.status(500).json({ message: 'Database error', error: err });
                        if (counts[0].enrolled >= section.capacity &&
                            Number(enrollment.section_id) !== Number(section.id)) {
                            return res.status(409).json({ message: 'This section is full. Choose another section.' });
                        }

                        db.query(
                            `SELECT sec.day, sec.time_start, sec.time_end, s.code
                             FROM enrollments e
                             JOIN sections sec ON sec.id = e.section_id
                             JOIN subjects s ON s.id = e.subject_id
                             WHERE e.student_id = ? AND e.school_year = ? AND e.semester = ?
                               AND e.id <> ? AND e.status IN ('auto_enrolled', 'pre_enlisted', 'submitted_for_advising', 'officially_enrolled', 'manually_added')`,
                            [enrollment.student_id, enrollment.school_year, enrollment.semester, enrollment.id],
                            (err, assignedSections) => {
                                if (err) return res.status(500).json({ message: 'Database error', error: err });

                                const selectedDays = String(section.day || '').split(/[\/,]/).map(day => day.trim()).filter(Boolean);
                                const selectedStart = String(section.time_start || '');
                                const selectedEnd = String(section.time_end || '');
                                const conflict = selectedDays.length && selectedStart && selectedEnd &&
                                    assignedSections.find(assigned => {
                                        const assignedDays = String(assigned.day || '').split(/[\/,]/).map(day => day.trim());
                                        const sharesDay = selectedDays.some(day => assignedDays.includes(day));
                                        return sharesDay &&
                                            selectedStart < String(assigned.time_end || '') &&
                                            selectedEnd > String(assigned.time_start || '');
                                    });

                                if (conflict) {
                                    return res.status(409).json({
                                        message: `This section conflicts with ${conflict.code}'s schedule. Choose another section.`
                                    });
                                }

                                db.query(
                                    'UPDATE enrollments SET section_id = ? WHERE id = ? AND student_id = ? AND status IN ("auto_enrolled", "pre_enlisted")',
                                    [section.id, enrollment.id, enrollment.student_id],
                                    (updateErr, result) => {
                                        if (updateErr) return res.status(500).json({ message: 'Database error', error: updateErr });
                                        if (!result.affectedRows) return res.status(409).json({ message: 'This enrollment can no longer be changed.' });
                                        res.json({ message: 'Section selected successfully.' });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// ============================================================
//  GET ONE STUDENT'S ENROLLMENTS (admin)
// ============================================================
router.get('/:id/enrollments', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT s.code, s.name, s.units, s.type, e.status, e.school_year, e.semester
        FROM enrollments e
        JOIN subjects s ON e.subject_id = s.id
        WHERE e.student_id = ?
        ORDER BY e.semester, s.code
    `;
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  GET ALL DEPARTMENTS (for register form)
// ============================================================
router.get('/departments', protect, restrictTo('admin'), (req, res) => {
    db.query('SELECT * FROM departments', (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  SEARCH STUDENTS (admin and teacher only)
// ============================================================
router.get('/search', protect, restrictTo('teacher', 'admin'), (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: 'Search query required' });

    const sql = `
        SELECT s.id, s.student_number, s.first_name, s.last_name,
               s.course, s.year_level, s.type, s.ok_to_enroll,
               d.name as department_name
        FROM students s
        JOIN departments d ON s.department_id = d.id
        WHERE s.student_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?
    `;
    const like = `%${query}%`;
    db.query(sql, [like, like, like], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  ENROLLMENT STATUS (open/closed check)
// ============================================================
router.get('/enrollment-status', protect, (req, res) => {
    db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (results.length === 0) return res.json({ is_open: 0 });
        res.json(results[0]);
    });
});

// ============================================================
//  TOGGLE ENROLLMENT OPEN/CLOSED (admin)
// ============================================================
router.patch('/enrollment-settings', protect, restrictTo('admin'), (req, res) => {
    const { is_open, school_year, semester } = req.body;

    db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, current) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });

        const currentSettings = current[0];
        const semesterChanged = currentSettings &&
            (currentSettings.school_year !== school_year || currentSettings.semester !== parseInt(semester));

        db.query(
            'UPDATE enrollment_settings SET is_open = ?, school_year = ?, semester = ?, previous_school_year = ?, previous_semester = ? ORDER BY id DESC LIMIT 1',
            [is_open, school_year, semester, currentSettings?.school_year, currentSettings?.semester],
            (err) => {
                if (err) return res.status(500).json({ message: 'Database error', error: err });

                if (is_open && semesterChanged) {
                    db.query(
                        `UPDATE students SET type = 'old', ok_to_enroll = 0, current_semester = ?
                         WHERE id IN (
                             SELECT DISTINCT student_id FROM enrollments 
                             WHERE status IN ('officially_enrolled', 'auto_enrolled')
                         )`,
                        [parseInt(semester)],
                        (err) => { if (err) console.error('Error advancing students:', err); }
                    );

                    if (currentSettings && currentSettings.semester === 2 && parseInt(semester) === 1) {
                        db.query(
                            `UPDATE students SET year_level = year_level + 1, current_semester = 1
                             WHERE id IN (
                                 SELECT DISTINCT student_id FROM enrollments 
                                 WHERE status IN ('officially_enrolled', 'auto_enrolled')
                             )`,
                            () => {}
                        );
                    }

                    db.query(
                        `UPDATE students SET current_semester = 1 
                         WHERE current_semester >= 2 
                         AND id IN (
                             SELECT DISTINCT student_id FROM enrollments 
                             WHERE status = 'officially_enrolled'
                         )`,
                        () => {}
                    );
                }

                res.json({
                    message: `Enrollment ${is_open ? 'opened' : 'closed'} successfully.${semesterChanged && is_open ? ' Students have been advanced to the new semester.' : ''}`
                });
            }
        );
    });
});

// ============================================================
//  OLD STUDENT BEGINS ENROLLMENT
// ============================================================
router.post('/enroll-old', protect, restrictTo('student'), (req, res) => {
    const userId = req.user.id;

    db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, settings) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (!settings[0] || !settings[0].is_open) {
            return res.status(403).json({ message: 'Enrollment is currently closed.' });
        }

        const { school_year, semester } = settings[0];

        db.query(
            'SELECT s.* FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?',
            [userId],
            (err, students) => {
                if (err) return res.status(500).json({ message: 'Database error', error: err });
                const student = students[0];

                if (!student.ok_to_enroll) {
                    return res.status(403).json({ message: 'You are not yet cleared for enrollment. Please approach the college admin office.' });
                }

                db.query(
                    'SELECT id FROM enrollments WHERE student_id = ? AND school_year = ? AND semester = ? LIMIT 1',
                    [student.id, school_year, semester],
                    (err, existing) => {
                        if (err) return res.status(500).json({ message: 'Database error', error: err });
                        if (existing.length > 0) {
                            return res.status(400).json({ message: 'You are already enrolled for this semester.' });
                        }

                        db.query(
                            `SELECT g.subject_id, g.grade, s.type as subject_type
                             FROM grades g
                             JOIN subjects s ON g.subject_id = s.id
                             WHERE g.student_id = ?`,
                            [student.id],
                            (err, grades) => {
                                if (err) return res.status(500).json({ message: 'Database error', error: err });

                                const passedSubjectIds = new Set();
                                const failedSubjectIds = new Set();

                                grades.forEach(g => {
                                    const isNonMajor = ['GE', 'PE', 'NSTP', 'drawing'].includes(g.subject_type);
                                    // 1.8 threshold for Year 3+, 2.0 for Year 1-2
                                    const threshold = isNonMajor ? 1.0 : (student.year_level >= 3 ? 1.8 : 2.0);
                                    if (g.grade >= threshold) {
                                        passedSubjectIds.add(g.subject_id);
                                    } else {
                                        failedSubjectIds.add(g.subject_id);
                                    }
                                });

                                const isRegular = failedSubjectIds.size === 0;

                                db.query(
                                    'UPDATE students SET status = ?, type = "old" WHERE id = ?',
                                    [isRegular ? 'regular' : 'irregular', student.id],
                                    () => {}
                                );

                                db.query(
                                    `SELECT s.id as subject_id, s.code, s.name, s.units
                                     FROM curriculum c
                                     JOIN subjects s ON c.subject_id = s.id
                                     WHERE c.department_id = ? AND c.year_level = ? AND c.semester = ?`,
                                    [student.department_id, student.year_level, parseInt(semester)],
                                    (err, nextSubjects) => {
                                        if (err) return res.status(500).json({ message: 'Database error', error: err });

                                        db.query('SELECT subject_id, prerequisite_id FROM prerequisites', (err, prereqs) => {
                                            if (err) return res.status(500).json({ message: 'Database error', error: err });

                                            const prereqMap = {};
                                            prereqs.forEach(p => {
                                                if (!prereqMap[p.subject_id]) prereqMap[p.subject_id] = [];
                                                prereqMap[p.subject_id].push(p.prerequisite_id);
                                            });

                                            const eligible = [];
                                            const notEligible = [];

                                            nextSubjects.forEach(sub => {
                                                if (passedSubjectIds.has(sub.subject_id)) return;
                                                const prereqsNeeded = prereqMap[sub.subject_id] || [];
                                                const meetsAllPrereqs = prereqsNeeded.every(pid => passedSubjectIds.has(pid));
                                                if (meetsAllPrereqs) {
                                                    eligible.push(sub);
                                                } else {
                                                    notEligible.push(sub);
                                                }
                                            });

                                            const toEnroll = [...eligible];
                                            if (!isRegular) {
                                                failedSubjectIds.forEach(fid => {
                                                    const alreadyIn = toEnroll.find(s => s.subject_id === fid);
                                                    if (!alreadyIn) toEnroll.push({ subject_id: fid, units: 0 });
                                                });
                                            }

                                            const conflictFree = toEnroll;
                                            const totalUnits = conflictFree.reduce((sum, s) => sum + (s.units || 0), 0);
                                            const standardUnits = nextSubjects.reduce((sum, s) => sum + s.units, 0);
                                            const notices = [];

                                            if (totalUnits < 15) {
                                                notices.push({ type: 'unit_underload', message: `Your unit load (${totalUnits}) is below the minimum of 15 units. Please consult your advisor.` });
                                            } else if (totalUnits > standardUnits) {
                                                notices.push({ type: 'unit_overload', message: `Your unit load (${totalUnits}) exceeds the standard (${standardUnits} units). Please consult your advisor.` });
                                            }

                                            if (notEligible.length > 0) {
                                                notices.push({
                                                    type: 'f2f_required',
                                                    message: `You do not meet prerequisites for: ${notEligible.map(s => s.code).join(', ')}. Please consult your advisor.`
                                                });
                                            }

                                            if (conflictFree.length === 0) {
                                                return res.json({ message: 'No eligible subjects found.', notices });
                                            }

                                            const enrollValues = conflictFree.map(s => [
                                                student.id, s.subject_id, school_year, semester, 'pre_enlisted', null
                                            ]);

                                            db.query(
                                                'INSERT INTO enrollments (student_id, subject_id, school_year, semester, status, section_id) VALUES ?',
                                                [enrollValues],
                                                (err) => {
                                                    if (err) return res.status(500).json({ message: 'Error enrolling subjects', error: err });

                                                    if (notices.length > 0) {
                                                        const noticeValues = notices.map(n => [student.id, n.type, n.message]);
                                                        db.query('INSERT INTO notices (student_id, type, message) VALUES ?', [noticeValues], () => {});
                                                    }

                                                    res.json({
                                                        message: isRegular ? 'Regular enrollment complete.' : 'Irregular enrollment complete.',
                                                        status: isRegular ? 'regular' : 'irregular',
                                                        enrolled: conflictFree.map(s => `${s.code} - ${s.name}`),
                                                        not_eligible: notEligible.map(s => `${s.code} - ${s.name}`),
                                                        conflicts: [],
                                                        notices,
                                                        school_year,
                                                        semester
                                                    });
                                                }
                                            );
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// ============================================================
//  SUBMIT FOR ADVISING
// ============================================================
router.post('/submit-advising', protect, restrictTo('student'), (req, res) => {
    const userId = req.user.id;

    db.query('SELECT s.* FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?', [userId], (err, students) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        const student = students[0];

        db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, settings) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            if (!settings[0] || !settings[0].is_open) {
                return res.status(403).json({ message: 'Enrollment is currently closed.' });
            }

            const { school_year, semester } = settings[0];

            db.query(
                'SELECT id FROM advising_requests WHERE student_id = ? AND school_year = ? AND semester = ? AND status = "pending" LIMIT 1',
                [student.id, school_year, semester],
                (err, existing) => {
                    if (err) return res.status(500).json({ message: 'Database error', error: err });
                    if (existing.length > 0) {
                        return res.status(400).json({ message: 'You have already submitted for advising.' });
                    }

                    db.query(
                        `SELECT s.code
                         FROM enrollments e
                         JOIN subjects s ON s.id = e.subject_id
                         WHERE e.student_id = ? AND e.school_year = ? AND e.semester = ?
                           AND e.status = 'pre_enlisted' AND e.section_id IS NULL
                           AND EXISTS (
                               SELECT 1 FROM sections sec
                               WHERE sec.subject_id = e.subject_id
                                 AND sec.school_year = e.school_year
                                 AND sec.semester = e.semester
                           )`,
                        [student.id, school_year, semester],
                        (err, unassigned) => {
                            if (err) return res.status(500).json({ message: 'Database error', error: err });
                            if (unassigned.length) {
                                return res.status(400).json({
                                    message: `Choose a section for each subject before submitting: ${unassigned.map(s => s.code).join(', ')}.`
                                });
                            }

                            db.query(
                                'SELECT id FROM teachers WHERE department_id = ? LIMIT 1',
                                [student.department_id],
                                (err, teachers) => {
                                    if (err) return res.status(500).json({ message: 'Database error', error: err });
                                    const teacher_id = teachers.length > 0 ? teachers[0].id : null;

                                    db.query(
                                        'INSERT INTO advising_requests (student_id, teacher_id, school_year, semester) VALUES (?, ?, ?, ?)',
                                        [student.id, teacher_id, school_year, semester],
                                        (err) => {
                                            if (err) return res.status(500).json({ message: 'Database error', error: err });

                                            db.query(
                                                'UPDATE enrollments SET status = "submitted_for_advising" WHERE student_id = ? AND school_year = ? AND semester = ? AND status = "pre_enlisted"',
                                                [student.id, school_year, semester],
                                                (err) => {
                                                    if (err) return res.status(500).json({ message: 'Database error', error: err });
                                                    res.json({ message: 'Subjects submitted for advising successfully. Please wait for your advisor to review.' });
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// ============================================================
//  GE SUBJECTS (available for student to add)
// ============================================================
router.get('/ge-subjects', protect, restrictTo('student'), (req, res) => {
    db.query('SELECT s.id FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?', [req.user.id], (err, students) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        const student = students[0];

        const sql = `
            SELECT s.id, s.code, s.name, s.units
            FROM subjects s
            WHERE s.type = 'GE'
            AND s.code NOT LIKE 'CHS%'
            AND s.id NOT IN (SELECT subject_id FROM prerequisites)
            AND s.id NOT IN (SELECT subject_id FROM grades WHERE student_id = ? AND passed = 1)
            AND s.id NOT IN (SELECT subject_id FROM enrollments WHERE student_id = ?)
            ORDER BY s.code
        `;
        db.query(sql, [student.id, student.id], (err, results) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json(results);
        });
    });
});

// ============================================================
//  ADD GE SUBJECT
// ============================================================
router.post('/add-ge', protect, restrictTo('student'), (req, res) => {
    const userId = req.user.id;
    const { subject_id } = req.body;

    db.query('SELECT s.* FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?', [userId], (err, students) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        const student = students[0];

        db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, settings) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            if (!settings[0] || !settings[0].is_open) {
                return res.status(403).json({ message: 'Enrollment is currently closed.' });
            }

            const { school_year, semester } = settings[0];

            db.query(
                'SELECT id FROM enrollments WHERE student_id = ? AND subject_id = ? AND school_year = ? AND semester = ?',
                [student.id, subject_id, school_year, semester],
                (err, existing) => {
                    if (err) return res.status(500).json({ message: 'Database error', error: err });
                    if (existing.length > 0) return res.status(400).json({ message: 'Subject already added.' });

                    db.query(
                        'SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND passed = 1',
                        [student.id, subject_id],
                        (err, passed) => {
                            if (err) return res.status(500).json({ message: 'Database error', error: err });
                            if (passed.length > 0) return res.status(400).json({ message: 'You have already passed this subject.' });

                            db.query(
                                'INSERT INTO enrollments (student_id, subject_id, school_year, semester, status) VALUES (?, ?, ?, ?, "pre_enlisted")',
                                [student.id, subject_id, school_year, semester],
                                (err) => {
                                    if (err) return res.status(500).json({ message: 'Database error', error: err });
                                    res.json({ message: 'GE subject added successfully.' });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// ============================================================
//  REMOVE PRE-ENLISTED SUBJECT
// ============================================================
router.delete('/remove-subject/:enrollment_id', protect, restrictTo('student'), (req, res) => {
    db.query('SELECT s.id FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?', [req.user.id], (err, students) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        const student = students[0];

        db.query(
            'DELETE FROM enrollments WHERE id = ? AND student_id = ? AND status = "pre_enlisted"',
            [req.params.enrollment_id, student.id],
            (err, result) => {
                if (err) return res.status(500).json({ message: 'Database error', error: err });
                if (result.affectedRows === 0) {
                    return res.status(400).json({ message: 'Cannot remove this subject. It may already be submitted for advising.' });
                }
                res.json({ message: 'Subject removed.' });
            }
        );
    });
});

// ============================================================
//  STUDENT GRADE HISTORY
// ============================================================
router.get('/my-grades', protect, restrictTo('student'), (req, res) => {
    db.query('SELECT s.id FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?', [req.user.id], (err, students) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        const student = students[0];

        const sql = `
            SELECT g.grade, g.passed, g.school_year, g.semester,
                   s.code, s.name, s.units
            FROM grades g
            JOIN subjects s ON g.subject_id = s.id
            WHERE g.student_id = ?
            ORDER BY g.school_year, g.semester, s.code
        `;
        db.query(sql, [student.id], (err, results) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json(results);
        });
    });
});

// ============================================================
//  FACULTY CONTACTS
// ============================================================
router.get('/contacts', protect, restrictTo('student'), (req, res) => {
    const sql = `
        SELECT f.name, f.role, f.email, f.phone, d.name as department_name
        FROM faculty_contacts f
        LEFT JOIN departments d ON f.department_id = d.id
        ORDER BY f.role, f.name
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

module.exports = router;
