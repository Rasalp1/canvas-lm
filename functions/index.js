/**
 * Cloud Functions for Canvas LM - Gemini File Search Tool (RAG) Proxy
 * 
 * These functions act as a secure proxy between the Chrome extension
 * and the Gemini File Search API, keeping your API key safe on the server.
 * 
 * File Search Tool is Google's enterprise RAG system with:
 * - Persistent corpus storage
 * - Automatic chunking and embedding
 * - Semantic search across documents
 * - Production-ready scalability
 */

// Load environment variables from .env file
require('dotenv').config();

const {onCall} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const https = require('https');

// Initialize Firebase Admin SDK
admin.initializeApp();

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

// Get API key from environment variable (.env file)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  logger.warn('⚠️ GEMINI_API_KEY not set. Add it to functions/.env file: GEMINI_API_KEY=your_key_here');
}

// Set global options for cost control and region
// europe-north1 is located in Finland (closest to Sweden)
setGlobalOptions({ 
  maxInstances: 10,
  region: 'europe-north1'
});

// Get Firestore instance
const db = admin.firestore();

// ==================== RATE LIMITING ====================

// Rate limit configuration
const RATE_LIMITS = {
  queryCourseStore: { requests: 50, windowMs: 60000 },      // 50 queries per minute
  uploadToStore: { requests: 20, windowMs: 60000 },          // 20 uploads per minute
  createCourseStore: { requests: 5, windowMs: 60000 },       // 5 store creations per minute
  deleteDocument: { requests: 30, windowMs: 60000 }          // 30 deletions per minute
};

/**
 * Check rate limit for a user
 * @param {string} userId - User ID
 * @param {string} operation - Operation name (e.g., 'queryCourseStore')
 * @returns {Promise<boolean>} true if allowed, throws error if rate limited
 */
