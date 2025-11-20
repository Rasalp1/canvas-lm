# Integration Checklist

Use this checklist to integrate Gemini RAG into your Canvas extension.

## ✅ Phase 1: Setup (Already Complete!)

- [x] Created `src/gemini-rag.js`
- [x] Updated `src/firestore-helpers.js` with Gemini functions
- [x] Created `settings.html` + `src/settings.js`
- [x] Updated `webpack.config.js`
- [x] Updated `manifest.json`
- [x] Updated `popup.html`
- [x] Built successfully with `npm run build`

## 🔧 Phase 2: Configuration

- [ ] **Get Gemini API Key**
  - Go to https://aistudio.google.com/app/apikey
  - Click "Create API Key"
  - Copy the key (starts with `AIza...`)

- [ ] **Test Settings Page**
  - Reload extension in Chrome
  - Right-click extension icon → "Options"
  - Paste API key
  - Click "Save API Key"
  - Verify "Connected" status appears

## 💻 Phase 3: Code Integration

### Step 1: Initialize Gemini in popup.js

- [ ] Add global variable at top of `popup.js`:
```javascript
let geminiRAG = null;
```

- [ ] Add initialization function:
```javascript
async function initializeGeminiRAG() {
  const result = await chrome.storage.sync.get(['geminiApiKey']);
  if (result.geminiApiKey) {
    geminiRAG = new GeminiRAGManager(result.geminiApiKey);
    console.log('✅ Gemini RAG ready');
    return true;
  }
  return false;
}
```

- [ ] Call it in your DOMContentLoaded event:
```javascript
// After Firebase helpers load
await initializeGeminiRAG();
```

- [ ] Load Gemini helper functions:
```javascript
let saveDocumentGeminiUri = window.firestoreHelpers.saveDocumentGeminiUri;
let getCourseDocumentsWithGemini = window.firestoreHelpers.getCourseDocumentsWithGemini;
let getDocumentsNeedingGeminiUpload = window.firestoreHelpers.getDocumentsNeedingGeminiUpload;
let clearExpiredGeminiUris = window.firestoreHelpers.clearExpiredGeminiUris;
```

### Step 2: Upload PDFs to Gemini

- [ ] Find your `saveFoundPDFsToFirestore()` function

- [ ] Add this after Firestore save:
```javascript
// After saving PDFs to Firestore
if (geminiRAG && foundPDFs.length > 0) {
  status.textContent = `📤 Uploading ${foundPDFs.length} PDFs to Gemini...`;
  await uploadPDFsToGemini(currentCourseData.courseId, foundPDFs);
}
```

- [ ] Add the upload function (copy from `GEMINI_INTEGRATION_EXAMPLE.js` lines 77-115):
```javascript
async function uploadPDFsToGemini(courseId, pdfs) {
  // See GEMINI_INTEGRATION_EXAMPLE.js for complete code
}
```

### Step 3: Add Chat UI

- [ ] Add chat HTML to `popup.html` (after scan section):
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

- [ ] Add CSS to `styles.css` (copy from `GEMINI_INTEGRATION_EXAMPLE.js` lines 179-223)

### Step 4: Implement Chat Logic

- [ ] Add chat function (copy from `GEMINI_INTEGRATION_EXAMPLE.js` lines 122-171):
```javascript
async function sendChatMessage() {
  // See example file for complete code
}
```

- [ ] Add helper functions:
```javascript
function appendChatMessage(role, content) { /* ... */ }
function updateChatMessage(messageId, content) { /* ... */ }
```

- [ ] Add event listeners:
```javascript
const sendChatBtn = document.getElementById('send-chat-btn');
const chatInput = document.getElementById('chat-input');

sendChatBtn?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});
```

### Step 5: Handle File Expiration

- [ ] Add function to check expired files:
```javascript
async function ensureValidGeminiFiles(courseId) {
  await clearExpiredGeminiUris(db, courseId);
  const result = await getDocumentsNeedingGeminiUpload(db, courseId);
  
  if (result.success && result.data.length > 0) {
    console.log(`⚠️ ${result.data.length} files need re-upload`);
    // Optionally auto-reupload
  }
}
```

