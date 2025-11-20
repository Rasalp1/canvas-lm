# Migrating from File API to File Search Tool

## Overview

Google's **File Search** is a newer, more powerful RAG (Retrieval Augmented Generation) tool compared to the basic File API. It provides:

- **Persistent storage** (no 48-hour expiration!)
- **Semantic search** with automatic embeddings
- **Better retrieval** with intelligent chunking
- **Metadata filtering** for targeted queries
- **Citations** showing which documents were used
- **Free storage** (only pay for embeddings at indexing time)

## Key Differences

| Feature | File API (Old) | File Search (New) |
|---------|---------------|-------------------|
| **Storage Duration** | 48 hours | Permanent (until deleted) |
| **Search Method** | Basic file reference | Semantic search with embeddings |
| **Chunking** | Manual | Automatic with configurable params |
| **Cost** | Context tokens at query time | Embeddings at index time ($0.15/1M tokens) |
| **Storage Cost** | Free (48h) | Free (permanent) |
| **Query Cost** | Full file tokens | Only retrieved chunks |
| **Citations** | No | Yes |
| **Metadata** | No | Yes (20 key-value pairs) |
| **Max File Size** | 2GB | 100MB per document |

## Architecture Comparison

### Old File API Flow:
```
1. Upload PDF → Get temporary file URI (expires in 48h)
2. Reference entire file in chat prompt
3. Model reads entire PDF every time
4. Pay for all tokens in file each query
```

### New File Search Flow:
```
1. Create File Search Store (permanent container)
2. Upload PDF → Automatically chunked & embedded
3. Semantic search finds relevant chunks only
4. Model reads only relevant chunks
5. Pay once for embeddings, then only for retrieved chunks
```

## Migration Steps

### Step 1: Update Your Firestore Schema

The File Search API uses **stores** and **documents**, not individual file URIs.

**Old Schema:**
```javascript
documents/
  {docId}/
    fileName: string
    fileUrl: string
    geminiUri: string           // Old: temporary file URI
    geminiFileName: string      // Old: "files/abc123"
    geminiUploadedAt: timestamp
    geminiExpiresAt: timestamp  // Old: 48 hour expiration
```

**New Schema:**
```javascript
// Store info at course level
courses/
  {courseId}/
    fileSearchStoreId: string   // New: persistent store ID
    fileSearchStoreName: string // New: "fileSearchStores/xyz123"
    
    documents/
      {docId}/
        fileName: string
        fileUrl: string
        fileSearchDocumentId: string    // New: document ID
        fileSearchDocumentName: string  // New: full resource name
        uploadedAt: timestamp
        state: string                   // New: PENDING/ACTIVE/FAILED
        customMetadata: object          // New: searchable metadata
```

### Step 2: Create New File Search Manager

Replace `gemini-rag.js` with a new implementation:

