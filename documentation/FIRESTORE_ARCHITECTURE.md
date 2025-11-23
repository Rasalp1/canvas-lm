# Firestore Database Architecture - Canvas LM

## 🎯 Overview

Firestore is a **NoSQL document database** with a hierarchical structure. Unlike SQL databases where you define tables upfront, Firestore creates collections and documents **dynamically** when you write data.

## 🔑 Key Architecture Decision: Shared Courses

**Courses and PDFs are SHARED** across all users, while **chat histories and interactions are PRIVATE**.

### Rationale
- ✅ **Shared**: Courses exist independently - if course CS101 exists, all users see the same PDFs
- ✅ **Efficiency**: No duplicate PDF uploads to Gemini for the same course
- ✅ **Storage**: Single Gemini File Search store per course, shared by all users
- 🔐 **Privacy**: Each user's chat history, questions, and interactions remain completely private

### What's Shared vs Private

| Data Type | Scope | Example |
|-----------|-------|---------|
| **Course Info** | 🌍 Shared | CS101 name, Canvas URL |
| **PDF Documents** | 🌍 Shared | lecture1.pdf, slides.pdf |
| **Gemini Store** | 🌍 Shared | Single RAG corpus per course |
| **User Enrollments** | 🔐 Private | Which courses user has accessed |
| **Chat Sessions** | 🔐 Private | User's conversation history |
| **Chat Messages** | 🔐 Private | Individual Q&A exchanges |

## 📊 Core Concepts

### Document vs Collection
- **Collection**: Container for documents (like a folder)
- **Document**: Contains fields/data (like a file with JSON)
- **Subcollection**: Collection nested inside a document

```
Collection → Document → Subcollection → Document → ...
```

### Path Structure
Every piece of data has a path:
```
users/A123                           ← Document path (even number of segments)
courses/CS101/documents/doc1         ← Document path (4 segments)
users/A123/fileSearchStores          ← Collection path (odd number of segments)
```

## 🏗️ Canvas LM Database Structure

### Visual Hierarchy

