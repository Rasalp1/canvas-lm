// gemini-cloud-functions.js - Client for calling Firebase Cloud Functions
// This replaces direct Gemini API calls with secure server-side calls

import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Gemini Cloud Functions Client
 * Calls Firebase Cloud Functions that proxy Gemini API requests
 * Your API key stays secure on the server
 */
class GeminiCloudClient {
  constructor(firebaseApp) {
    this.functions = getFunctions(firebaseApp);
  }

  /**
   * Upload a PDF file via Cloud Function
   * @param {Blob|File} file - The PDF file to upload
   * @param {string} displayName - Optional display name for the file
   * @returns {Promise<Object>} File metadata including URI for referencing
   */
  async uploadPDF(file, displayName = null) {
    try {
      // Convert file to base64
      const fileData = await this.fileToBase64(file);
      
      const uploadPDF = httpsCallable(this.functions, 'uploadPDF');
      const result = await uploadPDF({
        fileData: fileData,
        fileName: displayName || file.name || 'document.pdf',
        mimeType: 'application/pdf'
      });

      if (!result.data.success) {
        throw new Error('Upload failed');
      }

      return result.data.file;
    } catch (error) {
      console.error('Error uploading PDF via Cloud Function:', error);
      throw error;
    }
  }

  /**
   * Chat with context using uploaded files
   * @param {string} question - The question to ask
   * @param {Array<string>} fileUris - Array of Gemini file URIs for context
   * @param {string} model - Model to use (default: gemini-1.5-flash)
   * @returns {Promise<string>} The answer from Gemini
   */
  async chatWithContext(question, fileUris = [], model = 'gemini-1.5-flash') {
    try {
      const chatWithContext = httpsCallable(this.functions, 'chatWithContext');
      const result = await chatWithContext({
        question: question,
        fileUris: fileUris,
        model: model
      });

      if (!result.data.success) {
        throw new Error('Chat failed');
      }

      return result.data.answer;
    } catch (error) {
      console.error('Error chatting via Cloud Function:', error);
      throw error;
    }
  }

  /**
   * List uploaded files
   * @param {number} pageSize - Number of files per page
   * @param {string} pageToken - Token for pagination
   * @returns {Promise<Object>} List of files with nextPageToken
   */
  async listFiles(pageSize = 100, pageToken = null) {
    try {
      const listFiles = httpsCallable(this.functions, 'listFiles');
      const result = await listFiles({
        pageSize: pageSize,
        pageToken: pageToken
      });

      if (!result.data.success) {
        throw new Error('List files failed');
      }

      return {
        files: result.data.files,
        nextPageToken: result.data.nextPageToken
      };
    } catch (error) {
      console.error('Error listing files via Cloud Function:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Gemini
   * @param {string} fileName - The file name (e.g., "files/abc123")
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(fileName) {
    try {
      const deleteFile = httpsCallable(this.functions, 'deleteFile');
      const result = await deleteFile({ fileName: fileName });

      return result.data.success;
    } catch (error) {
      console.error('Error deleting file via Cloud Function:', error);
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param {string} fileName - The file name (e.g., "files/abc123")
   * @returns {Promise<Object>} File metadata
   */
  async getFile(fileName) {
    try {
      const getFile = httpsCallable(this.functions, 'getFile');
      const result = await getFile({ fileName: fileName });

      if (!result.data.success) {
        throw new Error('Get file failed');
      }

      return result.data.file;
    } catch (error) {
      console.error('Error getting file via Cloud Function:', error);
      throw error;
    }
  }

  /**
   * Upload multiple PDFs in batch
   * @param {Array<File>} files - Array of PDF files to upload
   * @returns {Promise<Array<Object>>} Array of file metadata
   */
  async uploadBatch(files) {
    try {
      const uploadPromises = files.map(file => this.uploadPDF(file));
      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error('Error in batch upload:', error);
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
}

// Make available globally for other scripts
window.GeminiCloudClient = GeminiCloudClient;

export default GeminiCloudClient;
