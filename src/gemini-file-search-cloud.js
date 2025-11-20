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
    
    if (!userId) {
      console.warn('⚠️ GeminiFileSearchCloudClient initialized without userId - operations will fail');
    }
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

      console.log('✅ PDF uploaded and indexed:', result.data.document.name);
      return result.data.document;
    } catch (error) {
      console.error('❌ Error uploading to File Search store:', error);
      throw error;
    }
  }

  /**
   * List documents in a File Search store
   * @param {string} storeName - Store resource name
   * @param {number} pageSize - Number of documents per page
   * @param {string} pageToken - Token for pagination
   * @returns {Promise<Object>} List of documents with nextPageToken
   */
  async listDocuments(storeName, pageSize = 100, pageToken = null) {
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
   * Query File Search store with semantic search and generate answer
   * This is the main RAG endpoint
   * @param {string} question - The question to ask
   * @param {string} storeName - Store resource name to search
   * @param {string} model - Model to use (default: gemini-1.5-flash)
   * @param {string} metadataFilter - Optional metadata filter
   * @param {number} topK - Number of chunks to retrieve (default: 5)
   * @returns {Promise<Object>} Answer with citations
   */
  async queryWithFileSearch(question, storeName, model = 'gemini-1.5-flash', metadataFilter = null, topK = 5) {
    try {
      if (!this.userId) {
        throw new Error('userId not set. Call setUserId() first.');
      }
      
      console.log('🔍 Querying File Search store with:', question);
      
      const queryWithFileSearch = httpsCallable(this.functions, 'queryWithFileSearch');
      const result = await queryWithFileSearch({
        userId: this.userId,
        question,
        storeName,
        model,
        metadataFilter,
        topK
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
      console.error('❌ Error querying File Search store:', error);
      throw error;
    }
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
}

// Make available globally for other scripts
window.GeminiFileSearchCloudClient = GeminiFileSearchCloudClient;

export default GeminiFileSearchCloudClient;
