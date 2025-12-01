// gemini-file-search-cloud.js - Cloud Functions client for File Search Tool (RAG)
// Replaces direct API calls with secure server-side calls

import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Gemini File Search Cloud Client
 * Calls Firebase Cloud Functions that proxy File Search Tool API requests
 * Your API key stays secure on the server
 * 
 * This is for the File Search Tool (RAG) - persistent, searchable corpus
 * NOT the simple File API (temporary file uploads)
 * 
 * Requires userId for all operations to enforce user isolation
 */
class GeminiFileSearchCloudClient {
  constructor(firebaseApp, userId) {
    this.functions = getFunctions(firebaseApp, 'europe-north1');
    this.userId = userId;
  }
  
  /**
   * Set or update the user ID
   * @param {string} userId - User ID from Chrome Identity
   */
  setUserId(userId) {
    this.userId = userId;
  }

  // ==================== STORE MANAGEMENT ====================

  /**
   * Create a File Search store for a course (SHARED - NEW)
   * Creates one shared store per course, reuses if already exists
   * @param {string} courseId - Canvas course ID
   * @param {string} displayName - Display name for the store (e.g., course name)
   * @returns {Promise<Object>} Store metadata with alreadyExists flag
   */
  async createCourseStore(courseId, displayName) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }

      const createCourseStore = httpsCallable(this.functions, 'createCourseStore');
      const result = await createCourseStore({ 
        courseId,
        displayName,
        userId: this.userId 
      });

      if (!result.data.success) {
        throw new Error('Create course store failed');
      }

      if (result.data.alreadyExists) {
        console.log('✅ Using existing shared store for course:', result.data.storeName);
      } else {
        console.log('✅ New shared store created for course:', result.data.storeName);
      }
      
      return {
        name: result.data.storeName,
        alreadyExists: result.data.alreadyExists,
        store: result.data.store
      };
    } catch (error) {
      console.error('❌ Error creating course store:', error);
      throw error;
    }
  }

  /**
   * Create a File Search store (DEPRECATED - use createCourseStore)
   * @param {string} displayName - Display name for the store (e.g., course name)
   * @returns {Promise<Object>} Store metadata
   */
  async createStore(displayName) {
    console.warn('⚠️ createStore() is deprecated. Use createCourseStore() for new implementations.');
    
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }

      const createStore = httpsCallable(this.functions, 'createStore');
      const result = await createStore({ 
        displayName,
        userId: this.userId 
      });

      if (!result.data.success) {
        throw new Error('Create store failed');
      }

      console.log('✅ File Search store created:', result.data.store.name);
      return result.data.store;
    } catch (error) {
      console.error('❌ Error creating File Search store:', error);
      throw error;
    }
  }

  /**
   * Get a File Search store by name
   * @param {string} storeName - Store resource name (e.g., "fileSearchStores/abc123")
   * @returns {Promise<Object>} Store metadata
   */
  async getStore(storeName) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }

      const getStore = httpsCallable(this.functions, 'getStore');
      const result = await getStore({ 
        storeName,
        userId: this.userId 
      });

      if (!result.data.success) {
        throw new Error('Get store failed');
      }

      return result.data.store;
    } catch (error) {
      console.error('❌ Error getting store:', error);
      throw error;
    }
  }

  /**
   * List all File Search stores
   * @param {number} pageSize - Number of stores per page
   * @param {string} pageToken - Token for pagination
   * @returns {Promise<Object>} List of stores with nextPageToken
   */
  async listStores(pageSize = 100, pageToken = null) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }

      const listStores = httpsCallable(this.functions, 'listStores');
      const result = await listStores({
        userId: this.userId
      });

      if (!result.data.success) {
        throw new Error('List stores failed');
      }

      return {
        stores: result.data.stores
      };
    } catch (error) {
      console.error('❌ Error listing stores:', error);
      throw error;
    }
  }

  /**
   * Delete a File Search store
   * @param {string} storeName - Store resource name
   * @returns {Promise<boolean>} Success status
   */
  async deleteStore(storeName) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }

      const deleteStore = httpsCallable(this.functions, 'deleteStore');
      const result = await deleteStore({ 
        storeName,
        userId: this.userId 
      });

      console.log('✅ File Search store deleted:', storeName);
      return result.data.success;
    } catch (error) {
      console.error('❌ Error deleting store:', error);
      throw error;
    }
  }

  // ==================== DOCUMENT MANAGEMENT ====================

  /**
   * Upload a PDF directly to File Search store
   * Automatically chunks, embeds, and indexes the document
   * @param {string} storeName - Store resource name
   * @param {Blob|File} file - The PDF file to upload
   * @param {string} displayName - Display name for the document
   * @param {Object} metadata - Optional metadata for the document
   * @returns {Promise<Object>} Document metadata
   */
  async uploadToStore(storeName, file, displayName = null, metadata = {}) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }

      console.log('📤 Uploading PDF to File Search store...');
      
      // Convert file to base64
      const fileData = await this.fileToBase64(file);
      
      const uploadToStore = httpsCallable(this.functions, 'uploadToStore');
      const result = await uploadToStore({
        storeName,
        fileData,
        fileName: displayName || file.name || 'document.pdf',
        mimeType: 'application/pdf',
        metadata,
        userId: this.userId
      });

      if (!result.data.success) {
        throw new Error('Upload failed');
      }

      console.log('✅ PDF uploaded and indexed:', result.data.fileName);
      return {
        name: result.data.name,           // Full document resource name
        documentId: result.data.documentId,
        fileName: result.data.fileName,
        operationName: result.data.operationName
      };
    } catch (error) {
      console.error('❌ Error uploading to File Search store:', error);
      throw error;
    }
  }

  /**
   * List documents in a File Search store
   * @param {string} storeName - Store resource name
   * @param {number} pageSize - Number of documents per page (max 20)
   * @param {string} pageToken - Token for pagination
   * @returns {Promise<Object>} List of documents with nextPageToken
   */
  async listDocuments(storeName, pageSize = 20, pageToken = null) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }

      const listDocuments = httpsCallable(this.functions, 'listDocuments');
      const result = await listDocuments({
        storeName,
        pageSize,
        pageToken,
        userId: this.userId
      });

      if (!result.data.success) {
        throw new Error('List documents failed');
      }

      return {
        documents: result.data.documents,
        nextPageToken: result.data.nextPageToken
      };
    } catch (error) {
      console.error('❌ Error listing documents:', error);
      throw error;
    }
  }

  /**
   * Delete a document from File Search store
   * @param {string} documentName - Document resource name
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocument(documentName) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }
      
      const deleteDocument = httpsCallable(this.functions, 'deleteDocument');
      const result = await deleteDocument({ 
        userId: this.userId,
        documentName 
      });

      console.log('✅ Document deleted:', documentName);
      return result.data.success;
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      throw error;
    }
  }

  // ==================== QUERY (RAG) ====================

  /**
   * Query course store (RECOMMENDED)
   * This is the main RAG endpoint for querying course materials
   * @param {string} question - The question to ask
   * @param {string} courseId - Canvas course ID
   * @param {string} model - Model to use (default: gemini-2.5-flash)
   * @param {string} metadataFilter - Optional metadata filter
   * @param {number} topK - Number of chunks to retrieve (default: 5)
   * @param {Array} history - Optional conversation history (max 10 messages)
   * @returns {Promise<Object>} Answer with citations
   */
  async queryCourseStore(question, courseId, model = 'gemini-2.5-flash', metadataFilter = null, topK = 5, history = []) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }
      
      console.log('🔍 Querying course store with:', question);
      
      const queryCourseStore = httpsCallable(this.functions, 'queryCourseStore');
      const result = await queryCourseStore({
        userId: this.userId,
        question,
        courseId,
        model,
        metadataFilter,
        topK,
        history: history.slice(-10)
      });

      if (!result.data.success) {
        throw new Error('Query failed');
      }

      console.log('✅ Query completed');
      return {
        answer: result.data.answer,
        groundingMetadata: result.data.groundingMetadata,
        model: result.data.model
      };
    } catch (error) {
      console.error('❌ Error querying course store:', error);
      throw error;
    }
  }

  /**
   * DEPRECATED: Use queryCourseStore instead
   * This method has been removed. Use queryCourseStore for all queries.
   */
  async queryWithFileSearch() {
    throw new Error('queryWithFileSearch is deprecated. Use queryCourseStore instead.');
  }

  // Helper: Convert File/Blob to base64
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Upload multiple PDFs in batch
   * @param {string} storeName - Store resource name
   * @param {Array<File>} files - Array of PDF files to upload
   * @returns {Promise<Array<Object>>} Array of document metadata
   */
  async uploadBatch(storeName, files) {
    try {
      console.log(`📤 Batch uploading ${files.length} files...`);
      const uploadPromises = files.map(file => 
        this.uploadToStore(storeName, file)
      );
      const results = await Promise.all(uploadPromises);
      console.log(`✅ Batch upload complete: ${results.length} files`);
      return results;
    } catch (error) {
      console.error('❌ Error in batch upload:', error);
      throw error;
    }
  }

  // ==================== USAGE LIMIT METHODS ====================

  /**
   * Check if user has remaining message quota
   * @returns {Promise<Object>} Usage status with allowed, remaining, resetTime
   */
  async checkUsageLimit() {
    try {
      if (!this.userId) {
        console.warn('[UsageLimit] userId not set, returning default limits');
        return { allowed: true, remaining: 40, resetTime: null, loading: false };
      }
      
      console.log('[UsageLimit] Calling checkUsageLimit cloud function with userId:', this.userId);
      const checkLimit = httpsCallable(this.functions, 'checkUsageLimit');
      const result = await checkLimit({ userId: this.userId });
      console.log('[UsageLimit] Cloud function response:', result.data);
      return result.data;
    } catch (error) {
      console.error('[UsageLimit] Error checking usage limit:', error);
      console.error('[UsageLimit] Error details:', error.message, error.code);
      // On error, allow the request (fail open)
      return { allowed: true, remaining: 40, resetTime: null, loading: false };
    }
  }

  /**
   * Record a message usage after sending
   * @param {string} courseChatId - ID of the current chat session
   * @param {string} messageId - ID of the message
   * @returns {Promise<Object>} Result of recording
   */
  async recordMessageUsage(courseChatId, messageId) {
    try {
      if (!this.userId) {
        console.warn('[UsageLimit] userId not set, skipping usage recording');
        return { success: true, recorded: false, reason: 'no_userId' };
      }
      
      console.log('[UsageLimit] Recording message usage:', { userId: this.userId, courseChatId, messageId });
      const recordUsage = httpsCallable(this.functions, 'recordMessageUsage');
      const result = await recordUsage({ userId: this.userId, courseChatId, messageId });
      console.log('[UsageLimit] Message usage recorded successfully:', result.data);
      return result.data;
    } catch (error) {
      console.error('[UsageLimit] Error recording message usage:', error);
      console.error('[UsageLimit] Error details:', error.message, error.code);
      throw error;
    }
  }

  /**
   * Get detailed usage information
   * @returns {Promise<Object>} Usage details with message history
   */
  async getUsageDetails() {
    try {
      const getDetails = httpsCallable(this.functions, 'getUsageDetails');
      const result = await getDetails({});
      return result.data;
    } catch (error) {
      console.error('Error getting usage details:', error);
      throw error;
    }
  }

  /**
   * Initialize usage limit configuration (admin only, run once)
   * Creates the default config document if it doesn't exist
   * @returns {Promise<Object>} Initialization result
   */
  async initializeUsageLimitConfig() {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }
      
      console.log('🔧 Initializing usage limit configuration...');
      const initConfig = httpsCallable(this.functions, 'initializeUsageLimitConfig');
      const result = await initConfig({ userId: this.userId });
      console.log('✅ Config initialization result:', result.data);
      return result.data;
    } catch (error) {
      console.error('❌ Error initializing config:', error);
      throw error;
    }
  }
}

// Make available globally for other scripts
window.GeminiFileSearchCloudClient = GeminiFileSearchCloudClient;

export default GeminiFileSearchCloudClient;
