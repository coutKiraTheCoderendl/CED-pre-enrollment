-- ============================================================
--  Migration: Support paired weekdays for section schedules
--  Run once on existing ced_preenrollment databases.
-- ============================================================

USE ced_preenrollment;

ALTER TABLE sections
  MODIFY COLUMN day
  ENUM('Mon/Thu','Tue/Fri','Wed/Sat','Mon','Tue','Wed','Thu','Fri','Sat')
  DEFAULT NULL;
