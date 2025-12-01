import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from './ui/alert';

/**
 * Component to display usage limit information
 * Shows remaining messages and countdown timer when limit is reached
 */
export function UsageLimitDisplay({ usageStatus }) {
  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    if (!usageStatus.resetTime) return;

    const updateTimer = () => {
      const now = new Date();
      const reset = new Date(usageStatus.resetTime);
      const diff = reset - now;

      if (diff <= 0) {
        setTimeRemaining('Available now');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining(
        `${hours}h ${minutes}m ${seconds}s`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [usageStatus.resetTime]);

  if (usageStatus.loading) {
    return null;
  }

  // Admin users get a special display
  if (usageStatus.isAdmin) {
    return (
      <div className="p-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-xl">👑</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-amber-900">Admin Account</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-800">
                Unlimited
              </span>
            </div>
            <p className="text-xs text-amber-700 mt-0.5">
              No message limits applied
            </p>
          </div>
        </div>
      </div>
    );
  }

  const percentage = (usageStatus.remaining / 40) * 100;
  const isExhausted = usageStatus.remaining === 0;

  return (
    <div className="space-y-2 p-3 bg-secondary/20 rounded-lg">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium">Messages Remaining</span>
        <span className="font-bold">
          {usageStatus.remaining} / 40
        </span>
      </div>
      
      <div className="w-full bg-secondary rounded-full h-2">
        <div 
          className="bg-primary h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {isExhausted && (
        <Alert variant="destructive">
          <AlertDescription>
            You've reached your message limit. Next message available in: <strong>{timeRemaining}</strong>
          </AlertDescription>
        </Alert>
      )}
      
      <p className="text-xs text-muted-foreground">
        Resets on a rolling 3-hour window
      </p>
    </div>
  );
}
