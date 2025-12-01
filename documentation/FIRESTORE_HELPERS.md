# Firestore Helper Functions - Next Steps

## Overview

Now that authentication is working (Chrome Identity) and Firebase is initialized (Firestore only), we need to create helper functions to manage data storage and retrieval.

## Data We Need to Store

Based on the current implementation, we have:

### 1. **User Data**
- User profile from Chrome Identity
- Last seen timestamp
- User preferences (future)

### 2. **Course Data**
- Course ID, name, code
- Canvas URL
- Last scanned timestamp
- PDF count

### 3. **Document/PDF Data**
- Course association
- File metadata (name, URL, size)
- Gemini file IDs (for RAG)
- Upload status
- Download timestamp

### 4. **Chat Sessions** (Future)
- Conversation history
- Associated course/documents
- Timestamps

## Firestore Schema Design

```javascript
// Firestore structure:
users/{userId}/
  - email: string
  - displayName: string
  - createdAt: timestamp
  - lastSeenAt: timestamp
  - preferences: object (future)

courses/{courseId}/
  - userId: string (owner)
  - courseName: string
  - courseCode: string
  - canvasUrl: string
  - lastScannedAt: timestamp
  - pdfCount: number
  - documents: subcollection

courses/{courseId}/documents/{docId}/
  - fileName: string
  - fileUrl: string
  - fileSize: number
  - fileType: string (e.g., "application/pdf")
  - scannedFrom: string (e.g., "files", "modules", "pages")
  - uploadedAt: timestamp
  - geminiFileId: string (null until uploaded)
  - uploadStatus: "pending" | "uploading" | "completed" | "failed"

chatSessions/{sessionId}/
  - userId: string
  - courseId: string
  - createdAt: timestamp
  - lastMessageAt: timestamp
  - messages: subcollection (future)
```

## Helper Functions to Create

### Phase 1: Core CRUD Operations

Create a new file: `src/firestore-helpers.js`

