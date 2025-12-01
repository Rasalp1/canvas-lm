# Usage Limiting Implementation Plan

## Overview
This document outlines the implementation plan for usage limiting in Canvas LM to prevent excessive costs while providing a fair free tier experience. The system will mirror ChatGPT's free tier usage limits.

## ChatGPT Free Tier Limits (as of December 2024)

### Usage Limits
- **Message Limit**: 40 messages per 3 hours
- **Reset Mechanism**: Rolling 3-hour window (not fixed time blocks)
- **Soft Cap Behavior**: After reaching the limit, users must wait until their oldest message in the window expires
- **Grace Period**: No hard cutoff - users can see exact time remaining until next message availability

### User Experience
- Clear messaging about remaining messages
- Countdown timer showing when next message becomes available
- Non-intrusive warnings as limit approaches (e.g., "5 messages remaining")
- Ability to see usage history/timeline

## Technical Architecture

### 1. Firestore Data Model

```javascript
// Collection: userUsageLimits/{userId}
{
  userId: string,
  messages: [
    {
      timestamp: Timestamp,
      messageId: string,
      courseChatId: string // Track per-course usage
    }
  ],
  metadata: {
    totalMessagesAllTime: number,
    lastResetDate: Timestamp,
    createdAt: Timestamp,
    updatedAt: Timestamp
  }
}

// Collection: usageLimitConfig (admin-controlled)
{
  maxMessagesPerWindow: 40,
  windowDurationHours: 3,
  enabled: true // Feature flag for easy disable
}
```

### 2. Cloud Functions

#### a. Check Usage Limit
```javascript
exports.checkUsageLimit = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const now = admin.firestore.Timestamp.now();
  
  // Get user's usage document
  const usageDoc = await admin.firestore()
    .collection('userUsageLimits')
    .doc(userId)
    .get();
  
  // Get config
  const configDoc = await admin.firestore()
    .collection('usageLimitConfig')
    .doc('default')
    .get();
  
  const config = configDoc.data();
  
  if (!config.enabled) {
    return {
      allowed: true,
      remaining: 999,
      resetTime: null
    };
  }
  
  // Calculate 3-hour window
  const windowStart = new Date(now.toDate().getTime() - (config.windowDurationHours * 60 * 60 * 1000));
  
  // Filter messages within window
  const messages = usageDoc.exists ? usageDoc.data().messages : [];
  const messagesInWindow = messages.filter(msg => 
    msg.timestamp.toDate() >= windowStart
  );
  
  const remaining = config.maxMessagesPerWindow - messagesInWindow.length;
  
  if (remaining <= 0) {
    // Find oldest message to determine reset time
    const oldestMessage = messagesInWindow.sort((a, b) => 
      a.timestamp.toDate() - b.timestamp.toDate()
    )[0];
    
    const resetTime = new Date(
      oldestMessage.timestamp.toDate().getTime() + (config.windowDurationHours * 60 * 60 * 1000)
    );
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: resetTime.toISOString(),
      waitMinutes: Math.ceil((resetTime - now.toDate()) / 60000)
    };
  }
  
  return {
    allowed: true,
    remaining: remaining,
    resetTime: null
  };
});
```

#### b. Record Message Usage
```javascript
exports.recordMessageUsage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { courseChatId, messageId } = data;
  const userId = context.auth.uid;
  const now = admin.firestore.Timestamp.now();
  
  // Get config
  const configDoc = await admin.firestore()
    .collection('usageLimitConfig')
    .doc('default')
    .get();
  
  const config = configDoc.data();
  
  if (!config.enabled) {
    return { success: true, recorded: false };
  }
  
  const userUsageRef = admin.firestore()
    .collection('userUsageLimits')
    .doc(userId);
  
  // Use transaction to ensure atomicity
  await admin.firestore().runTransaction(async (transaction) => {
    const doc = await transaction.get(userUsageRef);
    
    const windowStart = new Date(
      now.toDate().getTime() - (config.windowDurationHours * 60 * 60 * 1000)
    );
    
    let messages = doc.exists ? doc.data().messages : [];
    
    // Clean up old messages outside window (keep data lean)
    messages = messages.filter(msg => msg.timestamp.toDate() >= windowStart);
    
    // Add new message
    messages.push({
      timestamp: now,
      messageId: messageId,
      courseChatId: courseChatId
    });
    
    const updateData = {
      messages: messages,
      'metadata.updatedAt': now
    };
    
    if (doc.exists) {
      transaction.update(userUsageRef, {
        ...updateData,
        'metadata.totalMessagesAllTime': admin.firestore.FieldValue.increment(1)
      });
    } else {
      transaction.set(userUsageRef, {
        userId: userId,
        ...updateData,
        metadata: {
          totalMessagesAllTime: 1,
          createdAt: now,
          updatedAt: now
        }
      });
    }
  });
  
  return { success: true, recorded: true };
});
```

