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
            const studentType = itRow.student_type;

            // Step 3: skip if this student number is already in our system
            db.query('SELECT id FROM students WHERE student_number = ?', [studentNumber], (errCheck, existingRows) => {
                if (errCheck) return res.status(500).json({ message: 'Database error', error: errCheck.message });

                if (existingRows.length > 0) {
                    alreadyExistingCount = alreadyExistingCount + 1;
                    return processStudent(index + 1);
                }

                // Step 4: turn the IT program code (CpE) into our department id
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
                        [studentNumber, firstName, lastName, age, address, departmentId, programName, yearLevel, studentType],
                        (errInsert, insertResult) => {
                            if (errInsert) return res.status(500).json({ message: 'Error inserting student', error: errInsert.message });

                            const newStudentId = insertResult.insertId;

                            // Step 6: create the login account (same rule as /api/students/new:
                            // username = student number, password = student number, hashed)
                            bcrypt.hash(studentNumber, 10, (errHash, passwordHash) => {
                                if (errHash) return res.status(500).json({ message: 'Error hashing password' });

                                db.query(
                                    'INSERT INTO users (username, password, role, student_id) VALUES (?, ?, "student", ?)',
                                    [studentNumber, passwordHash, newStudentId],
                                    (errUser) => {
                                        if (errUser) return res.status(500).json({ message: 'Error creating user account', error: errUser.message });

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