```
firestore (root)
│
├─ users/                                    [Collection]
│  │
│  ├─ A123/                                  [Document - Chrome User ID]
│  │  ├─ email: "alice@example.com"         (Field)
│  │  ├─ displayName: "alice"               (Field)
│  │  ├─ isAdmin: false                     (Field - NEW: Admin privileges)
│  │  ├─ createdAt: Timestamp               (Field)
│  │  ├─ lastSeenAt: Timestamp              (Field)
│  │  │
│  │  └─ enrollments/                       [Subcollection - 🔐 PRIVATE]
│  │     │
│  │     ├─ 12345/                          [Document - Course ID user accessed]
│  │     │  ├─ courseId: "12345"
│  │     │  ├─ courseName: "Introduction to CS"
│  │     │  ├─ enrolledAt: Timestamp
│  │     │  ├─ lastAccessedAt: Timestamp
│  │     │  └─ favorite: false
│  │     │
│  │     └─ 67890/                          [Document]
│  │        ├─ courseId: "67890"
│  │        ├─ courseName: "Advanced Math"
│  │        ├─ enrolledAt: Timestamp
│  │        ├─ lastAccessedAt: Timestamp
│  │        └─ favorite: true
│  │
│  └─ B456/                                  [Document - Another User]
│     ├─ email: "bob@example.com"
│     ├─ displayName: "bob"
│     ├─ isAdmin: false                     (Field)
│     ├─ createdAt: Timestamp
│     ├─ lastSeenAt: Timestamp
│     │
│     └─ enrollments/                       [Subcollection - Bob's courses]
│        └─ 12345/                          [Same course, different enrollment]
│           ├─ enrolledAt: Timestamp (Bob's enrollment time)
│           └─ ... (Bob's preferences)
│
├─ courses/                                  [Collection - 🌍 SHARED]
│  │
│  ├─ 12345/                                 [Document - Canvas Course ID]
│  │  ├─ courseName: "Introduction to CS"   (Field - NO userId!)
│  │  ├─ courseCode: "CS101"                (Field)
│  │  ├─ canvasUrl: "https://..."           (Field)
│  │  ├─ canvasInstance: "canvas.edu"       (Field - Domain)
│  │  ├─ firstScannedAt: Timestamp          (Field - When first discovered)
│  │  ├─ lastScannedAt: Timestamp           (Field - Last update)
│  │  ├─ pdfCount: 15                       (Field)
│  │  ├─ fileSearchStoreName: "store_abc123" (Field - Shared Gemini store)
│  │  ├─ totalEnrollments: 42               (Field - How many users enrolled)
│  │  ├─ createdBy: "A123"                  (Field - First user who scanned)
│  │  │
│  │  └─ documents/                         [Subcollection - 🌍 SHARED]
│  │     │
│  │     ├─ aHR0cHM6Ly9jYW52YXMuZWR1L2ZpbGVzLzEvbGVjdHVyZTEucGRm/  [Document]
│  │     │  ├─ fileName: "lecture1.pdf"
│  │     │  ├─ fileUrl: "https://canvas.edu/files/1/lecture1.pdf"
│  │     │  ├─ fileSize: 2048576
│  │     │  ├─ fileType: "application/pdf"
│  │     │  ├─ scannedFrom: "files"
│  │     │  ├─ uploadedAt: Timestamp
│  │     │  ├─ fileSearchDocumentName: "document_gemini_123"
│  │     │  ├─ uploadStatus: "completed"
│  │     │  └─ uploadedBy: "A123"          (Who uploaded to Gemini)
│  │     │
│  │     ├─ aHR0cHM6Ly9jYW52YXMuZWR1L2ZpbGVzLzIvbGVjdHVyZTIucGRm/  [Document]
│  │     │  ├─ fileName: "lecture2.pdf"
│  │     │  ├─ fileUrl: "https://canvas.edu/files/2/lecture2.pdf"
│  │     │  ├─ fileSize: 1524288
│  │     │  ├─ fileType: "application/pdf"
│  │     │  ├─ scannedFrom: "modules"
│  │     │  ├─ uploadedAt: Timestamp
│  │     │  ├─ fileSearchDocumentName: "document_gemini_456"
│  │     │  ├─ uploadStatus: "completed"
│  │     │  └─ uploadedBy: "B456"          (Different user uploaded this)
│  │     │
│  │     └─ ... (more PDF documents)
│  │
│  └─ 67890/                                 [Document - Another Course]
│     ├─ courseName: "Advanced Mathematics"
│     ├─ courseCode: "MATH201"
│     ├─ canvasUrl: "https://..."
│     ├─ firstScannedAt: Timestamp
│     ├─ lastScannedAt: Timestamp
│     ├─ pdfCount: 8
│     ├─ fileSearchStoreName: "store_xyz789"
│     ├─ totalEnrollments: 18
│     ├─ createdBy: "B456"
│     │
│     └─ documents/                         [Subcollection]
│        └─ ... (PDFs for MATH201 - shared)
│        └─ ...
│
└─ chatSessions/                             [Collection - TOP-LEVEL with userId]
   │
   ├─ session_abc123/                        [Document - Chat Session ID]
   │  ├─ userId: "A123"                      (Field - Owner reference)
   │  ├─ courseId: "12345"                   (Field - Course reference)
   │  ├─ createdAt: Timestamp                (Field)
   │  ├─ lastMessageAt: Timestamp            (Field)
   │  ├─ title: "Questions about Lecture 1"  (Field)
   │  ├─ messageCount: 5                     (Field)
   │  │
   │  └─ messages/                           [Subcollection]
   │     ├─ msg_1/
   │     │  ├─ role: "user"
   │     │  ├─ content: "Explain recursion"
   │     │  └─ timestamp: Timestamp
   │     │
   │     ├─ msg_2/
   │     │  ├─ role: "assistant"
   │     │  ├─ content: "Recursion is..."
   │     │  └─ timestamp: Timestamp
   │     │
   │     └─ ... (more messages)
   │
   ├─ session_xyz789/                        [Document - Another session]
   │  ├─ userId: "A123"
   │  ├─ courseId: "67890"
   │  └─ ... (session metadata)
   │
   └─ session_def456/                        [Document - Bob's session]
      ├─ userId: "B456"
      ├─ courseId: "12345"
      └─ ... (session metadata)
```

