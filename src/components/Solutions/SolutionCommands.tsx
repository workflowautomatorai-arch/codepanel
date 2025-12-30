import React, { useState, useEffect, useCallback } from 'react';
import {
  Screenshot,
  AuthenticatedUser,
  SubscriptionLevel,
} from '../../../shared/api';
import CommandButton from '../shared/commands/CommandButton';
import { authService } from '../../services/auth.ts';

export interface SolutionCommandsProps {
  isProcessing: boolean;
  screenshots?: Screenshot[];
}

const SolutionCommands: React.FC<SolutionCommandsProps> = ({
  isProcessing,
  screenshots = [],
}) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  useEffect(() => {
    // Fetch the current user when the component mounts
    const fetchUser = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    };

    fetchUser().catch(console.error);
  }, []);

  const handleScreenshot = useCallback(async () => {
    try {
      await window.electronAPI?.triggerScreenshot?.();
    } catch (error) {
      console.error('Error triggering screenshot:', error);
    }
  }, []);

  const handleStartOver = useCallback(() => {
    window.electronAPI?.triggerReset?.();
  }, []);

  return (
    <div>
      <div className="pt-2 w-fit">
        <div className="text-xs text-gray-100 bg-gray-900/80 backdrop-blur-sm rounded-lg py-2 px-4 flex items-center justify-center gap-4">
          {!isProcessing &&
            !(user && user.subscription.level === SubscriptionLevel.FREE) && (
              <>
                <CommandButton
                  label={
                    screenshots.length === 0
                      ? 'Screenshot your code'
                      : 'Screenshot'
                  }
                  shortcut="H"
                  onClick={handleScreenshot}
                />

                {screenshots.length > 0 && (
                  <CommandButton label="Debug" shortcut="↵" />
                )}
              </>
            )}

          <CommandButton
            label="Start Over"
            shortcut="G"
            onClick={handleStartOver}
          />
        </div>
      </div>
    </div>
  );
};

export default SolutionCommands;
