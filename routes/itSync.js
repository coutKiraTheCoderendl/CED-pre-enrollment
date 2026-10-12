// routes/itSync.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');
const itDb = require('../config/itDb');
const { protect, restrictTo } = require('../middleware/auth');

// ============================================================
//  SYNC CED STUDENTS FROM IT DEPARTMENT (read-only source)
// ============================================================
router.post('/sync-it', protect, restrictTo('admin'), (req, res) => {

    // Step 1: read the CED-only view from the IT database
    itDb.query('SELECT * FROM ced_students_view', (errRead, itStudents) => {
        if (errRead) {
            return res.status(500).json({ message: 'Could not read from IT database', error: errRead.message });
        }

        let addedCount = 0;
        let alreadyExistingCount = 0;
        let noDepartmentCount = 0;

        const currentYear = new Date().getFullYear();
        const school_year = `${currentYear}-${currentYear + 1}`;

        // Step 2: handle one IT student at a time
        const processStudent = (index) => {

            // Finished all rows -> send the summary
            if (index === itStudents.length) {
                return res.json({
                    message: 'Sync from IT complete.',
                    read_from_it: itStudents.length,
                    added: addedCount,
                    already_existing: alreadyExistingCount,
                    no_matching_department: noDepartmentCount
                });
            }

            const itRow = itStudents[index];
            const studentNumber = itRow.student_number;
            const firstName = itRow.first_name;
            const lastName = itRow.last_name;
            const age = itRow.age;
            const address = itRow.address;
            const programCode = itRow.program_code;
            const programName = itRow.program_name;
            const yearLevel = itRow.year_level;

            // Force 'old' for any student above Year 1 regardless of what IT says
            // Year 1 new students get auto-enrolled; everyone else goes through the old student flow
            const resolvedType = (yearLevel > 1) ? 'old' : (itRow.student_type || 'new');

            // Step 3: skip if this student number is already in our system
            db.query('SELECT id FROM students WHERE student_number = ?', [studentNumber], (errCheck, existingRows) => {
                if (errCheck) return res.status(500).json({ message: 'Database error', error: errCheck.message });

                if (existingRows.length > 0) {
                    alreadyExistingCount = alreadyExistingCount + 1;
                    return processStudent(index + 1);
                }

                // Step 4: turn the IT program code (e.g. CpE) into our department id
                db.query('SELECT id FROM departments WHERE code = ?', [programCode], (errDept, departmentRows) => {
                    if (errDept) return res.status(500).json({ message: 'Database error', error: errDept.message });

                    if (departmentRows.length === 0) {
                        noDepartmentCount = noDepartmentCount + 1;
                        return processStudent(index + 1);
                    }

                    const departmentId = departmentRows[0].id;

                    // Step 5: insert the student
                    const insertStudentSQL = `INSERT INTO students
                        (student_number, first_name, last_name, age, address, department_id, course, year_level, type)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                    db.query(
                        insertStudentSQL,
                        [studentNumber, firstName, lastName, age, address, departmentId, programName, yearLevel, resolvedType],
                        (errInsert, insertResult) => {
                            if (errInsert) return res.status(500).json({ message: 'Error inserting student', error: errInsert.message });

                            const newStudentId = insertResult.insertId;

                            // Step 6: create the login account
                            // username = student number, password = student number (hashed)
                            bcrypt.hash(studentNumber, 10, (errHash, passwordHash) => {
                                if (errHash) return res.status(500).json({ message: 'Error hashing password' });

                                db.query(
                                    'INSERT INTO users (username, password, role, student_id) VALUES (?, ?, "student", ?)',
                                    [studentNumber, passwordHash, newStudentId],
                                    (errUser) => {
                                        if (errUser) return res.status(500).json({ message: 'Error creating user account', error: errUser.message });

                                        // Step 7: auto-enroll freshmen (new, year 1) into Sem 1 subjects
                                        // Step 7: auto-enroll freshmen (new, year 1) into Sem 1 subjects
if (resolvedType === 'new' && yearLevel === 1) {
    console.log(`[SYNC] Auto-enrolling ${studentNumber}, dept ${departmentId}, year ${yearLevel}`);
    db.query(
        `SELECT s.id as subject_id, s.units FROM curriculum c
         JOIN subjects s ON c.subject_id = s.id
         WHERE c.department_id = ? AND c.year_level = 1 AND c.semester = 1`,
        [departmentId],
        (errCurr, subjects) => {
            console.log(`[SYNC] Curriculum query result:`, errCurr, subjects?.length);
            if (errCurr || !subjects.length) {
                addedCount = addedCount + 1;
                return processStudent(index + 1);
            }

            db.query(
                `SELECT subject_id, id as section_id FROM sections
                 WHERE school_year = ? AND semester = 1`,
                [school_year],
                (errSec, sections) => {
                    console.log(`[SYNC] Sections found:`, sections?.length);
                    const sectionMap = {};
                    if (sections) sections.forEach(sec => {
                        if (!sectionMap[sec.subject_id]) sectionMap[sec.subject_id] = sec.section_id;
                    });

                    const enrollValues = subjects.map(sub => [
                        newStudentId, sub.subject_id, school_year, 1, 'auto_enrolled',
                        sectionMap[sub.subject_id] || null
                    ]);

                    console.log(`[SYNC] Inserting ${enrollValues.length} enrollments for student ${newStudentId}`);
                    db.query(
                        'INSERT INTO enrollments (student_id, subject_id, school_year, semester, status, section_id) VALUES ?',
                        [enrollValues],
                        (errEnroll) => {
                            console.log(`[SYNC] Enroll result:`, errEnroll);
                            if (errEnroll) console.error('Auto-enroll error for ' + studentNumber, errEnroll);
                            addedCount = addedCount + 1;
                            processStudent(index + 1);
                        }
                    );
                }
            );
        }
    );
    return;
}
                                        

                                        // Higher year or shiftee — just count and move on
                                        // They will enroll through the old student flow after admin clears them
                                        addedCount = addedCount + 1;
                                        processStudent(index + 1);
                                    }
                                );
                            });
                        }
                    );
                });
            });
        };

        processStudent(0);
    });
});

module.exports = router;