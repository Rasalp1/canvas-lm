# Lecture-Specific Context Implementation Plan

**Feature:** Automatic PDF context detection when viewing Canvas lecture files

**Goal:** When a user views a Canvas file page (e.g., `https://canvas.education.lu.se/courses/36823/files/7099894?module_item_id=1667284`), the extension should automatically detect which PDF corresponds to that page and use it as context for chat queries.

---

## Overview

This implementation adds intelligent context awareness to the chat system by:
1. Detecting when users are viewing specific Canvas file pages
2. Matching those pages to PDFs stored in Firestore
3. Automatically prioritizing those PDFs when answering questions
4. Providing visual feedback about the active context

---

## Architecture Changes

### Current Flow
```
User on Canvas → Opens popup → Asks question → RAG searches ALL course PDFs
```

### New Flow
```
User on Canvas file page → Opens popup → Chat detects current file → 
RAG prioritizes specific PDF → Better, more relevant answers
```

---

## Implementation Phases

### **Phase 1: Core Context Detection** (2-3 hours)

#### 1.1 Add URL Detection to Content Script

**File:** `src/content-script.js`

**Location:** Add new method to `CanvasContentScript` class (after line ~1740, near `extractCourseId()`)

```javascript
/**
 * Detect if user is currently viewing a specific Canvas file
 * @returns {Object|null} File context information or null
 */
getCurrentFileContext() {
  const url = window.location.href;
  
  // Match Canvas file URLs: /courses/{courseId}/files/{fileId}
  const fileMatch = url.match(/\/courses\/(\d+)\/files\/(\d+)/);
  
  // Extract module_item_id if present (indicates lecture context)
  const moduleMatch = url.match(/[?&]module_item_id=(\d+)/);
  
  if (fileMatch) {
    const [, courseId, fileId] = fileMatch;
    
    return {
      type: 'canvas_file_view',
      courseId: courseId,
      fileId: fileId,
      moduleItemId: moduleMatch ? moduleMatch[1] : null,
      url: url,
      timestamp: Date.now()
    };
  }
  
  return null;
}

/**
 * Get detailed file info from current page (title, metadata)
 */
getCurrentFileMetadata() {
  const context = this.getCurrentFileContext();
  if (!context) return null;
  
  // Try to extract file title from page
  const titleSelectors = [
    '.page-title',
    'h1.file-name',
    '.ef-file-preview-header-title',
    '[data-testid="file-preview-title"]'
  ];
  
  let title = null;
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      title = element.textContent.trim();
      break;
    }
  }
  
  return {
    ...context,
    pageTitle: title || document.title,
    isPDFViewer: document.querySelector('.ef-file-preview-frame, iframe[src*=".pdf"]') !== null
  };
}
```

#### 1.2 Add Message Handler for Context Requests

**File:** `src/content-script.js`

**Location:** In `handleMessage()` method, add new case (around line 1800)

```javascript
case 'getCurrentFileContext':
  try {
    const context = this.getCurrentFileMetadata();
    console.log(' Current file context:', context);
    sendResponse({ success: true, context: context });
  } catch (error) {
    console.error('Error getting file context:', error);
    sendResponse({ success: false, error: error.message });
  }
  return false; // Synchronous response
```

#### 1.3 Add Context Retrieval to Popup Logic

**File:** `src/popup-logic.js`

**Location:** Add new method after `getCourseDocumentsForDrawer()` (around line 1510)

