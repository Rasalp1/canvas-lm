# Quick Start: Adding Gemini RAG to Your Extension

## ✅ What's Been Done

1. **Created `src/gemini-rag.js`** - Full Gemini File API integration
2. **Updated `src/firestore-helpers.js`** - Added functions to store/retrieve Gemini URIs
3. **Updated `webpack.config.js`** - Included gemini-rag in the build
4. **Updated `popup.html`** - Added script tag for gemini-rag.js
5. **Created documentation** - See `GEMINI_RAG_INTEGRATION.md`
6. **Created example code** - See `GEMINI_INTEGRATION_EXAMPLE.js`

## 🚀 Next Steps

### 1. Get Your Gemini API Key

1. Visit https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy the API key (starts with `AIza...`)

### 2. Store the API Key

Add this to your extension (e.g., in a settings page or popup):

```javascript
// Save API key
await chrome.storage.sync.set({ geminiApiKey: 'YOUR_API_KEY_HERE' });
```

### 3. Initialize Gemini in popup.js

Add these lines to your popup.js initialization:

```javascript
// At the top with other globals
let geminiRAG = null;

// In your DOMContentLoaded or init function
async function initGemini() {
  const result = await chrome.storage.sync.get(['geminiApiKey']);
  if (result.geminiApiKey) {
    geminiRAG = new GeminiRAGManager(result.geminiApiKey);
    console.log('✅ Gemini RAG ready');
  } else {
    console.warn('⚠️ Set Gemini API key in settings');
  }
}

// Call it after Firebase loads
await initGemini();
```

### 4. Upload PDFs to Gemini

Modify your existing `saveFoundPDFsToFirestore()` function to also upload to Gemini.

See `GEMINI_INTEGRATION_EXAMPLE.js` lines 55-105 for the complete code.

### 5. Add Chat UI

Add this HTML to popup.html (after the scan section):

```html
<div id="chat-section" class="section hidden">
  <h3>💬 Chat with Course Materials</h3>
  <div id="chat-history" class="chat-history"></div>
  <div class="chat-input-container">
    <input type="text" id="chat-input" placeholder="Ask a question..." />
    <button id="send-chat-btn" class="primary-btn">Send</button>
  </div>
</div>
```

### 6. Implement Chat Function

Add the chat function from `GEMINI_INTEGRATION_EXAMPLE.js` (lines 107-170).

### 7. Rebuild

```bash
npm run build
```

### 8. Test

1. Reload extension in Chrome
2. Navigate to a Canvas course
3. Scan for PDFs (they'll upload to Gemini automatically)
4. Ask questions in the chat!

## 🎯 Key Concepts

### It's the Same API Key
You use the **same Gemini API key** for both regular chat and file operations. No separate key needed.

### Different Endpoints
- **File upload**: `https://generativelanguage.googleapis.com/v1beta/files`
- **Chat**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent`

### Files Expire After 48 Hours
- Files are automatically deleted after 48 hours
- Store Gemini URIs in Firestore with expiration timestamps
- Re-upload expired files when needed

### How RAG Works
1. Upload PDFs → Get Gemini file URIs
2. Store URIs in Firestore
3. Reference URIs in chat prompts
4. Gemini reads the PDFs and answers questions

## 📝 Example Usage

```javascript
// Upload a PDF
const fileData = await geminiRAG.uploadPDF(pdfBlob, 'lecture-notes.pdf');

// Save URI to Firestore
await saveDocumentGeminiUri(db, courseId, docId, fileData.uri, fileData.name);

// Chat with context
const docs = await getCourseDocumentsWithGemini(db, courseId);
const uris = docs.data.map(doc => doc.geminiUri);

const answer = await geminiRAG.chatWithContext(
  "What's covered in chapter 3?",
  uris,
  'gemini-1.5-flash'
);
```

## 💡 Tips

- Use `gemini-1.5-flash` for faster/cheaper responses
- Use `gemini-1.5-pro` for better quality (slower/pricier)
- Batch upload PDFs using `batchUploadPDFs()`
- Check for expired files with `getDocumentsNeedingGeminiUpload()`
- Clean up old files with `clearExpiredGeminiUris()`

## 📚 Full Documentation

- **API Reference**: `documentation/GEMINI_RAG_INTEGRATION.md`
- **Code Examples**: `GEMINI_INTEGRATION_EXAMPLE.js`
- **Gemini Docs**: https://ai.google.dev/gemini-api/docs/vision

## 🔒 Security Note

Store API keys securely using Chrome's sync storage. Consider encrypting sensitive data.

## ❓ Troubleshooting

**Upload fails?**
- Check API key is valid
- Ensure file is a PDF and < 2GB

**Chat returns empty?**
- Verify files are in 'ACTIVE' state (wait for processing)
- Check URIs are valid and not expired

**Files expired?**
- Call `ensureValidGeminiFiles()` before chatting
- Implement auto-reupload logic

## 🎉 You're Ready!

Your extension now has full RAG capabilities powered by Gemini's File API!
