import React from 'react';
import { COMMAND_KEY } from '../../../utils/platform';

interface CommandButtonProps {
  label: string;
  shortcut: string;
  description?: string;
  onClick?: () => void;
}

const CommandButton: React.FC<CommandButtonProps> = ({
  label,
  shortcut,
  description,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-[var(--border-default)] btn-glass"
      style={{
        // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'no-drag',
        appRegion: 'no-drag',
      }}
    >
      <span className="leading-none truncate text-shadow text-[var(--text-primary)]">
        {label}
      </span>
      <div className="flex gap-1 pointer-events-none">
        <span className="kbd">{COMMAND_KEY}</span>
        <span className="kbd">{shortcut}</span>
      </div>
      {description && (
        <p className="text-[10px] leading-relaxed text-[var(--text-muted)] truncate mt-1 text-shadow">
          {description}
        </p>
      )}
    </button>
  );
};

export default CommandButton;
