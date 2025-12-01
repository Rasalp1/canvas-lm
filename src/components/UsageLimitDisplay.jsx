import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from './ui/alert';

/**
 * Component to display usage limit information
 * Shows remaining messages and countdown timer when limit is reached
 */
export function UsageLimitDisplay({ usageStatus }) {
  const [timeRemaining, setTimeRemaining] = useState('');

  // Debug logging
  useEffect(() => {
    console.log('[UsageLimitDisplay] Received usageStatus:', usageStatus);
  }, [usageStatus]);

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

  // Don't render if no usageStatus provided
  if (!usageStatus) {
    return null;
  }

  if (usageStatus.loading) {
    return (
      <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg animate-pulse">
        <div className="h-3 bg-slate-200 rounded w-1/2 mb-1"></div>
        <div className="h-1.5 bg-slate-200 rounded"></div>
      </div>
    );
  }

  // Admin users get a special display
  if (usageStatus.isAdmin || usageStatus.tier === 'admin') {
    return (
      <div className="p-2 bg-amber-50/50 border border-amber-100 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-base">👑</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Admin Account</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700">
                Unlimited
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Premium users get a special display
  if (usageStatus.tier === 'premium') {
    return (
      <div className="p-2 bg-purple-50/50 border border-purple-100 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Premium Account</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                Unlimited
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if user has unlimited usage (999 remaining means unlimited)
  const isUnlimited = usageStatus.remaining >= 999;
  
  if (isUnlimited) {
    return (
      <div className="p-2 bg-blue-50/50 border border-blue-100 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-base">♾️</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Unlimited Messages</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                ∞
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const percentage = (usageStatus.remaining / 20) * 100;
  const isExhausted = usageStatus.remaining === 0;

  return (
    <div className="space-y-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg">
      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-500">Messages Remaining</span>
        <span className="text-slate-600">
          {usageStatus.remaining} / 20
        </span>
      </div>
      
      <div className="w-full bg-slate-200 rounded-full h-1.5">
        <div 
          className="bg-slate-400 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {isExhausted && (
        <Alert variant="destructive" className="py-1.5 px-2">
          <AlertDescription className="text-xs">
            Limit reached. Next message in: <strong>{timeRemaining}</strong>
          </AlertDescription>
        </Alert>
      )}
      
      <p className="text-xs text-slate-400">
        Resets every 3 hours
      </p>
    </div>
  );
}
