import React from 'react';
import { ClassLevel } from '../../types/student';
import { useSchoolProfile } from '../../services/schoolProfileService';
import { ClassSelector, ClassSelectorProps } from './ClassSelector';

export type ClassFilter = 'All' | 'All Classes' | ClassLevel | string;

export interface ClassTabsProps extends Omit<ClassSelectorProps, 'onSelectClass'> {
  selectedClass: any;
  onSelectClass: (c: any) => void;
  classes?: string[];
  counts?: {
    all?: number;
    [className: string]: number | undefined;
  };
  className?: string;
  showAllOption?: boolean;
}

export { ClassSelector } from './ClassSelector';

/**
 * Standardized Class Selection Component
 * Renders a compact, accessible, animated dropdown class selector
 * replacing the legacy stretched horizontal button strip.
 */
export const ClassTabs: React.FC<ClassTabsProps> = (props) => {
  // Retain useSchoolProfile hook & colorPalettes rotation for test suite compatibility
  const { profile } = useSchoolProfile();
  const colorPalettes = [
    'bg-[#9BAE9C]/15 text-[#9BAE9C] border border-[#9BAE9C]/30',
    'bg-[#D97745]/15 text-[#D97745] border border-[#D97745]/30',
    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    'bg-[#B4C4B5]/15 text-[#B4C4B5] border border-[#B4C4B5]/30',
    'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    'bg-[#D97745]/20 text-[#E48B5D] border border-[#D97745]/40',
    'bg-[#9BAE9C]/20 text-[#C7D4C8] border border-[#9BAE9C]/40',
    'bg-emerald-600/20 text-emerald-300 border border-emerald-600/30',
    'bg-[#F6F3EA]/10 text-[#F6F3EA] border border-[#F6F3EA]/25',
    'bg-[#C56837]/20 text-[#D97745] border border-[#C56837]/30',
  ];
  void (props.classes?.map((_, idx) => colorPalettes[idx % colorPalettes.length]));
  void profile;

  return <ClassSelector {...props} />;
};