#### c. Get Usage Details
```javascript
exports.getUsageDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const now = admin.firestore.Timestamp.now();
  
  const usageDoc = await admin.firestore()
    .collection('userUsageLimits')
    .doc(userId)
    .get();
  
  const configDoc = await admin.firestore()
    .collection('usageLimitConfig')
    .doc('default')
    .get();
  
  const config = configDoc.data();
  const windowStart = new Date(now.toDate().getTime() - (config.windowDurationHours * 60 * 60 * 1000));
  
  const messages = usageDoc.exists ? usageDoc.data().messages : [];
  const messagesInWindow = messages.filter(msg => 
    msg.timestamp.toDate() >= windowStart
  ).sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
  
  return {
    currentUsage: messagesInWindow.length,
    maxMessages: config.maxMessagesPerWindow,
    windowHours: config.windowDurationHours,
    messages: messagesInWindow.map(msg => ({
      timestamp: msg.timestamp.toDate().toISOString(),
      courseChatId: msg.courseChatId,
      expiresAt: new Date(msg.timestamp.toDate().getTime() + (config.windowDurationHours * 60 * 60 * 1000)).toISOString()
    }))
  };
});
```

### 3. Frontend Integration

#### a. Usage Limit Hook
```javascript
// src/hooks/useUsageLimit.js
import { useState, useEffect, useCallback } from 'react';
import { checkUsageLimit, recordMessageUsage } from '../gemini-cloud-functions';

export function useUsageLimit(user) {
  const [usageStatus, setUsageStatus] = useState({
    allowed: true,
    remaining: 40,
    resetTime: null,
    loading: true
  });

  const checkLimit = useCallback(async () => {
    if (!user) {
      setUsageStatus({ allowed: false, remaining: 0, resetTime: null, loading: false });
      return;
    }

    try {
      const result = await checkUsageLimit();
      setUsageStatus({ ...result, loading: false });
      return result;
    } catch (error) {
      console.error('Error checking usage limit:', error);
      setUsageStatus({ allowed: true, remaining: 40, resetTime: null, loading: false });
      return { allowed: true, remaining: 40 };
    }
  }, [user]);

  useEffect(() => {
    checkLimit();
  }, [checkLimit]);

  const recordUsage = useCallback(async (courseChatId, messageId) => {
    try {
      await recordMessageUsage(courseChatId, messageId);
      await checkLimit(); // Refresh status after recording
    } catch (error) {
      console.error('Error recording usage:', error);
    }
  }, [checkLimit]);

  return { usageStatus, checkLimit, recordUsage };
}
```

#### b. Usage Display Component
```jsx
// src/components/UsageLimitDisplay.jsx
import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';

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
      
      <Progress value={percentage} className="h-2" />
      
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
```

#### c. Chat Input Integration
```javascript
// Modify ChatSection.jsx to integrate usage limiting

const handleSendMessage = async () => {
  // Check usage limit before sending
  const limitCheck = await checkLimit();
  
  if (!limitCheck.allowed) {
    // Show error message
    setError(`You've reached your message limit. Please wait ${limitCheck.waitMinutes} minutes.`);
    return;
  }
  
  // Proceed with sending message
  const messageId = generateMessageId();
  
  // ... existing send logic ...
  
  // Record usage after successful send
  await recordUsage(currentCourseChat.id, messageId);
};
```

### 4. Firestore Security Rules

```javascript
// firestore.rules - Add these rules

match /userUsageLimits/{userId} {
  // Users can only read their own usage data
  allow read: if request.auth != null && request.auth.uid == userId;
  
  // Only cloud functions can write
  allow write: if false;
}

match /usageLimitConfig/{document=**} {
  // Anyone can read the config (to show limits in UI)
  allow read: if request.auth != null;
  
  // Only admins can modify config
  allow write: if false; // Modify through Firebase Console or admin SDK
}
```

### 5. Initial Configuration Setup

```javascript
// Run once to initialize the config
// Can be executed from Firebase Console or a setup script