```javascript
// gemini-file-search.js
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

class GeminiFileSearchManager {
  constructor(apiKey) {
    if (!apiKey) throw new Error('Gemini API key is required');
    this.apiKey = apiKey;
    this.stores = new Map(); // Track stores: Map<storeId, storeMetadata>
  }

  /**
   * Create a new File Search Store
   * @param {string} displayName - Human-readable name
   * @returns {Promise<Object>} Store metadata
   */
  async createStore(displayName) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/fileSearchStores?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create store: ${errorText}`);
      }

      const store = await response.json();
      this.stores.set(store.name, store);
      return store;
    } catch (error) {
      console.error('Error creating File Search store:', error);
      throw error;
    }
  }

  /**
   * Upload PDF directly to File Search Store
   * Automatically chunks, embeds, and indexes
   * @param {string} storeName - Store resource name (e.g., "fileSearchStores/xyz")
   * @param {Blob} file - PDF file blob
   * @param {string} displayName - Display name for document
   * @param {Object} customMetadata - Optional metadata for filtering
   * @returns {Promise<Object>} Operation info (long-running)
   */
  async uploadToStore(storeName, file, displayName, customMetadata = {}) {
    try {
      // Prepare metadata
      const metadata = {
        displayName: displayName || file.name || 'document.pdf',
        mimeType: 'application/pdf',
        customMetadata: this._formatCustomMetadata(customMetadata)
      };

      // Create multipart form data
      const formData = new FormData();
      formData.append('metadata', JSON.stringify(metadata));
      formData.append('file', file);

      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/upload/${storeName}:uploadToFileSearchStore?key=${this.apiKey}`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload to store: ${errorText}`);
      }

      const operation = await response.json();
      
      // Poll operation status
      const result = await this.waitForOperation(operation.name);
      return result;
    } catch (error) {
      console.error('Error uploading to File Search store:', error);
      throw error;
    }
  }

  /**
   * Alternative: Upload via File API first, then import
   * @param {string} storeName - Store resource name
   * @param {string} fileName - File resource name (e.g., "files/abc123")
   * @param {Object} customMetadata - Optional metadata
   * @returns {Promise<Object>} Operation info
   */
  async importFileToStore(storeName, fileName, customMetadata = {}) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${storeName}:importFile?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName,
            customMetadata: this._formatCustomMetadata(customMetadata)
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to import file: ${errorText}`);
      }

      const operation = await response.json();
      const result = await this.waitForOperation(operation.name);
      return result;
    } catch (error) {
      console.error('Error importing file:', error);
      throw error;
    }
  }

  /**
   * Wait for long-running operation to complete
   */
  async waitForOperation(operationName, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${operationName}?key=${this.apiKey}`,
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('Failed to check operation status');

      const operation = await response.json();
      
      if (operation.done) {
        if (operation.error) {
          throw new Error(`Operation failed: ${JSON.stringify(operation.error)}`);
        }
        return operation.response;
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Operation timeout');
  }

  /**
   * Chat with File Search
   * @param {string} message - User's question
   * @param {string} storeName - Store resource name
   * @param {string} metadataFilter - Optional filter (e.g., 'topic = "chapter3"')
   * @param {number} topK - Number of chunks to retrieve (default 5)
   * @param {string} model - Model name
   * @returns {Promise<Object>} Response with text and citations
   */
  async chatWithFileSearch(message, storeName, metadataFilter = null, topK = 5, model = 'gemini-2.5-flash') {
    try {
      const requestBody = {
        contents: [{
          parts: [{ text: message }]
        }],
        tools: [{
          fileSearch: {
            fileSearchStoreNames: [storeName],
            ...(metadataFilter && { metadataFilter }),
            topK
          }
        }]
      };

      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${errorText}`);
      }

      const data = await response.json();
      
      // Extract response and citations
      const result = {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
        citations: data.candidates?.[0]?.groundingMetadata?.groundingChunks || [],
        safetyRatings: data.candidates?.[0]?.safetyRatings || []
      };

      return result;
    } catch (error) {
      console.error('Error chatting with File Search:', error);
      throw error;
    }
  }

  /**
   * List all documents in a store
   */
  async listDocuments(storeName, pageSize = 20) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${storeName}/documents?pageSize=${pageSize}&key=${this.apiKey}`,
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('Failed to list documents');
      
      const data = await response.json();
      return data.documents || [];
    } catch (error) {
      console.error('Error listing documents:', error);
      throw error;
    }
  }

  /**
   * Get document info
   */
  async getDocument(documentName) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${documentName}?key=${this.apiKey}`,
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('Failed to get document');
      return await response.json();
    } catch (error) {
      console.error('Error getting document:', error);
      throw error;
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentName, force = true) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${documentName}?force=${force}&key=${this.apiKey}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete document');
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Delete entire store
   */
  async deleteStore(storeName, force = true) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/${storeName}?force=${force}&key=${this.apiKey}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete store');
      this.stores.delete(storeName);
      return true;
    } catch (error) {
      console.error('Error deleting store:', error);
      throw error;
    }
  }

  /**
   * List all stores
   */
  async listStores() {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/fileSearchStores?key=${this.apiKey}`,
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('Failed to list stores');
      
      const data = await response.json();
      return data.fileSearchStores || [];
    } catch (error) {
      console.error('Error listing stores:', error);
      throw error;
    }
  }

  /**
   * Format custom metadata for API
   */
  _formatCustomMetadata(metadata) {
    return Object.entries(metadata).map(([key, value]) => {
      if (typeof value === 'number') {
        return { key, numericValue: value };
      } else if (Array.isArray(value)) {
        return { key, stringListValue: { values: value } };
      } else {
        return { key, stringValue: String(value) };
      }
    });
  }

  /**
   * Batch upload multiple PDFs
   */
  async batchUploadToStore(storeName, files, onProgress = null) {
    const results = [];
    const total = files.length;
    
    for (let i = 0; i < files.length; i++) {
      try {
        if (onProgress) onProgress(i + 1, total, files[i].name);
        
        const result = await this.uploadToStore(
          storeName,
          files[i].file,
          files[i].name,
          files[i].metadata || {}
        );
        
        results.push({
          success: true,
          name: files[i].name,
          documentData: result
        });
      } catch (error) {
        console.error(`Failed to upload ${files[i].name}:`, error);
        results.push({
          success: false,
          name: files[i].name,
          error: error.message
        });
      }
    }
    
    return results;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GeminiFileSearchManager = GeminiFileSearchManager;
}
```

### Step 3: Update Firestore Helpers

Add new functions to `firestore-helpers.js`:

```javascript
// ==================== FILE SEARCH OPERATIONS ====================

