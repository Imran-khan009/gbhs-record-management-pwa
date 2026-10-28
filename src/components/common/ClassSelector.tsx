import React, { useState, useRef, useEffect } from 'react';
import { ClassLevel } from '../../types/student';
import { GraduationCap, ChevronDown, Check } from 'lucide-react';
import { useSchoolProfile, sanitizeClasses, sortClasses } from '../../services/schoolProfileService';

export type ClassFilter = 'All' | 'All Classes' | ClassLevel | string;

export interface ClassSelectorProps {
  selectedClass: string;
  onSelectClass: (c: any) => void;
  classes?: string[];
  counts?: {
    all?: number;
    [className: string]: number | undefined;
  };
  className?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
  labelPrefix?: string;
  disabled?: boolean;
  id?: string;
}

export const ClassSelector: React.FC<ClassSelectorProps> = ({
  selectedClass,
  onSelectClass,
  classes,
  counts,
  className = '',
  showAllOption = true,
  allOptionLabel = 'All Classes',
  labelPrefix = 'Class: ',
  disabled = false,
  id = 'gbhs-class-selector',
}) => {
  const { profile } = useSchoolProfile();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Dynamic class list from props or school profile
  const configured = sortClasses(
    sanitizeClasses(classes && classes.length > 0 ? classes : profile.classes)
  );

  // Color palette rotation for custom class badges (preserves test expectations)
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

  // Helper to extract student/record counts
  const getCount = (cls: string): number | undefined => {
    if (!counts) return undefined;
    if (cls === 'All' || cls === 'All Classes' || cls === 'All Class') {
      return counts.all;
    }
    const rawKey = cls.toLowerCase().replace(/[\s_-]+/g, '');
    return counts[cls] ?? counts[rawKey];
  };

  const isAllSelected =
    selectedClass === 'All' ||
    selectedClass === 'All Classes' ||
    selectedClass === 'All Class' ||
    !selectedClass;

  // Active display label
  const activeLabel = isAllSelected ? allOptionLabel : selectedClass;
  const activeCount = isAllSelected ? getCount('All') : getCount(selectedClass);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const firstBtn = listRef.current?.querySelector('button');
        firstBtn?.focus();
      }
    }
  };

  const handleSelect = (clsKey: string) => {
    onSelectClass(clsKey);
    setIsOpen(false);
  };

  // Determine key for "All" based on what the consumer uses
  const allKey = selectedClass === 'All Classes' ? 'All Classes' : 'All';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full sm:w-auto text-left select-none ${className}`}
      id={id}
    >
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`btn-interactive w-full sm:w-auto min-h-[38px] flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#202822] hover:bg-[#2B352E] text-[#F6F3EA] border border-[#3D4A41] hover:border-[#D97745]/60 shadow-xs transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97745] ${
          isOpen ? 'border-[#D97745] ring-2 ring-[#D97745]/20 shadow-md' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GraduationCap className="w-4 h-4 text-[#D97745] shrink-0" />
          <span className="truncate">
            <span className="text-[#9BAE9C] font-normal">{labelPrefix}</span>
            <span className="text-[#F6F3EA] font-bold">{activeLabel}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {activeCount !== undefined && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[#1A211C] text-[#9BAE9C] border border-[#3D4A41]">
              {activeCount}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-[#9BAE9C] transition-transform duration-200 ease-out ${
              isOpen ? 'rotate-180 text-[#D97745]' : ''
            }`}
          />
        </div>
      </button>

      {/* Animated Dropdown Menu */}
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Filter by class"
          className="absolute left-0 mt-1.5 w-full sm:w-56 max-w-[calc(100vw-32px)] bg-[#202822] border border-[#3D4A41] rounded-xl shadow-2xl p-1.5 z-50 backdrop-blur-md max-h-64 sm:max-h-72 overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-150"
        >
          {showAllOption && (
            <button
              type="button"
              role="option"
              aria-selected={isAllSelected}
              onClick={() => handleSelect(allKey)}
              className={`btn-interactive w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 text-left cursor-pointer ${
                isAllSelected
                  ? 'bg-[#D97745] text-white shadow-xs font-bold'
                  : 'text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#2B352E]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GraduationCap
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isAllSelected ? 'text-white' : 'text-[#9BAE9C]'
                  }`}
                />
                <span className="truncate">{allOptionLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {getCount('All') !== undefined && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                      isAllSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#1A211C] text-[#9BAE9C] border border-[#3D4A41]'
                    }`}
                  >
                    {getCount('All')}
                  </span>
                )}
                {isAllSelected && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
            </button>
          )}

          {configured.map((cls, idx) => {
            const isSelected = selectedClass === cls;
            const count = getCount(cls);
            const palette = colorPalettes[idx % colorPalettes.length];

            return (
              <button
                key={cls}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(cls)}
                className={`btn-interactive w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 text-left cursor-pointer mt-0.5 ${
                  isSelected
                    ? 'bg-[#D97745] text-white shadow-xs font-bold'
                    : 'text-[#9BAE9C] hover:text-[#F6F3EA] hover:bg-[#2B352E]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GraduationCap
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-white' : 'text-[#9BAE9C]'
                    }`}
                  />
                  <span className="truncate">{cls}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {count !== undefined && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected ? 'bg-white/20 text-white' : palette
                      }`}
                    >
                      {count}
                    </span>
                  )}
                  {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
