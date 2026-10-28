import { ClassLevel } from './student';

export interface TeachingLogEntry {
  id: string; // UUID
  date: string; // YYYY-MM-DD
  day: string; // Monday, Tuesday, etc.
  class: ClassLevel; // Class 1 to Class 10
  subjectTopic: string;
  learningObjectives: string;
  theoryCovered: string;
  practicalActivity: string;
  totalRegistered: number;
  studentsPresent: number;
  studentsCompletingTask: number;
  studentsNeedingHelp: number;
  teachingMethod: string;
  issueChallenge?: string;
  evidenceFileName?: string;
  nextLesson?: string;
  instructorName: string;
  owner_id?: string;
  ownerId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type SkillStatus = 'Proficient' | 'Competent' | 'Needs Improvement' | 'Not Started';
export type PracticalCompletedStatus = 'Yes' | 'No' | 'In Progress';

export interface PracticalProgressEntry {
  id: string; // UUID
  assessmentDate: string; // YYYY-MM-DD
  studentId?: string;
  registrationId: string; // Roll No or Admission No
  studentName: string;
  class: ClassLevel; // Class 1 to Class 10
  skillTask: string; // e.g. Typing Speed, MS Word, Excel Formulas
  attemptNumber: number; // 1, 2, 3...
  practicalCompleted: PracticalCompletedStatus;
  scoreMarks: number; // 0 - 100
  skillStatus: SkillStatus;
  weakArea?: string;
  remedialPracticeRequired: 'Yes' | 'No';
  reassessmentDate?: string;
  evidenceFile?: string;
  instructorRemarks?: string;
  owner_id?: string;
  ownerId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type FollowupStatus = 'Pending Return' | 'Resolved / Returned' | 'Escalated' | 'Prolonged Leave';

export interface AbsenteeFollowupEntry {
  id: string; // UUID
  date: string; // YYYY-MM-DD
  studentId?: string;
  registrationId: string; // Roll No or Admission No
  studentName: string;
  class: ClassLevel; // Class 1 to Class 10
  absenceCount: number; // Consecutive or total days absent
  followupReason: string; // Illness, Family Emergency, Village visit, etc.
  actionTaken: string; // Phone Call, Home Visit, WhatsApp notice
  contactPerson: string; // Father, Mother, Guardian
  responseReceived: string; // Parent/Guardian reply
  expectedReturnDate?: string; // YYYY-MM-DD
  followupDate: string; // YYYY-MM-DD
  currentStatus: FollowupStatus;
  managementReferral: 'Yes' | 'No';
  remarks?: string;
  owner_id?: string;
  ownerId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
