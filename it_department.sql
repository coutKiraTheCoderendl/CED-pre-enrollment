-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 10, 2026 at 06:29 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `it_department`
--

-- --------------------------------------------------------

--
-- Stand-in structure for view `ced_students_view`
-- (See below for the actual view)
--
CREATE TABLE `ced_students_view` (
`student_number` varchar(20)
,`first_name` varchar(50)
,`last_name` varchar(50)
,`age` tinyint(4)
,`address` varchar(255)
,`program_code` varchar(10)
,`program_name` varchar(100)
,`year_level` tinyint(4)
,`student_type` varchar(10)
);

-- --------------------------------------------------------

--
-- Table structure for table `it_student_records`
--

CREATE TABLE `it_student_records` (
  `id` int(11) NOT NULL,
  `student_number` varchar(20) NOT NULL,
  `first_name` varchar(50) NOT NULL,
  `last_name` varchar(50) NOT NULL,
  `age` tinyint(4) NOT NULL,
  `address` varchar(255) NOT NULL,
  `college_code` varchar(10) NOT NULL,
  `program_code` varchar(10) NOT NULL,
  `program_name` varchar(100) NOT NULL,
  `year_level` tinyint(4) NOT NULL,
  `student_type` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `it_student_records`
--

INSERT INTO `it_student_records` (`id`, `student_number`, `first_name`, `last_name`, `age`, `address`, `college_code`, `program_code`, `program_name`, `year_level`, `student_type`) VALUES
(1, 'SIM-0001', 'Jirah', 'Ege', 19, 'Dumaguete City', 'CED', 'CpE', 'BS Computer Engineering', 1, 'new'),
(2, 'SIM-0002', 'JiRAHH', 'Yehey', 20, 'Valencia', 'CED', 'CpE', 'BS Computer Engineering', 2, 'old'),
(3, 'SIM-0003', 'Pedro', 'Reyes', 21, 'Bacong', 'CED', 'CE', 'BS Civil Engineering', 3, 'old'),
(4, 'SIM-0004', 'Ana', 'Garcia', 22, 'Sibulan', 'CED', 'EE', 'BS Electrical Engineering', 4, 'old'),
(5, 'SIM-0005', 'Luis', 'Torres', 19, 'Dauin', 'CBA', 'BSBA', 'BS Business Administration', 1, 'new'),
(6, 'SIM-0006', 'Rosa', 'Mendoza', 20, 'Zamboanguita', 'CON', 'BSN', 'BS Nursing', 2, 'old'),
(7, 'SIM-0007', 'Samuel', 'Real', 19, 'Dumaguete City', 'CED', 'CpE', 'BS Computer Engineering', 2, 'new'),
(9, 'SIM-0008', 'Tomn', 'Jerry', 22, 'Dumaguete City', 'CON', 'BSN', 'BS Nursing', 3, 'new'),
(10, 'SIM-0009', 'JiRUH', 'Ege', 19, 'Dumaguete City', 'CED', 'CpE', 'BS Computer Engineering', 1, 'new'),
(12, 'SIM-0010', 'JiBRUH', 'Egestudyante', 19, 'Dumaguete City', 'CED', 'CpE', 'BS Computer Engineering', 2, 'new'),
(13, 'SIM-0011', 'Kent', 'Tan', 23, 'Dumaguete City', 'CED', 'CE', 'BS Civil Engineering', 4, 'old'),
(14, 'SIM-0012', 'Overlord', 'Baring', 32, 'Dumaguete City', 'CED', 'ME', 'BS Mechanical Engineering', 3, 'old');

-- --------------------------------------------------------

--
-- Structure for view `ced_students_view`
--
DROP TABLE IF EXISTS `ced_students_view`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `ced_students_view`  AS SELECT `it_student_records`.`student_number` AS `student_number`, `it_student_records`.`first_name` AS `first_name`, `it_student_records`.`last_name` AS `last_name`, `it_student_records`.`age` AS `age`, `it_student_records`.`address` AS `address`, `it_student_records`.`program_code` AS `program_code`, `it_student_records`.`program_name` AS `program_name`, `it_student_records`.`year_level` AS `year_level`, `it_student_records`.`student_type` AS `student_type` FROM `it_student_records` WHERE `it_student_records`.`college_code` = 'CED' ;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `it_student_records`
--
ALTER TABLE `it_student_records`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `student_number` (`student_number`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `it_student_records`
--
ALTER TABLE `it_student_records`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
