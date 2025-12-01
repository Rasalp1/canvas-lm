import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing usage limits
 * Checks user's message quota and tracks usage
 */
export function useUsageLimit(user) {
  const [usageStatus, setUsageStatus] = useState({
    allowed: true,
    remaining: 40,
    resetTime: null,
    loading: true
  });

  const checkLimit = useCallback(async () => {
    if (!user) {
      setUsageStatus({ 
        allowed: false, 
        remaining: 0, 
        resetTime: null, 
        loading: false 
      });
      return { allowed: false, remaining: 0 };
    }

    try {
      // Get Firebase Auth token
      const token = await user.getIdToken();
      
      // Call Cloud Function
      const response = await fetch(
        'https://europe-north1-canvas-lm.cloudfunctions.net/checkUsageLimit',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ data: {} })
        }
      );

      const { result } = await response.json();
      setUsageStatus({ ...result, loading: false });
      return result;
    } catch (error) {
      console.error('Error checking usage limit:', error);
      // On error, allow the request (fail open)
      const fallback = { allowed: true, remaining: 40, resetTime: null, loading: false };
      setUsageStatus(fallback);
      return fallback;
    }
  }, [user]);

  const recordUsage = useCallback(async (courseChatId, messageId) => {
    if (!user) return;

    try {
      const token = await user.getIdToken();
      
      await fetch(
        'https://europe-north1-canvas-lm.cloudfunctions.net/recordMessageUsage',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ 
            data: { 
              courseChatId, 
              messageId 
            } 
          })
        }
      );

      // Refresh status after recording
      await checkLimit();
    } catch (error) {
      console.error('Error recording usage:', error);
    }
  }, [user, checkLimit]);

  useEffect(() => {
    checkLimit();
  }, [checkLimit]);

  return { usageStatus, checkLimit, recordUsage };
}