## 🔍 Data Relationships

### 1. User ↔ Courses (Many-to-Many via Enrollments)
```javascript
// User A123 can access multiple courses
users/A123/enrollments/12345/
users/A123/enrollments/67890/

// Course 12345 can have multiple users
users/A123/enrollments/12345/
users/B456/enrollments/12345/
users/C789/enrollments/12345/
```

**Query Pattern:**
```javascript
// Get all courses user A123 has enrolled in
const enrollmentsRef = collection(db, 'users', 'A123', 'enrollments');
const snapshot = await getDocs(enrollmentsRef);

// For each enrollment, fetch the shared course data
for (const doc of snapshot.docs) {
  const courseId = doc.id;
  const courseDoc = await getDoc(doc(db, 'courses', courseId));
  // courseDoc contains shared course data
}
```

### 2. User → Chat Sessions (One-to-Many) - TOP-LEVEL COLLECTION
```javascript
// User A123 has multiple chat sessions (stored in top-level collection)
chatSessions/session_abc123/
  userId: "A123"
  courseId: "12345"

chatSessions/session_xyz789/
  userId: "A123"
  courseId: "67890"

// Course → Chat Sessions (many users can have sessions for same course)
chatSessions/session_abc123/
  userId: "A123"
  courseId: "12345"  → references courses/12345/

chatSessions/session_def456/
  userId: "B456"
  courseId: "12345"  → references courses/12345/
```

**Query Pattern:**
```javascript
// Get all chat sessions for user A123
const q = query(
  collection(db, 'chatSessions'),
  where('userId', '==', 'A123')
);
const snapshot = await getDocs(q);

// Get chat sessions for user A123 and specific course
const q = query(
  collection(db, 'chatSessions'),
  where('userId', '==', 'A123'),
  where('courseId', '==', '12345')
);

// ADMIN: Get all chat sessions for a course (across all users)
const q = query(
  collection(db, 'chatSessions'),
  where('courseId', '==', '12345')
);
```

**Cascade Deletion:**
```javascript
// When a course is deleted, automatically delete all chat sessions
// This is handled by Cloud Function trigger: onCourseDeleted
// See ADMIN_AND_CASCADE_DELETE.md for details
```

### 3. Chat Session → Messages (One-to-Many)
```javascript
// Session has multiple messages (stored as subcollection)
chatSessions/session_abc123/messages/msg_1/
chatSessions/session_abc123/messages/msg_2/
```

**Query Pattern:**
```javascript
// Get all messages for a session
const messagesRef = collection(
  db, 'chatSessions', 'session_abc123', 'messages'
);
const snapshot = await getDocs(messagesRef);
```

### 4. Course → Documents (One-to-Many - SHARED)
```javascript
// Course 12345 has multiple PDFs
courses/12345/documents/doc1/
courses/12345/documents/doc2/
courses/12345/documents/doc3/
```

**Query Pattern:**
```javascript
// Get all documents for course 12345
const docsRef = collection(db, 'courses', '12345', 'documents');
const snapshot = await getDocs(docsRef);
```

### 5. Course ↔ File Search Store (One-to-One - SHARED)
```javascript
// Course has ONE shared Gemini store (created by first user)
courses/12345/
  fileSearchStoreName: "store_abc123"
  createdBy: "A123"

// Store is accessible to ALL enrolled users via Cloud Functions
```

**Access Pattern:**
```javascript
// 1. Check if user is enrolled in course
const enrollmentDoc = await getDoc(
  doc(db, 'users', 'A123', 'enrollments', '12345')
);
if (!enrollmentDoc.exists()) {
  throw new Error('User not enrolled in course');
}

// 2. Get course and its shared store
const courseDoc = await getDoc(doc(db, 'courses', '12345'));
const storeName = courseDoc.data().fileSearchStoreName;

// 3. Use store via Cloud Functions (no per-user ownership check)
const result = await cloudFunction.queryStore(storeName, question);
```