async function checkRateLimit(userId, operation) {
  const config = RATE_LIMITS[operation];
  if (!config) {
    return true; // No rate limit configured for this operation
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const rateLimitRef = db
    .collection('users').doc(userId)
    .collection('rateLimits').doc(operation);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      
      if (!doc.exists) {
        // First request in this window
        transaction.set(rateLimitRef, {
          requests: [now],
          lastReset: now
        });
        return true;
      }

      const data = doc.data();
      // Filter out requests outside the current window
      const recentRequests = (data.requests || []).filter(timestamp => timestamp > windowStart);
      
      if (recentRequests.length >= config.requests) {
        // Rate limit exceeded
        const oldestRequest = Math.min(...recentRequests);
        const retryAfter = Math.ceil((oldestRequest + config.windowMs - now) / 1000);
        throw new Error(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
      }

      // Add current request
      recentRequests.push(now);
      transaction.set(rateLimitRef, {
        requests: recentRequests,
        lastReset: now
      });
      
      return true;
    });

    return result;
  } catch (error) {
    if (error.message.includes('Rate limit exceeded')) {
      throw error;
    }
    // Log transaction errors but don't block the request
    logger.warn('Rate limit check failed, allowing request', { userId, operation, error: error.message });
    return true;
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Verify user is enrolled in a course
 * NEW: Uses enrollment model instead of ownership
 */
async function verifyEnrollment(userId, courseId) {
  const enrollmentDoc = await db
    .collection('users').doc(userId)
    .collection('enrollments').doc(courseId)
    .get();
  
  if (!enrollmentDoc.exists) {
    throw new Error('Unauthorized: Not enrolled in course');
  }
  
  return enrollmentDoc.data();
}

/**
 * Get shared Gemini store for a course
 * NEW: Stores are now attached to courses, not users
 */
async function getSharedStore(courseId) {
  const courseDoc = await db.collection('courses').doc(courseId).get();
  
  if (!courseDoc.exists) {
    throw new Error('Course not found');
  }
  
  const courseData = courseDoc.data();
  
  if (!courseData.fileSearchStoreName) {
    throw new Error('Course has no Gemini store yet');
  }
  
  return courseData.fileSearchStoreName;
}

/**
 * Get courseId from store name
 * Maps a Gemini store back to its course
 */
async function getCourseIdFromStore(storeName) {
  const coursesSnapshot = await db.collection('courses')
    .where('fileSearchStoreName', '==', storeName)
    .limit(1)
    .get();
  
  if (coursesSnapshot.empty) {
    throw new Error('Store not associated with any course');
  }
  
  return coursesSnapshot.docs[0].id;
}

/**
 * Link Gemini store to shared course
 * NEW: Store is attached to course, not user
 * Also auto-enrolls the user who creates the store
 */
async function linkStoreToCourse(courseId, storeName, userId) {
  // Update course with store info
  await db.collection('courses').doc(courseId).update({
    fileSearchStoreName: storeName,
    storeCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
    storeCreatedBy: userId  // Track who created it
  });
  
  // Auto-enroll user who creates the store (implicit enrollment)
  await db
    .collection('users').doc(userId)
    .collection('enrollments').doc(courseId)
    .set({
      enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
      enrolledBy: 'system', // Auto-enrolled when creating store
      role: 'creator'
    }, { merge: true });
  
  logger.info('Store linked to course and user auto-enrolled', { courseId, storeName, userId });
}

// ==================== FILE SEARCH STORE MANAGEMENT ====================

/**
 * Create a File Search store for a course (SHARED)
 * NEW: Creates ONE shared store per course, not per user
 * First user to request creates it, subsequent users use the same store
 * Auto-enrolls user and creates course document if needed
 * Rate limited: 5 requests per minute per user
 */
exports.createCourseStore = onCall(async (request) => {
  try {
    const { courseId, userId, displayName, courseName } = request.data;

    if (!courseId || !userId) {
      throw new Error('courseId and userId are required');
    }

    // Check rate limit (5 store creations per minute)
    await checkRateLimit(userId, 'createCourseStore');

    // Check if course exists, create if not
    let courseDoc = await db.collection('courses').doc(courseId).get();
    
    if (!courseDoc.exists) {
      // Create course document
      await db.collection('courses').doc(courseId).set({
        courseId: courseId,
        courseName: courseName || displayName || `Course ${courseId}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
        totalSize: 0
      });
      logger.info('Course document created', { courseId, userId });
      courseDoc = await db.collection('courses').doc(courseId).get();
    }
    
    const existingStore = courseDoc.data().fileSearchStoreName;
    
    if (existingStore) {
      // Verify the store actually exists in Google's API
      logger.info('Checking if existing store is valid', { courseId, storeName: existingStore });
      
      const verifyResponse = await fetch(
        `${GEMINI_API_ENDPOINT}/${existingStore}?key=${GEMINI_API_KEY}`
      );
      
      if (verifyResponse.ok) {
        logger.info('Store already exists and is valid', { courseId, storeName: existingStore });
        return {
          success: true,
          message: 'Store already exists for this course',
          storeName: existingStore,
          alreadyExists: true
        };
      } else {
        logger.warn('Existing store not found in API, will create new one', { 
          courseId, 
          oldStore: existingStore,
          status: verifyResponse.status
        });
        // Continue to create new store
      }
    }

    // Create new Gemini store
    const storeDisplayName = displayName || `Course ${courseId} Materials`;
    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/fileSearchStores?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: storeDisplayName })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Create store failed: ${error}`);
    }

    const store = await response.json();
    
    // Link store to SHARED course (not user)
    await linkStoreToCourse(courseId, store.name, userId);
    
    logger.info('File Search store created for course', { 
      storeName: store.name, 
      courseId,
      createdBy: userId 
    });

    return {
      success: true,
      store: store,
      storeName: store.name,
      alreadyExists: false
    };

  } catch (error) {
    logger.error('Create course store error:', error);
    throw new Error(error.message);
  }
});

/**
 * Get a File Search store by name
 * Verifies user is enrolled in the course
 */
exports.getStore = onCall(async (request) => {
  try {
    const { storeName, userId } = request.data;

    if (!storeName || !userId) {
      throw new Error('storeName and userId are required');
    }

    // Get courseId from store and verify enrollment
    const courseId = await getCourseIdFromStore(storeName);
    await verifyEnrollment(userId, courseId);

    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/${storeName}?key=${GEMINI_API_KEY}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Get store failed: ${error}`);
    }

    const store = await response.json();

    return {
      success: true,
      store: store
    };

  } catch (error) {
    logger.error('Get store error:', error);
    throw new Error(error.message);
  }
});

/**
 * List all courses user is enrolled in
 * Returns course stores based on enrollment
 */
exports.listStores = onCall(async (request) => {
  try {
    const { userId } = request.data || {};

    if (!userId) {
      throw new Error('userId is required');
    }

    // Get user's enrollments
    const enrollmentsSnapshot = await db
      .collection('users').doc(userId)
      .collection('enrollments')
      .get();

    const stores = [];
    
    // Get course data for each enrollment
    for (const enrollDoc of enrollmentsSnapshot.docs) {
      const courseId = enrollDoc.id;
      const courseDoc = await db.collection('courses').doc(courseId).get();
      
      if (courseDoc.exists) {
        const courseData = courseDoc.data();
        if (courseData.fileSearchStoreName) {
          stores.push({
            courseId: courseId,
            name: courseData.fileSearchStoreName,
            displayName: courseData.courseName,
            createdAt: courseData.storeCreatedAt
          });
        }
      }
    }

    logger.info('User course stores retrieved', { userId, count: stores.length });

    return {
      success: true,
      stores: stores
    };

  } catch (error) {
    logger.error('List stores error:', error);
    throw new Error(error.message);
  }
});

/**
 * Delete a File Search store
 * Verifies user is enrolled in the course (only course creator can delete)
 */
exports.deleteStore = onCall(async (request) => {
  try {
    const { storeName, userId } = request.data;

    if (!storeName || !userId) {
      throw new Error('storeName and userId are required');
    }

    // Get courseId and verify enrollment
    const courseId = await getCourseIdFromStore(storeName);
    await verifyEnrollment(userId, courseId);
    
    // Verify user is course creator
    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (courseDoc.data().createdBy !== userId) {
      throw new Error('Only course creator can delete the store');
    }

    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/${storeName}?key=${GEMINI_API_KEY}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Delete store failed: ${error}`);
    }

    // Remove store reference from course
    await db.collection('courses').doc(courseId).update({
      fileSearchStoreName: admin.firestore.FieldValue.delete(),
      storeCreatedAt: admin.firestore.FieldValue.delete(),
      storeCreatedBy: admin.firestore.FieldValue.delete()
    });

    logger.info('Store deleted', { storeName, userId });

    return { success: true };

  } catch (error) {
    logger.error('Delete store error:', error);
    throw new Error(error.message);
  }
});

