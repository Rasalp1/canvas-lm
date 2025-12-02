# Lecture Context Feature Documentation

**Last Updated:** December 2, 2025  
**Version:** 1.1.0

## Overview

The Lecture Context feature automatically detects which specific Canvas file (lecture, module, or document) the user is currently viewing and uses this context to provide more relevant, focused answers. When enabled, the AI prioritizes the current document in its responses while still having access to all course materials.

## Key Benefits

1. **More Relevant Answers**: Questions about specific lectures get answers from that lecture
2. **Natural Context Injection**: No need to mention "in this lecture" or specify file names
3. **User Control**: Toggle on/off based on whether broad or focused search is desired
4. **Visual Feedback**: Clear UI indicator showing when context is active
5. **Improved Accuracy**: Higher chunk retrieval (10 vs 5) when context is available

## How It Works

### 1. Page Context Detection

**File:** `popup-logic.js` → `updatePageContext()`

```javascript
async updatePageContext() {
  // 1. Get active Canvas tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // 2. Check if on Canvas page
  if (!tab.url?.includes('canvas.')) return null;
  
  // 3. Ask content script for file context
  const response = await chrome.tabs.sendMessage(tab.id, {
    action: 'getCurrentFileContext'
  });
  
  // Response: { fileId, url, moduleItemId, fileName }
}
```

**File:** `content-script.js` → Message handler

```javascript
// Detects Canvas file URLs like:
// /courses/123/files/456/preview
// /courses/123/modules/items/789

case 'getCurrentFileContext':
  const fileId = extractFileIdFromUrl(window.location.href);
  const moduleItemId = extractModuleItemId(window.location.href);
  
  sendResponse({
    success: true,
    context: { fileId, url: window.location.href, moduleItemId }
  });
```

### 2. Document Matching

**File:** `popup-logic.js` → `getCurrentPagePDF()`

```javascript
// Match detected fileId to Firestore document
const docsResult = await firestoreHelpers.getCourseDocuments(db, courseId);

const matchingDoc = docsResult.data.find(doc => {
  const storedFileIdMatch = doc.fileUrl.match(/\/files\/(\d+)/);
  return storedFileIdMatch[1] === fileContext.fileId;
});

// Return: { fileName, fileUrl, contextType: 'page_file', pageUrl, moduleItemId }
```

### 3. UI Indicator Update

**File:** `ChatSection.jsx`

```jsx
{currentPagePDF && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
    <div className="flex items-start gap-3">
      <svg className="w-5 h-5 text-blue-600">...</svg>
      <div className="flex-1">
        <p className="text-sm font-medium text-blue-900">
          📄 Viewing Context
        </p>
        <p className="text-sm text-blue-700 mt-1 truncate">
          {currentPagePDF.fileName}
        </p>
        <p className="text-xs text-blue-600 mt-1">
          Questions will prioritize this document
        </p>
      </div>
    </div>
  </div>
)}
```

### 4. Context Toggle

**File:** `App.jsx` & `ChatSection.jsx`

```jsx
// State management
const [contextEnabled, setContextEnabled] = useState(true);

// Toggle handler
const handleContextToggle = (enabled) => {
  setContextEnabled(enabled);
  popupLogic.setContextEnabled(enabled);
};

// Toggle UI (in ChatSection)
<label className="flex items-center gap-2 cursor-pointer">
  <input 
    type="checkbox" 
    checked={contextEnabled}
    onChange={(e) => setContextEnabled(e.target.checked)}
  />
  <span>Prioritize current document</span>
</label>
```

### 5. Query Enhancement

**File:** `popup-logic.js` → `handleChatSend()`

