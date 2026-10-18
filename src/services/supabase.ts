import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Student, AttendanceRecord } from '../types/student';
import { OutboxOperation } from '../types/sync';
import { getAppState, setAppState } from './db';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isCustomConfigured: boolean;
  simulationMode: 'none' | 'offline' | 'server_error' | 'slow_network' | 'conflict_trigger' | 'auth_expired';
}

const DEFAULT_CONFIG_KEY = 'supabase_client_config';

// In-memory / persistent mock cloud store for zero-setup instantaneous testing & verification
const MOCK_CLOUD_STUDENTS_KEY = 'mock_supabase_cloud_students';
const MOCK_CLOUD_ATTENDANCE_KEY = 'mock_supabase_cloud_attendance';

let supabaseInstance: SupabaseClient | null = null;
let currentConfig: SupabaseConfig = {
  url: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '',
  anonKey: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '',
  isCustomConfigured: false,
  simulationMode: 'none',
};

export async function initSupabaseConfig(): Promise<SupabaseConfig> {
  const saved = await getAppState<SupabaseConfig>(DEFAULT_CONFIG_KEY);
  if (saved) {
    currentConfig = { ...currentConfig, ...saved };
  }
  if (currentConfig.url && currentConfig.anonKey) {
    try {
      supabaseInstance = createClient(currentConfig.url, currentConfig.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      currentConfig.isCustomConfigured = true;
    } catch {
      supabaseInstance = null;
    }
  }
  return currentConfig;
}

export function getSupabaseConfig(): SupabaseConfig {
  return currentConfig;
}

export async function updateSupabaseConfig(newConfig: Partial<SupabaseConfig>): Promise<void> {
  currentConfig = { ...currentConfig, ...newConfig };
  if (currentConfig.url && currentConfig.anonKey) {
    try {
      supabaseInstance = createClient(currentConfig.url, currentConfig.anonKey);
      currentConfig.isCustomConfigured = true;
    } catch {
      supabaseInstance = null;
    }
  } else {
    supabaseInstance = null;
    currentConfig.isCustomConfigured = false;
  }
  await setAppState(DEFAULT_CONFIG_KEY, currentConfig);
}

export function setNetworkSimulation(mode: SupabaseConfig['simulationMode']) {
  currentConfig.simulationMode = mode;
}

// -------------------------------------------------------------
// CLOUD SYNC ADAPTER (Handles live Supabase or Mock Cloud)
// -------------------------------------------------------------

export interface RemoteSyncResponse {
  success: boolean;
  error?: {
    message: string;
    type: 'network' | 'validation' | 'conflict' | 'auth' | 'server';
    remoteData?: any;
  };
}

export async function syncOperationToCloud(
  operation: OutboxOperation,
  userToken?: string
): Promise<RemoteSyncResponse> {
  // Check simulation mode first
  if (currentConfig.simulationMode === 'offline') {
    return {
      success: false,
      error: {
        message: 'Network is unreachable (Simulated Offline Mode)',
        type: 'network',
      },
    };
  }

  if (currentConfig.simulationMode === 'auth_expired') {
    return {
      success: false,
      error: {
        message: 'Authentication token has expired or is invalid. Please log in again.',
        type: 'auth',
      },
    };
  }

  if (currentConfig.simulationMode === 'server_error') {
    return {
      success: false,
      error: {
        message: 'HTTP 503 Service Unavailable: Remote server temporarily overloaded.',
        type: 'server',
      },
    };
  }

  if (currentConfig.simulationMode === 'conflict_trigger') {
    // Generate a remote conflict for demonstration
    const fakeRemote = {
      ...operation.payload,
      version: (operation.version || 1) + 5,
      name: (operation.payload as any).name ? `${(operation.payload as any).name} (Cloud Modified)` : undefined,
      updatedAt: new Date(Date.now() + 10000).toISOString(),
    };
    return {
      success: false,
      error: {
        message: 'Conflict detected: Remote version is newer than local version.',
        type: 'conflict',
        remoteData: fakeRemote,
      },
    };
  }

  // 1. If real Supabase client is configured
  if (supabaseInstance && currentConfig.url && currentConfig.anonKey) {
    try {
      if (operation.entityType === 'student') {
        const student = operation.payload as Student;
        if (operation.operationType === 'DELETE') {
          const { error } = await supabaseInstance
            .from('students')
            .delete()
            .eq('id', student.id);
          if (error) throw error;
        } else {
          // Idempotent upsert by client-generated ID
          const { error } = await supabaseInstance
            .from('students')
            .upsert({
              id: student.id,
              admission_no: student.admissionNo,
              roll_no: student.rollNo,
              name: student.name,
              father_name: student.fatherName,
              class: student.class,
              section: student.section,
              phone: student.phone,
              dob: student.dob,
              address: student.address,
              status: student.status,
              version: student.version,
              updated_at: student.updatedAt,
              created_at: student.createdAt,
              school_id: student.schoolId,
              created_by: student.createdBy,
            }, { onConflict: 'id' });
          if (error) throw error;
        }
      } else if (operation.entityType === 'attendance') {
        const attendance = operation.payload as AttendanceRecord;
        if (operation.operationType === 'DELETE') {
          const { error } = await supabaseInstance
            .from('attendance')
            .delete()
            .eq('id', attendance.id);
          if (error) throw error;
        } else {
          // Idempotent upsert
          const { error } = await supabaseInstance
            .from('attendance')
            .upsert({
              id: attendance.id,
              student_id: attendance.studentId,
              student_name: attendance.studentName,
              roll_no: attendance.rollNo,
              class: attendance.class,
              section: attendance.section,
              date: attendance.date,
              status: attendance.status,
              remarks: attendance.remarks,
              version: attendance.version,
              updated_at: attendance.updatedAt,
              school_id: attendance.schoolId,
              marked_by: attendance.markedBy,
            }, { onConflict: 'id' });
          if (error) throw error;
        }
      }
      return { success: true };
    } catch (err: any) {
      const msg = err.message || 'Supabase request failed';
      if (msg.includes('JWT') || msg.includes('auth') || msg.includes('token')) {
        return { success: false, error: { message: msg, type: 'auth' } };
      }
      return { success: false, error: { message: msg, type: 'network' } };
    }
  }

  // 2. Mock Cloud Store (Provides instant zero-setup cloud sync verification & idempotency)
  try {
    if (operation.entityType === 'student') {
      const student = operation.payload as Student;
      let cloudStudents: Record<string, Student> = JSON.parse(
        localStorage.getItem(MOCK_CLOUD_STUDENTS_KEY) || '{}'
      );

      // Check conflict if remote version is higher
      const existing = cloudStudents[student.id];
      if (existing && existing.version > student.version && operation.operationType !== 'DELETE') {
        return {
          success: false,
          error: {
            message: `Remote conflict detected: Cloud record has version ${existing.version}, local is ${student.version}`,
            type: 'conflict',
            remoteData: existing,
          },
        };
      }

      if (operation.operationType === 'DELETE') {
        delete cloudStudents[student.id];
      } else {
        // Idempotent upsert
        cloudStudents[student.id] = { ...student };
      }
      localStorage.setItem(MOCK_CLOUD_STUDENTS_KEY, JSON.stringify(cloudStudents));
    } else if (operation.entityType === 'attendance') {
      const attendance = operation.payload as AttendanceRecord;
      let cloudAttendance: Record<string, AttendanceRecord> = JSON.parse(
        localStorage.getItem(MOCK_CLOUD_ATTENDANCE_KEY) || '{}'
      );

      const existing = cloudAttendance[attendance.id];
      if (existing && existing.version > attendance.version && operation.operationType !== 'DELETE') {
        return {
          success: false,
          error: {
            message: `Attendance conflict detected: Cloud recorded ${existing.status} at ${existing.updatedAt}`,
            type: 'conflict',
            remoteData: existing,
          },
        };
      }

      if (operation.operationType === 'DELETE') {
        delete cloudAttendance[attendance.id];
      } else {
        cloudAttendance[attendance.id] = { ...attendance };
      }
      localStorage.setItem(MOCK_CLOUD_ATTENDANCE_KEY, JSON.stringify(cloudAttendance));
    }

    // Simulate minor realistic network delay
    await new Promise((res) => setTimeout(res, 80));
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: {
        message: err.message || 'Mock cloud processing failed',
        type: 'server',
      },
    };
  }
}