// ==================== DOCUMENT MANAGEMENT ====================

/**
 * Upload a PDF directly to File Search store
 * Automatically chunks, embeds, and indexes the document
 * Verifies user is enrolled in the course
 * 
 * Configured with 1GB memory to handle large PDFs (up to 100MB limit)
 */
exports.uploadToStore = onCall(
  {
    memory: '1GiB',        // Increased to handle large PDFs in base64 + buffer conversion
    timeoutSeconds: 540,   // 9 minutes for large file processing
    cpu: 2                 // 2 vCPUs for faster processing
  },
  async (request) => {
  try {
    const { storeName, fileData, fileName, mimeType, metadata, userId } = request.data;

    if (!storeName || !fileData || !fileName || !userId) {
      throw new Error('storeName, fileData, fileName, and userId are required');
    }

    // File Search API has a 100 MB limit per document
    // Base64 is ~33% larger than original file
    // So max base64 string should be ~133 MB (100 MB * 1.33)
    const maxBase64Size = 140 * 1024 * 1024; // 140 MB to be safe
    const estimatedFileSize = (fileData.length * 3) / 4; // Estimate original size from base64
    
    if (fileData.length > maxBase64Size) {
      throw new Error(`File too large. Maximum size is 100 MB. This file appears to be ${Math.round(estimatedFileSize / 1024 / 1024)} MB`);
    }
    
    logger.info('Upload request received', { 
      fileName, 
      base64Length: fileData.length,
      estimatedSizeMB: Math.round(estimatedFileSize / 1024 / 1024)
    });

    // Check rate limit (20 uploads per minute)
    await checkRateLimit(userId, 'uploadToStore');

    // Get courseId and verify enrollment
    const courseId = await getCourseIdFromStore(storeName);
    await verifyEnrollment(userId, courseId);

    // Step 1: Initialize resumable upload
    const uploadMetadata = {
      displayName: fileName,
      mimeType: mimeType || 'application/pdf'
    };

    // Convert metadata to CustomMetadata array format required by API
    if (metadata && Object.keys(metadata).length > 0) {
      uploadMetadata.customMetadata = Object.entries(metadata).map(([key, value]) => {
        // Convert each key-value pair to CustomMetadata format
        if (typeof value === 'number') {
          return { key, numericValue: value };
        } else if (Array.isArray(value)) {
          return { key, stringListValue: { values: value } };
        } else {
          return { key, stringValue: String(value) };
        }
      });
    }

    // Step 2: Decode base64 to get actual file buffer
    // Note: This temporarily doubles memory usage (base64 string + buffer)
    const buffer = Buffer.from(fileData, 'base64');
    const fileSize = buffer.length;
    
    // Verify file size is within File Search API limits (100 MB)
    const maxFileSize = 100 * 1024 * 1024; // 100 MB
    if (fileSize > maxFileSize) {
      throw new Error(`File size (${Math.round(fileSize / 1024 / 1024)} MB) exceeds File Search API limit of 100 MB`);
    }
    
    // Validate PDF format by checking magic bytes
    const pdfMagicBytes = buffer.slice(0, 5).toString();
    if (!pdfMagicBytes.startsWith('%PDF-')) {
      logger.error('Invalid PDF file', {
        fileName,
        firstBytes: buffer.slice(0, 20).toString('hex'),
        mimeType
      });
      throw new Error(`Invalid PDF file: ${fileName}. File does not have PDF magic bytes.`);
    }
    
    logger.info('File decoded and validated successfully', { 
      fileSizeMB: Math.round(fileSize / 1024 / 1024),
      pdfVersion: pdfMagicBytes
    });

    // File Search API uses multipart/form-data (NOT resumable protocol like Files API!)
    // Create multipart boundary
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    // Build multipart body
    const parts = [];
    
    // Part 1: metadata as JSON
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="metadata"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(uploadMetadata) + '\r\n'
    );
    
    // Part 2: file content
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType || 'application/pdf'}\r\n\r\n`
    );
    
    // Create final body with buffer
    const textParts = parts.join('');
    const endBoundary = `\r\n--${boundary}--\r\n`;
    
    const bodyParts = [
      Buffer.from(textParts, 'utf-8'),
      buffer,
      Buffer.from(endBoundary, 'utf-8')
    ];
    
    const multipartBody = Buffer.concat(bodyParts);

    // Upload directly with multipart/form-data
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/${storeName}:uploadToFileSearchStore?key=${GEMINI_API_KEY}`;
    
    logger.info('Uploading to File Search store', { 
      url: uploadUrl.replace(GEMINI_API_KEY, 'REDACTED'),
      fileSize,
      fileName,
      storeName 
    });

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length.toString()
      },
      body: multipartBody
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = errorText;
      }
      
      logger.error('Upload failed', { 
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorDetails,
        fileName,
        fileSize: Math.round(fileSize / 1024 / 1024) + ' MB',
        storeName,
        requestHeaders: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': multipartBody.length
        }
      });
      
      // Provide more helpful error messages
      if (uploadResponse.status === 500) {
        throw new Error(`Google API Internal Error (500). This may be due to: invalid file format, corrupted PDF, or temporary API issues. File: ${fileName}`);
      } else if (uploadResponse.status === 429) {
        throw new Error(`Rate limit exceeded. Please wait a moment and try again.`);
      } else if (uploadResponse.status === 403) {
        throw new Error(`Permission denied. Check API key and store access.`);
      } else {
        throw new Error(`Upload failed [${uploadResponse.status}]: ${JSON.stringify(errorDetails)}`);
      }
    }

    // uploadToFileSearchStore returns a long-running operation
    const operationData = await uploadResponse.json();
    
    logger.info('Upload operation started', { 
      operationName: operationData.name,
      done: operationData.done 
    });

    // Step 4: Poll operation until done
    let operation = operationData;
    let attempts = 0;
    const maxAttempts = 30;

    while (!operation.done && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Poll the operation status
      const statusResponse = await fetch(
        `${GEMINI_API_ENDPOINT}/${operation.name}?key=${GEMINI_API_KEY}`
      );
      
      if (statusResponse.ok) {
        operation = await statusResponse.json();
        logger.info('Operation status', { 
          done: operation.done, 
          attempt: attempts + 1 
        });
      }
      
      attempts++;
    }

    if (!operation.done) {
      throw new Error(`Upload operation timed out after ${maxAttempts} attempts`);
    }

    if (operation.error) {
      logger.error('Upload operation failed', { error: operation.error });
      throw new Error(`Upload operation failed: ${JSON.stringify(operation.error)}`);
    }

    // Extract document info from operation response
    const document = operation.response;
    
    // Log the full response structure for debugging
    logger.info('Operation response structure', { 
      responseKeys: document ? Object.keys(document) : 'null',
      hasDocumentName: !!document?.documentName,
      documentName: document?.documentName
    });

    // Get the full document resource name from the response
    // Format: fileSearchStores/{store}/documents/{documentId}
    const documentName = document?.documentName;
    
    if (!documentName) {
      logger.error('No document name in operation response', { operation });
      throw new Error('Document name not found in upload response');
    }

    // Extract just the document ID from the full resource name
    const documentId = documentName.split('/').pop();

    // Update last upload timestamp (pdfCount is set by client during batch upload)
    await db
      .collection('courses').doc(courseId)
      .update({
        lastUploadAt: admin.firestore.FieldValue.serverTimestamp()
      });

    logger.info('Document uploaded to File Search store', { 
      storeName,
      documentId,
      documentName,
      fileName,
      userId 
    });

    // Return full document resource name for Firestore tracking
    return {
      success: true,
      name: documentName,           // Full resource name
      documentId,                   // Just the ID
      fileName,
      operationName: operation.name
    };

  } catch (error) {
    logger.error('Upload to store error:', error);
    throw new Error(error.message);
  }
});