```javascript
/**
 * Get the PDF document that corresponds to the current Canvas page
 * @returns {Promise<Object|null>} Document data or null if not viewing a file
 */
async getCurrentPagePDF() {
  try {
    // Check if user is on a Canvas page
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      console.log('No active tab found');
      return null;
    }
    
    const tab = tabs[0];
    
    // Only check Canvas URLs
    if (!tab.url?.includes('canvas.')) {
      console.log('Not on a Canvas page');
      return null;
    }
    
    // Ask content script for current file context
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getCurrentFileContext'
      });
      
      if (!response?.success || !response.context) {
        console.log('No file context on current page');
        return null;
      }
      
      const fileContext = response.context;
      console.log(' Detected file context:', fileContext);
      
      // Match fileId to a document in Firestore
      if (!this.currentCourseData?.id) {
        console.log('No current course data');
        return null;
      }
      
      const docsResult = await this.firestoreHelpers.getCourseDocuments(
        this.db,
        this.currentCourseData.id
      );
      
      if (!docsResult.success || !docsResult.data) {
        console.log('No documents found for course');
        return null;
      }
      
      // Try to match by fileId in URL
      const matchingDoc = docsResult.data.find(doc => {
        if (!doc.fileUrl) return false;
        
        // Extract file ID from stored URL
        const storedFileIdMatch = doc.fileUrl.match(/\/files\/(\d+)/);
        if (!storedFileIdMatch) return false;
        
        return storedFileIdMatch[1] === fileContext.fileId;
      });
      
      if (matchingDoc) {
        console.log(' Matched current page to PDF:', matchingDoc.fileName);
        return {
          ...matchingDoc,
          contextType: 'page_file',
          pageUrl: fileContext.url,
          moduleItemId: fileContext.moduleItemId
        };
      }
      
      console.log('No matching document found for file ID:', fileContext.fileId);
      return null;
      
    } catch (messageError) {
      // Content script might not be loaded yet
      console.log('Could not communicate with content script:', messageError.message);
      return null;
    }
    
  } catch (error) {
    console.error('Error getting current page PDF:', error);
    return null;
  }
}

/**
 * Check for current page context and update UI
 */
async updatePageContext() {
  try {
    const currentPDF = await this.getCurrentPagePDF();
    
    if (currentPDF) {
      this.uiCallbacks.setCurrentPagePDF?.(currentPDF);
      console.log(' Page context active:', currentPDF.fileName);
    } else {
      this.uiCallbacks.setCurrentPagePDF?.(null);
    }
  } catch (error) {
    console.error('Error updating page context:', error);
  }
}
```

#### 1.4 Integrate Context into Chat Flow

**File:** `src/popup-logic.js`

**Location:** Modify `handleChatSend()` method (around line 1350)

**Changes:**
1. Check for current page PDF before sending query
2. Enhance the query message with context
3. Add metadata filter to prioritize the specific document

```javascript
async handleChatSend(message) {
  if (!this.currentUser || !this.db) {
    this.conversationHistory.push({ 
      role: 'assistant', 
      content: ' Please sign in to use chat' 
    });
    this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
    return;
  }
  
  if (!this.fileSearchManager) {
    this.conversationHistory.push({ 
      role: 'assistant', 
      content: ' File Search service not available' 
    });
    this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
    return;
  }
  
  if (!this.currentCourseData) {
    this.conversationHistory.push({ 
      role: 'assistant', 
      content: ' Please navigate to a Canvas course first' 
    });
    this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
    return;
  }
  
  // Get course and check if File Search store exists
  const courseResult = await this.firestoreHelpers.getCourse(this.db, this.currentCourseData.id);
  if (!courseResult.success || !courseResult.data.fileSearchStoreName) {
    this.conversationHistory.push({ 
      role: 'assistant', 
      content: ' Please scan the course first to build the knowledge base' 
    });
    this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
    return;
  }
  
  const fileSearchStoreName = courseResult.data.fileSearchStoreName;
  
  // Ensure we have a chat session
  if (!this.currentSessionId) {
    await this.loadOrCreateChatSession();
    if (!this.currentSessionId) {
      this.conversationHistory.push({ 
        role: 'assistant', 
        content: ' Unable to create chat session' 
      });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      return;
    }
  }
  
  // NEW: Check if user is viewing a specific file
  const currentPagePDF = await this.getCurrentPagePDF();
  let enhancedMessage = message;
  let metadataFilter = null;
  
  if (currentPagePDF) {
    // Add context to the message for better understanding
    enhancedMessage = `[Context: User is currently viewing "${currentPagePDF.fileName}" on Canvas] ${message}`;
    
    // Create metadata filter to prioritize this document
    // Note: This assumes your documents have a 'fileName' metadata field
    metadataFilter = `fileName = "${currentPagePDF.fileName}"`;
    
    console.log(' Using page context for query:', currentPagePDF.fileName);
  }
  
  // Add user message
  this.conversationHistory.push({ role: 'user', content: message });
  this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
  this.uiCallbacks.setIsChatLoading?.(true);
  
  // Save user message to Firestore
  await this.firestoreHelpers.addMessageToSession(
    this.db,
    this.currentUser.id,
    this.currentSessionId,
    { role: 'user', content: message }
  );
  
  try {
    // Get last 10 messages (excluding the current one) for context
    const historyForGemini = this.conversationHistory
      .slice(-10)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
    
    // Query course store with enhanced message and metadata filter
    const response = await this.fileSearchManager.queryCourseStore(
      enhancedMessage,
      this.currentCourseData.id,
      'gemini-2.5-flash',
      metadataFilter, // NEW: Prioritize current document
      currentPagePDF ? 10 : 5, // Retrieve more chunks if we have context
      historyForGemini
    );
    
    // Stream the response word-by-word
    await this.streamMessage(response.answer, 20);
    
    // Save assistant message to Firestore
    await this.firestoreHelpers.addMessageToSession(
      this.db,
      this.currentUser.id,
      this.currentSessionId,
      { role: 'assistant', content: response.answer }
    );
    
  } catch (error) {
    console.error('Chat error:', error);
    
    const errorMessage = ' Error: ' + error.message;
    await this.streamMessage(errorMessage, 20);
    
    // Save error message to Firestore
    await this.firestoreHelpers.addMessageToSession(
      this.db,
      this.currentUser.id,
      this.currentSessionId,
      { role: 'assistant', content: errorMessage }
    );
  }
}
```

