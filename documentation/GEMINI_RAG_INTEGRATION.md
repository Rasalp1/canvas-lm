# Gemini File API (RAG) Integration Guide

## Overview

This extension integrates Google's Gemini File API to provide RAG (Retrieval Augmented Generation) capabilities. This allows users to upload PDFs and chat with their course materials using AI.

## How It Works

### The Gemini File API vs Regular Gemini API

**Same API Key** - You use the same Gemini API key for both regular chat and file operations.

**Different Endpoint** - The File API uses a different endpoint:
- Regular Gemini API: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- File API: `https://generativelanguage.googleapis.com/v1beta/files`

### Key Concepts

1. **File Upload**: Files are uploaded to Google's servers and stored for up to 48 hours
2. **File Processing**: PDFs require processing time (usually 5-30 seconds) before they can be used
3. **File URI**: Each uploaded file gets a URI like `https://generativelanguage.googleapis.com/v1beta/files/{file-id}`
4. **Context Reference**: You reference uploaded files in your chat prompts by their URI

## Getting Your API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Save the API key securely
4. Store it in your extension's settings or use Chrome's storage API

## Implementation Steps

### 1. Add Gemini RAG Manager to Your Build

Update `webpack.config.js` to include the new file:

```javascript
entry: {
  'firebase-config': './src/firebase-config.js',
  'firestore-helpers': './src/firestore-helpers.js',
  'gemini-rag': './src/gemini-rag.js',  // Add this line
  popup: './src/popup.js',
  background: './src/background.js',
  'content-script': './src/content-script.js',
},
```

### 2. Load Script in popup.html

Add the script tag before `popup.js`:

```html
<script src="dist/gemini-rag.js"></script>
<script src="dist/popup.js"></script>
```

### 3. Initialize in Your Code

```javascript
// In popup.js or wherever you need it
let geminiRAG;

async function initializeGemini() {
  // Get API key from Chrome storage or your settings
  const apiKey = await getGeminiAPIKey(); // Implement this
  geminiRAG = new GeminiRAGManager(apiKey);
}
```

### 4. Upload PDFs

When you download PDFs from Canvas, upload them to Gemini:

```javascript
async function uploadPDFToGemini(pdfBlob, fileName) {
  try {
    const fileData = await geminiRAG.uploadPDF(pdfBlob, fileName);
    console.log('Uploaded:', fileData);
    
    // Store the file URI in Firestore for later reference
    await saveDocumentGeminiUri(courseId, documentId, fileData.uri);
    
    return fileData;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}
```

### 5. Chat with Context

```javascript
async function askQuestion(question, courseId) {
  try {
    // Get all PDF URIs for this course from Firestore
    const documents = await getCourseDocuments(courseId);
    const fileUris = documents
      .filter(doc => doc.geminiUri)
      .map(doc => doc.geminiUri);
    
    if (fileUris.length === 0) {
      throw new Error('No documents uploaded yet');
    }
    
    // Chat with context
    const response = await geminiRAG.chatWithContext(
      question,
      fileUris,
      'gemini-1.5-pro' // or 'gemini-1.5-flash' for faster/cheaper
    );
    
    return response;
  } catch (error) {
    console.error('Chat failed:', error);
    throw error;
  }
}
```

## API Limitations & Best Practices

### File Limits
- **Max file size**: 2GB per file
- **Storage duration**: 48 hours (files auto-delete after this)
- **Max files per prompt**: Up to ~1500 pages total across all PDFs
- **Supported formats**: PDF, images, audio, video

### Token Limits
- **Gemini 1.5 Pro**: 2M token context window (can handle ~1500 pages)
- **Gemini 1.5 Flash**: 1M token context window (faster, cheaper)

### Best Practices

1. **Store file URIs**: Save Gemini file URIs in Firestore so you don't need to re-upload
2. **Check file state**: Always wait for `state: 'ACTIVE'` before using files
3. **Handle expiration**: Files expire after 48 hours, implement re-upload logic
4. **Batch uploads**: Use `batchUploadPDFs()` for multiple files
5. **Clean up**: Delete files when no longer needed to stay organized
6. **Error handling**: Implement robust error handling for network issues

## Example: Complete Flow

```javascript
// 1. Initialize
await initializeGemini();

// 2. User scans Canvas course
const pdfs = await scanCanvasCourse(courseId);

// 3. Upload all PDFs to Gemini
const uploadResults = await geminiRAG.batchUploadPDFs(
  pdfs.map(pdf => ({ file: pdf.blob, name: pdf.name })),
  (current, total, name) => {
    console.log(`Uploading ${current}/${total}: ${name}`);
  }
);

// 4. Store URIs in Firestore
for (const result of uploadResults) {
  if (result.success) {
    await saveDocumentGeminiUri(
      courseId,
      result.name,
      result.fileData.uri,
      result.fileData.name
    );
  }
}

// 5. User asks a question
const answer = await askQuestion(
  "What topics are covered in the introduction chapter?",
  courseId
);

console.log('AI Answer:', answer);
```

## Pricing

As of November 2024:

- **File storage**: Free for 48 hours
- **Gemini 1.5 Pro**: $0.00125 per 1K input tokens, $0.005 per 1K output tokens
- **Gemini 1.5 Flash**: $0.000075 per 1K input tokens, $0.0003 per 1K output tokens

For typical use:
- Uploading 10 PDFs (500 pages total) + asking 10 questions ≈ $0.10 - $0.50

## Troubleshooting

### File Upload Fails
- Check API key is valid
- Verify file is actually a PDF
- Ensure file size < 2GB

### File Processing Timeout
- Increase `maxAttempts` in `waitForFileProcessing()`
- Large files (>100 pages) may take 30-60 seconds

### Chat Returns Empty Response
- Ensure files are in 'ACTIVE' state
- Check file URIs are valid
- Verify API key has correct permissions

### Files Expired
- Implement logic to check file age
- Re-upload files older than 47 hours
- Store upload timestamp in Firestore

## Security Considerations

1. **API Key Storage**: Store in Chrome's sync storage, encrypted if possible
2. **User Privacy**: Inform users their PDFs are uploaded to Google's servers
3. **Data Retention**: Files are deleted after 48 hours automatically
4. **Access Control**: Ensure only the user can access their uploaded files

## Next Steps

1. Add UI for chat interface in popup.html
2. Implement API key management (settings page)
3. Add progress indicators for uploads
4. Store Gemini URIs in Firestore schema
5. Implement file expiration handling
6. Add conversation history
