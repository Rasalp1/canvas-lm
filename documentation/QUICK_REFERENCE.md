# Quick Reference - Usage Limits & Tiers

This is a quick reference guide for common tasks. For comprehensive documentation, see [USAGE_LIMITS_AND_TIERS.md](./USAGE_LIMITS_AND_TIERS.md).

## Quick Links

- [Set User to Admin](#set-user-to-admin)
- [Grant Premium Access](#grant-premium-access)
- [Check User's Current Tier](#check-users-current-tier)
- [Initialize Usage Config](#initialize-usage-config)
- [Deploy Cloud Functions](#deploy-cloud-functions)
- [Test Usage Limits](#test-usage-limits)

---

## Set User to Admin

**Via Firestore Console:**
1. Go to Firebase Console → Firestore
2. Navigate to `users` collection
3. Find user document by UID
4. Add/edit field: `tier` = `"admin"` (string)

**Via Firebase CLI:**
```bash
firebase firestore:set users/USER_ID_HERE '{"tier":"admin"}' --merge
```

**Result:** User gets unlimited messages + gold admin badge

---

## Grant Premium Access

**Manually (for testing):**
```bash
firebase firestore:set users/USER_ID_HERE '{"tier":"premium"}' --merge
```

**Via Stripe (production):**
- User upgrades through pricing page
- Stripe webhook automatically sets `tier: "premium"`
- No manual intervention needed

**Result:** User gets unlimited messages + premium badge

---

## Check User's Current Tier

**Browser Console (when signed in):**
```javascript
// Get current user ID
firebase.auth().currentUser.uid

// Check tier in Firestore Console
// Navigate to users/{userId} and look at tier field
```

**In code:**
```javascript
const userDoc = await db.collection('users').doc(userId).get();
const tier = userDoc.data()?.tier || 'free';
console.log('User tier:', tier);
```

---

## Initialize Usage Config

**Required on first setup only.**

Firestore Console:
1. Create collection: `usageLimitConfig`
2. Create document ID: `default`
3. Add fields:
   ```
   maxMessagesPerWindow: 40 (number)
   windowDurationHours: 3 (number)
   enabled: true (boolean)
   ```

**Via Firebase CLI:**
```bash
firebase firestore:set usageLimitConfig/default '{
  "maxMessagesPerWindow": 40,
  "windowDurationHours": 3,
  "enabled": true
}' --merge
```

---

## Deploy Cloud Functions

```bash
cd "/path/to/Canva LM"
firebase deploy --only functions
```

**Functions deployed:**
- `checkUsageLimit` - Checks if user can send message
- `recordMessageUsage` - Records message after sending
- `getUsageDetails` - Gets usage history
- `createCheckoutSession` - Stripe checkout (if implemented)
- `stripeWebhook` - Stripe webhook handler (if implemented)
- `createPortalSession` - Stripe portal (if implemented)

---

## Test Usage Limits

**Test as Free User:**
1. Set your tier to `"free"` in Firestore
2. Reload extension
3. Send 40 messages
4. Verify error on 41st message
5. Check usage counter displays correctly

**Test as Admin:**
1. Set your tier to `"admin"` in Firestore
2. Reload extension
3. Verify gold badge shows
4. Send unlimited messages
5. Check no usage recording in Firestore

**Check Firestore Data:**
- Collection: `userUsageLimits/{userId}`
- Should contain messages array with timestamps
- Messages should expire after 3 hours

---

## Common Issues

### "Admin badge not showing"
```bash
# 1. Check Firestore
firebase firestore:get users/YOUR_USER_ID

# 2. Verify tier field
# Should show: tier: "admin"

# 3. Reload extension
# chrome://extensions → Click reload

# 4. Clear cache
# Remove and reinstall extension
```

### "Usage limit not enforced"
```bash
# 1. Check config exists
firebase firestore:get usageLimitConfig/default

# 2. Check enabled: true
# Should show: enabled: true

# 3. Check Cloud Functions deployed
firebase functions:list

# 4. Check function logs
firebase functions:log --only checkUsageLimit
```

### "Stripe checkout not working"
```bash
# 1. Verify config
firebase functions:config:get

# Should show:
# stripe.secret_key: "sk_..."
# stripe.webhook_secret: "whsec_..."

# 2. Set if missing
firebase functions:config:set stripe.secret_key="sk_..."
firebase functions:config:set stripe.webhook_secret="whsec_..."

# 3. Redeploy
firebase deploy --only functions
```

---

## Useful Commands

### View all users and their tiers
```javascript
// Run in Firebase Console or Admin SDK
db.collection('users')
  .get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(doc.id, data.email, data.tier || 'free');
    });
  });
```

### Reset user's usage manually
```bash
firebase firestore:delete userUsageLimits/USER_ID_HERE
```

### Change usage limits
```bash
# Example: 100 messages per 6 hours
firebase firestore:set usageLimitConfig/default '{
  "maxMessagesPerWindow": 100,
  "windowDurationHours": 6,
  "enabled": true
}' --merge
```

### Disable usage limiting (emergency)
```bash
firebase firestore:set usageLimitConfig/default '{"enabled": false}' --merge
```

### Bulk set users to premium
```javascript
// Run in Firebase Admin SDK
const batch = db.batch();
['userId1', 'userId2', 'userId3'].forEach(uid => {
  batch.update(db.collection('users').doc(uid), { tier: 'premium' });
});
await batch.commit();
```

---

## Tier Comparison

| Feature | Free | Premium | Admin |
|---------|------|---------|-------|
| Messages | 40 per 3hrs | Unlimited | Unlimited |
| Cost | $0 | $9.99/mo | Internal |
| Badge | None | Purple | Gold 👑 |
| Priority Support | ❌ | ✅ | ✅ |
| Usage Tracked | ✅ | ❌ | ❌ |
| Assignment | Auto | Stripe | Manual |

---

## Configuration Locations

- **User Tiers**: `users/{userId}` → `tier` field
- **Usage Data**: `userUsageLimits/{userId}` → `messages` array
- **Limits Config**: `usageLimitConfig/default`
- **Cloud Functions**: `/functions/index.js`
- **Security Rules**: `/firestore.rules`
- **UI Component**: `/src/components/UsageLimitDisplay.jsx`
- **Integration**: `/src/popup-logic.js`

---

## Emergency Procedures

### Disable usage limiting globally
```bash
firebase firestore:set usageLimitConfig/default '{"enabled": false}' --merge
```
Effect: All users can send unlimited messages immediately

### Reset specific user's limit
```bash
firebase firestore:delete userUsageLimits/USER_ID
```
Effect: User's message count resets to 0

### Grant temporary admin access
```bash
firebase firestore:set users/USER_ID '{"tier":"admin"}' --merge
# Later:
firebase firestore:set users/USER_ID '{"tier":"free"}' --merge
```

---

For complete documentation, see [USAGE_LIMITS_AND_TIERS.md](./USAGE_LIMITS_AND_TIERS.md)