#### 1.5 Call Context Check on Course Detection

**File:** `src/popup-logic.js`

**Location:** In `detectCanvas()` method, after course detection (around line 250)

```javascript
// After setting current course data
this.currentCourseData = {
  id: courseInfo.courseId,
  name: courseInfo.courseName,
  url: courseInfo.url
};

// NEW: Check if viewing a specific file
await this.updatePageContext();
```

Also add to `handleSwitchCourse()` after switching:

```javascript
// After loading enrollment and chat session
await this.updatePageContext();
```

---

### **Phase 2: UI Enhancements** (1-2 hours)

#### 2.1 Add State for Current Page PDF

**File:** `src/App.jsx`

**Location:** Add state near other useState declarations (around line 80)

```javascript
const [currentPagePDF, setCurrentPagePDF] = useState(null);
```

#### 2.2 Update UI Callbacks

**File:** `src/App.jsx`

**Location:** In useEffect where callbacks are set (around line 130)

```javascript
popupLogic.setUICallbacks({
  setUser,
  setIsLoggedIn,
  setUserStats,
  setStatus,
  setCourseDetails,
  setShowCourseInfo,
  setCourseList,
  setIsScanning,
  setScanProgress,
  setScanTimeLeft,
  setChatMessages,
  setIsChatLoading,
  setIsExtensionPage,
  setCurrentCourseDocCount,
  setScanStartTime,
  setEstimatedScanTime,
  setEnrollmentStatus,
  setNewDocumentsFound,
  setCurrentPagePDF // NEW
});
```

#### 2.3 Add Context Indicator Component

**File:** `src/components/ChatSection.jsx`

**Location:** At the top of the component, before the chat messages container

```jsx
{currentPagePDF && (
  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-3 flex items-start gap-3">
    <div className="flex-shrink-0 mt-0.5">
      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
           Viewing Context
        </p>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">
          Active
        </span>
      </div>
      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1 truncate">
        {currentPagePDF.fileName}
      </p>
      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
        Questions will prioritize this document
      </p>
    </div>
  </div>
)}
```

Update the ChatSection component to accept the prop:

```jsx
export const ChatSection = ({ 
  chatMessages, 
  chatInput, 
  isChatLoading, 
  currentPagePDF, // NEW
  onChatInputChange, 
  onChatSend 
}) => {
  // ... component code
}
```

#### 2.4 Pass Prop from App

**File:** `src/App.jsx`

**Location:** Where ChatSection is rendered (around line 450)

```jsx
<ChatSection
  chatMessages={chatMessages}
  chatInput={chatInput}
  isChatLoading={isChatLoading}
  currentPagePDF={currentPagePDF} // NEW
  onChatInputChange={handleChatInputChange}
  onChatSend={handleChatSend}
/>
```

---

### **Phase 3: Enhanced Scanning** (2-3 hours, OPTIONAL)

#### 3.1 Store Module Item IDs During Scan

**File:** `src/content-script.js`

**Location:** In `processParsedLink()` method (around line 350)

**Enhancement:** Store the `module_item_id` when found

