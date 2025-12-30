import React from 'react';
import { Camera } from 'lucide-react';

interface ScreenshotButtonProps {
  onClick: () => void;
  disabled?: boolean;
  showShortcut?: boolean;
}

const ScreenshotButton: React.FC<ScreenshotButtonProps> = ({
  onClick,
  disabled = false,
  showShortcut = true,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        btn-secondary flex items-center gap-2 text-xs px-3 py-2
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      title="Capture & Analyze (⌘H)"
    >
      <Camera className="w-3.5 h-3.5" />
      <span>Capture</span>
      {showShortcut && <span className="kbd">H</span>}
    </button>
  );
};

export default ScreenshotButton;