```javascript
// firestore-helpers.js
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  addDoc
} from 'firebase/firestore';

// ==================== USER OPERATIONS ====================

/**
 * Create or update user in Firestore
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {Object} userData - User data from Chrome Identity
 */
export async function saveUser(db, userId, userData) {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      email: userData.email,
      displayName: userData.displayName || userData.email.split('@')[0],
      lastSeenAt: Timestamp.now(),
      createdAt: Timestamp.now()
    }, { merge: true }); // merge: true prevents overwriting existing data
    
    console.log('User saved to Firestore:', userId);
    return { success: true };
  } catch (error) {
    console.error('Error saving user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user data from Firestore
 */
export async function getUser(db, userId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return { success: true, data: userSnap.data() };
    } else {
      return { success: false, error: 'User not found' };
    }
  } catch (error) {
    console.error('Error getting user:', error);
    return { success: false, error: error.message };
  }
}

// ==================== COURSE OPERATIONS ====================

/**
 * Save course information to Firestore
 */
export async function saveCourse(db, userId, courseData) {
  try {
    const courseRef = doc(db, 'courses', courseData.courseId);
    await setDoc(courseRef, {
      userId: userId,
      courseName: courseData.courseName,
      courseCode: courseData.courseCode || '',
      canvasUrl: courseData.canvasUrl,
      lastScannedAt: Timestamp.now(),
      pdfCount: courseData.pdfCount || 0,
      createdAt: Timestamp.now()
    }, { merge: true });
    
    console.log('Course saved to Firestore:', courseData.courseId);
    return { success: true };
  } catch (error) {
    console.error('Error saving course:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get course data from Firestore
 */
export async function getCourse(db, courseId) {
  try {
    const courseRef = doc(db, 'courses', courseId);
    const courseSnap = await getDoc(courseRef);
    
    if (courseSnap.exists()) {
      return { success: true, data: courseSnap.data() };
    } else {
      return { success: false, error: 'Course not found' };
    }
  } catch (error) {
    console.error('Error getting course:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all courses for a user
 */
export async function getUserCourses(db, userId) {
  try {
    const coursesRef = collection(db, 'courses');
    const q = query(coursesRef, where('userId', '==', userId), orderBy('lastScannedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const courses = [];
    querySnapshot.forEach((doc) => {
      courses.push({ id: doc.id, ...doc.data() });
    });
    
    return { success: true, data: courses };
  } catch (error) {
    console.error('Error getting user courses:', error);
    return { success: false, error: error.message };
  }
}

// ==================== DOCUMENT/PDF OPERATIONS ====================

/**
 * Save PDF document metadata to Firestore
 */
export async function saveDocument(db, courseId, pdfData) {
  try {
    // Use PDF URL as document ID to prevent duplicates
    const docId = btoa(pdfData.url).replace(/[/+=]/g, '_'); // Base64 encode and sanitize
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    
    await setDoc(docRef, {
      fileName: pdfData.title || pdfData.fileName,
      fileUrl: pdfData.url,
      fileSize: pdfData.size || 0,
      fileType: pdfData.type || 'application/pdf',
      scannedFrom: pdfData.scannedFrom || 'unknown',
      uploadedAt: Timestamp.now(),
      geminiFileId: null,
      uploadStatus: 'pending'
    }, { merge: true });
    
    console.log('Document saved to Firestore:', docId);
    return { success: true, docId: docId };
  } catch (error) {
    console.error('Error saving document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save multiple documents (batch operation)
 */
export async function saveDocuments(db, courseId, pdfsArray) {
  const results = [];
  
  for (const pdf of pdfsArray) {
    const result = await saveDocument(db, courseId, pdf);
    results.push({ pdf: pdf.title, ...result });
  }
  
  return results;
}

/**
 * Get all documents for a course
 */
export async function getCourseDocuments(db, courseId) {
  try {
    const docsRef = collection(db, 'courses', courseId, 'documents');
    const querySnapshot = await getDocs(docsRef);
    
    const documents = [];
    querySnapshot.forEach((doc) => {
      documents.push({ id: doc.id, ...doc.data() });
    });
    
    return { success: true, data: documents };
  } catch (error) {
    console.error('Error getting course documents:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update document upload status
 */
export async function updateDocumentStatus(db, courseId, docId, status, geminiFileId = null) {
  try {
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    const updateData = {
      uploadStatus: status,
      lastUpdatedAt: Timestamp.now()
    };
    
    if (geminiFileId) {
      updateData.geminiFileId = geminiFileId;
    }
    
    await updateDoc(docRef, updateData);
    
    console.log('Document status updated:', docId, status);
    return { success: true };
  } catch (error) {
    console.error('Error updating document status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a document
 */
export async function deleteDocument(db, courseId, docId) {
  try {
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    await deleteDoc(docRef);
    
    console.log('Document deleted:', docId);
    return { success: true };
  } catch (error) {
    console.error('Error deleting document:', error);
    return { success: false, error: error.message };
  }
}

// ==================== STATISTICS & ANALYTICS ====================

/**
 * Get storage statistics for a user
 */
export async function getUserStats(db, userId) {
  try {
    const courses = await getUserCourses(db, userId);
    
    if (!courses.success) {
      return courses;
    }
    
    let totalPDFs = 0;
    let totalCourses = courses.data.length;
    
    for (const course of courses.data) {
      const docs = await getCourseDocuments(db, course.id);
      if (docs.success) {
        totalPDFs += docs.data.length;
      }
    }
    
    return {
      success: true,
      data: {
        totalCourses: totalCourses,
        totalPDFs: totalPDFs,
        lastScanDate: courses.data[0]?.lastScannedAt || null
      }
    };
  } catch (error) {
    console.error('Error getting user stats:', error);
    return { success: false, error: error.message };
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if Firebase is initialized and ready
 */
export function isFirebaseReady() {
  return !!(window.firebaseDb && window.firebaseModules);
}

/**
 * Wait for Firebase to be ready (with timeout)
 */
export async function waitForFirebase(maxWaitMs = 5000) {
  const startTime = Date.now();
  
  while (!isFirebaseReady()) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error('Firebase initialization timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return true;
}
```

## Integration with Existing Code

### Update `popup.js` to Use Helpers