```javascript
foundPDFs.push({
  url: this.convertToDownloadURL(absoluteUrl),
  title: this.extractBetterTitle(element, absoluteUrl) || text || 'Canvas PDF',
  filename: this.extractFilename(absoluteUrl),
  context: `Found in: ${sourceUrl}`,
  type: pdfType,
  sourceUrl: sourceUrl,
  moduleItemId: element.closest('[data-module-item-id]')?.dataset.moduleItemId || null, // NEW
  canvasItemType: itemType,
  isAttachment: isAttachment,
  isEmbeddedFile: isEmbeddedFile,
  fileId: fileId,
  source: source,
  needsRedirectResolution: absoluteUrl.includes('/modules/items/')
});
```

#### 3.2 Store Module Item ID in Firestore

**File:** `src/popup-logic.js`

**Location:** In the scanning process where documents are saved (around line 1100)

**Enhancement:** Add moduleItemId to document metadata

```javascript
const docData = {
  fileName: pdf.name,
  fileUrl: pdf.url,
  fileSize: blob.size,
  fileType: blob.type,
  scannedFrom: pdf.type,
  uploadedAt: window.firebaseModules.Timestamp.now(),
  uploadedBy: this.currentUser.id,
  uploadStatus: 'pending',
  moduleItemId: pdf.moduleItemId || null, // NEW
  sourceUrl: pdf.sourceUrl || null // NEW
};
```

#### 3.3 Update Firestore Schema Documentation

**File:** `documentation/FIRESTORE_ARCHITECTURE.md`

Add to the documents subcollection structure:

```markdown
 documents/                         [Subcollection -  SHARED]
   
    aHR0cHM6Ly9jYW52YXMuZWR1L2ZpbGVzLzEvbGVjdHVyZTEucGRm/  [Document]
      fileName: "lecture1.pdf"
      fileUrl: "https://canvas.edu/files/1/lecture1.pdf"
      fileSize: 2048576
      fileType: "application/pdf"
      scannedFrom: "files"
      moduleItemId: "1667284"      ← NEW
      sourceUrl: "https://..."     ← NEW
      uploadedAt: Timestamp
      fileSearchDocumentName: "document_gemini_123"
      uploadStatus: "completed"
      uploadedBy: "A123"
```

---

### **Phase 4: Advanced Features** (3-4 hours, OPTIONAL)

#### 4.1 Context Toggle Button

Allow users to manually enable/disable context mode:

```jsx
const [usePageContext, setUsePageContext] = useState(true);

// In ChatSection.jsx
{currentPagePDF && (
  <button 
    onClick={() => setUsePageContext(!usePageContext)}
    className="text-xs text-blue-600 hover:text-blue-700 underline"
  >
    {usePageContext ? ' Using page context' : ' Search all documents'}
  </button>
)}
```

#### 4.2 Related Documents Suggestion

Show other PDFs from the same module:

```javascript
async getRelatedDocuments(moduleItemId) {
  const docs = await this.firestoreHelpers.getCourseDocuments(
    this.db,
    this.currentCourseData.id
  );
  
  return docs.data.filter(doc => 
    doc.moduleItemId === moduleItemId || 
    doc.sourceUrl?.includes(moduleItemId)
  );
}
```

#### 4.3 Smart Question Suggestions

Based on current PDF, suggest relevant questions:

```javascript
const suggestedQuestions = {
  'lecture': [
    'Summarize the main points of this lecture',
    'What are the key concepts covered?',
    'Are there any examples or case studies?'
  ],
  'lab': [
    'What are the lab objectives?',
    'What materials or tools are needed?',
    'Can you explain the methodology?'
  ],
  'assignment': [
    'What is the due date?',
    'What are the grading criteria?',
    'What format should I submit in?'
  ]
};
```

---

## Testing Plan

### Unit Tests

1. **URL Parsing Tests**
   - Valid file URLs with module_item_id
   - Valid file URLs without module_item_id
   - Non-file Canvas URLs
   - Non-Canvas URLs

2. **Document Matching Tests**
   - File ID matches document URL
   - Multiple documents with same name
   - Documents with different URL formats

### Integration Tests

1. **Content Script Communication**
   - Message passing between popup and content script
   - Timeout handling
   - Content script not loaded

2. **Context Flow**
   - Navigate to file page → Context detected
   - Navigate away → Context cleared
   - Switch courses → Context updates

### Manual Testing Checklist

