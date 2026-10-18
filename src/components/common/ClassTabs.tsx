import React from 'react';
import { ClassLevel } from '../../types/student';
import { GraduationCap, Sparkles } from 'lucide-react';

export type ClassFilter = 'All' | ClassLevel;

interface ClassTabsProps {
  selectedClass: ClassFilter;
  onSelectClass: (c: ClassFilter) => void;
  counts?: {
    all?: number;
    class7?: number;
    class8?: number;
    class9?: number;
  };
  className?: string;
  showAllOption?: boolean;
}

export const ClassTabs: React.FC<ClassTabsProps> = ({
  selectedClass,
  onSelectClass,
  counts,
  className = '',
  showAllOption = true,
}) => {
  const tabs: { key: ClassFilter; label: string; count?: number; badgeColor?: string }[] = [
    ...(showAllOption
      ? [
          {
            key: 'All' as ClassFilter,
            label: 'All Classes',
            count: counts?.all,
            badgeColor: 'bg-slate-750 text-slate-300',
          },
        ]
      : []),
    {
      key: 'Class 7' as ClassFilter,
      label: 'Class 7th',
      count: counts?.class7,
      badgeColor: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
    },
    {
      key: 'Class 8' as ClassFilter,
      label: 'Class 8th',
      count: counts?.class8,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    },
    {
      key: 'Class 9' as ClassFilter,
      label: 'Class 9th',
      count: counts?.class9,
      badgeColor: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
    },
  ];

  return (
    <div
      className={`inline-flex items-center p-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-inner ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = selectedClass === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onSelectClass(tab.key)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
              isActive
                ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-950/60 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <GraduationCap
              className={`w-3.5 h-3.5 transition ${
                isActive ? 'text-white' : 'text-slate-400'
              }`}
            />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : tab.badgeColor
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
