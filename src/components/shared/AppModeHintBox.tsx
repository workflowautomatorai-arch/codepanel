import React from 'react';
import { AppMode } from '../../../shared/api';

const APP_MODE_HINTS: Record<AppMode, string> = {
  [AppMode.LIVE_INTERVIEW]:
    'A helpful assistant that shows your problem, thoughts, and code all in one view. Works as an invisible overlay.',
  [AppMode.LEETCODE_SOLVER]:
    'Helps you solve one coding problem at a time with a focus on finding the best solution. Keeps explanations simple and direct to save time.',
};

interface AppModeHintBoxProps {
  currentAppMode: AppMode;
}

export const AppModeHintBox: React.FC<AppModeHintBoxProps> = ({
  currentAppMode,
}) => {
  return (
    <div className="px-2 mb-3">
      <div className="bg-white/5 border border-white/10 rounded-sm p-2">
        <p className="text-[11px] leading-relaxed text-gray-300">
          {APP_MODE_HINTS[currentAppMode]}
        </p>
      </div>
    </div>
  );
};