/**
 * Save File Search Store ID for a course
 */
export async function saveCourseFileSearchStore(db, courseId, storeName) {
  try {
    const { doc, updateDoc, Timestamp } = window.firebaseModules;
    const courseRef = doc(db, 'courses', courseId);
    
    await updateDoc(courseRef, {
      fileSearchStoreId: storeName.split('/')[1], // Extract ID
      fileSearchStoreName: storeName,
      fileSearchStoreCreatedAt: Timestamp.now()
    });
    
    console.log('✅ File Search store saved:', storeName);
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving File Search store:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save File Search document info
 */
export async function saveDocumentFileSearch(db, courseId, docId, documentName, state, metadata = {}) {
  try {
    const { doc, updateDoc, Timestamp } = window.firebaseModules;
    const docRef = doc(db, 'courses', courseId, 'documents', docId);
    
    await updateDoc(docRef, {
      fileSearchDocumentId: documentName.split('/').pop(),
      fileSearchDocumentName: documentName,
      fileSearchState: state,
      fileSearchUploadedAt: Timestamp.now(),
      customMetadata: metadata
    });
    
    console.log('✅ File Search document saved:', documentName);
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving File Search document:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all active (STATE_ACTIVE) documents for a course
 */
export async function getCourseActiveDocuments(db, courseId) {
  try {
    const result = await getCourseDocuments(db, courseId);
    
    if (!result.success) return result;
    
    const activeDocs = result.data.filter(doc => 
      doc.fileSearchState === 'STATE_ACTIVE'
    );
    
    console.log(`✅ Found ${activeDocs.length} active documents`);
    return { success: true, data: activeDocs };
  } catch (error) {
    console.error('❌ Error getting active documents:', error);
    return { success: false, error: error.message };
  }
}

// Add to exports at bottom of file:
// File Search operations
saveCourseFileSearchStore,
saveDocumentFileSearch,
getCourseActiveDocuments,
```

### Step 4: Update popup.js Implementation

**Old File API approach:**
```javascript
// OLD: Upload each PDF, get temporary URI
for (const pdf of pdfs) {
  const fileData = await geminiRAG.uploadPDF(pdfBlob, pdf.title);
  await saveDocumentGeminiUri(db, courseId, docId, fileData.uri, fileData.name);
}

// OLD: Chat with all file URIs
const docs = await getCourseDocumentsWithGemini(db, courseId);
const uris = docs.data.map(doc => doc.geminiUri);
const answer = await geminiRAG.chatWithContext(question, uris);
```

**New File Search approach:**
```javascript
// NEW: Create store once per course
let storeName = course.fileSearchStoreName;
if (!storeName) {
  const store = await fileSearch.createStore(`${course.courseName} Knowledge Base`);
  storeName = store.name;
  await saveCourseFileSearchStore(db, courseId, storeName);
}

// NEW: Upload PDFs to store (permanent storage)
for (const pdf of pdfs) {
  const documentData = await fileSearch.uploadToStore(
    storeName,
    pdfBlob,
    pdf.title,
    { source: 'canvas', module: pdf.moduleName } // metadata for filtering
  );
  
  await saveDocumentFileSearch(
    db,
    courseId,
    docId,
    documentData.name,
    documentData.state,
    { source: 'canvas', module: pdf.moduleName }
  );
}

// NEW: Chat with File Search (automatic semantic retrieval)
const result = await fileSearch.chatWithFileSearch(
  question,
  storeName,
  null, // optional metadata filter: 'module = "chapter3"'
  5     // retrieve top 5 most relevant chunks
);

console.log('Answer:', result.text);
console.log('Citations:', result.citations);
```

## Benefits of Migration

### 1. **No More Expiration Management**
- ❌ Old: Re-upload files every 48 hours
- ✅ New: Upload once, use forever

### 2. **Better Performance**
- ❌ Old: Send entire PDFs every query (expensive, slow)
- ✅ New: Only retrieve relevant chunks (fast, cheap)

### 3. **Cost Savings**
- ❌ Old: Pay for all tokens in all files on every query
- ✅ New: Pay once for embeddings, then only for retrieved chunks

Example: 10 PDFs (1000 pages total) with 10 queries
- **Old Cost**: ~$5-10 per query = $50-100 total
- **New Cost**: $0.15 one-time + $0.10 per query = $1.15 total
- **Savings**: 98% cost reduction!

### 4. **Better Accuracy**
- ❌ Old: Model sees all content (overwhelming)
- ✅ New: Model sees only relevant chunks (focused)

### 5. **Metadata Filtering**
```javascript
// Search only specific chapters
await fileSearch.chatWithFileSearch(
  "What is the main concept?",
  storeName,
  'chapter = "3" AND topic = "introduction"'
);
```

### 6. **Citations**
```javascript
const result = await fileSearch.chatWithFileSearch(...);
console.log(result.text); // The answer
console.log(result.citations); // Which documents were used
// [{ documentName: "...", text: "...", startIndex: 100 }]
```

## Supported Models

File Search currently works with:
- ✅ `gemini-2.5-pro`
- ✅ `gemini-2.5-flash`
- ❌ `gemini-1.5-*` (use old File API for these)

## Rate Limits

- Max file size: 100MB per document
- Total store size: 
  - Free tier: 1 GB
  - Tier 1: 10 GB
  - Tier 2: 100 GB
  - Tier 3: 1 TB
- Recommended: Keep each store under 20 GB for best performance

## Pricing

- **Embeddings**: $0.15 per 1M tokens (one-time at upload)
- **Storage**: Free
- **Query embeddings**: Free
- **Retrieved chunks**: Charged as normal context tokens

## Complete Migration Checklist

- [ ] Read this guide completely
- [ ] Create `src/gemini-file-search.js` with new manager class
- [ ] Update `firestore-helpers.js` with File Search functions
- [ ] Update Firestore schema (add fileSearchStore fields to courses)
- [ ] Update webpack.config.js to include new file
- [ ] Update popup.html to load new script
- [ ] Modify popup.js to use File Search instead of File API
- [ ] Test store creation
- [ ] Test document upload
- [ ] Test semantic search
- [ ] Test metadata filtering
- [ ] Test citations display
- [ ] Remove old File API code
- [ ] Update documentation
- [ ] Deploy and celebrate! 🎉

## Migration Timeline

**Recommended approach**: Run both systems in parallel for one week, then fully switch.

```javascript
// During transition period
if (USE_FILE_SEARCH) {
  // New File Search implementation
} else {
  // Old File API implementation (backup)
}
```

## Troubleshooting

### Upload fails
- Check file size < 100MB
- Verify API key is valid
- Ensure model is gemini-2.5-* (not 1.5)

### No results from chat
- Wait for documents to reach STATE_ACTIVE
- Check store has documents: `await listDocuments(storeName)`
- Verify topK parameter (try increasing)

### Citations missing
- Citations only appear when File Search is used
- Check `result.citations` array
- Ensure grounding_metadata is in response

## Need Help?

- [File Search Documentation](https://ai.google.dev/gemini-api/docs/file-search)
- [API Reference](https://ai.google.dev/api/file-search/file-search-stores)
- [Community Forum](https://discuss.ai.google.dev/c/gemini-api/)

---

**Ready to migrate?** The File Search API is significantly better for production RAG applications. Make the switch today!
