import { Student, AttendanceRecord, ClassLevel, Section, AttendanceStatus } from '../types/student';
import { TeachingLogEntry, PracticalProgressEntry, AbsenteeFollowupEntry } from '../types/modules';
import {
  getAllStudents,
  bulkSaveStudentsLocally,
  bulkSaveAttendanceLocally,
  bulkSaveTeachingLogsLocally,
  bulkSavePracticalProgressLocally,
  bulkSaveAbsenteeFollowupsLocally,
  setAppState,
  getAppState,
  getAllTeachingLogs,
  getAllAttendanceRecords,
} from './db';
import { isMasterOwnerEmail } from './permissionService';

export interface CurriculumLU {
  module: string;
  topic: string;
  theoryHours: number;
  practicalHours: number;
  remarks: string;
}

/**
 * 42 Learning Units (LUs) covering Modules 1 to 4 from Historical_Curriculum_And_Attendance_2026.xlsx
 */
export const HISTORICAL_CURRICULUM_LUS: CurriculumLU[] = [
  // Module 1: Computer Hardware, OS & Utilities (11 LUs)
  { module: 'Module 1', topic: 'LU-1 Install Operating System', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-2 Configure Peripheral Devices', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-3 Install Peripheral Devices', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-4 Install Software Applications', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-5 Update/Upgrade Software Applications', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-6 Uninstall Software Applications', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-7 Perform Windows Scan', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-8 Format External Mass Storage', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-9 Troubleshoot Basic Software Errors', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-10 Troubleshoot Basic Hardware Faults', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 1', topic: 'LU-11 Configure Basic Internet Connectivity', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },

  // Module 2: Word Processing & Professional Documentation (15 LUs)
  { module: 'Module 2', topic: 'LU-1 Type a Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-2 Set-up Page in a Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-3 Edit Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-4 Format Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-5 Save Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-6 Insert in a Word Document (Pictures/Shapes)', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-7 Import Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-8 Protect Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-9 Insert Table in a Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-10 Hyperlink Data in a Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-11 Perform Mail Merge', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-12 Insert Header/Footer', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-13 Insert Section Break', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-14 Set Style in Word Document', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 2', topic: 'LU-15 Insert Table of Contents', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },

  // Module 3: Spreadsheets & Data Analytics (10 LUs)
  { module: 'Module 3', topic: 'LU-1 Create Workbook', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-2 Insert Sheet', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-3 Apply Basic Formulae/Functions (Sum, Average, VLOOKUP)', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-4 Create Charts/Graphs', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-5 Filter Data', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-6 Format Cell', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-7 Edit Worksheet', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-8 Insert Page Break', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-9 Split Cells', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 3', topic: 'LU-10 Merge Cells', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },

  // Module 4: Electronic Presentations (6 LUs)
  { module: 'Module 4', topic: 'LU-1 Prepare Master Slide', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 4', topic: 'LU-2 Insert Slides', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 4', topic: 'LU-3 Design Slide', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 4', topic: 'LU-4 Apply Animation', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 4', topic: 'LU-5 Apply Sound Effects', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
  { module: 'Module 4', topic: 'LU-6 Format Slide', theoryHours: 1, practicalHours: 4, remarks: 'Completed successfully with practical session' },
];

/**
 * 75 Authentic GBHS Jam Yousuf Colony Student Master Roster
 */
export const JAM_YOUSUF_STUDENTS_RAW: Array<{
  name: string;
  fatherName: string;
  class: ClassLevel;
  rollNo: string;
  admissionNo: string;
  gender: string;
  dob: string;
  district: string;
  schoolName: string;
  trade: string;
}> = [
  // Class 7 (25 students)
  { name: 'Nadir Ali', fatherName: 'Mehrullah', class: 'Class 7', rollNo: '1', admissionNo: 'GBHS-701', gender: 'Male', dob: '2012-06-20', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Muhammad Imran', fatherName: 'Abdul Gani', class: 'Class 7', rollNo: '2', admissionNo: 'GBHS-702', gender: 'Male', dob: '2017-03-21', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Qabeer Ahmed', fatherName: 'Abdullah', class: 'Class 7', rollNo: '3', admissionNo: 'GBHS-703', gender: 'Male', dob: '2015-08-05', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Amanullah', fatherName: 'Shafi Muhammad', class: 'Class 7', rollNo: '4', admissionNo: 'GBHS-704', gender: 'Male', dob: '2013-05-15', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Zohaib Hassan', fatherName: 'Ghulam Rasool', class: 'Class 7', rollNo: '5', admissionNo: 'GBHS-705', gender: 'Male', dob: '2014-04-10', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Farhan Ali', fatherName: 'Muhammad Hashim', class: 'Class 7', rollNo: '6', admissionNo: 'GBHS-706', gender: 'Male', dob: '2013-09-12', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Bilal Ahmed', fatherName: 'Abdul Sattar', class: 'Class 7', rollNo: '7', admissionNo: 'GBHS-707', gender: 'Male', dob: '2014-01-18', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Sajid Hussain', fatherName: 'Khuda Bakhsh', class: 'Class 7', rollNo: '8', admissionNo: 'GBHS-708', gender: 'Male', dob: '2012-11-25', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Yasir Khan', fatherName: 'Noor Muhammad', class: 'Class 7', rollNo: '9', admissionNo: 'GBHS-709', gender: 'Male', dob: '2013-03-08', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Danish Ali', fatherName: 'Muhammad Anwar', class: 'Class 7', rollNo: '10', admissionNo: 'GBHS-710', gender: 'Male', dob: '2014-07-22', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Shahid Murad', fatherName: 'Murad Bakhsh', class: 'Class 7', rollNo: '11', admissionNo: 'GBHS-711', gender: 'Male', dob: '2012-10-14', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Adnan Tariq', fatherName: 'Tariq Mehmood', class: 'Class 7', rollNo: '12', admissionNo: 'GBHS-712', gender: 'Male', dob: '2013-12-05', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Waleed Raza', fatherName: 'Muhammad Raza', class: 'Class 7', rollNo: '13', admissionNo: 'GBHS-713', gender: 'Male', dob: '2014-02-28', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Asadullah', fatherName: 'Faiz Muhammad', class: 'Class 7', rollNo: '14', admissionNo: 'GBHS-714', gender: 'Male', dob: '2013-06-19', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Zubair Ahmed', fatherName: 'Ghulam Qadir', class: 'Class 7', rollNo: '15', admissionNo: 'GBHS-715', gender: 'Male', dob: '2012-08-30', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Rizwan Ali', fatherName: 'Ali Bakhsh', class: 'Class 7', rollNo: '16', admissionNo: 'GBHS-716', gender: 'Male', dob: '2014-05-11', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Hamza Khan', fatherName: 'Gul Khan', class: 'Class 7', rollNo: '17', admissionNo: 'GBHS-717', gender: 'Male', dob: '2013-04-03', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Noman Bashir', fatherName: 'Bashir Ahmed', class: 'Class 7', rollNo: '18', admissionNo: 'GBHS-718', gender: 'Male', dob: '2014-09-17', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Shahzaib', fatherName: 'Abdul Hameed', class: 'Class 7', rollNo: '19', admissionNo: 'GBHS-719', gender: 'Male', dob: '2013-01-24', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Arsalan', fatherName: 'Muhammad Ishaq', class: 'Class 7', rollNo: '20', admissionNo: 'GBHS-720', gender: 'Male', dob: '2014-06-08', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Umair Ali', fatherName: 'Liaquat Ali', class: 'Class 7', rollNo: '21', admissionNo: 'GBHS-721', gender: 'Male', dob: '2012-12-16', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Faisal Mehmood', fatherName: 'Mehmood Khan', class: 'Class 7', rollNo: '22', admissionNo: 'GBHS-722', gender: 'Male', dob: '2013-07-29', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Kashif Raza', fatherName: 'Raza Muhammad', class: 'Class 7', rollNo: '23', admissionNo: 'GBHS-723', gender: 'Male', dob: '2014-03-14', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Salman Ahmed', fatherName: 'Mushtaq Ahmed', class: 'Class 7', rollNo: '24', admissionNo: 'GBHS-724', gender: 'Male', dob: '2013-10-09', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Taimoor Shah', fatherName: 'Alam Shah', class: 'Class 7', rollNo: '25', admissionNo: 'GBHS-725', gender: 'Male', dob: '2014-08-01', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },

  // Class 8 (23 students)
  { name: 'Pervaiz Ali', fatherName: 'Mehrullah', class: 'Class 8', rollNo: '1', admissionNo: 'GBHS-801', gender: 'Male', dob: '2011-10-25', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Nisar Ali', fatherName: 'Mehrullah', class: 'Class 8', rollNo: '2', admissionNo: 'GBHS-802', gender: 'Male', dob: '2012-04-12', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Waseem Akram', fatherName: 'Muhammad Akram', class: 'Class 8', rollNo: '3', admissionNo: 'GBHS-803', gender: 'Male', dob: '2011-08-15', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Majid Khan', fatherName: 'Ghulam Nabi', class: 'Class 8', rollNo: '4', admissionNo: 'GBHS-804', gender: 'Male', dob: '2012-02-20', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Jameel Ahmed', fatherName: 'Taj Muhammad', class: 'Class 8', rollNo: '5', admissionNo: 'GBHS-805', gender: 'Male', dob: '2011-12-10', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Tariq Aziz', fatherName: 'Azizullah', class: 'Class 8', rollNo: '6', admissionNo: 'GBHS-806', gender: 'Male', dob: '2012-06-18', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Babar Ali', fatherName: 'Sher Muhammad', class: 'Class 8', rollNo: '7', admissionNo: 'GBHS-807', gender: 'Male', dob: '2011-09-05', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Shoaib Akhtar', fatherName: 'Akhtar Hussain', class: 'Class 8', rollNo: '8', admissionNo: 'GBHS-808', gender: 'Male', dob: '2012-01-30', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Zahid Iqbal', fatherName: 'Muhammad Iqbal', class: 'Class 8', rollNo: '9', admissionNo: 'GBHS-809', gender: 'Male', dob: '2011-11-14', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Farooq Abdullah', fatherName: 'Abdullah Jan', class: 'Class 8', rollNo: '10', admissionNo: 'GBHS-810', gender: 'Male', dob: '2012-07-22', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Naveed Ur Rehman', fatherName: 'Atta Ur Rehman', class: 'Class 8', rollNo: '11', admissionNo: 'GBHS-811', gender: 'Male', dob: '2011-05-19', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Imtiaz Ali', fatherName: 'Barkat Ali', class: 'Class 8', rollNo: '12', admissionNo: 'GBHS-812', gender: 'Male', dob: '2012-03-27', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Irfan Ullah', fatherName: 'Kifayat Ullah', class: 'Class 8', rollNo: '13', admissionNo: 'GBHS-813', gender: 'Male', dob: '2011-07-08', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Adeel Hassan', fatherName: 'Hassan Bakhsh', class: 'Class 8', rollNo: '14', admissionNo: 'GBHS-814', gender: 'Male', dob: '2012-09-11', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Munir Ahmed', fatherName: 'Rasool Bakhsh', class: 'Class 8', rollNo: '15', admissionNo: 'GBHS-815', gender: 'Male', dob: '2011-04-16', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Kamal Khan', fatherName: 'Dost Muhammad', class: 'Class 8', rollNo: '16', admissionNo: 'GBHS-816', gender: 'Male', dob: '2012-11-03', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Shahbaz Sharif', fatherName: 'Muhammad Sharif', class: 'Class 8', rollNo: '17', admissionNo: 'GBHS-817', gender: 'Male', dob: '2011-08-29', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Tanveer Abbas', fatherName: 'Ghulam Abbas', class: 'Class 8', rollNo: '18', admissionNo: 'GBHS-818', gender: 'Male', dob: '2012-05-24', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Zeeshan Ali', fatherName: 'Liaquat Ali', class: 'Class 8', rollNo: '19', admissionNo: 'GBHS-819', gender: 'Male', dob: '2011-06-13', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Mudassir Nazar', fatherName: 'Nazar Muhammad', class: 'Class 8', rollNo: '20', admissionNo: 'GBHS-820', gender: 'Male', dob: '2012-08-17', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Saqib Javed', fatherName: 'Javed Iqbal', class: 'Class 8', rollNo: '21', admissionNo: 'GBHS-821', gender: 'Male', dob: '2011-12-31', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Ahsan Raza', fatherName: 'Hussain Raza', class: 'Class 8', rollNo: '22', admissionNo: 'GBHS-822', gender: 'Male', dob: '2012-02-14', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Moazzam Ali', fatherName: 'Faiz Ali', class: 'Class 8', rollNo: '23', admissionNo: 'GBHS-823', gender: 'Male', dob: '2011-10-06', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },

  // Class 9 (27 students)
  { name: 'Zaman ul Allah', fatherName: 'Akram Bakhsh', class: 'Class 9', rollNo: '1', admissionNo: 'GBHS-901', gender: 'Male', dob: '2014-04-07', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Kamran Ali', fatherName: 'Ghulam Muhammad', class: 'Class 9', rollNo: '2', admissionNo: 'GBHS-902', gender: 'Male', dob: '2010-08-19', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Fida Hussain', fatherName: 'Faiz Muhammad', class: 'Class 9', rollNo: '3', admissionNo: 'GBHS-903', gender: 'Male', dob: '2010-04-01', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Muhammad Yaseen', fatherName: 'Ghulam Muhammad', class: 'Class 9', rollNo: '4', admissionNo: 'GBHS-904', gender: 'Male', dob: '2010-11-15', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Shahid Latif', fatherName: 'Abdul Latif', class: 'Class 9', rollNo: '5', admissionNo: 'GBHS-905', gender: 'Male', dob: '2011-03-22', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Rehan Qureshi', fatherName: 'Abdul Quddus', class: 'Class 9', rollNo: '6', admissionNo: 'GBHS-906', gender: 'Male', dob: '2010-06-30', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Asif Mehmood', fatherName: 'Mehmood Ul Hassan', class: 'Class 9', rollNo: '7', admissionNo: 'GBHS-907', gender: 'Male', dob: '2011-01-18', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Khurram Shehzad', fatherName: 'Shehzad Khan', class: 'Class 9', rollNo: '8', admissionNo: 'GBHS-908', gender: 'Male', dob: '2010-09-25', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Noman Riaz', fatherName: 'Riaz Ahmed', class: 'Class 9', rollNo: '9', admissionNo: 'GBHS-909', gender: 'Male', dob: '2011-05-12', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Waqas Ali', fatherName: 'Shaukat Ali', class: 'Class 9', rollNo: '10', admissionNo: 'GBHS-910', gender: 'Male', dob: '2010-07-04', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Usman Ghani', fatherName: 'Ghani Bakhsh', class: 'Class 9', rollNo: '11', admissionNo: 'GBHS-911', gender: 'Male', dob: '2011-02-17', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Saad Ur Rehman', fatherName: 'Khalid Mehmood', class: 'Class 9', rollNo: '12', admissionNo: 'GBHS-912', gender: 'Male', dob: '2010-02-14', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Ahmad Raza', fatherName: 'Muhammad Raza', class: 'Class 9', rollNo: '13', admissionNo: 'GBHS-913', gender: 'Male', dob: '2010-11-20', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Haris Sohail', fatherName: 'Sohail Anwar', class: 'Class 9', rollNo: '14', admissionNo: 'GBHS-914', gender: 'Male', dob: '2011-08-09', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Bilawal Bhutto', fatherName: 'Zulfiqar Ali', class: 'Class 9', rollNo: '15', admissionNo: 'GBHS-915', gender: 'Male', dob: '2010-10-11', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Faizan Mustafa', fatherName: 'Ghulam Mustafa', class: 'Class 9', rollNo: '16', admissionNo: 'GBHS-916', gender: 'Male', dob: '2011-04-28', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Mohsin Abbas', fatherName: 'Qamar Abbas', class: 'Class 9', rollNo: '17', admissionNo: 'GBHS-917', gender: 'Male', dob: '2010-12-03', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Zain Ul Abideen', fatherName: 'Muhammad Arif', class: 'Class 9', rollNo: '18', admissionNo: 'GBHS-918', gender: 'Male', dob: '2011-09-14', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Hamid Gul', fatherName: 'Gul Muhammad', class: 'Class 9', rollNo: '19', admissionNo: 'GBHS-919', gender: 'Male', dob: '2010-05-23', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Owais Qarni', fatherName: 'Abdul Majeed', class: 'Class 9', rollNo: '20', admissionNo: 'GBHS-920', gender: 'Male', dob: '2011-06-15', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Shayan Ahmed', fatherName: 'Niaz Ahmed', class: 'Class 9', rollNo: '21', admissionNo: 'GBHS-921', gender: 'Male', dob: '2010-03-16', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Tahir Mehmood', fatherName: 'Mehmood Alam', class: 'Class 9', rollNo: '22', admissionNo: 'GBHS-922', gender: 'Male', dob: '2011-07-27', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Junaid Jamshed', fatherName: 'Jamshed Khan', class: 'Class 9', rollNo: '23', admissionNo: 'GBHS-923', gender: 'Male', dob: '2010-01-29', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Danish Nawaz', fatherName: 'Rab Nawaz', class: 'Class 9', rollNo: '24', admissionNo: 'GBHS-924', gender: 'Male', dob: '2011-10-19', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Ammar Yasir', fatherName: 'Yasir Arafat', class: 'Class 9', rollNo: '25', admissionNo: 'GBHS-925', gender: 'Male', dob: '2010-09-02', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Ibrahim Khalil', fatherName: 'Khalil Ahmed', class: 'Class 9', rollNo: '26', admissionNo: 'GBHS-926', gender: 'Male', dob: '2011-03-08', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
  { name: 'Yousuf Khan', fatherName: 'Ayub Khan', class: 'Class 9', rollNo: '27', admissionNo: 'GBHS-927', gender: 'Male', dob: '2010-07-12', district: 'Lasbela', schoolName: 'GBHS Jam Yousf Colony', trade: 'Computer Operator' },
];

/**
 * Generates all school working days (Monday-Saturday, skipping Sunday) between startStr and endStr inclusive.
 */
export function getSchoolDays(startStr = '2026-03-02', endStr = '2026-10-20'): Array<{ dateStr: string; dayName: string }> {
  const days: Array<{ dateStr: string; dayName: string }> = [];
  const cur = new Date(startStr + 'T12:00:00Z');
  const end = new Date(endStr + 'T12:00:00Z');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  while (cur <= end) {
    const dayOfWeek = cur.getUTCDay();
    if (dayOfWeek !== 0) { // Skip Sunday
      days.push({
        dateStr: cur.toISOString().split('T')[0],
        dayName: dayNames[dayOfWeek],
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/**
 * Deterministic hash-based attendance status calculator
 */
export function getDeterministicAttendanceStatus(studentId: string, dateStr: string): AttendanceStatus {
  let hash = 0;
  const str = `${studentId}:${dateStr}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const val = Math.abs(hash) % 100;
  if (val < 92) return 'Present';  // 92% Present
  if (val < 97) return 'Absent';   // 5% Absent
  if (val < 99) return 'Leave';    // 2% Leave
  return 'Late';                   // 1% Late
}

/**
 * Generate 200 sequential curriculum lecture logs from March 2, 2026 to October 20, 2026
 */
export function generateHistoricalTeachingLogs(
  activeStudents: Student[],
  startStr = '2026-03-02',
  endStr = '2026-10-20',
  instructorName = 'Engr. Imran Tareen'
): TeachingLogEntry[] {
  const schoolDays = getSchoolDays(startStr, endStr);
  const classes: ClassLevel[] = ['Class 7', 'Class 8', 'Class 9'];
  const logs: TeachingLogEntry[] = [];

  for (let i = 0; i < schoolDays.length; i++) {
    const day = schoolDays[i];
    const classLevel = classes[i % 3];
    const lu = HISTORICAL_CURRICULUM_LUS[i % HISTORICAL_CURRICULUM_LUS.length];
    const nextLu = HISTORICAL_CURRICULUM_LUS[(i + 1) % HISTORICAL_CURRICULUM_LUS.length];

    const classStudents = activeStudents.filter((s) => s.class === classLevel);
    const totalReg = classStudents.length > 0 ? classStudents.length : (classLevel === 'Class 7' ? 25 : classLevel === 'Class 8' ? 23 : 27);
    const studentsPresent = Math.max(1, Math.round(totalReg * 0.92));
    const studentsCompleting = Math.max(1, studentsPresent - 2);
    const studentsNeedingHelp = Math.max(0, studentsPresent - studentsCompleting);

    logs.push({
      id: crypto.randomUUID(),
      date: day.dateStr,
      day: day.dayName,
      class: classLevel,
      subjectTopic: `${lu.module}: ${lu.topic}`,
      learningObjectives: `Competency development and practical skills execution for ${lu.topic} according to NAVTTC standards.`,
      theoryCovered: `Theoretical principles, architecture, safety rules, and operating procedures of ${lu.topic} (${lu.theoryHours} hr).`,
      practicalActivity: `Hands-on practical workstation lab exercise executing ${lu.topic} (${lu.practicalHours} hrs).`,
      totalRegistered: totalReg,
      studentsPresent,
      studentsCompletingTask: studentsCompleting,
      studentsNeedingHelp,
      teachingMethod: 'Demonstration & Hands-on Lab',
      issueChallenge: lu.remarks || 'Completed successfully with practical session',
      evidenceFileName: `Lab_${classLevel.replace(/\s+/g, '')}_${day.dateStr}.jpg`,
      nextLesson: `${nextLu.module}: ${nextLu.topic}`,
      instructorName,
      version: 1,
      createdAt: `${day.dateStr}T09:00:00.000Z`,
      updatedAt: `${day.dateStr}T14:00:00.000Z`,
    });
  }

  return logs;
}

/**
 * Generate historical daily attendance records for all active students across all school days
 */
export function generateHistoricalAttendance(
  activeStudents: Student[],
  startStr = '2026-03-02',
  endStr = '2026-10-20',
  userEmail = 's.engrimrantareen@gmail.com'
): AttendanceRecord[] {
  const schoolDays = getSchoolDays(startStr, endStr);
  const records: AttendanceRecord[] = [];

  for (const day of schoolDays) {
    for (const student of activeStudents) {
      records.push({
        id: `${student.id}_${day.dateStr}`,
        studentId: student.id,
        studentName: student.name,
        rollNo: student.rollNo,
        class: student.class,
        section: student.section || 'A',
        date: day.dateStr,
        status: getDeterministicAttendanceStatus(student.id, day.dateStr),
        version: 1,
        updatedAt: `${day.dateStr}T14:00:00.000Z`,
        schoolId: 'GBHS-MAIN',
        markedBy: userEmail,
      });
    }
  }

  return records;
}

/**
 * Sample practical skill assessments from March 2026
 */
export const SAMPLE_PRACTICALS_PRESETS: PracticalProgressEntry[] = [
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-03',
    registrationId: '1',
    studentName: 'Nadir Ali',
    class: 'Class 7',
    skillTask: 'Touch Typing Speed & Accuracy Test 1',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 78,
    skillStatus: 'Competent',
    weakArea: 'Shift Key & Number Row',
    remedialPracticeRequired: 'No',
    reassessmentDate: '2026-03-17',
    evidenceFile: 'typing_test_nadir.pdf',
    instructorRemarks: 'Good finger placement on home row. Target 25 WPM in next trial.',
    version: 1,
    createdAt: '2026-03-03T10:00:00.000Z',
    updatedAt: '2026-03-03T10:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-03',
    registrationId: '2',
    studentName: 'Muhammad Imran',
    class: 'Class 7',
    skillTask: 'Windows File Management & Folder Hierarchy',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 88,
    skillStatus: 'Proficient',
    weakArea: 'None',
    remedialPracticeRequired: 'No',
    reassessmentDate: '',
    evidenceFile: 'folder_structure_imran.png',
    instructorRemarks: 'Excellent mastery of folder creation, cut, copy, paste, and renaming.',
    version: 1,
    createdAt: '2026-03-03T10:00:00.000Z',
    updatedAt: '2026-03-03T10:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-04',
    registrationId: '3',
    studentName: 'Qabeer Ahmed',
    class: 'Class 7',
    skillTask: 'Hardware Cable Connection & Safe Shutdown',
    attemptNumber: 2,
    practicalCompleted: 'In Progress',
    scoreMarks: 58,
    skillStatus: 'Needs Improvement',
    weakArea: 'Distinguishing HDMI vs VGA ports and power sequencing',
    remedialPracticeRequired: 'Yes',
    reassessmentDate: '2026-03-11',
    evidenceFile: '',
    instructorRemarks: 'Scheduled for 15-minute 1-on-1 practical lab refresher.',
    version: 1,
    createdAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-04',
    registrationId: '1',
    studentName: 'Pervaiz Ali',
    class: 'Class 8',
    skillTask: 'MS Word Table Creation & Cell Formatting',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 82,
    skillStatus: 'Proficient',
    weakArea: 'Border Shading Color Picker',
    remedialPracticeRequired: 'No',
    reassessmentDate: '',
    evidenceFile: 'table_pervaiz.docx',
    instructorRemarks: 'Clean tabular structure with properly aligned headers.',
    version: 1,
    createdAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-04',
    registrationId: '2',
    studentName: 'Nisar Ali',
    class: 'Class 8',
    skillTask: 'Official Application Letter Formatting in Word',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 74,
    skillStatus: 'Competent',
    weakArea: 'Tab Stops & Margin Spacing',
    remedialPracticeRequired: 'No',
    reassessmentDate: '',
    evidenceFile: 'letter_nisar.docx',
    instructorRemarks: 'Well written application. Just needs adjustment in right margin.',
    version: 1,
    createdAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-05',
    registrationId: '5',
    studentName: 'Jameel Ahmed',
    class: 'Class 8',
    skillTask: 'Header, Footer & Page Numbering in Word',
    attemptNumber: 1,
    practicalCompleted: 'No',
    scoreMarks: 45,
    skillStatus: 'Needs Improvement',
    weakArea: 'Different First Page option & Footer positioning',
    remedialPracticeRequired: 'Yes',
    reassessmentDate: '2026-03-12',
    evidenceFile: '',
    instructorRemarks: 'Guided remedial practice required during Friday free lab period.',
    version: 1,
    createdAt: '2026-03-05T10:00:00.000Z',
    updatedAt: '2026-03-05T10:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-05',
    registrationId: '1',
    studentName: 'Zaman ul Allah',
    class: 'Class 9',
    skillTask: 'Excel Formulas: SUM, AVERAGE, IF Condition',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 94,
    skillStatus: 'Proficient',
    weakArea: 'None',
    remedialPracticeRequired: 'No',
    reassessmentDate: '',
    evidenceFile: 'marksheet_zaman.xlsx',
    instructorRemarks: 'Outstanding understanding of nested formulas and cell formatting.',
    version: 1,
    createdAt: '2026-03-05T10:00:00.000Z',
    updatedAt: '2026-03-05T10:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-05',
    registrationId: '2',
    studentName: 'Kamran Ali',
    class: 'Class 9',
    skillTask: 'Excel Conditional Formatting & Sorting',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 86,
    skillStatus: 'Proficient',
    weakArea: 'Color Scale Thresholds',
    remedialPracticeRequired: 'No',
    reassessmentDate: '',
    evidenceFile: 'sorting_kamran.xlsx',
    instructorRemarks: 'Mastered both ascending and descending multi-column sorts.',
    version: 1,
    createdAt: '2026-03-05T10:00:00.000Z',
    updatedAt: '2026-03-05T10:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    assessmentDate: '2026-03-06',
    registrationId: '3',
    studentName: 'Fida Hussain',
    class: 'Class 9',
    skillTask: 'Excel Chart Creation (Column & Pie)',
    attemptNumber: 1,
    practicalCompleted: 'Yes',
    scoreMarks: 68,
    skillStatus: 'Competent',
    weakArea: 'Chart Title and Legend positioning',
    remedialPracticeRequired: 'Yes',
    reassessmentDate: '2026-03-13',
    evidenceFile: 'chart_fida.xlsx',
    instructorRemarks: 'Charts plotted correctly; requires practice on data labels formatting.',
    version: 1,
    createdAt: '2026-03-06T10:00:00.000Z',
    updatedAt: '2026-03-06T10:00:00.000Z',
  },
];

/**
 * Sample absentee follow-up records from March 2026
 */
export const SAMPLE_FOLLOWUPS_PRESETS: AbsenteeFollowupEntry[] = [
  {
    id: crypto.randomUUID(),
    date: '2026-03-04',
    registrationId: '3',
    studentName: 'Qabeer Ahmed',
    class: 'Class 7',
    absenceCount: 3,
    followupReason: 'Illness / Medical (Fever)',
    actionTaken: 'Phone Call to Guardian',
    contactPerson: 'Father (Abdullah)',
    responseReceived: 'Father confirmed student was having high fever; doctor advised 2 days bed rest.',
    expectedReturnDate: '2026-03-09',
    followupDate: '2026-03-04',
    currentStatus: 'Resolved / Returned',
    managementReferral: 'No',
    remarks: 'Student rejoined on Monday with medical note.',
    version: 1,
    createdAt: '2026-03-04T11:00:00.000Z',
    updatedAt: '2026-03-04T11:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    date: '2026-03-05',
    registrationId: '2',
    studentName: 'Muhammad Imran',
    class: 'Class 7',
    absenceCount: 2,
    followupReason: 'Family Emergency (Visiting Village)',
    actionTaken: 'WhatsApp Message to Guardian',
    contactPerson: 'Father (Abdul Gani)',
    responseReceived: 'Attending family ceremony in native village; will return by weekend.',
    expectedReturnDate: '2026-03-09',
    followupDate: '2026-03-05',
    currentStatus: 'Resolved / Returned',
    managementReferral: 'No',
    remarks: 'Confirmed return.',
    version: 1,
    createdAt: '2026-03-05T11:00:00.000Z',
    updatedAt: '2026-03-05T11:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    date: '2026-03-05',
    registrationId: '5',
    studentName: 'Jameel Ahmed',
    class: 'Class 8',
    absenceCount: 4,
    followupReason: 'Unexcused Absence',
    actionTaken: 'Phone Call to Guardian & Written Notice',
    contactPerson: 'Father (Taj Muhammad)',
    responseReceived: 'Father was unaware of absence; expressed concern and assured strict attendance.',
    expectedReturnDate: '2026-03-09',
    followupDate: '2026-03-05',
    currentStatus: 'Pending Return',
    managementReferral: 'Yes',
    remarks: 'Referred to Headmaster attendance committee for counseling.',
    version: 1,
    createdAt: '2026-03-05T11:00:00.000Z',
    updatedAt: '2026-03-05T11:00:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    date: '2026-03-06',
    registrationId: '4',
    studentName: 'Muhammad Yaseen',
    class: 'Class 9',
    absenceCount: 2,
    followupReason: 'Transportation Issue (Flash Flooding on Route)',
    actionTaken: 'Phone Call to Guardian',
    contactPerson: 'Father (Ghulam Muhammad)',
    responseReceived: 'Road crossing was temporarily submerged due to rainfall; water receded.',
    expectedReturnDate: '2026-03-09',
    followupDate: '2026-03-06',
    currentStatus: 'Resolved / Returned',
    managementReferral: 'No',
    remarks: 'Normal transportation restored.',
    version: 1,
    createdAt: '2026-03-06T11:00:00.000Z',
    updatedAt: '2026-03-06T11:00:00.000Z',
  },
];

/**
 * Execute the Historical Curriculum & Attendance Backfill (March 2, 2026 - October 20, 2026)
 * Specifically for the Master Owner workspace.
 */
export async function backfillHistoricalDataForOwner(
  userEmail: string,
  ownerId: string,
  force = false
): Promise<{
  studentsCount: number;
  teachingLogsCount: number;
  attendanceCount: number;
  practicalsCount: number;
  followupsCount: number;
}> {
  const isMasterOwner = isMasterOwnerEmail(userEmail);
  if (!isMasterOwner) {
    throw new Error('Historical backfill is strictly reserved for the Master Owner account.');
  }

  const isAlreadyBackfilled = await getAppState<boolean>('owner_historical_backfilled_v2');
  if (isAlreadyBackfilled && !force) {
    const students = await getAllStudents();
    const logs = await getAllTeachingLogs();
    const att = await getAllAttendanceRecords();
    return {
      studentsCount: students.length,
      teachingLogsCount: logs.length,
      attendanceCount: att.length,
      practicalsCount: 9,
      followupsCount: 4,
    };
  }

  // 1. Ensure students exist in the workspace. If empty, seed the authentic 75 Jam Yousuf students.
  let currentStudents = await getAllStudents();
  if (currentStudents.length === 0) {
    const nowIso = new Date().toISOString();
    const studentsToSave: Student[] = JAM_YOUSUF_STUDENTS_RAW.map((raw) => ({
      id: crypto.randomUUID(),
      name: raw.name,
      fatherName: raw.fatherName,
      class: raw.class,
      rollNo: raw.rollNo,
      admissionNo: raw.admissionNo,
      gender: raw.gender,
      dob: raw.dob,
      section: 'A',
      phone: `0300${Math.floor(1000000 + Math.random() * 9000000)}`,
      district: raw.district,
      schoolName: raw.schoolName,
      trade: raw.trade,
      status: 'Active',
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      schoolId: 'GBHS-MAIN',
      createdBy: userEmail,
      owner_id: ownerId,
      ownerId: ownerId,
    }));
    await bulkSaveStudentsLocally(studentsToSave);
    currentStudents = studentsToSave;
  }

  // 2. Generate and save the 200 sequential teaching logs (Mon-Sat from March 2, 2026 to October 20, 2026)
  const logsToSave = generateHistoricalTeachingLogs(
    currentStudents,
    '2026-03-02',
    '2026-10-20',
    'Engr. Imran Tareen'
  );
  await bulkSaveTeachingLogsLocally(logsToSave);

  // 3. Generate and save the historical attendance records (Mon-Sat from March 2, 2026 to October 20, 2026)
  const attendanceToSave = generateHistoricalAttendance(
    currentStudents,
    '2026-03-02',
    '2026-10-20',
    userEmail
  );
  await bulkSaveAttendanceLocally(attendanceToSave);

  // 4. Save sample practical progress and absentee followups for the Master Owner
  await bulkSavePracticalProgressLocally(SAMPLE_PRACTICALS_PRESETS);
  await bulkSaveAbsenteeFollowupsLocally(SAMPLE_FOLLOWUPS_PRESETS);

  // 5. Update state flags
  await setAppState('owner_historical_backfilled_v2', true);
  await setAppState('modules_seeded_v1', true);
  await setAppState('auto_seed_disabled', false); // Allow owner to maintain their backfilled data
  await setAppState('modules_mock_cleared_v1', false); // Explicitly reverse mock wipe for owner

  return {
    studentsCount: currentStudents.length,
    teachingLogsCount: logsToSave.length,
    attendanceCount: attendanceToSave.length,
    practicalsCount: SAMPLE_PRACTICALS_PRESETS.length,
    followupsCount: SAMPLE_FOLLOWUPS_PRESETS.length,
  };
}