- [ ] Call it when course is detected:
```javascript
if (currentCourseData) {
  await ensureValidGeminiFiles(currentCourseData.courseId);
}
```

## 🧪 Phase 4: Testing

### Test Settings Page
- [ ] Open settings (right-click icon → Options)
- [ ] Enter invalid key (not starting with "AIza") → Should show error
- [ ] Enter valid key → Should save successfully
- [ ] Refresh settings page → Key should persist
- [ ] Click "Clear" → Key should be removed

### Test PDF Upload
- [ ] Navigate to a Canvas course
- [ ] Click "Scan Course & Build Knowledge Base"
- [ ] Watch for Gemini upload progress
- [ ] Check browser console for "✅ Uploaded: {filename}"
- [ ] Verify no errors

### Test Chat
- [ ] After PDFs uploaded, chat section should appear
- [ ] Type a question about course material
- [ ] Click "Send"
- [ ] Should see "🤔 Thinking..." then AI response
- [ ] Try multiple questions

### Test Error Handling
- [ ] Test without API key → Should prompt to set key
- [ ] Test with no PDFs uploaded → Should show message
- [ ] Test with expired files (after 48h) → Should handle gracefully

## 🐛 Debugging Checklist

If something doesn't work:

- [ ] Check browser console for errors
- [ ] Verify API key is saved: `chrome.storage.sync.get(['geminiApiKey'])`
- [ ] Check if `geminiRAG` is initialized: `console.log(geminiRAG)`
- [ ] Verify files uploaded to Firestore with Gemini URIs
- [ ] Test Gemini API directly with a simple request
- [ ] Check Network tab for failed API calls
- [ ] Verify permissions in manifest.json

## 🚀 Phase 5: Enhancements (Optional)

- [ ] Add loading spinners for uploads
- [ ] Add progress bar for batch uploads
- [ ] Implement conversation history
- [ ] Add "Export chat" feature
- [ ] Add file management UI (view/delete uploaded files)
- [ ] Implement auto-reupload for expired files
- [ ] Add model selection (Pro vs Flash)
- [ ] Add token usage tracking
- [ ] Implement rate limiting
- [ ] Add error retry logic

## 📊 Success Metrics

Your integration is complete when:

- ✅ Settings page works (save/load API key)
- ✅ PDFs upload to Gemini after scanning
- ✅ Gemini URIs saved to Firestore
- ✅ Chat responds with relevant answers
- ✅ No console errors
- ✅ Expired files handled gracefully

## 📚 Reference Files

When integrating, refer to:

1. **Complete examples**: `GEMINI_INTEGRATION_EXAMPLE.js`
2. **API documentation**: `documentation/GEMINI_RAG_INTEGRATION.md`
3. **Quick start**: `QUICK_START_GEMINI.md`
4. **Architecture**: `ARCHITECTURE.md`
5. **Summary**: `GEMINI_INTEGRATION_SUMMARY.md`

## 🎉 Final Step

- [ ] Test the complete flow:
  1. Open extension
  2. Enter API key in settings
  3. Navigate to Canvas course
  4. Scan for PDFs
  5. Wait for Gemini upload
  6. Ask a question in chat
  7. Get AI response

If all steps work → **Integration complete!** 🎊

## 💡 Tips

- Start with a small course (few PDFs) for initial testing
- Use `gemini-1.5-flash` during development (faster/cheaper)
- Monitor API usage in Google AI Studio
- Keep an eye on the 48-hour expiration
- Test with different types of questions

## ❓ Need Help?

If you get stuck:

1. Check the example code in `GEMINI_INTEGRATION_EXAMPLE.js`
2. Read the full docs in `documentation/GEMINI_RAG_INTEGRATION.md`
3. Review the architecture in `ARCHITECTURE.md`
4. Check browser console for detailed error messages
5. Verify API key is valid and has correct permissions

---

**You've got this!** 🚀 The hard part (integration setup) is done. Now it's just connecting the pieces together.