## 📝 Document ID Strategies

### 1. User IDs (from Chrome Identity)
```javascript
// Chrome provides unique ID
users/118234567890123456789/
```

### 2. Course IDs (from Canvas)
```javascript
// Canvas course ID
courses/12345/
```

### 3. PDF Document IDs (Base64 encoded URL)
```javascript
// Prevent duplicates by using URL as ID
const docId = btoa(pdfUrl).replace(/[/+=]/g, '_');
// Result: aHR0cHM6Ly9jYW52YXMuZWR1L2ZpbGVzLzEvcGRmLnBkZg__

courses/12345/documents/aHR0cHM6Ly9jYW52YXMuZWR1L2ZpbGVzLzEvcGRmLnBkZg__/
```

**Why Base64?**
- Same PDF URL always creates same document ID
- Prevents duplicate entries
- URL-safe after sanitization

### 4. Gemini Store IDs (from Gemini API)
```javascript
// Gemini returns full resource name
"fileSearchStores/abc123def456"

// We store just the ID part
users/A123/fileSearchStores/abc123def456/
```

## 🔐 Security Model

### Shared Courses with Private Access

```
User A123 enrollments:
  ✅ users/A123/enrollments/12345  (CS101)
  ✅ users/A123/enrollments/67890  (MATH201)

User A123 can access:
  ✅ courses/12345/  (shared course data)
  ✅ courses/67890/  (shared course data)
  ✅ users/A123/chatSessions/...  (private chats)

User A123 CANNOT access:
  ❌ users/B456/chatSessions/...  (Bob's chats)
  ❌ users/B456/enrollments/...  (Bob's enrollments)

User B456 enrollments:
  ✅ users/B456/enrollments/12345  (same CS101 course!)
  
User B456 can access:
  ✅ courses/12345/  (SAME shared course data as Alice)
  ✅ users/B456/chatSessions/...  (Bob's own private chats)

User B456 CANNOT access:
  ❌ users/A123/chatSessions/...  (Alice's chats)
```

### Enrollment Verification Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User A123 wants to chat with CS101 course                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
    ┌─────────────────────────────────────────────┐
    │ Check enrollment:                           │
    │ users/A123/enrollments/12345 exists?        │
    └─────────────┬───────────────────────────────┘
                  │
                  ├─ YES ✅
                  │   │
                  │   ▼
                  │   ┌───────────────────────────────────┐
                  │   │ Get shared course data:           │
                  │   │ courses/12345/                    │
                  │   │   fileSearchStoreName: "store_abc"│
                  │   └─────────────┬─────────────────────┘
                  │                 │
                  │                 ▼
                  │   ┌───────────────────────────────────┐
                  │   │ Query Gemini via Cloud Function   │
                  │   │ (store is shared by all users)    │
                  │   └───────────────────────────────────┘
                  │
                  └─ NO ❌
                      │
                      ▼
                  ┌───────────────────────────────────────┐
                  │ Error: "Not enrolled in course"       │
                  └───────────────────────────────────────┘
```

### Cloud Function Verification (Updated)

```javascript
// In Cloud Functions (functions/index.js)
async function verifyEnrollment(userId, courseId) {
  // Check if user is enrolled in this course
  const enrollmentDoc = await db
    .collection('users').doc(userId)
    .collection('enrollments').doc(courseId)
    .get();
  
  if (!enrollmentDoc.exists) {
    throw new Error('Unauthorized: Not enrolled in course');
  }
  
  return enrollmentDoc.data();
}

async function getSharedStore(courseId) {
  // Get the shared Gemini store for this course
  const courseDoc = await db.collection('courses').doc(courseId).get();
  
  if (!courseDoc.exists) {
    throw new Error('Course not found');
  }
  
  return courseDoc.data().fileSearchStoreName;
}

