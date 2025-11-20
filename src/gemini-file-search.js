// gemini-file-search.js - Gemini File Search API integration for RAG functionality
// Documentation: https://ai.google.dev/gemini-api/docs/file-search

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini File Search Manager
 * Handles permanent storage, semantic search, and chat with File Search stores
 */
class GeminiFileSearchManager {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = apiKey;
    this.stores = new Map(); // Track stores: Map<storeName, storeMetadata>
    this.documents = new Map(); // Track documents: Map<documentName, documentMetadata>
  }

  /**
   * Create a File Search store (permanent storage container)
   * @param {string} displayName - Display name for the store (e.g., course name)
   * @returns {Promise<Object>} Store metadata
   */
  async createStore(displayName) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/fileSearchStores?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            displayName: displayName
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create File Search store: ${errorText}`);
      }

      const storeData = await response.json();
      this.stores.set(storeData.name, storeData);
      
      console.log('✅ File Search store created:', storeData.name);
      return storeData;
    } catch (error) {
      console.error('❌ Error creating File Search store:', error);
      throw error;
    }
  }

  /**
   * Get an existing store by name
   * @param {string} storeName - Store resource name (e.g., "fileSearchStores/abc123")
   * @returns {Promise<Object>} Store metadata
   */
  async getStore(storeName) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${storeName}?key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get store: ${errorText}`);
      }

      const storeData = await response.json();
      this.stores.set(storeData.name, storeData);
      return storeData;
    } catch (error) {
      console.error('❌ Error getting store:', error);
      throw error;
    }
  }

  /**
   * List all stores
   * @param {number} pageSize - Number of stores per page (default: 100)
   * @returns {Promise<Array>} Array of store metadata
   */
  async listStores(pageSize = 100) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/fileSearchStores?pageSize=${pageSize}&key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list stores: ${errorText}`);
      }

      const data = await response.json();
      return data.fileSearchStores || [];
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
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${storeName}?key=${this.apiKey}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete store: ${errorText}`);
      }

      this.stores.delete(storeName);
      console.log('✅ Store deleted:', storeName);
      return true;
    } catch (error) {
      console.error('❌ Error deleting store:', error);
      throw error;
    }
  }

  /**
   * Upload a PDF to a File Search store
   * Automatically handles chunking, embedding, and indexing
   * @param {string} storeName - Store resource name
   * @param {Blob|File} file - The PDF file to upload
   * @param {string} displayName - Display name for the document
   * @param {Object} metadata - Optional metadata for the document
   * @returns {Promise<Object>} Document metadata
   */
  async uploadToStore(storeName, file, displayName = null, metadata = {}) {
    try {
      // Step 1: Create resumable upload session
      const uploadMetadata = {
        parent: storeName,
        file: {
          display_name: displayName || file.name || 'document.pdf',
          mime_type: 'application/pdf'
        }
      };

      // Add custom metadata if provided
      if (Object.keys(metadata).length > 0) {
        uploadMetadata.file.metadata = metadata;
      }

      const initResponse = await fetch(
        `${GEMINI_API_ENDPOINT}/${storeName}/documents:upload?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': file.size,
            'X-Goog-Upload-Header-Content-Type': 'application/pdf',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(uploadMetadata)
        }
      );

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`Failed to initialize upload: ${errorText}`);
      }

      const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');
      if (!uploadUrl) {
        throw new Error('No upload URL received from Gemini API');
      }

      // Step 2: Upload the file data
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Length': file.size,
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: file
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Failed to upload file: ${errorText}`);
      }

      const documentData = await uploadResponse.json();
      
      // Step 3: Wait for document to be processed and indexed
      const processedDocument = await this.waitForDocumentProcessing(documentData.file.name);
      
      // Store in our map for easy access
      this.documents.set(processedDocument.name, processedDocument);
      
      console.log('✅ Document uploaded to File Search store:', processedDocument.name);
      return processedDocument;
    } catch (error) {
      console.error('❌ Error uploading to File Search store:', error);
      throw error;
    }
  }

  /**
   * Wait for document processing to complete
   * Documents need to be processed (chunked and embedded) before they can be used
   * @param {string} documentName - Document resource name
   * @param {number} maxAttempts - Maximum polling attempts
   * @returns {Promise<Object>} Processed document metadata
   */
  async waitForDocumentProcessing(documentName, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const docData = await this.getDocument(documentName);
      
      if (docData.state === 'STATE_ACTIVE') {
        console.log('✅ Document processing complete:', documentName);
        return docData;
      } else if (docData.state === 'STATE_FAILED') {
        throw new Error(`Document processing failed: ${documentName}`);
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Document processing timeout: ${documentName}`);
  }

  /**
   * Get document metadata
   * @param {string} documentName - Document resource name
   * @returns {Promise<Object>} Document metadata
   */
  async getDocument(documentName) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${documentName}?key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get document: ${errorText}`);
      }

      const docData = await response.json();
      this.documents.set(docData.name, docData);
      return docData;
    } catch (error) {
      console.error('❌ Error getting document:', error);
      throw error;
    }
  }

  /**
   * List all documents in a store
   * @param {string} storeName - Store resource name
   * @param {number} pageSize - Number of documents per page
   * @returns {Promise<Array>} Array of document metadata
   */
  async listDocuments(storeName, pageSize = 100) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${storeName}/documents?pageSize=${pageSize}&key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list documents: ${errorText}`);
      }

      const data = await response.json();
      return data.documents || [];
    } catch (error) {
      console.error('❌ Error listing documents:', error);
      throw error;
    }
  }

  /**
   * Delete a document from a store
   * @param {string} documentName - Document resource name
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocument(documentName) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${documentName}?key=${this.apiKey}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete document: ${errorText}`);
      }

      this.documents.delete(documentName);
      console.log('✅ Document deleted:', documentName);
      return true;
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Chat with File Search (semantic search + generation)
   * Forces the model to ALWAYS use the RAG knowledge base and only answer from uploaded documents
   * @param {string} storeName - Store resource name to search
   * @param {string} message - User's question
   * @param {Object} options - Optional parameters
   * @param {string} options.model - Model to use (default: gemini-2.5-flash)
   * @param {Object} options.metadataFilter - Optional metadata filter
   * @param {Array} options.history - Optional conversation history
   * @param {string} options.systemInstruction - Custom system instruction (optional)
   * @returns {Promise<Object>} Response with answer and citations
   */
  async chatWithFileSearch(storeName, message, options = {}) {
    try {
      const model = options.model || 'gemini-2.5-flash';
      
      // Default system instruction that forces RAG-only responses
      const defaultSystemInstruction = `You are an intelligent course assistant for Canvas LMS. Your purpose is to help students understand their course materials by answering questions based EXCLUSIVELY on the uploaded documents in the knowledge base.

STRICT RULES:
1. ONLY use information found in the provided course documents (PDFs, lecture notes, readings, etc.)
2. ALWAYS search the File Search store before answering any question
3. NEVER use your general knowledge, training data, or information from outside the course materials
4. If the answer is not found in the uploaded documents, you MUST respond with: "I cannot find this information in your course materials. Please ask your instructor or check if the relevant document has been uploaded."
5. ALWAYS provide specific citations showing which document(s) you used
6. When quoting or paraphrasing, indicate the source document clearly

RESPONSE FORMAT:
- Answer the question clearly and concisely based on the documents
- Include relevant details, examples, or explanations from the course materials
- End with citations in this format: [Source: Document Name]
- If multiple documents are relevant, cite all of them

Remember: Your knowledge is limited to what's been uploaded to this course. This ensures accuracy and prevents misinformation.`;

      // Build the request with File Search tool
      const requestBody = {
        // System instruction to enforce RAG-only behavior
        system_instruction: {
          parts: [{
            text: options.systemInstruction || defaultSystemInstruction
          }]
        },
        contents: [],
        tools: [{
          file_search: {
            stores: [storeName]
          }
        }],
        // FORCE the model to always use File Search (ANY mode)
        tool_config: {
          function_calling_config: {
            mode: 'ANY'  // Model MUST use File Search, cannot answer from general knowledge
          }
        }
      };

      // Add metadata filter if provided
      if (options.metadataFilter) {
        requestBody.tools[0].file_search.metadata_filter = options.metadataFilter;
      }

      // Add conversation history if provided
      if (options.history && Array.isArray(options.history)) {
        requestBody.contents.push(...options.history);
      }

      // Add current user message
      requestBody.contents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${errorText}`);
      }

      const data = await response.json();
      
      // Extract response text and grounding metadata
      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error('No response from Gemini API');
      }

      const responseText = candidate.content?.parts?.[0]?.text || '';
      const groundingMetadata = candidate.groundingMetadata || null;

      return {
        text: responseText,
        groundingMetadata: groundingMetadata,
        citations: groundingMetadata?.retrievalMetadata?.citedDocuments || [],
        tokensUsed: data.usageMetadata
      };
    } catch (error) {
      console.error('❌ Error chatting with File Search:', error);
      throw error;
    }
  }

  /**
   * Batch upload multiple PDFs to a store
   * @param {string} storeName - Store resource name
   * @param {Array<{file: Blob, name: string, metadata?: Object}>} files - Array of files to upload
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<Array>} Array of upload results
   */
  async batchUploadToStore(storeName, files, onProgress = null) {
    const results = [];
    const total = files.length;
    
    for (let i = 0; i < files.length; i++) {
      try {
        if (onProgress) {
          onProgress(i + 1, total, files[i].name);
        }
        
        const uploaded = await this.uploadToStore(
          storeName,
          files[i].file,
          files[i].name,
          files[i].metadata || {}
        );
        
        results.push({
          success: true,
          name: files[i].name,
          documentData: uploaded
        });
      } catch (error) {
        console.error(`❌ Failed to upload ${files[i].name}:`, error);
        results.push({
          success: false,
          name: files[i].name,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Search within a store without generating a response
   * Useful for testing or retrieving relevant documents
   * @param {string} storeName - Store resource name
   * @param {string} query - Search query
   * @param {Object} metadataFilter - Optional metadata filter
   * @returns {Promise<Array>} Array of relevant document chunks
   */
  async searchStore(storeName, query, metadataFilter = null) {
    try {
      const requestBody = {
        query: query,
        stores: [storeName]
      };

      if (metadataFilter) {
        requestBody.metadata_filter = metadataFilter;
      }

      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/fileSearchStores:search?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Search failed: ${errorText}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('❌ Error searching store:', error);
      throw error;
    }
  }

  /**
   * Get all document names from a store
   * Useful for tracking what's uploaded
   * @param {string} storeName - Store resource name
   * @returns {Promise<Array<string>>} Array of document resource names
   */
  async getDocumentNames(storeName) {
    const documents = await this.listDocuments(storeName);
    return documents.map(doc => doc.name);
  }

  /**
   * Check if a store exists and is accessible
   * @param {string} storeName - Store resource name
   * @returns {Promise<boolean>} True if store exists
   */
  async storeExists(storeName) {
    try {
      await this.getStore(storeName);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GeminiFileSearchManager };
}

// Make available globally for popup.js
if (typeof window !== 'undefined') {
  window.GeminiFileSearchManager = GeminiFileSearchManager;
}
