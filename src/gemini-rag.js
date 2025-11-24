// gemini-rag.js - Gemini File API integration for RAG functionality
// Documentation: https://ai.google.dev/gemini-api/docs/vision?lang=rest

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini RAG Manager
 * Handles PDF uploads, file management, and chat with context
 */
class GeminiRAGManager {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = apiKey;
    this.uploadedFiles = new Map(); // Track uploaded files: Map<fileId, fileMetadata>
  }

  /**
   * Upload a PDF file to Gemini File API
   * @param {Blob|File} file - The PDF file to upload
   * @param {string} displayName - Optional display name for the file
   * @returns {Promise<Object>} File metadata including URI for referencing
   */
  async uploadPDF(file, displayName = null) {
    try {
      // Step 1: Create resumable upload session
      const metadata = {
        file: {
          display_name: displayName || file.name || 'document.pdf',
          mime_type: 'application/pdf'
        }
      };

      const initResponse = await fetch(
        `${GEMINI_API_ENDPOINT}/files?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': file.size,
            'X-Goog-Upload-Header-Content-Type': 'application/pdf',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(metadata)
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

      const fileData = await uploadResponse.json();
      
      // Step 3: Wait for file to be processed (required for PDFs)
      const processedFile = await this.waitForFileProcessing(fileData.file.name);
      
      // Store in our map for easy access
      this.uploadedFiles.set(processedFile.name, processedFile);
      
      return processedFile;
    } catch (error) {
      console.error('Error uploading PDF to Gemini:', error);
      throw error;
    }
  }

  /**
   * Wait for file processing to complete
   * PDFs need to be processed before they can be used in prompts
   */
  async waitForFileProcessing(fileName, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const fileData = await this.getFileMetadata(fileName);
      
      if (fileData.state === 'ACTIVE') {
        return fileData;
      } else if (fileData.state === 'FAILED') {
        throw new Error(`File processing failed: ${fileName}`);
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`File processing timeout: ${fileName}`);
  }

  /**
   * Get metadata for an uploaded file
   */
  async getFileMetadata(fileName) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/files/${fileName}?key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get file metadata: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw error;
    }
  }

  /**
   * List all uploaded files
   */
  async listFiles(pageSize = 100) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/files?pageSize=${pageSize}&key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list files: ${errorText}`);
      }

      const data = await response.json();
      return data.files || [];
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Gemini File API
   */
  async deleteFile(fileName) {
    try {
      const response = await fetch(
        `${GEMINI_API_ENDPOINT}/files/${fileName}?key=${this.apiKey}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete file: ${errorText}`);
      }

      // Remove from our map
      this.uploadedFiles.delete(fileName);
      
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Chat with context from uploaded PDFs
   * @param {string} message - User's question
   * @param {Array<string>} fileUris - Array of file URIs to use as context
   * @param {string} model - Model to use (default: gemini-1.5-pro)
   * @returns {Promise<string>} AI response
   */
  async chatWithContext(message, fileUris = [], model = 'gemini-1.5-pro') {
    try {
      // Build the parts array with file references and the text prompt
      const parts = [];
      
      // Add all file references first
      fileUris.forEach(uri => {
        parts.push({
          file_data: {
            mime_type: 'application/pdf',
            file_uri: uri
          }
        });
      });
      
      // Add the user's message
      parts.push({
        text: message
      });

      const requestBody = {
        contents: [{
          parts: parts
        }]
      };

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
      
      // Extract the text response
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error('Unexpected response format from Gemini API');
      }
    } catch (error) {
      console.error('Error chatting with Gemini:', error);
      throw error;
    }
  }

  /**
   * Batch upload multiple PDFs
   * @param {Array<{file: Blob, name: string}>} files - Array of files to upload
   * @returns {Promise<Array<Object>>} Array of uploaded file metadata
   */
  async batchUploadPDFs(files, onProgress = null) {
    const results = [];
    const total = files.length;
    
    for (let i = 0; i < files.length; i++) {
      try {
        if (onProgress) {
          onProgress(i + 1, total, files[i].name);
        }
        
        const uploaded = await this.uploadPDF(files[i].file, files[i].name);
        results.push({
          success: true,
          name: files[i].name,
          fileData: uploaded
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

  /**
   * Get all currently uploaded file URIs
   * Useful for passing to chatWithContext
   */
  getUploadedFileUris() {
    return Array.from(this.uploadedFiles.values()).map(file => file.uri);
  }

  /**
   * Clear all uploaded files (delete from Gemini)
   */
  async clearAllFiles() {
    const fileNames = Array.from(this.uploadedFiles.keys());
    const results = [];
    
    for (const fileName of fileNames) {
      try {
        await this.deleteFile(fileName);
        results.push({ fileName, success: true });
      } catch (error) {
        results.push({ fileName, success: false, error: error.message });
      }
    }
    
    return results;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GeminiRAGManager };
}

// Make available globally
if (typeof window !== 'undefined') {
  window.GeminiRAGManager = GeminiRAGManager;
}