// Usage in Cloud Function
exports.queryCourseStore = onCall(async (request) => {
  const { userId, courseId, question } = request.data;
  
  // 1. Verify user is enrolled
  await verifyEnrollment(userId, courseId);
  
  // 2. Get shared store for course
  const storeName = await getSharedStore(courseId);
  
  if (!storeName) {
    throw new Error('Course has no Gemini store yet');
  }
  
  // 3. Query shared store (API key secure on server)
  const result = await geminiAPI.query(storeName, question);
  
  // 4. Save to user's PRIVATE chat history
  await db
    .collection('users').doc(userId)
    .collection('chatSessions').doc()
    .set({
      courseId: courseId,
      question: question,
      answer: result,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  
  return result;
});
```

## 📥 How Data Gets Written

### Step-by-Step: User Scans Course (First Time)

```javascript
// 1. User A123 opens Canvas course page CS101
// 2. Content script scans for PDFs
// 3. Extension calls Firestore

// STEP 1: Save/update user
await setDoc(doc(db, 'users', 'A123'), {
  email: 'alice@example.com',
  displayName: 'alice',
  createdAt: Timestamp.now(),
  lastSeenAt: Timestamp.now()
}, { merge: true });
// Creates: users/A123/

// STEP 2: Check if course exists
const courseDoc = await getDoc(doc(db, 'courses', '12345'));
const courseExists = courseDoc.exists();

if (!courseExists) {
  // FIRST USER TO SCAN THIS COURSE - Create shared course
  await setDoc(doc(db, 'courses', '12345'), {
    courseName: 'Introduction to CS',
    courseCode: 'CS101',
    canvasUrl: 'https://canvas.edu/courses/12345',
    canvasInstance: 'canvas.edu',
    firstScannedAt: Timestamp.now(),
    lastScannedAt: Timestamp.now(),
    pdfCount: 15,
    fileSearchStoreName: null,  // Will be created later
    totalEnrollments: 1,
    createdBy: 'A123'  // Track who discovered it
  });
  // Creates: courses/12345/ (SHARED)
} else {
  // Course already exists - just update last scan
  await updateDoc(doc(db, 'courses', '12345'), {
    lastScannedAt: Timestamp.now(),
    totalEnrollments: increment(1)  // Increment enrollment count
  });
}

// STEP 3: Create user's enrollment
await setDoc(doc(db, 'users', 'A123', 'enrollments', '12345'), {
  courseId: '12345',
  courseName: 'Introduction to CS',
  enrolledAt: Timestamp.now(),
  lastAccessedAt: Timestamp.now(),
  favorite: false
});
// Creates: users/A123/enrollments/12345/ (PRIVATE)

// STEP 4: Save PDFs to shared course (if new or updated)
for (const pdf of pdfsArray) {
  const docId = btoa(pdf.url).replace(/[/+=]/g, '_');
  
  await setDoc(doc(db, 'courses', '12345', 'documents', docId), {
    fileName: 'lecture1.pdf',
    fileUrl: 'https://canvas.edu/files/1/lecture1.pdf',
    fileSize: 2048576,
    fileType: 'application/pdf',
    scannedFrom: 'files',
    uploadedAt: Timestamp.now(),
    fileSearchDocumentName: null,
    uploadStatus: 'pending',
    uploadedBy: null  // Will be set when uploaded to Gemini
  }, { merge: true });  // Merge to avoid overwriting existing data
  // Creates: courses/12345/documents/aHR0cHM6Li4u/ (SHARED)
}
```

### Step-by-Step: Second User Scans Same Course

```javascript
// 1. User B456 opens SAME Canvas course CS101
// 2. Content script scans for PDFs
// 3. Extension calls Firestore

// Course already exists from User A123!
const courseDoc = await getDoc(doc(db, 'courses', '12345'));
// ✅ courseDoc.exists() === true

// Just create enrollment for User B456
await setDoc(doc(db, 'users', 'B456', 'enrollments', '12345'), {
  courseId: '12345',
  courseName: 'Introduction to CS',  // Same course name
  enrolledAt: Timestamp.now(),  // But B456's enrollment time
  lastAccessedAt: Timestamp.now(),
  favorite: false
});
// Creates: users/B456/enrollments/12345/ (PRIVATE to B456)

// Update course enrollment count
await updateDoc(doc(db, 'courses', '12345'), {
  totalEnrollments: increment(1)
});

// PDFs already exist - no need to re-scan (unless new PDFs found)
```

### Step-by-Step: Creating Shared RAG Store

```javascript
// 4. FIRST user to click "Upload to Gemini" (either A123 or B456)
// 5. Cloud Function creates SHARED File Search store

// In Cloud Function
exports.createCourseStore = onCall(async (request) => {
  const { userId, courseId } = request.data;
  
  // Verify user is enrolled
  await verifyEnrollment(userId, courseId);
  
  // Check if store already exists
  const courseDoc = await db.collection('courses').doc(courseId).get();
  if (courseDoc.data().fileSearchStoreName) {
    return { 
      success: true, 
      message: 'Store already exists',
      storeName: courseDoc.data().fileSearchStoreName
    };
  }
  
  // Create Gemini store (ONCE for entire course)
  const geminiResponse = await createGeminiStore(`Course ${courseId} Materials`);
  const storeName = geminiResponse.name; // "fileSearchStores/abc123"
  
  // Link store to SHARED course (not user!)
  await db.collection('courses').doc(courseId).update({
    fileSearchStoreName: storeName,
    storeCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
    storeCreatedBy: userId  // Track who created it
  });
  // Updates: courses/12345/fileSearchStoreName (SHARED)
  
  return { success: true, storeName: storeName };
});

// Now ALL enrolled users can use this shared store!
```

### Step-by-Step: User Chats with Course

```javascript
// 6. User A123 asks a question
// 7. Cloud Function saves to PRIVATE chat history

exports.chatWithCourse = onCall(async (request) => {
  const { userId, courseId, question } = request.data;
  
  // Verify enrollment
  await verifyEnrollment(userId, courseId);
  
  // Get shared store
  const storeName = await getSharedStore(courseId);
  
  // Query Gemini (shared store, shared API key)
  const answer = await geminiAPI.query(storeName, question);
  
  // Create PRIVATE chat session
  const sessionRef = db
    .collection('users').doc(userId)
    .collection('chatSessions').doc();
  
  await sessionRef.set({
    courseId: courseId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    title: question.substring(0, 50),  // First 50 chars as title
    messageCount: 2  // Question + answer
  });
  // Creates: users/A123/chatSessions/session_abc/ (PRIVATE)
  
  // Save messages
  await sessionRef.collection('messages').add({
    role: 'user',
    content: question,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  await sessionRef.collection('messages').add({
    role: 'assistant',
    content: answer,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  // Creates: users/A123/chatSessions/session_abc/messages/... (PRIVATE)
  
  return { success: true, answer: answer };
});

// User B456's chats are stored separately in users/B456/chatSessions/
```

## 🔄 Common Query Patterns

### Get User's Enrolled Courses
```javascript
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';

// Get user's enrollments (private)
const enrollmentsRef = collection(db, 'users', currentUser.id, 'enrollments');
const enrollmentsSnap = await getDocs(enrollmentsRef);

// Fetch full course data for each enrollment
const courses = [];
for (const enrollDoc of enrollmentsSnap.docs) {
  const courseId = enrollDoc.id;
  
  // Get shared course data
  const courseDoc = await getDoc(doc(db, 'courses', courseId));
  if (courseDoc.exists()) {
    courses.push({
      id: courseId,
      enrollment: enrollDoc.data(),  // Private: enrolledAt, favorite, etc.
      course: courseDoc.data()        // Shared: courseName, pdfCount, etc.
    });
  }
}

console.log(courses);
// [
//   {
//     id: "12345",
//     enrollment: { enrolledAt: Timestamp, favorite: false },
//     course: { courseName: "Intro to CS", pdfCount: 15, ... }
//   },
//   ...
// ]
```

### Get Course's Documents (Shared)
```javascript
// Any enrolled user can see the same documents
const docsRef = collection(db, 'courses', '12345', 'documents');
const snapshot = await getDocs(docsRef);

snapshot.forEach(doc => {
  console.log(doc.data().fileName);
  // "lecture1.pdf"
  // "lecture2.pdf"
  // (Same for User A123 and User B456)
});
```

### Get User's Chat History for a Course
```javascript
import { query, where } from 'firebase/firestore';

// Get user's private chat sessions for specific course
const sessionsRef = collection(db, 'users', currentUser.id, 'chatSessions');
const q = query(sessionsRef, where('courseId', '==', '12345'));
const snapshot = await getDocs(q);

snapshot.forEach(doc => {
  console.log(doc.data());
  // {
  //   courseId: "12345",
  //   title: "Questions about Lecture 1",
  //   createdAt: Timestamp,
  //   messageCount: 5
  // }
});
```

### Get Messages for a Chat Session
```javascript
// Get messages for specific session (private to user)
const messagesRef = collection(
  db, 'users', currentUser.id, 'chatSessions', 'session_abc123', 'messages'
);
const snapshot = await getDocs(messagesRef);

const messages = [];
snapshot.forEach(doc => {
  messages.push(doc.data());
});

console.log(messages);
// [
//   { role: "user", content: "Explain recursion", timestamp: ... },
//   { role: "assistant", content: "Recursion is...", timestamp: ... }
// ]
```

### Check if User is Enrolled in Course
```javascript
// Quick enrollment check
const enrollmentDoc = await getDoc(
  doc(db, 'users', currentUser.id, 'enrollments', '12345')
);

if (enrollmentDoc.exists()) {
  console.log('User is enrolled!');
  console.log(enrollmentDoc.data());
} else {
  console.log('User not enrolled - need to scan course first');
}
```

### Update Document Status (After Upload)
```javascript
import { doc, updateDoc } from 'firebase/firestore';

// Update shared document status
const docRef = doc(db, 'courses', '12345', 'documents', 'aHR0cHM6Li4u');
await updateDoc(docRef, {
  uploadStatus: 'completed',
  fileSearchDocumentName: 'document_gemini_123',
  uploadedBy: currentUser.id  // Track who uploaded
});
```

### Mark Course as Favorite (Private)
```javascript
// Update user's private enrollment data
const enrollmentRef = doc(db, 'users', currentUser.id, 'enrollments', '12345');
await updateDoc(enrollmentRef, {
  favorite: true,
  lastAccessedAt: Timestamp.now()
});
// Only affects THIS user's view - doesn't change shared course data
```

## 📊 Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CHROME EXTENSION                               │
│                                                                       │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐       │
│  │ Content     │───▶│ Background   │───▶│ Popup UI         │       │
│  │ Script      │    │ Script       │    │ (User Interface) │       │
│  │             │    │              │    │                  │       │
│  │ Scan Canvas │    │ Manage State │    │ Display Courses  │       │
│  │ for PDFs    │    │              │    │ Upload to Gemini │       │
│  └─────────────┘    └──────────────┘    └──────────────────┘       │
│         │                  │                      │                  │
└─────────┼──────────────────┼──────────────────────┼──────────────────┘
          │                  │                      │
          │                  ▼                      ▼
          │       ┌─────────────────────────────────────────┐
          │       │         FIRESTORE DATABASE              │
          │       │                                         │
          │       │  users/A123/                            │
          │       │    ├─ email, displayName                │
          │       │    └─ fileSearchStores/                 │
          │       │        └─ store_abc123/                 │
          │       │                                         │
          │       │  courses/12345/                         │
          └──────▶│    ├─ userId: "A123"                    │
                  │    ├─ courseName, courseCode            │
                  │    ├─ fileSearchStoreName: "abc123"     │
                  │    └─ documents/                        │
                  │        ├─ doc1/ (lecture1.pdf)          │
                  │        └─ doc2/ (lecture2.pdf)          │
                  └─────────────────────────────────────────┘
                              │
                              │ Cloud Functions Proxy
                              ▼
                  ┌─────────────────────────────────────────┐
                  │      GEMINI API (via Cloud Functions)   │
                  │                                         │
                  │  fileSearchStores/abc123/               │
                  │    ├─ documents/                        │
                  │    │   ├─ document_gemini_123           │
                  │    │   └─ document_gemini_456           │
                  │    └─ Semantic Search & RAG             │
                  └─────────────────────────────────────────┘
```

## 🎓 Key Takeaways

1. **No Schema Required**: Collections and documents are created automatically on first write
2. **Hierarchical Paths**: `collection/document/subcollection/document/...`
3. **Shared Courses**: Course data and PDFs are shared - NO `userId` field in courses
4. **Enrollment Model**: Many-to-many relationship via `users/{userId}/enrollments/{courseId}`
5. **Private Chats**: Each user's conversations stored in `users/{userId}/chatSessions/`
6. **Single Gemini Store**: One shared File Search store per course (not per user)
7. **Subcollections**: Automatically nested, queried separately (can't query across parents)
8. **Document IDs**: Can be auto-generated or custom (we use Canvas IDs, Base64 URLs, etc.)
9. **Security**: Cloud Functions verify enrollment before allowing access to shared stores
10. **Merge Option**: `{ merge: true }` updates without overwriting existing fields

## 📊 Architecture Comparison: Old vs New

### Old Architecture (User-Owned Courses)

```
courses/12345/
  userId: "A123"  ← Each user had their own copy
  courseName: "Intro to CS"
  documents/ ← Duplicated PDFs

courses/12345_copy_for_B456/
  userId: "B456"  ← Same course, different document
  courseName: "Intro to CS"
  documents/ ← Duplicate PDFs!

users/A123/fileSearchStores/store_abc/  ← User-owned store
users/B456/fileSearchStores/store_xyz/  ← Separate store for same course!
```

**Problems:**
- ❌ Duplicate PDFs in database
- ❌ Duplicate uploads to Gemini (costs money!)
- ❌ Each user creates separate RAG store for same course
- ❌ Wasted storage and API calls

### New Architecture (Shared Courses)

```
courses/12345/  ← ONE shared course
  courseName: "Intro to CS"
  fileSearchStoreName: "store_abc"  ← ONE shared Gemini store
  totalEnrollments: 42
  documents/ ← ONE set of PDFs

users/A123/
  enrollments/12345/  ← Links to shared course
  chatSessions/ ← Private conversations

users/B456/
  enrollments/12345/  ← Links to SAME shared course
  chatSessions/ ← Private conversations (separate from A123)
```

**Benefits:**
- ✅ Single copy of course data and PDFs
- ✅ Single Gemini store (costs shared)
- ✅ First user creates, others benefit
- ✅ Chat histories remain private
- ✅ Efficient storage and API usage

### Migration Impact

**What Changes:**
1. Remove `userId` from `courses` collection
2. Add `users/{userId}/enrollments/` subcollection
3. Add `users/{userId}/chatSessions/` subcollection
4. Update Cloud Functions to check enrollment instead of ownership
5. Remove `users/{userId}/fileSearchStores/` (stores now linked to courses)

**What Stays the Same:**
1. `users/{userId}` profile data
2. `courses/{courseId}/documents/` structure
3. PDF scanning and upload logic
4. Gemini File Search API integration

**Data Migration Strategy:**
1. Keep existing courses as-is (no breaking changes)
2. New scans use enrollment model
3. Gradually migrate old user-owned courses to shared model
4. Merge duplicate courses by Canvas course ID

## 🚀 Next Steps

When you run your extension:
1. Open Firestore Console: https://console.firebase.google.com/project/canvas-lm/firestore
2. Scan a Canvas course
3. Watch the structure appear in real-time!
4. Navigate the hierarchy visually

You'll see the exact structure described above as data is written.

### Implementation Order:
1. ✅ Update documentation (this file)
2. ⏭️ Update `firestore-helpers.js` with enrollment functions
3. ⏭️ Update Cloud Functions for enrollment verification
4. ⏭️ Update `popup.js` and `content-script.js` for new flow
5. ⏭️ Add chat session management
6. ⏭️ Test with multiple users
7. ⏭️ Migrate existing data (if any)
