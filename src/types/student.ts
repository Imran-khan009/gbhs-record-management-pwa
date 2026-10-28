export type ClassLevel =
  | 'Class 1'
  | 'Class 2'
  | 'Class 3'
  | 'Class 4'
  | 'Class 5'
  | 'Class 6'
  | 'Class 7'
  | 'Class 8'
  | 'Class 9'
  | 'Class 10'
  | string;
export type Section = 'A' | 'B' | 'C' | 'General';
export type StudentStatus = 'Active' | 'Inactive' | 'Withdrawn' | 'Transferred';

export interface Student {
  id: string; // Stable UUID (client-generated)

  // Strictly standardized 13 fields matching official register
  serialNo?: string; // 1. S# (Serial Number)
  rollNo: string; // 2. Roll Num (Roll Number)
  district?: string; // 3. District
  schoolName?: string; // 4. School Name
  trade?: string; // 5. Trade
  name: string; // 6. Name of Learner
  fatherName: string; // 7. Father Name
  gender?: 'Male' | 'Female' | 'Other' | string; // 8. Gender
  dob?: string; // 9. DOB (Date of Birth)
  class: ClassLevel; // 10. Class
  dateOfCenterBeginning?: string; // 11. Date of Center Beginning
  guardianContact?: string; // 12. Guardian Contact
  registeredStatus?: string; // 13. Registerd

  // System & compatibility attributes
  admissionNo: string;
  section: Section;
  phone: string; // Synced with guardianContact
  address?: string;
  status: StudentStatus; // Synced with registeredStatus

  // Lifecycle & history attributes
  withdrawalReason?: string;
  withdrawnDate?: string;
  transferDetails?: string;
  transferredDate?: string;
  replacedStudentId?: string; // ID of student this student replaced
  replacementStudentId?: string; // ID of student who replaced this student

  admissionDate?: string;
  bFormNo?: string;
  fatherCnic?: string;
  fatherOccupation?: string;
  caste?: string;
  religion?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  permanentAddress?: string;
  previousSchool?: string;
  previousClass?: string;
  slcNo?: string;
  guardianName?: string;
  guardianRelation?: string;
  identificationMark?: string;
  monthlyIncome?: string;
  mediumOfInstruction?: string;
  remarks?: string;

  version: number; // Incrementing version for conflict detection
  updatedAt: string; // ISO 8601
  createdAt: string; // ISO 8601
  schoolId: string;
  createdBy: string;
  owner_id?: string;
  ownerId?: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Leave' | 'Late';

export interface AttendanceRecord {
  id: string; // Stable composite UUID: `${studentId}_${date}`
  studentId: string;
  studentName: string;
  rollNo: string;
  class: ClassLevel;
  section: Section;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  remarks?: string;
  version: number;
  updatedAt: string;
  schoolId: string;
  markedBy: string;
  owner_id?: string;
  ownerId?: string;
}

export interface StudentImportRow {
  rowNumber: number;

  // 13 Official Register Columns
  serialNo?: string; // 1. S#
  rollNo: string; // 2. Roll Num
  district?: string; // 3. District
  schoolName?: string; // 4. School Name
  trade?: string; // 5. Trade
  name: string; // 6. Name of Learner
  fatherName: string; // 7. Father Name
  gender?: 'Male' | 'Female' | 'Other' | string; // 8. Gender
  dob?: string; // 9. DOB
  class: ClassLevel; // 10. Class
  dateOfCenterBeginning?: string; // 11. Date of Center Beginning
  guardianContact?: string; // 12. Guardian Contact
  registeredStatus?: string; // 13. Registerd

  admissionNo: string;
  section: Section;
  phone: string;
  address?: string;
  status: StudentStatus;

  admissionDate?: string;
  bFormNo?: string;
  fatherCnic?: string;
  fatherOccupation?: string;
  caste?: string;
  religion?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  permanentAddress?: string;
  previousSchool?: string;
  previousClass?: string;
  slcNo?: string;
  guardianName?: string;
  guardianRelation?: string;
  identificationMark?: string;
  monthlyIncome?: string;
  mediumOfInstruction?: string;
  remarks?: string;

  validationErrors: string[];
  isDuplicate: boolean;
  duplicateReason?: string;
  selected: boolean;
  isExistingStudent?: boolean;
  existingStudentId?: string;
  actionType?: 'create' | 'update';
  hasPlaceholderRoll?: boolean;
  hasPlaceholderContact?: boolean;
  exclusionReason?: string;
  isBlankRoll?: boolean;
  isAmbiguousMatch?: boolean;
}