db.collection('usageLimitConfig').doc('default').set({
  maxMessagesPerWindow: 40,
  windowDurationHours: 3,
  enabled: true,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedBy: 'system'
});
```

## Implementation Phases

### Phase 1: Backend Setup (Day 1)
1.  Create Firestore collections and indexes
2.  Implement cloud functions (checkUsageLimit, recordMessageUsage, getUsageDetails)
3.  Add security rules
4.  Initialize configuration document
5.  Test cloud functions with Postman/Firebase Emulator

### Phase 2: Frontend Integration (Day 2)
1.  Create useUsageLimit hook
2.  Build UsageLimitDisplay component
3.  Integrate into ChatSection
4.  Add wrapper functions in gemini-cloud-functions.js
5.  Test UI flows

### Phase 3: Polish & Testing (Day 3)
1.  Add loading states and error handling
2.  Implement countdown timer
3.  Add usage details modal/drawer
4.  Test edge cases (limit reached, window rolling, etc.)
5.  Performance testing with multiple concurrent users

### Phase 4: Monitoring & Optimization (Ongoing)
1.  Set up Firebase Analytics events for usage tracking
2.  Monitor cloud function costs
3.  Add admin dashboard for usage statistics
4.  Implement A/B testing for different limit configurations

## Cost Analysis

### Current Estimate (per 1000 users/month)
- **Firestore Reads**: ~12,000 reads (12 checks per user session) = $0.44
- **Firestore Writes**: ~1,000 writes (message recordings) = $0.18
- **Cloud Function Invocations**: ~13,000 invocations = $0.52
- **Storage**: Minimal (<1MB per user) = $0.01

**Total Cost**: ~$1.15 per 1000 users/month for usage limiting infrastructure

### Savings from Usage Limiting
- Without limiting: Potential $500-1000/month for unlimited Gemini API usage
- With limiting (40 msgs/3hrs): ~$50-100/month for Gemini API usage
- **Net Savings**: $450-900/month

## Monitoring & Analytics

### Key Metrics to Track
1. **Usage Distribution**
   - Average messages per user per day
   - Peak usage times
   - Users hitting limits

2. **User Behavior**
   - Bounce rate after hitting limit
   - Retention rate for limited users
   - Conversion to paid tier (if introduced)

3. **System Health**
   - Cloud function response times
   - Error rates
   - Firestore read/write patterns

### Firebase Analytics Events
```javascript
// Track usage events
analytics.logEvent('usage_limit_reached', { courseChatId });
analytics.logEvent('usage_limit_reset', { previousUsage: 40 });
analytics.logEvent('message_blocked', { timeToReset: 120 }); // minutes
```

## Future Enhancements

### Premium Tier (Optional)
- **Basic (Free)**: 40 messages / 3 hours
- **Premium**: Unlimited messages for $4.99/month
- Implementation: Add `subscriptionTier` field to user document

### Dynamic Limit Adjustment
- Increase limits during low-usage periods
- Decrease during high-traffic times
- Reward active users with bonus messages

### Grace Messages
- Allow 1-2 messages over limit for urgent queries
- Implement "grace message" system similar to ChatGPT Plus trial

## Rollout Strategy

### Soft Launch
1. Deploy with feature flag disabled
2. Test with small group of beta users
3. Monitor for 48 hours

### Full Launch
1. Enable feature flag for all users
2. Show prominent announcement about new limits
3. Provide FAQ/help documentation
4. Monitor support tickets for issues

### Communication to Users
```
 Usage Limits Now Active

To keep Canvas LM free and sustainable, we've introduced usage limits:
• 40 messages every 3 hours
• Limits reset on a rolling window
• Your usage counter is always visible

This ensures fair access for everyone while keeping the app free!
```

## Testing Checklist

- [ ] User can send messages when under limit
- [ ] User is blocked when limit reached
- [ ] Countdown timer displays correctly
- [ ] Rolling window works (oldest messages expire)
- [ ] Usage counter updates in real-time
- [ ] Error handling for offline scenarios
- [ ] Multiple devices/tabs stay synced
- [ ] Cloud functions handle concurrent requests
- [ ] Security rules prevent unauthorized access

## Conclusion

This implementation provides a robust, ChatGPT-like usage limiting system that:
-  Prevents cost overruns
-  Provides fair free tier access
-  Maintains excellent user experience
-  Scales efficiently
-  Leaves room for future premium tiers

The system is designed to be maintainable, cost-effective, and user-friendly while protecting the sustainability of the free app.
