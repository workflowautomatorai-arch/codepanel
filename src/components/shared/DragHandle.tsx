import React from 'react';

interface DragHandleProps {
  className?: string;
}

const DragHandle: React.FC<DragHandleProps> = ({ className = '' }) => {
  return (
    <div
      className={`
        w-full h-7 flex items-center justify-center cursor-grab active:cursor-grabbing
        bg-gray-800/50 hover:bg-gray-800/60
        border-b border-gray-600/30
        backdrop-blur-md
        transition-colors duration-200
        select-none
        ${className}
      `}
      style={{
        // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'drag',
        appRegion: 'drag',
      }}
    >
      {/* Drag indicator - grip bar */}
      <div className="w-10 h-1 rounded-full bg-gray-400/60 hover:bg-gray-400/80 transition-colors pointer-events-none" />
    </div>
  );
};

export default DragHandle;
