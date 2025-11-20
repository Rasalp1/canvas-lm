// firestore-helpers.js
// Centralized Firestore operations for Canvas RAG Assistant

// Note: This file uses the global window.firebaseDb and window.firebaseModules
// set by firebase-config.js. These are available after the firebase-config.js script loads.

// ==================== USER OPERATIONS ====================

/**
 * Create or update user in Firestore
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {Object} userData - User data from Chrome Identity
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveUser(db, userId, userData) {
  try {
    const { doc, setDoc, Timestamp } = window.firebaseModules;
    
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      email: userData.email,
      displayName: userData.displayName || userData.email.split('@')[0],
      lastSeenAt: Timestamp.now(),
      createdAt: Timestamp.now()
    }, { merge: true }); // merge: true prevents overwriting existing data
    
    console.log('✅ User saved to Firestore:', userId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user data from Firestore
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @returns {Promise<Object>} Result object with user data
 */
export async function getUser(db, userId) {
  try {
    const { doc, getDoc } = window.firebaseModules;
    
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      console.log('✅ User retrieved from Firestore:', userId);
      return { success: true, data: userSnap.data() };
    } else {
      console.warn('⚠️ User not found in Firestore:', userId);
      return { success: false, error: 'User not found' };
    }
  } catch (error) {
    console.error('❌ Error getting user:', error);
    return { success: false, error: error.message };
  }
}

// ==================== COURSE OPERATIONS (SHARED) ====================

/**
 * Save course information to Firestore (SHARED across all users)
 * Creates or updates a shared course document
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID (for tracking who created it)
 * @param {Object} courseData - Course information
 * @returns {Promise<Object>} Result object with success status and whether it was newly created
 */
