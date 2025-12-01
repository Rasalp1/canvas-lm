# Usage Limits & User Tiers - Complete Guide

## Table of Contents
1. [Overview](#overview)
2. [User Tier System](#user-tier-system)
3. [Usage Limiting Architecture](#usage-limiting-architecture)
4. [Setup & Configuration](#setup--configuration)
5. [Admin Setup Guide](#admin-setup-guide)
6. [Testing & Monitoring](#testing--monitoring)
7. [Paid Tier Implementation](#paid-tier-implementation)

---

## Overview

Canvas LM implements a ChatGPT-style usage limiting system with three user tiers: Free, Premium, and Admin. This system prevents excessive API costs while providing a fair free tier experience.

**Quick Summary:**
- **Free Tier**: 40 messages per 3-hour rolling window
- **Premium Tier**: Unlimited messages (paid subscription)
- **Admin Tier**: Unlimited messages (internal use)

---

## User Tier System

### Tier Levels

#### 1. Free (Default)
- **Usage Limit**: 40 messages per 3-hour rolling window
- **Features**: All standard Canvas LM features
- **Assignment**: Automatically assigned to new users
- **Cost**: $0

#### 2. Premium
- **Usage Limit**: Unlimited messages
- **Features**: All features + priority support
- **Assignment**: Via paid subscription (Stripe)
- **Cost**: $9.99/month or $99.99/year
- **UI**: Purple/pink gradient badge

#### 3. Admin
- **Usage Limit**: Unlimited messages
- **Features**: Full system access + admin badge
- **Assignment**: Manually set in Firestore
- **Cost**: Internal use only
- **UI**: Gold gradient badge with crown icon 👑

### Database Structure

User tiers are stored in the `users` collection:

```javascript
// users/{userId}
{
  uid: "user123",
  email: "user@example.com",
  displayName: "User Name",
  tier: "free",  // "free" | "premium" | "admin"
  
  // For premium users (Stripe integration)
  stripeCustomerId: "cus_xxxxx",
  subscriptionId: "sub_xxxxx",
  subscriptionStatus: "active",
  subscriptionStartDate: Timestamp,
  
  createdAt: Timestamp,
  lastLoginAt: Timestamp
}
```

### Cloud Function Integration

The tier system is checked by Cloud Functions before enforcing limits:

```javascript
async function getUserTier(userId) {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return 'free';
  return userDoc.data().tier || 'free';
}

// In checkUsageLimit function
const tier = await getUserTier(userId);
if (tier === 'admin' || tier === 'premium') {
  return { allowed: true, remaining: 999, tier, isAdmin: tier === 'admin' };
}
// ... continue with usage limit check for free users
```

---

## Usage Limiting Architecture

### Data Model

```javascript
// Collection: userUsageLimits/{userId}
{
  userId: string,
  messages: [
    {
      timestamp: Timestamp,
      messageId: string,
      courseChatId: string
    }
  ],
  metadata: {
    totalMessagesAllTime: number,
    lastResetDate: Timestamp
  }
}

// Collection: usageLimitConfig/default
{
  maxMessagesPerWindow: 40,
  windowDurationHours: 3,
  enabled: true
}
```

### Cloud Functions

Three Cloud Functions handle usage limiting:

#### 1. checkUsageLimit
**Purpose**: Validates if user can send a message

**Logic**:
1. Get user tier from `users/{userId}`
2. If admin/premium → return unlimited access
3. Retrieve usage config from `usageLimitConfig/default`
4. Query recent messages within 3-hour window
5. Calculate remaining quota
6. Return allowed status with reset time if needed

**Response**:
```javascript
// Admin/Premium
{ allowed: true, remaining: 999, tier: 'admin', isAdmin: true }

// Free user within limit
{ allowed: true, remaining: 15, tier: 'free' }

// Free user at limit
{ allowed: false, remaining: 0, resetTime: '2024-03-15T10:30:00Z', waitMinutes: 45 }
```

#### 2. recordMessageUsage
**Purpose**: Records message after successful send

**Logic**:
1. Check user tier
2. If admin/premium → skip recording
3. Create message record with timestamp
4. Append to `userUsageLimits/{userId}` messages array
5. Clean up messages older than 3 hours

#### 3. getUsageDetails
**Purpose**: Gets detailed usage history for user

**Response**:
```javascript
{
  messagesInWindow: 23,
  totalMessagesAllTime: 456,
  oldestMessageTime: Timestamp,
  nextResetTime: Timestamp
}
```

### Client Integration

Wrapper methods in `gemini-cloud-functions.js`:

```javascript
class GeminiFileSearchCloudClient {
  async checkUsageLimit() {
    const result = await this.functions.httpsCallable('checkUsageLimit')({});
    return result.data;
  }
  
  async recordMessageUsage(courseChatId, messageId) {
    await this.functions.httpsCallable('recordMessageUsage')({
      courseChatId,
      messageId
    });
  }
}
```

Usage in `popup-logic.js`:
```javascript
// Before sending message
const limitCheck = await this.fileSearchManager.checkUsageLimit();
if (!limitCheck.allowed) {
  this.showUsageLimitError(limitCheck);
  return;
}

// Send message to Gemini...

// After successful response
await this.fileSearchManager.recordMessageUsage(courseChatId, messageId);
```

### UI Components

**UsageLimitDisplay.jsx**: Shows usage status in popup

```javascript
// Admin display
<div className="p-3 bg-gradient-to-r from-amber-50 to-yellow-50">
  <div className="flex items-center gap-2">
    <span className="text-2xl">👑</span>
    <span className="font-semibold">Admin Account</span>
    <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500">
      Unlimited
    </Badge>
  </div>
</div>

// Free user display
<div className="p-3 border rounded-lg">
  <div className="flex justify-between mb-2">
    <span>Messages: {used} / {limit}</span>
    <span className="text-sm text-gray-600">{timer}</span>
  </div>
  <ProgressBar value={(used / limit) * 100} />
</div>
```

### Security Rules

Firestore rules protect tier field and usage data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users - protect tier field from user modification
    match /users/{userId} {
      allow read, create: if true;
      allow update: if true && 
        (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['tier']) ||
         request.resource.data.tier == resource.data.tier);
      allow delete: if false;
    }
    
    // Usage limits - read-only for users, write-only for Cloud Functions
    match /userUsageLimits/{userId} {
      allow read: if true;
      allow write: if false;
    }
    
    // Config - read-only for everyone
    match /usageLimitConfig/{document} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

---

## Setup & Configuration

### 1. Initialize Usage Config

Create `usageLimitConfig/default` document in Firestore:

```javascript
{
  maxMessagesPerWindow: 40,
  windowDurationHours: 3,
  enabled: true,
  createdAt: <Firestore Timestamp>,
  updatedAt: <Firestore Timestamp>
}
```

**Via Firebase Console:**
1. Navigate to Firestore Database
2. Create collection `usageLimitConfig`
3. Add document with ID `default`
4. Add the fields above

### 2. Deploy Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Functions deployed:
- `checkUsageLimit`
- `recordMessageUsage`
- `getUsageDetails`

### 3. Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

### 4. Build Extension

```bash
npm run build
```

---

## Admin Setup Guide

### Setting Up Your Admin Account

**Step 1: Find Your User ID**

1. Open Canvas LM extension
2. Sign in with your account
3. Open browser console (F12)
4. Run: `firebase.auth().currentUser.uid`
5. Copy the user ID

**Step 2: Set Admin Tier**

**Option A: Firebase Console (Recommended)**
1. Go to [Firebase Console](https://console.firebase.google.com/project/canvas-lm/firestore)
2. Navigate to Firestore → `users` collection
3. Find your user document
4. Add/edit field:
   - Name: `tier`
   - Value: `admin`
   - Type: string

**Option B: Firebase CLI**
```bash
firebase firestore:set users/YOUR_USER_ID '{"tier":"admin"}' --project canvas-lm --merge
```

**Step 3: Verify**

1. Reload extension
2. Open popup
3. You should see:
   - Gold gradient badge with 👑
   - "Admin Account" label
   - "Unlimited" display

### Managing Other Users

**Grant Premium Access:**
```javascript
db.collection('users').doc(userId).update({ tier: 'premium' });
```

**Revoke Premium/Admin:**
```javascript
db.collection('users').doc(userId).update({ tier: 'free' });
```

**Bulk Management:**
```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

const batch = db.batch();
['userId1', 'userId2', 'userId3'].forEach(userId => {
  batch.update(db.collection('users').doc(userId), { tier: 'admin' });
});
await batch.commit();
```

---

## Testing & Monitoring

### Testing Checklist

**1. Test Free Tier Limits**
- [ ] Send 40 messages as free user
- [ ] Verify error message on 41st attempt
- [ ] Check countdown timer displays correctly
- [ ] Verify messages array in `userUsageLimits/{userId}`

**2. Test Rolling Window**
- [ ] Wait 3 hours
- [ ] Oldest messages should expire
- [ ] Quota refreshes automatically
- [ ] Can send messages again

**3. Test Admin Bypass**
- [ ] Set user tier to `admin`
- [ ] Verify unlimited sending
- [ ] Check gold badge displays
- [ ] Confirm usage not recorded in database

**4. Test Premium Bypass**
- [ ] Set user tier to `premium`
- [ ] Verify unlimited sending
- [ ] Check premium badge displays
- [ ] Confirm usage not recorded

### Monitoring

**Firestore Console:**
- Check `userUsageLimits` collection for usage data
- Monitor message counts per user
- Review usage patterns

**Cloud Functions Logs:**
```bash
firebase functions:log --only checkUsageLimit
firebase functions:log --only recordMessageUsage
```

**Key Metrics:**
- Average messages per user per day
- Free users hitting limit (conversion opportunity)
- Error rates in Cloud Functions
- Firestore read/write costs

### Cost Analysis

**Per Message Costs:**
- 1 Firestore read (check limit): $0.00000036
- 1 Firestore write (record usage): $0.00000108
- Total per message: ~$0.00000144

**For 1000 active free users (40 messages/day each):**
- Daily operations: 80,000 (40k reads + 40k writes)
- Daily cost: $0.12
- Monthly cost: ~$3.60

**Admin/Premium users have zero Firestore cost** (no usage tracking).

---

## Paid Tier Implementation

### Overview

Implement paid Premium subscriptions using Stripe to monetize the extension while maintaining a generous free tier.

### Pricing Strategy

| Plan | Price | Features | Target Audience |
|------|-------|----------|----------------|
| Free | $0/mo | 40 messages/3hrs | Students trying service |
| Premium Monthly | $9.99/mo | Unlimited messages | Regular users |
| Premium Annual | $99.99/yr | Unlimited (2 months free) | Committed users |

**Competitive Positioning:**
- ChatGPT Plus: $20/mo
- Claude Pro: $20/mo
- **Canvas LM Premium**: $9.99/mo (50% cheaper, student-focused)

### Technical Setup

#### 1. Install Stripe

```bash
cd functions
npm install stripe
```

#### 2. Configure Stripe

```bash
firebase functions:config:set stripe.secret_key="sk_live_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."
```

#### 3. Create Stripe Products

In Stripe Dashboard:
1. Create product: "Canvas LM Premium Monthly"
   - Price: $9.99/month recurring
   - Copy price ID
2. Create product: "Canvas LM Premium Annual"
   - Price: $99.99/year recurring
   - Copy price ID

#### 4. Add Stripe Cloud Functions

Create `functions/stripe-functions.js`:

```javascript
const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret_key);

// Create checkout session
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const userId = context.auth.uid;
  const { priceId } = data;

  // Get or create Stripe customer
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  let customerId = userDoc.data()?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userDoc.data()?.email,
      metadata: { firebaseUID: userId }
    });
    customerId = customer.id;
    await admin.firestore().collection('users').doc(userId).update({
      stripeCustomerId: customerId
    });
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${data.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: data.cancelUrl,
    metadata: { firebaseUID: userId }
  });

  return { url: session.url };
});

// Stripe webhook handler
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody, 
      sig, 
      functions.config().stripe.webhook_secret
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleSubscriptionCreated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object);
      break;
  }

  res.json({ received: true });
});

async function handleSubscriptionCreated(session) {
  const userId = session.metadata.firebaseUID;
  await admin.firestore().collection('users').doc(userId).update({
    tier: 'premium',
    subscriptionId: session.subscription,
    subscriptionStatus: 'active',
    subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function handleSubscriptionCanceled(subscription) {
  const customer = await stripe.customers.retrieve(subscription.customer);
  const userId = customer.metadata.firebaseUID;
  await admin.firestore().collection('users').doc(userId).update({
    tier: 'free',
    subscriptionStatus: 'canceled',
    subscriptionEndDate: admin.firestore.FieldValue.serverTimestamp()
  });
}

// Customer portal for managing subscription
exports.createPortalSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const userDoc = await admin.firestore()
    .collection('users')
    .doc(context.auth.uid)
    .get();
  
  const customerId = userDoc.data()?.stripeCustomerId;
  if (!customerId) {
    throw new functions.https.HttpsError('failed-precondition', 'No customer ID');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: data.returnUrl
  });

  return { url: session.url };
});
```

Import in `functions/index.js`:
```javascript
const stripeFunc = require('./stripe-functions');
exports.createCheckoutSession = stripeFunc.createCheckoutSession;
exports.stripeWebhook = stripeFunc.stripeWebhook;
exports.createPortalSession = stripeFunc.createPortalSession;
```

#### 5. Create Pricing UI Component

`src/components/PricingPage.jsx`:

```javascript
import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    interval: '/forever',
    features: ['40 messages per 3 hours', 'All Canvas courses', 'PDF support'],
    priceId: null,
    current: true
  },
  {
    name: 'Premium',
    price: '$9.99',
    interval: '/month',
    badge: 'Popular',
    features: ['Unlimited messages', 'Priority support', 'Early features'],
    priceId: 'price_xxxxx' // From Stripe Dashboard
  },
  {
    name: 'Annual',
    price: '$99.99',
    interval: '/year',
    badge: 'Best Value',
    savings: 'Save $20',
    features: ['Unlimited messages', 'Priority support', '2 months free'],
    priceId: 'price_yyyyy'
  }
];

export default function PricingPage({ currentTier }) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async (priceId) => {
    setLoading(true);
    try {
      const functions = getFunctions();
      const createCheckout = httpsCallable(functions, 'createCheckoutSession');
      
      const result = await createCheckout({
        priceId,
        successUrl: `${window.location.origin}/settings.html?success=true`,
        cancelUrl: `${window.location.origin}/settings.html`
      });
      
      window.location.href = result.data.url;
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-3 gap-6 p-6">
      {PLANS.map(plan => (
        <PlanCard 
          key={plan.name}
          plan={plan}
          currentTier={currentTier}
          loading={loading}
          onUpgrade={() => handleUpgrade(plan.priceId)}
        />
      ))}
    </div>
  );
}
```

#### 6. Deploy Everything

```bash
# Deploy functions
firebase deploy --only functions

# Build extension
npm run build

# Test in Chrome
```

#### 7. Configure Stripe Webhook

1. In Stripe Dashboard → Webhooks
2. Add endpoint: `https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/stripeWebhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy webhook secret
5. Run: `firebase functions:config:set stripe.webhook_secret="whsec_..."`
6. Redeploy: `firebase deploy --only functions`

### User Flow

**Upgrade Process:**
1. User hits 40 message limit
2. "Upgrade to Premium" button shown
3. Click → Pricing page opens
4. Select plan → Redirected to Stripe Checkout
5. Enter payment info
6. Stripe processes payment
7. Webhook updates user tier to `premium`
8. User redirected back → Success message
9. Unlimited messages immediately available

**Subscription Management:**
1. Open Settings → Account section
2. Click "Manage Subscription"
3. Redirected to Stripe Customer Portal
4. Can cancel, update card, view invoices
5. Changes sync automatically via webhooks

### Revenue Projections

**Conservative Scenario (1000 active users):**
- 80% free (800 users) = $0
- 15% premium monthly (150 × $9.99) = $1,498.50/mo
- 5% premium annual (50 × $99.99/12) = $416.63/mo
- **Total MRR**: ~$1,915/month
- **Annual**: ~$23,000

**Costs:**
- Stripe fees (2.9% + $0.30): ~$60/mo
- Firebase (Functions + Firestore): ~$45/mo
- **Net Revenue**: ~$1,810/month

**Break-even**: 12 premium subscribers

### Marketing Strategy

**In-App Prompts:**
- At 20 messages: "You've used 50% of free messages"
- At 35 messages: "5 messages remaining. Upgrade for unlimited?"
- At 40 messages: "Limit reached. Upgrade to Premium!"

**Email Campaign:**
- Welcome email with upgrade CTA
- Limit warning at 35 messages
- Re-engagement for users who hit limit

**Social Proof:**
- "Join 500+ premium users"
- Student testimonials
- University partnerships

---

## Troubleshooting

### Admin badge not showing
- Reload extension
- Sign out and back in
- Check `tier` field in Firestore
- Verify Cloud Functions deployed

### Usage limit not working
- Check `usageLimitConfig/default` exists
- Verify `enabled: true`
- Check Cloud Function logs
- Test with `checkUsageLimit` directly

### Stripe checkout fails
- Verify API keys configured
- Check webhook secret set
- Review Stripe Dashboard logs
- Test in Stripe test mode first

### User stuck at limit incorrectly
- Check `userUsageLimits/{userId}` messages array
- Verify timestamps within 3-hour window
- Manually delete old messages if needed
- Check system clock accuracy

---

## Success Metrics

### Track These KPIs

**Usage Metrics:**
- Daily active users
- Average messages per user
- Users hitting free limit daily
- Peak usage hours

**Conversion Metrics:**
- Free → Premium conversion rate (target: 5-10%)
- Checkout abandonment rate
- Time to upgrade after hitting limit

**Revenue Metrics:**
- Monthly Recurring Revenue (MRR)
- Customer Lifetime Value (LTV)
- Churn rate (target: <5%/month)
- Average revenue per user (ARPU)

**Technical Metrics:**
- Cloud Function error rate
- Average response time
- Firestore costs per user
- Stripe webhook success rate

---

## References

- **Implementation Files:**
  - `/functions/index.js` - Cloud Functions
  - `/src/components/UsageLimitDisplay.jsx` - UI component
  - `/src/hooks/useUsageLimit.js` - React hook
  - `/src/popup-logic.js` - Integration logic
  - `/firestore.rules` - Security rules

- **External Docs:**
  - [Stripe Documentation](https://stripe.com/docs)
  - [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
  - [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

- **Related Docs:**
  - `CLOUD_FUNCTIONS_SETUP.md` - Cloud Functions guide
  - `FIREBASE_SETUP.md` - Firebase configuration
  - `FIRESTORE_ARCHITECTURE.md` - Database design
