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
 * Link Gemini store to shared course
 * NEW: Store is attached to course, not user
 */
async function linkStoreToCourse(courseId, storeName, userId) {
  await db.collection('courses').doc(courseId).update({
    fileSearchStoreName: storeName,
    storeCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
    storeCreatedBy: userId  // Track who created it
  });
  
  logger.info('Store linked to course', { courseId, storeName, userId });
}

/**
 * DEPRECATED: Old user-owned store verification
 * Kept for backward compatibility during migration
 */
async function verifyStoreOwnership(userId, storeName) {
  const storeDoc = await db
    .collection('users').doc(userId)
    .collection('fileSearchStores').doc(storeName)
    .get();
  
  if (!storeDoc.exists) {
    throw new Error('Unauthorized: Store not found or you do not have access');
  }
  
  return storeDoc.data();
}

// ==================== FILE SEARCH STORE MANAGEMENT ====================

/**
 * Create a File Search store for a course (SHARED)
 * NEW: Creates ONE shared store per course, not per user
 * First user to request creates it, subsequent users use the same store
 */
exports.createCourseStore = onCall(async (request) => {
  try {
    const { courseId, userId, displayName } = request.data;

    if (!courseId || !userId) {
      throw new Error('courseId and userId are required');
    }

    // Verify user is enrolled in this course
    await verifyEnrollment(userId, courseId);
    
    // Check if store already exists for this course
    const courseDoc = await db.collection('courses').doc(courseId).get();
    
    if (!courseDoc.exists) {
      throw new Error('Course not found');
    }
    
    const existingStore = courseDoc.data().fileSearchStoreName;
    
    if (existingStore) {
      logger.info('Store already exists for course', { courseId, storeName: existingStore });
      return {
        success: true,
        message: 'Store already exists for this course',
        storeName: existingStore,
        alreadyExists: true
      };
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
 * DEPRECATED: Old user-owned store creation
 * Kept for backward compatibility
 */
exports.createStore = onCall(async (request) => {
  logger.warn('createStore is deprecated, use createCourseStore instead');
  
  try {
    const { displayName, userId } = request.data;

    if (!displayName || !userId) {
      throw new Error('displayName and userId are required');
    }

    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/fileSearchStores?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Create store failed: ${error}`);
    }

    const store = await response.json();
    
    logger.info('File Search store created (legacy)', { storeName: store.name, userId });

    return {
      success: true,
      store: store
    };

  } catch (error) {
    logger.error('Create store error:', error);
    throw new Error(error.message);
  }
});

/**
 * Get a File Search store by name
 * Verifies user owns the store
 */
exports.getStore = onCall(async (request) => {
  try {
    const { storeName, userId } = request.data;

    if (!storeName || !userId) {
      throw new Error('storeName and userId are required');
    }

    // Verify ownership
    await verifyStoreOwnership(userId, storeName);

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
 * List all File Search stores owned by user
 * Returns stores from Firestore (user's stores only)
 */
exports.listStores = onCall(async (request) => {
  try {
    const { userId } = request.data || {};

    if (!userId) {
      throw new Error('userId is required');
    }

    // Get user's stores from Firestore
    const storesSnapshot = await db
      .collection('users').doc(userId)
      .collection('fileSearchStores')
      .get();

    const stores = [];
    storesSnapshot.forEach(doc => {
      stores.push({
        name: doc.id,
        ...doc.data()
      });
    });

    logger.info('User stores retrieved', { userId, count: stores.length });

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
 * Verifies user owns the store
 */
exports.deleteStore = onCall(async (request) => {
  try {
    const { storeName, userId } = request.data;

    if (!storeName || !userId) {
      throw new Error('storeName and userId are required');
    }

    // Verify ownership
    await verifyStoreOwnership(userId, storeName);

    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/${storeName}?key=${GEMINI_API_KEY}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Delete store failed: ${error}`);
    }

    // Remove ownership record from Firestore
    await db
      .collection('users').doc(userId)
      .collection('fileSearchStores').doc(storeName)
      .delete();

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
 * Verifies user owns the store
 */
exports.uploadToStore = onCall(async (request) => {
  try {
    const { storeName, fileData, fileName, mimeType, metadata, userId } = request.data;

    if (!storeName || !fileData || !fileName || !userId) {
      throw new Error('storeName, fileData, fileName, and userId are required');
    }

    // Verify ownership
    await verifyStoreOwnership(userId, storeName);

    // Step 1: Initialize resumable upload
    const uploadMetadata = {
      parent: storeName,
      file: {
        display_name: fileName,
        mime_type: mimeType || 'application/pdf'
      }
    };

    if (metadata && Object.keys(metadata).length > 0) {
      uploadMetadata.file.metadata = metadata;
    }

    const fileSize = Buffer.byteLength(fileData, 'base64');

    const initResponse = await fetch(
      `${GEMINI_API_ENDPOINT}/${storeName}/documents:upload?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': fileSize,
          'X-Goog-Upload-Header-Content-Type': mimeType || 'application/pdf',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(uploadMetadata)
      }
    );

    if (!initResponse.ok) {
      const error = await initResponse.text();
      throw new Error(`Upload init failed: ${error}`);
    }

    const uploadUrl = initResponse.headers.get('x-goog-upload-url');

    // Step 2: Upload file content
    const buffer = Buffer.from(fileData, 'base64');
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': fileSize,
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: buffer
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`Upload failed: ${error}`);
    }

    const documentData = await uploadResponse.json();

    // Step 3: Wait for processing
    let document = documentData.document;
    let attempts = 0;
    const maxAttempts = 30;

    while (document.state === 'PROCESSING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(
        `${GEMINI_API_ENDPOINT}/${document.name}?key=${GEMINI_API_KEY}`
      );
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        document = statusData;
      }
      
      attempts++;
    }

    if (document.state !== 'ACTIVE') {
      throw new Error(`Document processing failed or timed out. State: ${document.state}`);
    }

    // Update document count in Firestore
    await db
      .collection('users').doc(userId)
      .collection('fileSearchStores').doc(storeName)
      .update({
        documentCount: admin.firestore.FieldValue.increment(1),
        lastUploadAt: admin.firestore.FieldValue.serverTimestamp()
      });

    logger.info('Document uploaded to File Search store', { 
      storeName,
      documentName: document.name,
      userId 
    });

    return {
      success: true,
      document: document
    };

  } catch (error) {
    logger.error('Upload to store error:', error);
    throw new Error(error.message);
  }
});

/**
 * List documents in a File Search store
 * Verifies user owns the store
 */
exports.listDocuments = onCall(async (request) => {
  try {
    const { storeName, pageSize = 100, pageToken, userId } = request.data;

    if (!storeName || !userId) {
      throw new Error('storeName and userId are required');
    }

    // Verify ownership
    await verifyStoreOwnership(userId, storeName);

    let url = `${GEMINI_API_ENDPOINT}/${storeName}/documents?pageSize=${pageSize}&key=${GEMINI_API_KEY}`;
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
 * Verifies user owns the store
 */
exports.deleteDocument = onCall(async (request) => {
  try {
    const { documentName, storeName, userId } = request.data;

    if (!documentName || !storeName || !userId) {
      throw new Error('documentName, storeName, and userId are required');
    }

    // Verify ownership
    await verifyStoreOwnership(userId, storeName);

    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/${documentName}?key=${GEMINI_API_KEY}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Delete document failed: ${error}`);
    }

    // Update document count in Firestore
    await db
      .collection('users').doc(userId)
      .collection('fileSearchStores').doc(storeName)
      .update({
        documentCount: admin.firestore.FieldValue.increment(-1)
      });

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
      sessionId = null
    } = request.data;

    if (!question || !courseId || !userId) {
      throw new Error('question, courseId, and userId are required');
    }

    // Verify user is enrolled in course
    await verifyEnrollment(userId, courseId);
    
    // Get shared store for course
    const storeName = await getSharedStore(courseId);

    // Build request with File Search tool
    const requestBody = {
      contents: [{
        parts: [{ text: question }]
      }],
      tools: [{
        fileSearch: {
          fileSearchStoreNames: [storeName],
          topK: topK
        }
      }]
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

/**
 * DEPRECATED: Query File Search store by name
 * Kept for backward compatibility
 * Use queryCourseStore instead for new implementations
 */
exports.queryWithFileSearch = onCall(async (request) => {
  logger.warn('queryWithFileSearch is deprecated, use queryCourseStore instead');
  
  try {
    const { 
      question, 
      storeName,
      userId,
      model = 'gemini-1.5-flash',
      metadataFilter,
      topK = 5
    } = request.data;

    if (!question || !storeName || !userId) {
      throw new Error('question, storeName, and userId are required');
    }

    // Use old verification for backward compatibility
    await verifyStoreOwnership(userId, storeName);

    // Build request with File Search tool
    const requestBody = {
      contents: [{
        parts: [{ text: question }]
      }],
      tools: [{
        fileSearch: {
          fileSearchStoreNames: [storeName],
          topK: topK
        }
      }]
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

    logger.info('File Search query completed', { 
      model,
      storeName,
      hasCitations: !!groundingMetadata
    });

    return {
      success: true,
      answer: text,
      groundingMetadata: groundingMetadata,
      model: model
    };

  } catch (error) {
    logger.error('Query error:', error);
    throw new Error(error.message);
  }
});