export async function saveCourse(db, userId, courseData) {
  try {
    const { doc, setDoc, getDoc, Timestamp } = window.firebaseModules;
    
    const courseRef = doc(db, 'courses', courseData.courseId);
    const courseSnap = await getDoc(courseRef);
    const isNewCourse = !courseSnap.exists();
    
    if (isNewCourse) {
      // First user to scan this course - create shared course
      await setDoc(courseRef, {
        courseName: courseData.courseName,
        courseCode: courseData.courseCode || '',
        canvasUrl: courseData.canvasUrl,
        canvasInstance: extractCanvasInstance(courseData.canvasUrl),
        firstScannedAt: Timestamp.now(),
        lastScannedAt: Timestamp.now(),
        pdfCount: courseData.pdfCount || 0,
        fileSearchStoreName: null, // Will be created later
        totalEnrollments: 1,
        createdBy: userId
      });
      console.log('✅ New shared course created:', courseData.courseId);
    } else {
      // Course exists - just update last scan time
      await setDoc(courseRef, {
        lastScannedAt: Timestamp.now(),
        pdfCount: courseData.pdfCount || 0
      }, { merge: true });
      console.log('✅ Shared course updated:', courseData.courseId);
    }
    
    return { success: true, isNewCourse: isNewCourse };
  } catch (error) {
    console.error('❌ Error saving course:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Extract Canvas instance domain from URL
 * @param {string} url - Canvas URL
 * @returns {string} Domain name
 */
function extractCanvasInstance(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Get course data from Firestore
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with course data
 */
export async function getCourse(db, courseId) {
  try {
    const { doc, getDoc } = window.firebaseModules;
    
    const courseRef = doc(db, 'courses', courseId);
    const courseSnap = await getDoc(courseRef);
    
    if (courseSnap.exists()) {
      console.log('✅ Course retrieved from Firestore:', courseId);
      return { success: true, data: courseSnap.data() };
    } else {
      console.warn('⚠️ Course not found in Firestore:', courseId);
      return { success: false, error: 'Course not found' };
    }
  } catch (error) {
    console.error('❌ Error getting course:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all courses for a user via enrollments
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @returns {Promise<Object>} Result object with array of courses
 */
export async function getUserCourses(db, userId) {
  try {
    const { collection, getDocs, doc, getDoc } = window.firebaseModules;
    
    // Get user's enrollments
    const enrollmentsRef = collection(db, 'users', userId, 'enrollments');
    const enrollmentsSnap = await getDocs(enrollmentsRef);
    
    const courses = [];
    
    // Fetch shared course data for each enrollment
    for (const enrollDoc of enrollmentsSnap.docs) {
      const courseId = enrollDoc.id;
      const enrollmentData = enrollDoc.data();
      
      // Get shared course data
      const courseRef = doc(db, 'courses', courseId);
      const courseSnap = await getDoc(courseRef);
      
      if (courseSnap.exists()) {
        courses.push({
          id: courseId,
          enrollment: enrollmentData, // Private: enrolledAt, favorite, etc.
          ...courseSnap.data() // Shared: courseName, pdfCount, etc.
        });
      }
    }
    
    // Sort by last accessed
    courses.sort((a, b) => {
      const aTime = a.enrollment?.lastAccessedAt?.toMillis() || 0;
      const bTime = b.enrollment?.lastAccessedAt?.toMillis() || 0;
      return bTime - aTime; // Descending order (newest first)
    });
    
    console.log(`✅ Retrieved ${courses.length} enrolled courses for user:`, userId);
    return { success: true, data: courses };
  } catch (error) {
    console.error('❌ Error getting user courses:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update course PDF count
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {number} pdfCount - Number of PDFs in course
 * @returns {Promise<Object>} Result object with success status
 */
export async function updateCoursePdfCount(db, courseId, pdfCount) {
  try {
    const { doc, updateDoc, Timestamp } = window.firebaseModules;
    
    const courseRef = doc(db, 'courses', courseId);
    await updateDoc(courseRef, {
      pdfCount: pdfCount,
      lastScannedAt: Timestamp.now()
    });
    
    console.log('✅ Course PDF count updated:', courseId, pdfCount);
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating course PDF count:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Increment total enrollments for a course
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with success status
 */
export async function incrementCourseEnrollments(db, courseId) {
  try {
    const { doc, updateDoc, getDoc } = window.firebaseModules;
    
    const courseRef = doc(db, 'courses', courseId);
    const courseSnap = await getDoc(courseRef);
    
    if (courseSnap.exists()) {
      const currentCount = courseSnap.data().totalEnrollments || 0;
      await updateDoc(courseRef, {
        totalEnrollments: currentCount + 1
      });
      console.log('✅ Course enrollment count incremented:', courseId);
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error incrementing enrollments:', error);
    return { success: false, error: error.message };
  }
}

// ==================== ENROLLMENT OPERATIONS (PRIVATE) ====================

/**
 * Create or update user enrollment in a course
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {Object} enrollmentData - Enrollment information
 * @returns {Promise<Object>} Result object with success status and whether it was new
 */
export async function enrollUserInCourse(db, userId, enrollmentData) {
  try {
    const { doc, setDoc, getDoc, Timestamp } = window.firebaseModules;
    
    const enrollmentRef = doc(db, 'users', userId, 'enrollments', enrollmentData.courseId);
    const enrollmentSnap = await getDoc(enrollmentRef);
    const isNewEnrollment = !enrollmentSnap.exists();
    
    if (isNewEnrollment) {
      // New enrollment
      await setDoc(enrollmentRef, {
        courseId: enrollmentData.courseId,
        courseName: enrollmentData.courseName,
        enrolledAt: Timestamp.now(),
        lastAccessedAt: Timestamp.now(),
        favorite: false
      });
      console.log('✅ User enrolled in course:', enrollmentData.courseId);
      
      // Increment course enrollment count
      await incrementCourseEnrollments(db, enrollmentData.courseId);
    } else {
      // Update existing enrollment
      await setDoc(enrollmentRef, {
        lastAccessedAt: Timestamp.now()
      }, { merge: true });
      console.log('✅ User enrollment updated:', enrollmentData.courseId);
    }
    
    return { success: true, isNewEnrollment: isNewEnrollment };
  } catch (error) {
    console.error('❌ Error enrolling user in course:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if user is enrolled in a course
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with enrollment status
 */
export async function isUserEnrolled(db, userId, courseId) {
  try {
    const { doc, getDoc } = window.firebaseModules;
    
    const enrollmentRef = doc(db, 'users', userId, 'enrollments', courseId);
    const enrollmentSnap = await getDoc(enrollmentRef);
    
    return { 
      success: true, 
      isEnrolled: enrollmentSnap.exists(),
      data: enrollmentSnap.exists() ? enrollmentSnap.data() : null
    };
  } catch (error) {
    console.error('❌ Error checking enrollment:', error);
    return { success: false, error: error.message, isEnrolled: false };
  }
}

/**
 * Update enrollment favorite status
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {string} courseId - Canvas course ID
 * @param {boolean} favorite - Favorite status
 * @returns {Promise<Object>} Result object with success status
 */
export async function updateEnrollmentFavorite(db, userId, courseId, favorite) {
  try {
    const { doc, updateDoc } = window.firebaseModules;
    
    const enrollmentRef = doc(db, 'users', userId, 'enrollments', courseId);
    await updateDoc(enrollmentRef, {
      favorite: favorite
    });
    
    console.log('✅ Enrollment favorite updated:', courseId, favorite);
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating enrollment favorite:', error);
    return { success: false, error: error.message };
  }
}

// ==================== DOCUMENT/PDF OPERATIONS (SHARED) ====================

/**
 * Save PDF document metadata to Firestore
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {Object} pdfData - PDF metadata
 * @returns {Promise<Object>} Result object with document ID
 */
export async function saveDocument(db, courseId, pdfData) {
  try {
    const { doc, setDoc, Timestamp } = window.firebaseModules;
    
    // Use PDF URL as document ID to prevent duplicates
    const docId = btoa(pdfData.url).replace(/[/+=]/g, '_'); // Base64 encode and sanitize
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    
    await setDoc(docRef, {
      fileName: pdfData.title || pdfData.fileName || 'Unknown',
      fileUrl: pdfData.url,
      fileSize: pdfData.size || 0,
      fileType: pdfData.type || 'application/pdf',
      scannedFrom: pdfData.scannedFrom || pdfData.type || 'unknown',
      uploadedAt: Timestamp.now(),
      fileSearchDocumentName: null,
      uploadStatus: 'pending'
    }, { merge: true });
    
    console.log('✅ Document saved to Firestore:', pdfData.title || docId);
    return { success: true, docId: docId };
  } catch (error) {
    console.error('❌ Error saving document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save multiple documents (batch operation)
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {Array} pdfsArray - Array of PDF metadata objects
 * @returns {Promise<Array>} Array of result objects for each PDF
 */
export async function saveDocuments(db, courseId, pdfsArray) {
  console.log(`📦 Starting batch save of ${pdfsArray.length} documents...`);
  const results = [];
  
  for (const pdf of pdfsArray) {
    const result = await saveDocument(db, courseId, pdf);
    results.push({ 
      fileName: pdf.title || pdf.fileName, 
      ...result 
    });
  }
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  console.log(`✅ Batch save complete: ${successCount} succeeded, ${failCount} failed`);
  
  return results;
}

/**
 * Get all documents for a course
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with array of documents
 */
export async function getCourseDocuments(db, courseId) {
  try {
    const { collection, getDocs } = window.firebaseModules;
    
    const docsRef = collection(db, 'courses', courseId, 'documents');
    const querySnapshot = await getDocs(docsRef);
    
    const documents = [];
    querySnapshot.forEach((doc) => {
      documents.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`✅ Retrieved ${documents.length} documents for course:`, courseId);
    return { success: true, data: documents };
  } catch (error) {
    console.error('❌ Error getting course documents:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update document upload status
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {string} docId - Document ID
 * @param {string} status - Upload status: 'pending' | 'uploading' | 'completed' | 'failed'
 * @param {string|null} geminiFileId - Optional Gemini file ID after successful upload
 * @returns {Promise<Object>} Result object with success status
 */
export async function updateDocumentStatus(db, courseId, docId, status, fileSearchDocumentName = null) {
  try {
    const { doc, updateDoc, Timestamp } = window.firebaseModules;
    
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    const updateData = {
      uploadStatus: status,
      lastUpdatedAt: Timestamp.now()
    };
    
    if (fileSearchDocumentName) {
      updateData.fileSearchDocumentName = fileSearchDocumentName;
    }
    
    await updateDoc(docRef, updateData);
    
    console.log('✅ Document status updated:', docId, status);
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating document status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a document
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {string} docId - Document ID
 * @returns {Promise<Object>} Result object with success status
 */
export async function deleteDocument(db, courseId, docId) {
  try {
    const { doc, deleteDoc } = window.firebaseModules;
    
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    await deleteDoc(docRef);
    
    console.log('✅ Document deleted:', docId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting document:', error);
    return { success: false, error: error.message };
  }
}

// ==================== GEMINI RAG OPERATIONS ====================

/**
 * Save File Search document metadata
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {string} docId - Document ID
 * @param {string} fileSearchDocumentName - File Search document resource name
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveDocumentFileSearch(db, courseId, docId, fileSearchDocumentName) {
  try {
    const { doc, updateDoc, Timestamp } = window.firebaseModules;
    
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    
    await updateDoc(docRef, {
      fileSearchDocumentName: fileSearchDocumentName,
      uploadedToFileSearchAt: Timestamp.now(),
      uploadStatus: 'completed'
    });
    
    console.log('✅ File Search document saved:', docId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving File Search document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all documents with File Search references for a course
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with array of documents with File Search references
 */
export async function getCourseDocumentsWithFileSearch(db, courseId) {
  try {
    const result = await getCourseDocuments(db, courseId);
    
    if (!result.success) {
      return result;
    }
    
    const validDocs = result.data.filter(doc => {
      return doc.fileSearchDocumentName && doc.uploadStatus === 'completed';
    });
    
    console.log(`✅ Found ${validDocs.length} documents in File Search`);
    return { success: true, data: validDocs };
  } catch (error) {
    console.error('❌ Error getting File Search documents:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all documents that need File Search upload
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with array of documents needing upload
 */
export async function getDocumentsNeedingFileSearchUpload(db, courseId) {
  try {
    const result = await getCourseDocuments(db, courseId);
    
    if (!result.success) {
      return result;
    }
    
    const needsUpload = result.data.filter(doc => {
      return !doc.fileSearchDocumentName || doc.uploadStatus !== 'completed';
    });
    
    console.log(`✅ Found ${needsUpload.length} documents needing File Search upload`);
    return { success: true, data: needsUpload };
  } catch (error) {
    console.error('❌ Error getting documents needing upload:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save File Search store name to course
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {string} fileSearchStoreName - File Search store resource name
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveCourseFileSearchStore(db, courseId, fileSearchStoreName) {
  try {
    const { doc, updateDoc, Timestamp } = window.firebaseModules;
    
    const courseRef = doc(db, 'courses', courseId);
    await updateDoc(courseRef, {
      fileSearchStoreName: fileSearchStoreName,
      fileSearchStoreCreatedAt: Timestamp.now()
    });
    
    console.log('✅ File Search store saved to course:', fileSearchStoreName);
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving File Search store:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a single document by ID
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {string} docId - Document ID
 * @returns {Promise<Object>} Result object with document data
 */
export async function getDocument(db, courseId, docId) {
  try {
    const { doc, getDoc } = window.firebaseModules;
    
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log('✅ Document retrieved:', docId);
      return { success: true, data: docSnap.data() };
    } else {
      console.warn('⚠️ Document not found:', docId);
      return { success: false, error: 'Document not found' };
    }
  } catch (error) {
    console.error('❌ Error getting document:', error);
    return { success: false, error: error.message };
  }
}

// ==================== STATISTICS & ANALYTICS ====================

/**
 * Get storage statistics for a user
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @returns {Promise<Object>} Result object with statistics
 */
export async function getUserStats(db, userId) {
  try {
    const courses = await getUserCourses(db, userId);
    
    if (!courses.success) {
      return courses;
    }
    
    let totalPDFs = 0;
    let totalCourses = courses.data.length;
    let totalSize = 0;
    
    for (const course of courses.data) {
      const docs = await getCourseDocuments(db, course.id);
      if (docs.success) {
        totalPDFs += docs.data.length;
        totalSize += docs.data.reduce((sum, doc) => sum + (doc.fileSize || 0), 0);
      }
    }
    
    console.log('✅ User stats calculated:', { totalCourses, totalPDFs, totalSize });
    
    return {
      success: true,
      data: {
        totalCourses: totalCourses,
        totalPDFs: totalPDFs,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        lastScanDate: courses.data[0]?.lastScannedAt || null
      }
    };
  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get course statistics (PDF count, size, etc.)
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with course statistics
 */
export async function getCourseStats(db, courseId) {
  try {
    const course = await getCourse(db, courseId);
    if (!course.success) {
      return course;
    }
    
    const docs = await getCourseDocuments(db, courseId);
    if (!docs.success) {
      return docs;
    }
    
    const totalSize = docs.data.reduce((sum, doc) => sum + (doc.fileSize || 0), 0);
    const uploadedCount = docs.data.filter(doc => doc.uploadStatus === 'completed').length;
    const pendingCount = docs.data.filter(doc => doc.uploadStatus === 'pending').length;
    const failedCount = docs.data.filter(doc => doc.uploadStatus === 'failed').length;
    
    console.log('✅ Course stats calculated:', courseId);
    
    return {
      success: true,
      data: {
        totalPDFs: docs.data.length,
        uploadedPDFs: uploadedCount,
        pendingPDFs: pendingCount,
        failedPDFs: failedCount,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        lastScanned: course.data.lastScannedAt
      }
    };
  } catch (error) {
    console.error('❌ Error getting course stats:', error);
    return { success: false, error: error.message };
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if Firebase is initialized and ready
 * @returns {boolean} True if Firebase is ready
 */
export function isFirebaseReady() {
  return !!(window.firebaseDb && window.firebaseModules);
}

/**
 * Wait for Firebase to be ready (with timeout)
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} True if Firebase is ready, throws error on timeout
 */
export async function waitForFirebase(maxWaitMs = 5000) {
  const startTime = Date.now();
  
  while (!isFirebaseReady()) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error('Firebase initialization timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('✅ Firebase is ready');
  return true;
}

/**
 * Generate a sanitized document ID from a URL
 * @param {string} url - URL to convert to document ID
 * @returns {string} Sanitized document ID
 */
export function urlToDocId(url) {
  return btoa(url).replace(/[/+=]/g, '_');
}

/**
 * Convert document ID back to URL
 * @param {string} docId - Document ID to convert
 * @returns {string} Original URL
 */
export function docIdToUrl(docId) {
  const base64 = docId.replace(/_/g, '/').replace(/_/g, '+').replace(/_/g, '=');
  return atob(base64);
}

// ==================== CHAT SESSION OPERATIONS (PRIVATE) ====================

/**
 * Create a new chat session for a user
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {Object} sessionData - Chat session information
 * @returns {Promise<Object>} Result object with session ID
 */
export async function createChatSession(db, userId, sessionData) {
  try {
    const { collection, addDoc, Timestamp } = window.firebaseModules;
    
    const sessionsRef = collection(db, 'users', userId, 'chatSessions');
    const docRef = await addDoc(sessionsRef, {
      courseId: sessionData.courseId,
      title: sessionData.title || 'New Chat',
      createdAt: Timestamp.now(),
      lastMessageAt: Timestamp.now(),
      messageCount: 0
    });
    
    console.log('✅ Chat session created:', docRef.id);
    return { success: true, sessionId: docRef.id };
  } catch (error) {
    console.error('❌ Error creating chat session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all chat sessions for a user (optionally filtered by course)
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {string|null} courseId - Optional course ID to filter by
 * @returns {Promise<Object>} Result object with array of sessions
 */
export async function getUserChatSessions(db, userId, courseId = null) {
  try {
    const { collection, query, where, getDocs, orderBy } = window.firebaseModules;
    
    const sessionsRef = collection(db, 'users', userId, 'chatSessions');
    let q;
    
    if (courseId) {
      q = query(sessionsRef, where('courseId', '==', courseId));
    } else {
      q = sessionsRef;
    }
    
    const snapshot = await getDocs(q);
    
    const sessions = [];
    snapshot.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort by last message time
    sessions.sort((a, b) => {
      const aTime = a.lastMessageAt?.toMillis() || 0;
      const bTime = b.lastMessageAt?.toMillis() || 0;
      return bTime - aTime;
    });
    
    console.log(`✅ Retrieved ${sessions.length} chat sessions for user`);
    return { success: true, data: sessions };
  } catch (error) {
    console.error('❌ Error getting chat sessions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a message to a chat session
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {string} sessionId - Chat session ID
 * @param {Object} messageData - Message data (role, content)
 * @returns {Promise<Object>} Result object with message ID
 */
export async function addMessageToSession(db, userId, sessionId, messageData) {
  try {
    const { collection, addDoc, doc, updateDoc, Timestamp, getDoc } = window.firebaseModules;
    
    // Add message
    const messagesRef = collection(db, 'users', userId, 'chatSessions', sessionId, 'messages');
    const messageRef = await addDoc(messagesRef, {
      role: messageData.role, // 'user' or 'assistant'
      content: messageData.content,
      timestamp: Timestamp.now()
    });
    
    // Update session metadata
    const sessionRef = doc(db, 'users', userId, 'chatSessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    const currentCount = sessionSnap.exists() ? (sessionSnap.data().messageCount || 0) : 0;
    
    await updateDoc(sessionRef, {
      lastMessageAt: Timestamp.now(),
      messageCount: currentCount + 1
    });
    
    console.log('✅ Message added to session:', sessionId);
    return { success: true, messageId: messageRef.id };
  } catch (error) {
    console.error('❌ Error adding message to session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all messages for a chat session
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {string} sessionId - Chat session ID
 * @returns {Promise<Object>} Result object with array of messages
 */
export async function getSessionMessages(db, userId, sessionId) {
  try {
    const { collection, getDocs } = window.firebaseModules;
    
    const messagesRef = collection(db, 'users', userId, 'chatSessions', sessionId, 'messages');
    const snapshot = await getDocs(messagesRef);
    
    const messages = [];
    snapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort by timestamp
    messages.sort((a, b) => {
      const aTime = a.timestamp?.toMillis() || 0;
      const bTime = b.timestamp?.toMillis() || 0;
      return aTime - bTime; // Ascending order (oldest first)
    });
    
    console.log(`✅ Retrieved ${messages.length} messages for session:`, sessionId);
    return { success: true, data: messages };
  } catch (error) {
    console.error('❌ Error getting session messages:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a chat session and all its messages
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {string} sessionId - Chat session ID
 * @returns {Promise<Object>} Result object with success status
 */
export async function deleteChatSession(db, userId, sessionId) {
  try {
    const { collection, getDocs, doc, deleteDoc } = window.firebaseModules;
    
    // Delete all messages first
    const messagesRef = collection(db, 'users', userId, 'chatSessions', sessionId, 'messages');
    const messagesSnap = await getDocs(messagesRef);
    
    for (const messageDoc of messagesSnap.docs) {
      await deleteDoc(messageDoc.ref);
    }
    
    // Delete the session
    const sessionRef = doc(db, 'users', userId, 'chatSessions', sessionId);
    await deleteDoc(sessionRef);
    
    console.log('✅ Chat session deleted:', sessionId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting chat session:', error);
    return { success: false, error: error.message };
  }
}

// ==================== EXPORTS ====================

// Make functions available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.firestoreHelpers = {
    // User operations
    saveUser,
    getUser,
    
    // Course operations (SHARED)
    saveCourse,
    getCourse,
    getUserCourses,
    updateCoursePdfCount,
    incrementCourseEnrollments,
    
    // Enrollment operations (PRIVATE)
    enrollUserInCourse,
    isUserEnrolled,
    updateEnrollmentFavorite,
    
    // Document operations (SHARED)
    saveDocument,
    saveDocuments,
    getCourseDocuments,
    getDocument,
    updateDocumentStatus,
    deleteDocument,
    
    // File Search operations
    saveDocumentFileSearch,
    getCourseDocumentsWithFileSearch,
    getDocumentsNeedingFileSearchUpload,
    saveCourseFileSearchStore,
    
    // Chat session operations (PRIVATE)
    createChatSession,
    getUserChatSessions,
    addMessageToSession,
    getSessionMessages,
    deleteChatSession,
    
    // Statistics
    getUserStats,
    getCourseStats,
    
    // Utilities
    isFirebaseReady,
    waitForFirebase,
    urlToDocId,
    docIdToUrl
  };
  
  console.log('✅ Firestore helpers loaded and available at window.firestoreHelpers');
}