- [ ] Navigate to Canvas file page with `?module_item_id=`
- [ ] Open extension popup
- [ ] Verify context indicator appears
- [ ] Ask a question about the current document
- [ ] Verify answer is relevant to that specific PDF
- [ ] Navigate to course home (non-file page)
- [ ] Verify context indicator disappears
- [ ] Ask same question, verify it searches all documents
- [ ] Test with multiple PDFs in same course
- [ ] Test with course that has no PDFs scanned yet
- [ ] Test error handling when content script unavailable

---

## Performance Considerations

### Impact Analysis

| Operation | Current | With Context | Impact |
|-----------|---------|--------------|--------|
| Popup Open | ~200ms | ~250ms | +50ms (acceptable) |
| Chat Query | ~2-3s | ~2-3s | No change (server-side) |
| Memory | ~15MB | ~15MB | Negligible |
| Network | 0 extra | 0 extra | No API calls |

### Optimization Strategies

1. **Caching:** Cache current page context for 30 seconds
2. **Debouncing:** Only check context on course switch/refresh
3. **Lazy Loading:** Load context only when chat is opened
4. **Error Handling:** Fail silently if content script unavailable

---

## Error Handling

### Scenarios to Handle

1. **Content Script Not Loaded**
   ```javascript
   try {
     const response = await chrome.tabs.sendMessage(tab.id, {...});
   } catch (error) {
     // Gracefully degrade - use all documents
     console.log('Content script not available, using full search');
   }
   ```

2. **Document Not Found**
   ```javascript
   if (!matchingDoc) {
     console.log('No matching document for file ID:', fileId);
     // Continue without context
     return null;
   }
   ```

3. **URL Parsing Failures**
   ```javascript
   try {
     const match = url.match(/\/files\/(\d+)/);
     if (!match) return null;
   } catch (error) {
     console.error('URL parsing error:', error);
     return null;
   }
   ```

4. **Firestore Query Failures**
   ```javascript
   const docsResult = await this.firestoreHelpers.getCourseDocuments(...);
   if (!docsResult.success) {
     console.error('Failed to fetch documents:', docsResult.error);
     return null;
   }
   ```

---

## Security Considerations

1. **URL Validation:** Always validate and sanitize URLs before processing
2. **Permission Scope:** No new permissions needed (uses existing activeTab)
3. **Data Privacy:** File IDs are already public in URLs, no sensitive data exposed
4. **XSS Prevention:** Use React's built-in escaping for all user-facing text

---

## Success Metrics

### Key Performance Indicators

1. **Context Detection Rate:** % of file page visits where context is detected
   - Target: >95%

2. **Answer Relevance:** User satisfaction with contextual answers
   - Measure: Implicit (continued usage)

3. **Performance Impact:** Popup open time with context detection
   - Target: <300ms total

4. **Error Rate:** Failed context detections / total attempts
   - Target: <5%

---

## Deployment Steps

### Pre-Deployment

1. [ ] Complete Phase 1 implementation
2. [ ] Test on 3+ different Canvas courses
3. [ ] Verify with 5+ different file types
4. [ ] Check console for errors
5. [ ] Test on both Chrome and Edge

### Build & Deploy

```bash
# 1. Run tests
npm test

# 2. Build extension
npm run build

# 3. Test built version
# Load unpacked extension from dist/

# 4. Verify all features work in built version

# 5. Create release
git add .
git commit -m "feat: Add lecture-specific context detection"
git push origin main

# 6. Package for Chrome Web Store (if applicable)
```

### Post-Deployment

1. [ ] Monitor error logs for 24 hours
2. [ ] Collect user feedback
3. [ ] Check performance metrics
4. [ ] Document any issues found
5. [ ] Plan Phase 2 if Phase 1 successful

---

## Future Enhancements

### Phase 5 Ideas (Future Work)

1. **Multi-Document Context:** Detect when page references multiple PDFs
2. **Auto-Navigation:** "Show me this section in the PDF" → Navigate to file page
3. **Citation Links:** Click citation → Open specific page in Canvas file viewer
4. **Context History:** "What did you ask about the previous lecture?"
5. **Smart Caching:** Pre-load context for upcoming lectures
6. **Cross-Reference:** "Compare this lecture with lecture 3"
7. **Offline Context:** Store context locally for offline use

---

## Known Limitations

1. **URL Variations:** Canvas might use different URL formats across institutions
   - **Mitigation:** Test with multiple Canvas instances, add URL patterns as needed