```javascript
async handleChatSend(message) {
  // Get current page context
  const currentPagePDF = await this.getCurrentPagePDF();
  
  // Check if context is enabled
  const contextEnabled = this.contextEnabled !== false;
  
  if (currentPagePDF && contextEnabled) {
    // Enhance the message
    const contextualMessage = `Regarding "${currentPagePDF.fileName}": ${message}`;
    
    // Create metadata filter
    const metadataFilter = `fileName = "${currentPagePDF.fileName}"`;
    
    // Query with enhanced parameters
    const response = await fileSearchManager.queryCourseStore(
      contextualMessage,  // Enhanced message
      courseId,
      'gemini-2.5-flash',
      metadataFilter,     // Prioritize this document
      10,                 // Increased topK (vs 5 normally)
      historyForGemini
    );
  }
}
```

### 6. Cloud Function Processing

**File:** `functions/index.js` → `queryCourseStore`

```javascript
exports.queryCourseStore = onCall(async (request) => {
  const { question, courseId, metadataFilter, topK = 5 } = request.data;
  
  // Build query with metadata filter if provided
  const queryRequest = {
    query: question,
    topK: topK,
    metadataFilter: metadataFilter || null,
    fileSearchTool: {
      fileSearchConfig: {
        corpus: corpusResourceName
      }
    }
  };
  
  // Gemini prioritizes documents matching the filter
  const response = await geminiClient.generateContent(queryRequest);
});
```

## Canvas URL Patterns Detected

The system recognizes these Canvas URL patterns:

```javascript
// File preview pages
/courses/{courseId}/files/{fileId}/preview
/courses/{courseId}/files/{fileId}

// Module items (often link to files)
/courses/{courseId}/modules/items/{itemId}

// File download pages
/courses/{courseId}/files/{fileId}/download

// Embedded file viewers
/courses/{courseId}/files/{fileId}?wrap=1
```

## User Experience Flow

### Scenario 1: Context Available & Enabled

```
1. User navigates to: /courses/123/files/456/preview
   → UI shows: "📄 Viewing Context: Week_3_Algorithms.pdf"
   
2. User asks: "What is the time complexity?"
   → Enhanced to: "Regarding 'Week_3_Algorithms.pdf': What is the time complexity?"
   → Metadata filter: fileName = "Week_3_Algorithms.pdf"
   → topK: 10 chunks
   
3. AI responds with answer focused on Week 3 Algorithms document
   → Citations primarily from the current document
   → More accurate, specific answers
```

### Scenario 2: Context Available but Disabled

```
1. User navigates to: /courses/123/files/456/preview
   → UI shows: "📄 Viewing Context: Week_3_Algorithms.pdf"
   → Toggle: OFF
   
2. User asks: "What is the time complexity?"
   → Sent as-is: "What is the time complexity?"
   → No metadata filter
   → topK: 5 chunks (standard)
   
3. AI responds with answer from all course materials
   → Citations from various documents
   → Broader search results
```

### Scenario 3: No Context (Not on File Page)

```
1. User on: /courses/123/modules
   → No context indicator shown
   → Toggle not relevant
   
2. User asks: "What is the time complexity?"
   → Sent as-is: "What is the time complexity?"
   → No metadata filter
   → topK: 5 chunks (standard)
   
3. AI responds with answer from all course materials
   → Standard behavior
```

## Implementation Files

### Core Logic
- `src/popup-logic.js`
  - `updatePageContext()`: Main context detection orchestrator
  - `getCurrentPagePDF()`: Matches Canvas file to Firestore document
  - `setContextEnabled()`: Toggle state management
  - `handleChatSend()`: Query enhancement with context

### Content Script
- `src/content-script.js`
  - Message handler: `getCurrentFileContext`
  - URL parsing for fileId extraction
  - Module item ID extraction

### UI Components
- `src/App.jsx`
  - Context state management
  - Props passing to ChatSection

- `src/components/ChatSection.jsx`
  - Context indicator display
  - Toggle switch UI
  - Context-aware styling

### Cloud Functions
- `functions/index.js`
  - `queryCourseStore`: Processes metadata filters
  - Gemini API integration with File Search

## Configuration

### Toggle Defaults
```javascript
// Default: Context enabled
this.contextEnabled = true; // popup-logic.js constructor

// User can toggle per question
setContextEnabled(enabled) {
  this.contextEnabled = enabled;
}
```

