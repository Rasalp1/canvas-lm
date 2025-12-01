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
      <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg animate-pulse">
        <div className="h-4 bg-slate-300 rounded w-1/2 mb-2"></div>
        <div className="h-2 bg-slate-300 rounded"></div>
      </div>
    );
  }

  // Admin users get a special display
  if (usageStatus.isAdmin || usageStatus.tier === 'admin') {
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

  // Premium users get a special display
  if (usageStatus.tier === 'premium') {
    return (
      <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-purple-900">Premium Account</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                Unlimited
              </span>
            </div>
            <p className="text-xs text-purple-700 mt-0.5">
              No message limits • Priority support
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check if user has unlimited usage (999 remaining means unlimited)
  const isUnlimited = usageStatus.remaining >= 999;
  
  if (isUnlimited) {
    return (
      <div className="p-3 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-xl">♾️</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-blue-900">Unlimited Messages</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500 text-white">
                ∞
              </span>
            </div>
            <p className="text-xs text-blue-700 mt-0.5">
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
    <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium text-slate-700">Messages Remaining</span>
        <span className="font-bold text-slate-900">
          {usageStatus.remaining} / 40
        </span>
      </div>
      
      <div className="w-full bg-slate-200 rounded-full h-2">
        <div 
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
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
      
      <p className="text-xs text-slate-600">
        Resets on a rolling 3-hour window
      </p>
    </div>
  );
}