2. **Dynamic Content:** File pages loaded via JavaScript might not be detected immediately
   - **Mitigation:** Add observer for URL changes, retry logic

3. **Redirect URLs:** Some Canvas links redirect before showing final file
   - **Mitigation:** Already handled by existing `needsRedirectResolution` logic

4. **Permission Requirements:** Requires content script to be injected
   - **Mitigation:** Graceful degradation when content script unavailable

5. **Metadata Filter Support:** Depends on Cloud Function implementation
   - **Verification Needed:** Check if File Search API supports metadata filtering
   - **Fallback:** Use enhanced message context only if filtering unavailable

---

## Implementation Tips

### Development Workflow

1. **Start Small:** Implement URL detection first, test thoroughly
2. **Console Logging:** Add extensive logging for debugging
3. **Incremental Testing:** Test each phase before moving to next
4. **User Feedback:** Show clear indicators when context is active
5. **Graceful Degradation:** Always fall back to full search if context fails

### Code Quality

1. **Type Safety:** Add JSDoc comments for all new methods
2. **Error Boundaries:** Wrap all async operations in try-catch
3. **Performance:** Use async/await, avoid blocking operations
4. **Readability:** Keep methods focused, single responsibility
5. **Documentation:** Update inline comments for complex logic

### Common Pitfalls to Avoid

1.  Don't block chat if context detection fails
2.  Don't assume content script is always available
3.  Don't make additional API calls for context
4.  Don't break existing functionality
5.  Don't forget to handle URL edge cases

---

## Support & Troubleshooting

### Debug Commands

```javascript
// In content script console:
// Check current context
window.contentScript?.getCurrentFileContext()

// In popup console:
// Force context refresh
await popupLogic.updatePageContext()

// Check current state
popupLogic.currentPagePDF
```

### Common Issues

**Issue:** Context not detected
- **Check:** Is content script loaded? (Open console, look for init message)
- **Check:** Is URL format correct? (Verify regex match)
- **Check:** Are documents scanned? (Open drawer, verify PDFs exist)

**Issue:** Wrong document matched
- **Check:** File IDs in Firestore URLs (Compare with page URL)
- **Check:** Multiple documents with same ID (Should be impossible, but check)

**Issue:** Performance degradation
- **Check:** Network tab for unexpected requests
- **Check:** Console for repeated errors
- **Check:** Memory profiler for leaks

---

## Acceptance Criteria

### Phase 1 Complete When:

- [x] User navigates to Canvas file page
- [x] Extension detects file ID from URL
- [x] Extension matches file ID to Firestore document
- [x] Chat queries include context about current document
- [x] Context indicator shows in UI
- [x] Answers are more relevant to current document
- [x] Feature works across different Canvas courses
- [x] No errors in console during normal operation
- [x] Extension performance remains acceptable (<300ms popup open)

---

## Timeline Estimate

| Phase | Tasks | Time | Priority |
|-------|-------|------|----------|
| Phase 1 | Core context detection | 2-3 hours | HIGH |
| Phase 2 | UI enhancements | 1-2 hours | HIGH |
| Phase 3 | Enhanced scanning | 2-3 hours | MEDIUM |
| Phase 4 | Advanced features | 3-4 hours | LOW |
| Testing | All phases | 2 hours | HIGH |
| **Total** | **Minimum viable** | **5-7 hours** | - |
| **Total** | **Full implementation** | **10-14 hours** | - |

---

## Quick Start

To begin implementation immediately:

1. **Start with Phase 1.1:** Add `getCurrentFileContext()` to content-script.js
2. **Test URL detection:** Open Canvas file page, run method in console
3. **Verify regex patterns:** Test with your specific Canvas instance URLs
4. **Continue with Phase 1.2-1.5:** Complete core functionality
5. **Basic testing:** Verify context detection works end-to-end
6. **Move to Phase 2:** Add UI indicators once core works

**First commit goal:** Context detection working in console (1 hour)

---

## Notes

- This feature requires NO new permissions
- No changes to Cloud Functions needed (uses existing queryCourseStore)
- No changes to Firestore schema needed for basic version
- Fully backward compatible (degrades gracefully if unavailable)
- Can be feature-flagged for gradual rollout if desired

---

**Document Version:** 1.0  
**Last Updated:** December 1, 2025  
**Status:** Ready for Implementation