/**
 * List documents in a File Search store
 * Verifies user is enrolled in the course
 */
exports.listDocuments = onCall(async (request) => {
  try {
    const { storeName, pageSize = 20, pageToken, userId } = request.data;

    if (!storeName || !userId) {
      throw new Error('storeName and userId are required');
    }

    // Get courseId and verify enrollment
    const courseId = await getCourseIdFromStore(storeName);
    await verifyEnrollment(userId, courseId);

    // Gemini API requires pageSize between 1 and 20
    const validPageSize = Math.max(1, Math.min(20, pageSize));

    let url = `${GEMINI_API_ENDPOINT}/${storeName}/documents?pageSize=${validPageSize}&key=${GEMINI_API_KEY}`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`List documents failed: ${error}`);
    }

    const result = await response.json();

    return {
      success: true,
      documents: result.documents || [],
      nextPageToken: result.nextPageToken
    };

  } catch (error) {
    logger.error('List documents error:', error);
    throw new Error(error.message);
  }
});

/**
 * Delete a document from File Search store
 * Verifies user is enrolled in the course
 * Rate limited: 30 deletions per minute per user
 */
exports.deleteDocument = onCall(async (request) => {
  try {
    const { documentName, storeName, userId } = request.data;

    if (!documentName || !storeName || !userId) {
      throw new Error('documentName, storeName, and userId are required');
    }

    // Check rate limit (30 deletions per minute)
    await checkRateLimit(userId, 'deleteDocument');

    // Get courseId and verify enrollment
    const courseId = await getCourseIdFromStore(storeName);
    await verifyEnrollment(userId, courseId);

    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/${documentName}?key=${GEMINI_API_KEY}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Delete document failed: ${error}`);
    }

    logger.info('Document deleted', { documentName, storeName, userId });

    return { success: true };

  } catch (error) {
    logger.error('Delete document error:', error);
    throw new Error(error.message);
  }
});

// ==================== QUERY WITH FILE SEARCH ====================

/**
 * Query course's shared File Search store (NEW)
 * Verifies user is enrolled in course
 * Optionally saves to user's private chat history
 * Rate limited: 50 requests per minute per user
 */
exports.queryCourseStore = onCall(async (request) => {
  try {
    const { 
      question, 
      courseId,
      userId,
      model = 'gemini-1.5-flash',
      metadataFilter,
      topK = 5,
      saveToHistory = false,
      sessionId = null,
      history = []
    } = request.data;

    if (!question || !courseId || !userId) {
      throw new Error('question, courseId, and userId are required');
    }

    // Check rate limit (50 queries per minute)
    await checkRateLimit(userId, 'queryCourseStore');

    // Verify user is enrolled in course
    await verifyEnrollment(userId, courseId);
    
    // Get shared store for course
    const storeName = await getSharedStore(courseId);

    // Build request with File Search tool
    // Start with conversation history (limit to last 10 messages)
    const contents = history.slice(-10);
    
    // Add current user question
    contents.push({
      role: 'user',
      parts: [{ text: question }]
    });
    
    const requestBody = {
      system_instruction: {
        parts: [{ 
          text: 'You are Canvas LM, an intelligent course assistant for courses on Canvas. Your purpose is to help students understand their course materials by answering questions based EXCLUSIVELY on the uploaded documents in the knowledge base.\n\nSTRICT RULES:\n1. Persona: Be professional, encouraging, and helpful. You are knowledgeable and serious about the course, but also support the student in a mentor-type way.\n2. ONLY use information found in the provided course documents\n3. ALWAYS search the File Search store before answering any question\n4. Reference the course material as often as possible, and use language such as "Based on the course material,"\n5. Provide specific citations showing which document(s) you used\n6. Use quotes and paraphrasing extensively\n\nRESPONSE FORMAT:\n- Answer the question clearly and concisely based on the documents\n- Include relevant details, examples, or explanations from the course materials\n- When asked for when the exam date is, always mention only the latest date available.\n\nRemember: Your knowledge is based on what\'s been uploaded to this course. This ensures accuracy and prevents misinformation.'
        }]
      },
      contents: contents,
      tools: [{
        fileSearch: {
          fileSearchStoreNames: [storeName],
          topK: topK
        }
      }],
      generationConfig: {
        maxOutputTokens: 8192  // Increase from default (~2048) to allow longer responses
      }
    };

    // Add metadata filter if provided
    if (metadataFilter) {
      requestBody.tools[0].fileSearch.metadataFilter = metadataFilter;
    }

    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Query failed: ${error}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    // Extract citations if available
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata;

    // Save to user's private chat history if requested
    if (saveToHistory) {
      let chatSessionId = sessionId;
      
      if (!chatSessionId) {
        // Create new chat session
        const sessionRef = await db
          .collection('users').doc(userId)
          .collection('chatSessions')
          .add({
            courseId: courseId,
            title: question.substring(0, 50),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
            messageCount: 2
          });
        chatSessionId = sessionRef.id;
      }
      
      // Add messages to session
      const sessionRef = db
        .collection('users').doc(userId)
        .collection('chatSessions').doc(chatSessionId);
      
      await sessionRef.collection('messages').add({
        role: 'user',
        content: question,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      await sessionRef.collection('messages').add({
        role: 'assistant',
        content: text,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update session metadata
      await sessionRef.update({
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        messageCount: admin.firestore.FieldValue.increment(2)
      });
    }

    logger.info('Course query completed', { 
      model,
      courseId,
      storeName,
      userId,
      savedToHistory: saveToHistory
    });

    return {
      success: true,
      answer: text,
      groundingMetadata: groundingMetadata,
      sessionId: sessionId,
      model: model
    };

  } catch (error) {
    logger.error('Query course store error:', error);
    throw new Error(error.message);
  }
});

// ==================== PDF DOWNLOAD PROXY ====================

/**
 * Proxy function to download PDFs from Canvas
 * Bypasses CORS by making server-side request with user's session cookies
 * 
 * This is the industry-standard solution for cross-origin authenticated downloads:
 * - Extension passes Canvas session cookies to backend
 * - Backend makes authenticated request to Canvas
 * - Backend streams PDF back as base64
 * - Extension uploads to Google File Search
 */
exports.downloadCanvasPdf = onCall(async (request) => {
  try {
    const { url, cookies } = request.data;

    if (!url) {
      throw new Error('url is required');
    }

    if (!cookies || typeof cookies !== 'object') {
      throw new Error('cookies object is required');
    }

    // Validate Canvas URL
    if (!url.includes('canvas.education.lu.se')) {
      throw new Error('Invalid Canvas URL');
    }

    logger.info('Downloading PDF via proxy', { 
      url: url.substring(0, 100), // Log partial URL for debugging
      hasCookies: Object.keys(cookies).length > 0 
    });

    // Convert cookies object to Cookie header string
    const cookieHeader = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    // Make authenticated request to Canvas
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*',
        'Referer': 'https://canvas.education.lu.se/',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow' // Follow redirects automatically
    });

    if (!response.ok) {
      throw new Error(`Canvas returned ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      logger.warn('Unexpected content type', { contentType, url });
    }

    // Get PDF as buffer
    const buffer = await response.buffer();
    
    // Convert to base64
    const base64Data = buffer.toString('base64');

    logger.info('PDF downloaded successfully', { 
      size: buffer.length,
      contentType 
    });

    return {
      success: true,
      base64Data: base64Data,
      mimeType: contentType.includes('pdf') ? 'application/pdf' : contentType,
      size: buffer.length
    };

  } catch (error) {
    logger.error('PDF download error:', error);
    throw new Error(`Failed to download PDF: ${error.message}`);
  }
});