// SQL Schema generator for Supabase RLS and tables
export function getSupabaseSQLSchema(): string {
  return `-- ==========================================
-- GBHS Computer Operator Supabase Database Schema
-- Row Level Security (RLS) & Idempotent Upsert Rules
-- ==========================================

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Students Table
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY,
    admission_no TEXT NOT NULL,
    roll_no TEXT NOT NULL,
    name TEXT NOT NULL,
    father_name TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('Class 7', 'Class 8', 'Class 9')),
    section TEXT NOT NULL,
    phone TEXT,
    dob DATE,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Transferred')),
    version INTEGER NOT NULL DEFAULT 1,
    school_id TEXT NOT NULL DEFAULT 'GBHS-MAIN',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_school_admission UNIQUE (school_id, admission_no)
);

-- 2. Daily Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY, -- e.g. student_id_date composite
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    roll_no TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('Class 7', 'Class 8', 'Class 9')),
    section TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Leave', 'Late')),
    remarks TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    school_id TEXT NOT NULL DEFAULT 'GBHS-MAIN',
    marked_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_student_daily_attendance UNIQUE (student_id, date)
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- 4. Scope policies to authenticated operator
CREATE POLICY "Authorized school operator students policy"
ON public.students
FOR ALL
TO authenticated
USING (auth.jwt() ->> 'email' = created_by OR auth.jwt() ->> 'role' = 'authenticated')
WITH CHECK (auth.jwt() ->> 'email' = created_by OR auth.jwt() ->> 'role' = 'authenticated');

CREATE POLICY "Authorized school operator attendance policy"
ON public.attendance
FOR ALL
TO authenticated
USING (auth.jwt() ->> 'email' = marked_by OR auth.jwt() ->> 'role' = 'authenticated')
WITH CHECK (auth.jwt() ->> 'email' = marked_by OR auth.jwt() ->> 'role' = 'authenticated');
`;
}