```javascript
// At the top of popup.js
import {
  saveUser,
  saveCourse,
  saveDocuments,
  getCourseDocuments,
  updateDocumentStatus,
  getUserStats
} from './firestore-helpers.js';

// Use in your existing functions:

// After Chrome Identity authentication:
async function checkUserSignedIn() {
  const userInfo = await getUserProfile();
  if (userInfo && userInfo.email) {
    currentUser = {
      email: userInfo.email,
      id: userInfo.id,
      displayName: userInfo.email.split('@')[0]
    };
    
    // Use helper function instead of direct Firestore call
    await saveUser(window.firebaseDb, userInfo.id, currentUser);
    
    updateUIForUser(currentUser);
  }
}

// After PDF scanning:
async function onPDFScanComplete(courseData, pdfs) {
  const db = window.firebaseDb;
  
  // Save course
  await saveCourse(db, currentUser.id, {
    courseId: courseData.courseId,
    courseName: courseData.courseName,
    courseCode: courseData.courseCode,
    canvasUrl: courseData.url,
    pdfCount: pdfs.length
  });
  
  // Save all PDFs
  const results = await saveDocuments(db, courseData.courseId, pdfs);
  console.log('Saved PDFs to Firestore:', results);
}
```

## Implementation Checklist

### Step 1: Create Helper Functions File
- [ ] Create `src/firestore-helpers.js`
- [ ] Add all imports from firebase/firestore
- [ ] Implement user operations (saveUser, getUser)
- [ ] Implement course operations (saveCourse, getCourse, getUserCourses)
- [ ] Implement document operations (saveDocument, getCourseDocuments, etc.)
- [ ] Add utility functions (waitForFirebase, isFirebaseReady)

### Step 2: Update firebase-config.js
- [ ] Export additional Firestore functions needed by helpers
```javascript
export {
  collection,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  addDoc
};
```

### Step 3: Integrate with popup.js
- [ ] Import helper functions at top of popup.js
- [ ] Replace direct Firestore calls with helper functions
- [ ] Update `checkUserSignedIn()` to use `saveUser()`
- [ ] Update PDF scan completion to use `saveCourse()` and `saveDocuments()`
- [ ] Add error handling for all Firestore operations

### Step 4: Update background.js
- [ ] Add Firestore helpers for background operations
- [ ] Save course info when detected
- [ ] Update document status after downloads

### Step 5: Testing
- [ ] Test user creation/update
- [ ] Test course saving
- [ ] Test PDF metadata storage
- [ ] Test document retrieval
- [ ] Test error handling
- [ ] Verify no duplicate documents

### Step 6: Add UI for Firestore Data
- [ ] Show stored courses in popup
- [ ] Display PDF count per course
- [ ] Show sync status
- [ ] Add "View stored PDFs" button

## Benefits of Helper Functions

1. **Consistency** - Same logic used everywhere
2. **Error Handling** - Centralized error management
3. **Testing** - Easier to test isolated functions
4. **Maintenance** - Change once, applies everywhere
5. **Type Safety** - Can add JSDoc or TypeScript later
6. **Logging** - Centralized logging for debugging

## Next Phase: After Helpers

Once helper functions are working:

1. **Gemini Integration** - Upload PDFs to Gemini File Search
2. **Update Helper** - Add `updateDocumentStatus()` after Gemini upload
3. **RAG Chat** - Query Gemini with stored document IDs
4. **Chat History** - Store conversations in Firestore
5. **Settings** - Store user preferences

## Example Usage Flow

```
User Action: Scan Canvas Course
    ↓
1. Chrome Identity → Get user ID
2. saveUser(userId, userData) → Firestore
    ↓
3. Scan Canvas → Find 15 PDFs
4. saveCourse(courseId, courseData) → Firestore
5. saveDocuments(courseId, pdfsArray) → Firestore (batch)
    ↓
6. Download PDFs → Local storage
7. Upload to Gemini → Get file IDs
8. updateDocumentStatus(docId, "completed", geminiFileId) → Firestore
    ↓
9. User can now chat with PDFs using stored Gemini file IDs
```

## Success Criteria

Helper functions are working when:
-  Users persist across extension reloads
-  Courses appear in popup after scanning
-  PDFs don't duplicate in Firestore
-  Can retrieve all user's courses
-  Can see PDF count per course
-  Error messages are helpful
-  Loading states work properly

Ready to implement? Start with Step 1! 