// ==================== ADMIN OPERATIONS ====================

/**
 * Firestore trigger: Cascade delete chat sessions when a course is deleted
 * This runs automatically whenever a document in the 'courses' collection is deleted
 */
const {onDocumentDeleted} = require('firebase-functions/v2/firestore');

exports.onCourseDeleted = onDocumentDeleted('courses/{courseId}', async (event) => {
  const courseId = event.params.courseId;
  logger.info(`🗑️ Course ${courseId} deleted, starting cascade deletion...`);
  
  try {
    let deletedSessions = 0;
    let deletedMessages = 0;
    let deletedDocuments = 0;
    
    // 1. Delete all chat sessions for this course
    const sessionsSnapshot = await db.collection('chatSessions')
      .where('courseId', '==', courseId)
      .get();
    
    for (const sessionDoc of sessionsSnapshot.docs) {
      // Delete all messages in this session
      const messagesSnapshot = await db.collection('chatSessions')
        .doc(sessionDoc.id)
        .collection('messages')
        .get();
      
      for (const messageDoc of messagesSnapshot.docs) {
        await messageDoc.ref.delete();
        deletedMessages++;
      }
      
      // Delete the session
      await sessionDoc.ref.delete();
      deletedSessions++;
    }
    
    // 2. Note: Course documents are subcollections and need manual cleanup
    // They will be handled by the deleteCourseWithCascade function in firestore-helpers
    
    logger.info(`✅ Cascade delete complete for course ${courseId}: ${deletedSessions} sessions, ${deletedMessages} messages`);
    
    return {
      success: true,
      courseId,
      deletedSessions,
      deletedMessages
    };
  } catch (error) {
    logger.error(`❌ Error in cascade delete for course ${courseId}:`, error);
    throw error;
  }
});
