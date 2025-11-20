# Migration Strategy: User-Owned to Shared Courses

## 🎯 Overview

This document outlines the strategy for migrating from the old user-owned course model to the new shared course model.

## 📊 What Changed

### Old Model (User-Owned)
- Each user had their own copy of courses (`userId` field)
- Duplicate PDFs across users for same course
- User-owned Gemini File Search stores (`users/{userId}/fileSearchStores/`)
- Each user created separate RAG stores for same course

### New Model (Shared)
- Courses are shared (`NO userId` field in courses)
- Single copy of PDFs per course
- Enrollments track user access (`users/{userId}/enrollments/`)
- Single shared Gemini store per course
- Private chat history per user

## 🔄 Migration Phases

### Phase 1: Deploy New Code (Non-Breaking)
**Status:** ✅ Complete

**Changes:**
- ✅ Updated `firestore-helpers.js` with new functions
- ✅ Updated Cloud Functions with enrollment verification
- ✅ Added enrollment management functions
- ✅ Added chat session management
- ✅ Kept old functions with deprecation warnings

**Impact:** Zero downtime - old and new code coexist

### Phase 2: Update Frontend (Progressive)
**Status:** ⏳ Pending

**Tasks:**
1. Update `content-script.js` to use new `saveCourse()` and `enrollUserInCourse()`
2. Update `popup.js` to use new `getUserCourses()` (fetches via enrollments)
3. Update UI to call `createCourseStore` instead of `createStore`
4. Update chat UI to call `queryCourseStore` instead of `queryWithFileSearch`
5. Add chat history display using `getUserChatSessions()`

**Testing Strategy:**
- Test with fresh user account first
- Verify enrollment creation
- Verify shared store access
- Verify chat history privacy

### Phase 3: Data Migration (Manual/Scripted)
**Status:** ⏳ Pending

**Migration Script Strategy:**

```javascript
// migration-script.js (to be run in Firestore console or Cloud Function)

async function migrateUserOwnedToSharedCourses() {
  const db = admin.firestore();
  
  // 1. Get all existing courses
  const coursesSnapshot = await db.collection('courses').get();
  
  // Group courses by courseId (Canvas ID)
  const courseGroups = new Map();
  
  coursesSnapshot.forEach(doc => {
    const data = doc.data();
    const courseId = doc.id;
    const userId = data.userId;
    
    if (!courseGroups.has(courseId)) {
      courseGroups.set(courseId, []);
    }
    
    courseGroups.get(courseId).push({
      courseId,
      userId,
      data
    });
  });
  
  // 2. For each course group, merge into single shared course
  for (const [courseId, userCourses] of courseGroups.entries()) {
    // Pick the most recent scan as source of truth
    const latestCourse = userCourses.sort((a, b) => {
      const aTime = a.data.lastScannedAt?.toMillis() || 0;
      const bTime = b.data.lastScannedAt?.toMillis() || 0;
      return bTime - aTime;
    })[0];
    
    // Create shared course (remove userId)
    await db.collection('courses').doc(courseId).set({
      courseName: latestCourse.data.courseName,
      courseCode: latestCourse.data.courseCode || '',
      canvasUrl: latestCourse.data.canvasUrl,
      canvasInstance: extractDomain(latestCourse.data.canvasUrl),
      firstScannedAt: latestCourse.data.createdAt,
      lastScannedAt: latestCourse.data.lastScannedAt,
      pdfCount: latestCourse.data.pdfCount || 0,
      fileSearchStoreName: latestCourse.data.fileSearchStoreName || null,
      totalEnrollments: userCourses.length,
      createdBy: latestCourse.userId
    }, { merge: true });
    
    // 3. Create enrollments for all users
    for (const userCourse of userCourses) {
      await db
        .collection('users').doc(userCourse.userId)
        .collection('enrollments').doc(courseId)
        .set({
          courseId: courseId,
          courseName: userCourse.data.courseName,
          enrolledAt: userCourse.data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          lastAccessedAt: userCourse.data.lastScannedAt || admin.firestore.FieldValue.serverTimestamp(),
          favorite: false,
          migratedFrom: 'old-model' // Track migration
        });
    }
    
    console.log(`Migrated course ${courseId} for ${userCourses.length} users`);
  }
  
  // 4. Merge duplicate Gemini stores
  // If multiple users created stores for same course, keep one
  const storesToMigrate = [];
  
  for (const [courseId, userCourses] of courseGroups.entries()) {
    const storesForCourse = userCourses
      .filter(uc => uc.data.fileSearchStoreName)
      .map(uc => ({
        userId: uc.userId,
        storeName: uc.data.fileSearchStoreName
      }));
    
    if (storesForCourse.length > 1) {
      // Multiple stores for same course - keep first, note others
      const primaryStore = storesForCourse[0];
      const duplicates = storesForCourse.slice(1);
      
      storesToMigrate.push({
        courseId,
        primaryStore: primaryStore.storeName,
        duplicates: duplicates.map(s => s.storeName),
        note: 'Manual cleanup required - delete duplicate Gemini stores'
      });
    }
  }
  
  console.log('Migration complete!');
  console.log('Stores requiring manual cleanup:', storesToMigrate);
  
  return {
    coursesProcessed: courseGroups.size,
    storesToCleanup: storesToMigrate
  };
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}
```

**Manual Steps After Migration:**
1. Review duplicate Gemini stores and delete extras (costs money)
2. Verify enrollment counts match expected users
3. Test with existing users to ensure they see their courses
4. Monitor Cloud Function logs for any access errors

### Phase 4: Cleanup (After Verification)
**Status:** ⏳ Future

