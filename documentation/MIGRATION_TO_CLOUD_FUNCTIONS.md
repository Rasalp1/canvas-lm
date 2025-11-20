# Quick Migration Guide: From Direct API to Cloud Functions

## What Changed?

Instead of calling Gemini API directly from the extension, we now call Firebase Cloud Functions that proxy the requests. Your API key stays secure on the server.

## Migration Steps

### 1. Update Your Code

**Find and replace this pattern:**

```javascript
// OLD: Direct API call
import { GeminiRAGManager } from './gemini-rag.js';

// Get API key from storage
const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
const gemini = new GeminiRAGManager(geminiApiKey);
```

**With this:**

```javascript
// NEW: Cloud Functions call
import GeminiCloudClient from './gemini-cloud-functions.js';

// No API key needed!
const gemini = new GeminiCloudClient(window.firebaseApp);
```

### 2. Same API, Zero Changes Needed

The methods are identical:

```javascript
// Upload PDF - exact same syntax
const file = await gemini.uploadPDF(pdfBlob, 'document.pdf');

// Chat - exact same syntax
const answer = await gemini.chatWithContext(
  "What is the main topic?",
  [fileUri]
);

// List files - exact same syntax
const { files } = await gemini.listFiles();

// Delete file - exact same syntax
await gemini.deleteFile('files/abc123');
```

### 3. Remove Settings UI (Optional)

Since users don't need to provide API keys anymore, you can simplify `settings.html`:

```diff
- <input type="password" id="api-key" placeholder="Enter your Gemini API key...">
- <button id="save-btn">Save API Key</button>
```

Or keep the page for future settings.

### 4. Update Imports in popup.js

```javascript
// At the top of popup.js
import GeminiCloudClient from './gemini-cloud-functions.js';

// Later in your code
const geminiClient = new GeminiCloudClient(window.firebaseApp);
```

## Example: Complete Update

**Before (popup.js):**
```javascript
// Initialize Gemini with user's API key
async function initGemini() {
  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
  if (!geminiApiKey) {
    alert('Please set your Gemini API key in settings');
    return null;
  }
  return new GeminiRAGManager(geminiApiKey);
}

// Usage
const gemini = await initGemini();
if (gemini) {
  const result = await gemini.uploadPDF(file);
}
```

**After (popup.js):**
```javascript
// Initialize Gemini with Cloud Functions
function initGemini() {
  return new GeminiCloudClient(window.firebaseApp);
}

// Usage
const gemini = initGemini();
const result = await gemini.uploadPDF(file);
```

## Files to Update

✅ `src/popup.js` - Replace GeminiRAGManager with GeminiCloudClient  
✅ `src/background.js` - If you use Gemini there  
✅ `settings.html` - Remove API key input (optional)  
✅ `settings.js` - Remove API key handling (optional)

## Deploy Cloud Functions

Before testing:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Test

1. Rebuild extension: `npm run build`
2. Load in Chrome
3. Try uploading a PDF
4. Check Firebase Console logs if issues

That's it! 🎉
