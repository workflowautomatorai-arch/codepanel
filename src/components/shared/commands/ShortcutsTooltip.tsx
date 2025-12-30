import React from 'react';
import { LanguageSelector } from '../LanguageSelector';
import { sendToElectron } from '../../../utils/electron';
import { IPC_EVENTS } from '@shared/constants.ts';
import { LocaleSelector } from '../LocaleSelector.tsx';
import { AppMode } from '@shared/api.ts';

interface ShortcutsTooltipProps {
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  currentAppMode: AppMode;
  onSignOut: () => void;
  className?: string;
  setAppMode: (appMode: AppMode) => void;
}

const ShortcutsTooltip: React.FC<ShortcutsTooltipProps> = ({
  tooltipRef,
  currentAppMode,
  onSignOut,
  className = '',
  setAppMode,
}) => {
  // Suppress unused variable warning - keeping for potential future use
  void currentAppMode;
  void setAppMode;

  return (
    <div
      ref={tooltipRef}
      className={`absolute text-[14px] top-full left-0 mt-2 w-48 transform -translate-x-[calc(50%-12px)] ${className}`}
      style={{ zIndex: 100 }}
    >
      <div className="absolute -top-2 right-0 w-full h-2" />
      <div className="p-3 text-xs bg-[#1E2530]/90 backdrop-blur-md rounded-lg border border-gray-700 text-gray-100 shadow-lg">
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-300">Settings</h3>

          <div className="space-y-2">
            <LanguageSelector />
            <LocaleSelector />
          </div>

          <div className="pt-2 mt-2 border-t border-gray-700 flex items-center justify-between">
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-white transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log Out
            </button>
            <button
              onClick={() => sendToElectron(IPC_EVENTS.TOOLTIP.CLOSE_CLICK)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Quit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsTooltip;
