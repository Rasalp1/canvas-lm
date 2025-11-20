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

// ==================== COURSE OPERATIONS ====================

/**
 * Save course information to Firestore
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @param {Object} courseData - Course information
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveCourse(db, userId, courseData) {
  try {
    const { doc, setDoc, Timestamp } = window.firebaseModules;
    
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
    
    console.log('✅ Course saved to Firestore:', courseData.courseId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving course:', error);
    return { success: false, error: error.message };
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
 * Get all courses for a user
 * @param {Object} db - Firestore database instance
 * @param {string} userId - Chrome Identity user ID
 * @returns {Promise<Object>} Result object with array of courses
 */
export async function getUserCourses(db, userId) {
  try {
    const { collection, query, where, getDocs } = window.firebaseModules;
    
    const coursesRef = collection(db, 'courses');
    const q = query(coursesRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const courses = [];
    querySnapshot.forEach((doc) => {
      courses.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort in memory instead of in query (avoids index requirement)
    courses.sort((a, b) => {
      const aTime = a.lastScannedAt?.toMillis() || 0;
      const bTime = b.lastScannedAt?.toMillis() || 0;
      return bTime - aTime; // Descending order (newest first)
    });
    
    console.log(`✅ Retrieved ${courses.length} courses for user:`, userId);
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

// ==================== DOCUMENT/PDF OPERATIONS ====================

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
      geminiFileId: null,
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
export async function updateDocumentStatus(db, courseId, docId, status, geminiFileId = null) {
  try {
    const { doc, updateDoc, Timestamp } = window.firebaseModules;
    
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    const updateData = {
      uploadStatus: status,
      lastUpdatedAt: Timestamp.now()
    };
    
    if (geminiFileId) {
      updateData.geminiFileId = geminiFileId;
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
 * Save Gemini file URI and metadata to a document
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @param {string} docId - Document ID
 * @param {string} geminiUri - Gemini file URI
 * @param {string} geminiFileName - Gemini file name (e.g., "files/abc123")
 * @param {Date} expiresAt - Optional expiration date (defaults to 48 hours from now)
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveDocumentGeminiUri(db, courseId, docId, geminiUri, geminiFileName, expiresAt = null) {
  try {
    const { doc, updateDoc, Timestamp } = window.firebaseModules;
    
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    
    // Default expiration: 48 hours from now
    const expiration = expiresAt || new Date(Date.now() + 48 * 60 * 60 * 1000);
    
    await updateDoc(docRef, {
      geminiUri: geminiUri,
      geminiFileName: geminiFileName,
      geminiUploadedAt: Timestamp.now(),
      geminiExpiresAt: Timestamp.fromDate(expiration),
      uploadStatus: 'completed'
    });
    
    console.log('✅ Gemini URI saved for document:', docId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving Gemini URI:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all documents with valid (non-expired) Gemini URIs for a course
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with array of documents with valid Gemini URIs
 */
export async function getCourseDocumentsWithGemini(db, courseId) {
  try {
    const result = await getCourseDocuments(db, courseId);
    
    if (!result.success) {
      return result;
    }
    
    const now = new Date();
    const validDocs = result.data.filter(doc => {
      if (!doc.geminiUri || !doc.geminiExpiresAt) {
        return false;
      }
      
      // Check if not expired
      const expiresAt = doc.geminiExpiresAt.toDate();
      return expiresAt > now;
    });
    
    console.log(`✅ Found ${validDocs.length} documents with valid Gemini URIs`);
    return { success: true, data: validDocs };
  } catch (error) {
    console.error('❌ Error getting documents with Gemini URIs:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all documents that need Gemini upload (no URI or expired)
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with array of documents needing upload
 */
export async function getDocumentsNeedingGeminiUpload(db, courseId) {
  try {
    const result = await getCourseDocuments(db, courseId);
    
    if (!result.success) {
      return result;
    }
    
    const now = new Date();
    const needsUpload = result.data.filter(doc => {
      // No Gemini URI
      if (!doc.geminiUri) {
        return true;
      }
      
      // Expired URI
      if (doc.geminiExpiresAt) {
        const expiresAt = doc.geminiExpiresAt.toDate();
        return expiresAt <= now;
      }
      
      return false;
    });
    
    console.log(`✅ Found ${needsUpload.length} documents needing Gemini upload`);
    return { success: true, data: needsUpload };
  } catch (error) {
    console.error('❌ Error getting documents needing upload:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear expired Gemini URIs for a course
 * @param {Object} db - Firestore database instance
 * @param {string} courseId - Canvas course ID
 * @returns {Promise<Object>} Result object with count of cleared documents
 */
export async function clearExpiredGeminiUris(db, courseId) {
  try {
    const { doc, updateDoc } = window.firebaseModules;
    const result = await getCourseDocuments(db, courseId);
    
    if (!result.success) {
      return result;
    }
    
    const now = new Date();
    let clearedCount = 0;
    
    for (const document of result.data) {
      if (document.geminiExpiresAt) {
        const expiresAt = document.geminiExpiresAt.toDate();
        
        if (expiresAt <= now) {
          const docRef = doc(db, 'courses', courseId, 'documents', document.id);
          await updateDoc(docRef, {
            geminiUri: null,
            geminiFileName: null,
            geminiExpiresAt: null,
            uploadStatus: 'expired'
          });
          clearedCount++;
        }
      }
    }
    
    console.log(`✅ Cleared ${clearedCount} expired Gemini URIs`);
    return { success: true, clearedCount };
  } catch (error) {
    console.error('❌ Error clearing expired URIs:', error);
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

// ==================== EXPORTS ====================

// Make functions available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.firestoreHelpers = {
    // User operations
    saveUser,
    getUser,
    
    // Course operations
    saveCourse,
    getCourse,
    getUserCourses,
    updateCoursePdfCount,
    
    // Document operations
    saveDocument,
    saveDocuments,
    getCourseDocuments,
    getDocument,
    updateDocumentStatus,
    deleteDocument,
    
    // Gemini RAG operations
    saveDocumentGeminiUri,
    getCourseDocumentsWithGemini,
    getDocumentsNeedingGeminiUpload,
    clearExpiredGeminiUris,
    
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
