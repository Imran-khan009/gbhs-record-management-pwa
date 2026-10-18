import * as XLSX from 'xlsx';
import { ClassLevel } from '../types/student';
import {
  TeachingLogEntry,
  PracticalProgressEntry,
  AbsenteeFollowupEntry,
} from '../types/modules';
import {
  getAllTeachingLogs,
  getTeachingLogsByClass,
  saveTeachingLogLocally,
  deleteTeachingLogLocally,
  bulkSaveTeachingLogsLocally,
  getAllPracticalProgress,
  getPracticalProgressByClass,
  savePracticalProgressLocally,
  deletePracticalProgressLocally,
  bulkSavePracticalProgressLocally,
  getAllAbsenteeFollowups,
  getAbsenteeFollowupsByClass,
  saveAbsenteeFollowupLocally,
  deleteAbsenteeFollowupLocally,
  bulkSaveAbsenteeFollowupsLocally,
  getAppState,
  setAppState,
} from './db';

// -------------------------------------------------------------
// TEACHING LOG SERVICE
// -------------------------------------------------------------

export async function fetchTeachingLogs(classLevel?: ClassLevel | 'All'): Promise<TeachingLogEntry[]> {
  if (!classLevel || classLevel === 'All') {
    return getAllTeachingLogs();
  }
  return getTeachingLogsByClass(classLevel);
}