### Chunk Retrieval
```javascript
// Standard query
const topK = 5;

// With context
const topK = currentPagePDF ? 10 : 5;
```

### Metadata Filter Format
```javascript
// Gemini File Search metadata filter syntax
metadataFilter: `fileName = "${currentPagePDF.fileName}"`

// Example
metadataFilter: `fileName = "Week_3_Algorithms.pdf"`
```

## Testing & Debugging

### Enable Debug Logging
```javascript
// popup-logic.js
console.log('📄 ChatSection received currentPagePDF:', currentPagePDF);
console.log('🎯 Context enabled:', contextEnabled);
console.log('🎯 Using page context for query:', currentPagePDF.fileName);
```

### Test Cases

**Test 1: Context Detection**
```
1. Navigate to a Canvas file page
2. Open extension popup
3. Look for: "📄 Viewing Context: {filename}" in chat area
4. Expected: Blue context indicator card appears
```

**Test 2: Context Toggle**
```
1. With context detected, toggle OFF
2. Ask a question
3. Check console: "⏸️ Context available but disabled by user"
4. Expected: No metadata filter applied
```

**Test 3: Query Enhancement**
```
1. With context enabled, ask: "What is covered?"
2. Check network tab for queryCourseStore call
3. Verify: question contains "Regarding '{fileName}': What is covered?"
4. Verify: metadataFilter = "fileName = '{fileName}'"
```

**Test 4: No Context Available**
```
1. Navigate to /courses/123/modules (not a file page)
2. Open extension popup
3. Expected: No context indicator shown
4. Ask question: Should work normally without context
```

## Future Enhancements

### Planned Features
- [ ] Module-level context (prioritize all files in current module)
- [ ] Week-level context (group by week metadata)
- [ ] Assignment context (prioritize relevant materials for assignments)
- [ ] History-aware context (remember recently viewed documents)
- [ ] Multi-document context (select multiple documents to prioritize)

### Potential Improvements
- [ ] Cache file context to reduce content script calls
- [ ] Smarter context suggestions ("Also relevant: ...")
- [ ] Context-based follow-up question prompts
- [ ] Visual highlighting of context sources in responses
- [ ] Context breadcrumbs showing document hierarchy

## Troubleshooting

### Context Not Detected

**Problem:** On file page but no context indicator

**Solutions:**
1. Check if URL matches pattern: `/files/{fileId}`
2. Verify content script is loaded: Check console for content script logs
3. Check if document exists in Firestore: View course documents
4. Refresh Canvas page and reopen popup

### Context Not Applied to Query

**Problem:** Context shown but not used in query

**Solutions:**
1. Verify toggle is enabled (checked)
2. Check console for "🎯 Using page context" log
3. Verify `setContextEnabled(true)` was called
4. Check network tab for metadata filter in request

### Wrong Document Matched

**Problem:** Context shows wrong document name

**Solutions:**
1. Check fileId extraction from URL
2. Verify Firestore documents have correct fileUrl field
3. Check for duplicate fileIds in different URLs
4. Re-scan course to update document metadata

## Performance Considerations

### Latency Impact
- Context detection: ~50-100ms (one content script call)
- No impact on query time (metadata filtering is server-side)
- Toggle changes: Instant (client-side state)

### Caching Strategy
- Current implementation: Detect on every message send
- Planned: Cache context for 60 seconds (reduce content script calls)

### Resource Usage
- Minimal: One content script message per query
- No additional Firestore reads (documents already loaded)
- No additional Cloud Function calls (metadata filter is free)

## Security & Privacy

### Data Exposure
- File context never leaves browser (matched locally)
- Only fileName sent to Cloud Function (in metadata filter)
- No additional user data collected

### Permission Requirements
- Uses existing `tabs` permission
- Uses existing `chrome.tabs.sendMessage` API
- No new permissions required

## Conclusion

The Lecture Context feature significantly improves answer relevance by automatically detecting and utilizing the user's current Canvas page context. With a simple toggle control and clear visual feedback, users can easily switch between focused and broad search modes based on their needs.
