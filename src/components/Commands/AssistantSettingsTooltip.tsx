import React, { useState, useRef } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { sendToElectron } from '../../utils/electron';
import { IPC_EVENTS } from '@shared/constants.ts';

const AssistantSettingsTooltip: React.FC = () => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const {
    enableWebSearch,
    enableUrlContext,
    enablePersonalContext,
    toggleWebSearch,
    toggleUrlContext,
    togglePersonalContext,
  } = useSettings();

  const handleMouseEnter = () => {
    setIsTooltipVisible(true);
    sendToElectron(IPC_EVENTS.TOOLTIP.MOUSE_ENTER);
  };

  const handleMouseLeave = () => {
    setIsTooltipVisible(false);
    sendToElectron(IPC_EVENTS.TOOLTIP.MOUSE_LEAVE);
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Gear Icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-4 h-4 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
      >
        <path
          fillRule="evenodd"
          d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
          clipRule="evenodd"
        />
      </svg>

      {isTooltipVisible && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full right-0 mb-2 w-56 glass-container p-3 rounded-xl shadow-lg z-50"
          style={{
            // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
            WebkitAppRegion: 'no-drag',
            appRegion: 'no-drag',
          }}
        >
          <div className="text-xs font-medium text-[var(--text-primary)] mb-2">
            Assistant Capabilities
          </div>

          {/* Web Search Toggle */}
          <label className="flex items-center justify-between py-1.5 cursor-pointer group">
            <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
              Web Search
            </span>
            <button
              onClick={toggleWebSearch}
              className={`w-8 h-4 rounded-full transition-colors ${
                enableWebSearch ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transition-transform ${
                  enableWebSearch ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          {/* URL Context Toggle */}
          <label className="flex items-center justify-between py-1.5 cursor-pointer group">
            <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
              URL Context
            </span>
            <button
              onClick={toggleUrlContext}
              className={`w-8 h-4 rounded-full transition-colors ${
                enableUrlContext ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transition-transform ${
                  enableUrlContext ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          {/* Personal Context Toggle */}
          <label className="flex items-center justify-between py-1.5 cursor-pointer group">
            <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
              Personal Context
            </span>
            <button
              onClick={togglePersonalContext}
              className={`w-8 h-4 rounded-full transition-colors ${
                enablePersonalContext ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transition-transform ${
                  enablePersonalContext ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      )}
    </div>
  );
};

export default AssistantSettingsTooltip;