export async function createTeachingLog(
  data: Omit<TeachingLogEntry, 'id' | 'version' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; entry?: TeachingLogEntry; error?: string }> {
  try {
    const now = new Date().toISOString();
    const entry: TeachingLogEntry = {
      ...data,
      id: crypto.randomUUID(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await saveTeachingLogLocally(entry);
    return { success: true, entry };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save teaching log.' };
  }
}

export async function updateTeachingLog(
  id: string,
  updates: Partial<Omit<TeachingLogEntry, 'id' | 'createdAt'>>
): Promise<{ success: boolean; entry?: TeachingLogEntry; error?: string }> {
  try {
    const all = await getAllTeachingLogs();
    const current = all.find((e) => e.id === id);
    if (!current) return { success: false, error: 'Teaching log not found.' };

    const updated: TeachingLogEntry = {
      ...current,
      ...updates,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveTeachingLogLocally(updated);
    return { success: true, entry: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update teaching log.' };
  }
}

export async function deleteTeachingLog(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteTeachingLogLocally(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete teaching log.' };
  }
}

export function exportTeachingLogsToExcel(logs: TeachingLogEntry[], selectedClass: string = 'All'): void {
  const exportRows = logs.map((l) => ({
    Date: l.date,
    Day: l.day,
    Class: l.class,
    'Subject/Topic': l.subjectTopic,
    'Learning Objectives': l.learningObjectives,
    'Theory Covered': l.theoryCovered,
    'Practical Activity': l.practicalActivity,
    'Total Registered': l.totalRegistered,
    'Students Present': l.studentsPresent,
    'Students Completing Task': l.studentsCompletingTask,
    'Students Needing Help': l.studentsNeedingHelp,
    'Teaching Method': l.teachingMethod,
    'Issue/Challenge': l.issueChallenge || '',
    'Evidence File Name': l.evidenceFileName || '',
    'Next Lesson': l.nextLesson || '',
    'Instructor Name': l.instructorName,
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Teaching Log');
  ws['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 30 },
    { wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 22 },
    { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 26 }, { wch: 20 },
  ];
  XLSX.writeFile(wb, `GBHS_Teaching_Log_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// -------------------------------------------------------------
// PRACTICAL PROGRESS SERVICE
// -------------------------------------------------------------

export async function fetchPracticalProgress(classLevel?: ClassLevel | 'All'): Promise<PracticalProgressEntry[]> {
  if (!classLevel || classLevel === 'All') {
    return getAllPracticalProgress();
  }
  return getPracticalProgressByClass(classLevel);
}

export async function createPracticalProgress(
  data: Omit<PracticalProgressEntry, 'id' | 'version' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; entry?: PracticalProgressEntry; error?: string }> {
  try {
    const now = new Date().toISOString();
    const entry: PracticalProgressEntry = {
      ...data,
      id: crypto.randomUUID(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await savePracticalProgressLocally(entry);
    return { success: true, entry };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record practical progress.' };
  }
}

export async function updatePracticalProgress(
  id: string,
  updates: Partial<Omit<PracticalProgressEntry, 'id' | 'createdAt'>>
): Promise<{ success: boolean; entry?: PracticalProgressEntry; error?: string }> {
  try {
    const all = await getAllPracticalProgress();
    const current = all.find((e) => e.id === id);
    if (!current) return { success: false, error: 'Practical progress entry not found.' };

    const updated: PracticalProgressEntry = {
      ...current,
      ...updates,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await savePracticalProgressLocally(updated);
    return { success: true, entry: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update practical progress.' };
  }
}

export async function deletePracticalProgress(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await deletePracticalProgressLocally(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete practical progress entry.' };
  }
}

export function exportPracticalProgressToExcel(records: PracticalProgressEntry[], selectedClass: string = 'All'): void {
  const exportRows = records.map((r) => ({
    'Assessment Date': r.assessmentDate,
    'Registration ID': r.registrationId,
    'Student Name': r.studentName,
    Class: r.class,
    'Skill/Practical Task': r.skillTask,
    'Attempt Number': r.attemptNumber,
    'Practical Completed': r.practicalCompleted,
    'Score/Marks': r.scoreMarks,
    'Skill Status': r.skillStatus,
    'Weak Area': r.weakArea || '',
    'Remedial Practice Required': r.remedialPracticeRequired,
    'Reassessment Date': r.reassessmentDate || '',
    'Evidence File': r.evidenceFile || '',
    'Instructor Remarks': r.instructorRemarks || '',
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Practical Progress');
  ws['!cols'] = [
    { wch: 15 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 26 },
    { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 24 },
    { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 26 },
  ];
  XLSX.writeFile(wb, `GBHS_Practical_Progress_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// -------------------------------------------------------------
// ABSENTEE FOLLOW-UP SERVICE
// -------------------------------------------------------------

export async function fetchAbsenteeFollowups(classLevel?: ClassLevel | 'All'): Promise<AbsenteeFollowupEntry[]> {
  if (!classLevel || classLevel === 'All') {
    return getAllAbsenteeFollowups();
  }
  return getAbsenteeFollowupsByClass(classLevel);
}

export async function createAbsenteeFollowup(
  data: Omit<AbsenteeFollowupEntry, 'id' | 'version' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; entry?: AbsenteeFollowupEntry; error?: string }> {
  try {
    const now = new Date().toISOString();
    const entry: AbsenteeFollowupEntry = {
      ...data,
      id: crypto.randomUUID(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await saveAbsenteeFollowupLocally(entry);
    return { success: true, entry };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record absentee follow-up.' };
  }
}

export async function updateAbsenteeFollowup(
  id: string,
  updates: Partial<Omit<AbsenteeFollowupEntry, 'id' | 'createdAt'>>
): Promise<{ success: boolean; entry?: AbsenteeFollowupEntry; error?: string }> {
  try {
    const all = await getAllAbsenteeFollowups();
    const current = all.find((e) => e.id === id);
    if (!current) return { success: false, error: 'Follow-up record not found.' };

    const updated: AbsenteeFollowupEntry = {
      ...current,
      ...updates,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveAbsenteeFollowupLocally(updated);
    return { success: true, entry: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update follow-up record.' };
  }
}

export async function deleteAbsenteeFollowup(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteAbsenteeFollowupLocally(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete follow-up record.' };
  }
}

export function exportAbsenteeFollowupsToExcel(records: AbsenteeFollowupEntry[], selectedClass: string = 'All'): void {
  const exportRows = records.map((r) => ({
    Date: r.date,
    'Registration ID': r.registrationId,
    'Student Name': r.studentName,
    Class: r.class,
    'Absence Count': r.absenceCount,
    'Follow-up Reason': r.followupReason,
    'Action Taken': r.actionTaken,
    'Contact Person': r.contactPerson,
    'Response Received': r.responseReceived,
    'Expected Return Date': r.expectedReturnDate || '',
    'Follow-up Date': r.followupDate,
    'Current Status': r.currentStatus,
    'Management Referral': r.managementReferral,
    Remarks: r.remarks || '',
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Absentee Follow-up');
  ws['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 10 }, { wch: 15 },
    { wch: 24 }, { wch: 24 }, { wch: 20 }, { wch: 30 }, { wch: 18 },
    { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 26 },
  ];
  XLSX.writeFile(wb, `GBHS_Absentee_Followups_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// -------------------------------------------------------------
// SEED INITIAL SCHOOL DATA IF EMPTY
// -------------------------------------------------------------

export async function seedModuleDataIfEmpty(): Promise<void> {
  const isSeeded = await getAppState<boolean>('modules_seeded_v1');
  if (isSeeded) return;

  const now = new Date().toISOString();

  // Initial Teaching Logs
  const existingLogs = await getAllTeachingLogs();
  if (existingLogs.length === 0) {
    const sampleLogs: TeachingLogEntry[] = [
      {
        id: crypto.randomUUID(),
        date: '2026-03-02',
        day: 'Monday',
        class: 'Class 7',
        subjectTopic: 'Computer Hardware & Peripheral Devices',
        learningObjectives: 'Identify input/output devices, understand motherboard components and ports.',
        theoryCovered: 'System unit architecture, CPU, RAM vs Storage, ports (HDMI, VGA, USB).',
        practicalActivity: 'Connecting monitor, mouse, keyboard & setting up desktop computer station.',
        totalRegistered: 28,
        studentsPresent: 26,
        studentsCompletingTask: 24,
        studentsNeedingHelp: 2,
        teachingMethod: 'Demonstration & Hands-on Lab',
        issueChallenge: 'Minor cable shortage in Lab 2 resolved from backup reserve.',
        evidenceFileName: 'Lab7_Session_01.jpg',
        nextLesson: 'Windows Desktop, Taskbar and Start Menu Navigation',
        instructorName: 'Engr. Imran Tareen',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        date: '2026-03-04',
        day: 'Wednesday',
        class: 'Class 7',
        subjectTopic: 'Windows Operating System Navigation & Window Controls',
        learningObjectives: 'Master minimize, maximize, close, window snapping, and desktop organization.',
        theoryCovered: 'Operating System GUI concepts, desktop icons, taskbar customization, notifications.',
        practicalActivity: 'Arranging icons, creating user shortcuts, opening multiple application windows.',
        totalRegistered: 28,
        studentsPresent: 25,
        studentsCompletingTask: 23,
        studentsNeedingHelp: 2,
        teachingMethod: 'Guided Practice',
        issueChallenge: '',
        evidenceFileName: 'Lab7_Session_02.jpg',
        nextLesson: 'File Management: Creating Folders and Renaming Files',
        instructorName: 'Engr. Imran Tareen',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        date: '2026-03-02',
        day: 'Monday',
        class: 'Class 8',
        subjectTopic: 'MS Word Document Formatting & Typography',
        learningObjectives: 'Apply proper font styles, line spacing, margins, and page orientation.',
        theoryCovered: 'Word processor concepts, ribbon tabs, clipboard, text effects, paragraph formatting.',
        practicalActivity: 'Drafting an official school application letter with standard formatting standards.',
        totalRegistered: 24,
        studentsPresent: 22,
        studentsCompletingTask: 20,
        studentsNeedingHelp: 2,
        teachingMethod: 'Interactive Demonstration',
        issueChallenge: 'Two students needed guidance on line spacing shortcuts (Ctrl+1, Ctrl+2).',
        evidenceFileName: 'Lab8_Session_01.jpg',
        nextLesson: 'Inserting Tables & Aligning Tabular Data in MS Word',
        instructorName: 'Engr. Imran Tareen',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        date: '2026-03-05',
        day: 'Thursday',
        class: 'Class 8',
        subjectTopic: 'Tables & SmartArt Graphics in Word Documents',
        learningObjectives: 'Design multi-column tables, merge/split cells, apply borders and shading.',
        theoryCovered: 'Table properties, cell alignment, auto-fit behaviors, SmartArt hierarchy diagrams.',
        practicalActivity: 'Designing class weekly study schedule with colored headers and merged periods.',
        totalRegistered: 24,
        studentsPresent: 23,
        studentsCompletingTask: 21,
        studentsNeedingHelp: 2,
        teachingMethod: 'Hands-on Lab Exercise',
        issueChallenge: '',
        evidenceFileName: 'Lab8_Session_02.jpg',
        nextLesson: 'Header, Footer and Page Numbering Options',
        instructorName: 'Engr. Imran Tareen',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        date: '2026-03-03',
        day: 'Tuesday',
        class: 'Class 9',
        subjectTopic: 'Excel Spreadsheet Fundamentals: SUM, AVERAGE, MIN, MAX',
        learningObjectives: 'Understand cell references (A1, $A$1), formula bar, and mathematical functions.',
        theoryCovered: 'Grid structure, data types (Number, Text, Date), formula syntax starting with =.',
        practicalActivity: 'Creating a monthly student marksheet with automatic SUM and AVERAGE calculation.',
        totalRegistered: 27,
        studentsPresent: 25,
        studentsCompletingTask: 22,
        studentsNeedingHelp: 3,
        teachingMethod: 'Demonstration & Hands-on Lab',
        issueChallenge: 'Reminded students to always include closing parenthesis in functions.',
        evidenceFileName: 'Lab9_Session_01.jpg',
        nextLesson: 'Logical IF Function & Grading System Calculations',
        instructorName: 'Engr. Imran Tareen',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        date: '2026-03-06',
        day: 'Friday',
        class: 'Class 9',
        subjectTopic: 'Excel Conditional Formatting & Data Sorting',
        learningObjectives: 'Apply color scales to high/low values and sort student rosters alphabetically.',
        theoryCovered: 'Rule management, greater than / less than highlighting, multi-level sorting.',
        practicalActivity: 'Highlighting top scoring students in green, failed in red, and sorting by Roll No.',
        totalRegistered: 27,
        studentsPresent: 24,
        studentsCompletingTask: 22,
        studentsNeedingHelp: 2,
        teachingMethod: 'Hands-on Lab Exercise',
        issueChallenge: '',
        evidenceFileName: 'Lab9_Session_02.jpg',
        nextLesson: 'Charts & Graphical Data Presentation (Bar & Pie Charts)',
        instructorName: 'Engr. Imran Tareen',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    await bulkSaveTeachingLogsLocally(sampleLogs);
  }

  // Initial Practical Progress
  const existingProgress = await getAllPracticalProgress();
  if (existingProgress.length === 0) {
    const sampleProgress: PracticalProgressEntry[] = [
      {
        id: crypto.randomUUID(),
        assessmentDate: '2026-03-03',
        registrationId: '3473',
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
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        assessmentDate: '2026-03-03',
        registrationId: '3796',
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
      },
    ];
    await bulkSavePracticalProgressLocally(sampleProgress);
  }

  // Initial Absentee Follow-ups
  const existingFollowups = await getAllAbsenteeFollowups();
  if (existingFollowups.length === 0) {
    const sampleFollowups: AbsenteeFollowupEntry[] = [
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
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        date: '2026-03-05',
        registrationId: '3796',
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
      },
    ];
    await bulkSaveAbsenteeFollowupsLocally(sampleFollowups);
  }

  await setAppState('modules_seeded_v1', true);
}