**Tasks:**
1. Remove deprecated Cloud Functions (`createStore`, `queryWithFileSearch`)
2. Remove old `getUserCourses()` implementation that queries by `userId`
3. Remove `users/{userId}/fileSearchStores/` subcollection references
4. Update Firestore security rules to prevent `userId` field in courses

## 🧪 Testing Checklist

### New User Flow (Should Work Immediately)
- [ ] New user scans Canvas course
- [ ] Course created as shared (no userId field)
- [ ] Enrollment created in `users/{userId}/enrollments/`
- [ ] Course appears in user's course list
- [ ] User can create Gemini store for course
- [ ] Store linked to course (not user)
- [ ] User can query store
- [ ] Chat history saved privately

### Existing User Flow (After Migration)
- [ ] Existing user's courses migrated to enrollments
- [ ] User sees their courses via enrollments
- [ ] Duplicate courses merged
- [ ] Existing Gemini stores still accessible
- [ ] Old course documents preserved

### Multi-User Flow (Key Test)
- [ ] User A scans course → creates shared course
- [ ] User B scans SAME course → creates enrollment, no duplicate course
- [ ] User A creates Gemini store
- [ ] User B can access SAME Gemini store
- [ ] User A's chats private
- [ ] User B's chats private
- [ ] Both users see same PDFs

## 🚨 Risks & Mitigation

### Risk 1: Data Loss During Migration
**Mitigation:**
- Backup Firestore before migration
- Test migration script on copy of production data first
- Keep old functions with deprecation warnings (rollback option)

### Risk 2: Users Lose Access to Courses
**Mitigation:**
- Migration creates enrollments for ALL existing users
- Old functions still work during transition period
- Add logging to detect access issues

### Risk 3: Duplicate Gemini Stores Cost Money
**Mitigation:**
- Identify duplicates during migration
- Provide list of stores to delete manually
- Update UI to prevent creating duplicate stores

### Risk 4: Breaking Changes for Active Users
**Mitigation:**
- Deploy backend changes first (non-breaking)
- Frontend changes use feature flags
- Gradual rollout: new users first, then existing users

## 📅 Recommended Timeline

### Week 1: Preparation
- ✅ Update documentation (FIRESTORE_ARCHITECTURE.md)
- ✅ Update backend code (firestore-helpers.js, Cloud Functions)
- [ ] Write migration script
- [ ] Test migration script on staging data

### Week 2: Frontend Updates
- [ ] Update content-script.js for new course saving
- [ ] Update popup.js for enrollment-based queries
- [ ] Add chat history UI
- [ ] Test with new user accounts

### Week 3: Migration
- [ ] Backup production Firestore
- [ ] Run migration script
- [ ] Verify enrollment creation
- [ ] Clean up duplicate Gemini stores
- [ ] Monitor for errors

### Week 4: Monitoring & Cleanup
- [ ] Monitor Cloud Function logs
- [ ] Address any user reports
- [ ] Remove deprecated code
- [ ] Update Firestore security rules

## 🔧 Rollback Plan

If migration fails:

1. **Immediate Rollback:**
   - Revert frontend to use old functions
   - Old Cloud Functions still available (deprecated but functional)
   - Users continue with old model

2. **Data Rollback (If Needed):**
   - Restore Firestore from backup
   - Delete enrollment subcollections
   - Restore original courses collection

3. **Investigate & Retry:**
   - Review error logs
   - Fix migration script
   - Test again on staging
   - Retry migration when ready

## 📝 Notes for Developers

### When Adding New Features
- Use enrollment-based access: `verifyEnrollment(userId, courseId)`
- Never add `userId` to courses collection
- Always check enrollment before course access
- Save user-specific data to `users/{userId}/` subcollections

### When Debugging
- Check enrollments first: `users/{userId}/enrollments/{courseId}`
- Check shared course exists: `courses/{courseId}`
- Check store linked to course: `courses/{courseId}/fileSearchStoreName`
- Check chat history: `users/{userId}/chatSessions/`

### Firestore Console Queries

```javascript
// Find courses without enrollments (orphaned)
db.collection('courses').get().then(snapshot => {
  snapshot.docs.forEach(async doc => {
    const courseId = doc.id;
    // Check if any user is enrolled
    const enrollments = await db.collectionGroup('enrollments')
      .where('courseId', '==', courseId)
      .get();
    
    if (enrollments.empty) {
      console.log('Orphaned course:', courseId);
    }
  });
});

// Find users without enrollments but with old courses
db.collection('courses').where('userId', '!=', null).get().then(snapshot => {
  console.log(`Found ${snapshot.size} courses with userId field (old model)`);
});
```

## ✅ Success Criteria

Migration is successful when:

1. ✅ All existing users have enrollments for their courses
2. ✅ No duplicate courses for same Canvas course ID
3. ✅ All users can access shared course PDFs
4. ✅ Each course has ONE Gemini store
5. ✅ Users can query courses they're enrolled in
6. ✅ Chat histories are private per user
7. ✅ No `userId` fields in courses collection
8. ✅ Zero errors in Cloud Function logs
9. ✅ All users report courses working as expected
10. ✅ Cost savings from reduced duplicate stores

## 📚 Related Documentation

- [FIRESTORE_ARCHITECTURE.md](./FIRESTORE_ARCHITECTURE.md) - Complete database structure
- [AUTHENTICATION.md](./AUTHENTICATION.md) - Chrome Identity authentication
- [CLOUD_FUNCTIONS_SETUP.md](./CLOUD_FUNCTIONS_SETUP.md) - Cloud Functions deployment

---

**Last Updated:** 2025-11-20  
**Migration Status:** Phase 1 Complete, Phase 2 Pending  
**Next Action:** Update content-script.js and popup.js
