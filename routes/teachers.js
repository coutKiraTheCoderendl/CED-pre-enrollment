const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth');

// ============================================================
//  TEACHER PROFILE
// ============================================================
router.get('/me', protect, restrictTo('teacher'), (req, res) => {
    const sql = `
        SELECT t.id, t.first_name, t.last_name, t.email,
               d.name as department_name
        FROM teachers t
        LEFT JOIN departments d ON t.department_id = d.id
        WHERE t.user_id = ?
    `;
    db.query(sql, [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Teacher not found' });

        const teacher = results[0];

        db.query(
            `SELECT s.id, s.code, s.name, s.units  
             FROM teacher_subjects ts
             JOIN subjects s ON ts.subject_id = s.id
             WHERE ts.teacher_id = ?`,
            [teacher.id],
            (err, subjects) => {
                if (err) return res.status(500).json({ message: 'Database error', error: err });
                res.json({ teacher, subjects });
            }
        );
    });
});

// ============================================================
//  GET STUDENTS IN A SUBJECT
// ============================================================
router.get('/subject/:subject_id/students', protect, restrictTo('teacher'), (req, res) => {
    const sql = `
        SELECT st.id, st.student_number, st.first_name, st.last_name,
               st.year_level, st.course,
               e.school_year, e.semester,
               g.grade, g.passed,
               sub.type as subject_type
        FROM enrollments e
        JOIN students st ON e.student_id = st.id
        JOIN subjects sub ON e.subject_id = sub.id
        LEFT JOIN grades g ON g.student_id = st.id 
            AND g.subject_id = e.subject_id
            AND g.school_year = e.school_year
            AND g.semester = e.semester
        WHERE e.subject_id = ?
        ORDER BY st.last_name, st.first_name
    `;
    db.query(sql, [req.params.subject_id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  SUBMIT / UPDATE GRADE
// ============================================================
router.post('/grade', protect, restrictTo('teacher'), (req, res) => {
    const { student_id, subject_id, grade, school_year, semester, subject_type } = req.body;

    if (!student_id || !subject_id || grade === undefined || !school_year || !semester) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    const numericGrade = parseFloat(grade);

    // Fetch student's year level first so we can apply correct passing threshold
    db.query('SELECT year_level FROM students WHERE id = ?', [student_id], (err, students) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (!students || students.length === 0) return res.status(404).json({ message: 'Student not found.' });

        const year_level = students[0].year_level;

        const isNonMajor = ['GE', 'PE', 'NSTP', 'drawing'].includes(subject_type);
        // Year 3+ uses 1.8 passing threshold for major subjects, Year 1-2 uses 2.0
        const passingGrade = isNonMajor ? 1.0 : (year_level >= 3 ? 1.8 : 2.0);
        const passed = numericGrade >= passingGrade ? 1 : 0;

        const sql = `
            INSERT INTO grades (student_id, subject_id, grade, passed, school_year, semester)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE grade = VALUES(grade), passed = VALUES(passed)
        `;

        db.query(sql, [student_id, subject_id, numericGrade, passed, school_year, semester], (err) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({
                message: 'Grade submitted successfully.',
                passed: passed === 1 ? 'Passed' : 'Failed',
                grade: numericGrade,
                passing_threshold: passingGrade
            });
        });
    });
});

// ============================================================
//  GET ALL TEACHERS (admin)
// ============================================================
router.get('/all', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT t.id, t.first_name, t.last_name, t.email,
               d.name as department_name,
               u.username
        FROM teachers t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN departments d ON t.department_id = d.id
        ORDER BY t.last_name
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  ADVISING REQUESTS
// ============================================================
router.get('/advising-requests', protect, restrictTo('teacher'), (req, res) => {
    db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id], (err, teachers) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        const teacher = teachers[0];

        const sql = `
            SELECT ar.id, ar.status, ar.submitted_at,
                   s.id as student_id, s.student_number, s.first_name, s.last_name,
                   s.course, s.year_level, ar.school_year, ar.semester
            FROM advising_requests ar
            JOIN students s ON ar.student_id = s.id
            WHERE ar.teacher_id = ? AND ar.status = 'pending'
            ORDER BY ar.submitted_at ASC
        `;
        db.query(sql, [teacher.id], (err, results) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json(results);
        });
    });
});

// Get subjects for a specific advising request
router.get('/advising-requests/:student_id/subjects', protect, restrictTo('teacher'), (req, res) => {
    const sql = `
        SELECT e.id as enrollment_id, s.code, s.name, s.units, s.type, e.status
        FROM enrollments e
        JOIN subjects s ON e.subject_id = s.id
        WHERE e.student_id = ? AND e.status = 'submitted_for_advising'
        ORDER BY s.code
    `;
    db.query(sql, [req.params.student_id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Approve advising request
router.patch('/advising-requests/:request_id/approve', protect, restrictTo('teacher'), (req, res) => {
    const requestId = req.params.request_id;

    db.query('SELECT * FROM advising_requests WHERE id = ?', [requestId], (err, requests) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (requests.length === 0) return res.status(404).json({ message: 'Request not found' });

        const request = requests[0];

        db.query(
            'UPDATE enrollments SET status = "officially_enrolled" WHERE student_id = ? AND school_year = ? AND semester = ? AND status = "submitted_for_advising"',
            [request.student_id, request.school_year, request.semester],
            (err) => {
                if (err) return res.status(500).json({ message: 'Database error', error: err });

                db.query(
                    'UPDATE advising_requests SET status = "approved", reviewed_at = NOW() WHERE id = ?',
                    [requestId],
                    (err) => {
                        if (err) return res.status(500).json({ message: 'Database error', error: err });

                        db.query(
                            'INSERT INTO notices (student_id, type, message) VALUES (?, "f2f_required", ?)',
                            [request.student_id, 'Your enrollment has been approved by your advisor. You are now officially enrolled.'],
                            () => {}
                        );

                        res.json({ message: 'Student enrollment approved. Marked as officially enrolled.' });
                    }
                );
            }
        );
    });
});

// ============================================================
//  SEND NOTICE TO STUDENT
// ============================================================
router.post('/send-notice', protect, restrictTo('teacher'), (req, res) => {
    const { student_id, message } = req.body;
    if (!student_id || !message) return res.status(400).json({ message: 'Student ID and message required.' });

    db.query(
        'INSERT INTO notices (student_id, type, message) VALUES (?, "f2f_required", ?)',
        [student_id, message],
        (err) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({ message: 'Notice sent successfully.' });
        }
    );
});

module.exports = router;