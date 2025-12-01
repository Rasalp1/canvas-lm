# Option 2: Smart Navigation with State Persistence - Implementation Plan

## **Current Problem Analysis**

The existing codebase has implemented DOM mining (Option 1) but it's not working because:

1. **No Actual Navigation**: The `navigateAndScan()` method doesn't navigate - it just marks URLs as visited
2. **Limited Depth**: Only scans the current page without exploring linked content
3. **Missing PDFs**: Can't access PDFs that are behind assignment pages, module items, or file preview pages

## **Option 2: Smart Navigation Implementation Strategy**

### **Core Concept**
Navigate to each Canvas page, but **persist crawler state** across navigation using `chrome.storage` so the content script can resume after page loads.

### **State Persistence Architecture**

```javascript
// State structure to persist in chrome.storage
const persistentCrawlerState = {
  sessionId: 'unique-session-id',
  isActive: true,
  currentPhase: 'modules', // 'modules', 'assignments', 'files', 'pages'
  courseId: 'course-id',
  courseName: 'Course Name',
  
  // Navigation queue
  navigationQueue: [
    { url: '/courses/123/modules', priority: 1, phase: 'modules', visited: false },
    { url: '/courses/123/assignments/456', priority: 2, phase: 'assignments', visited: false }
  ],
  
  // Results
  foundPDFs: new Set(),
  visitedUrls: new Set(),
  
  // Progress tracking
  startTime: timestamp,
  lastNavigationTime: timestamp,
  pagesVisited: 0,
  pdfsFound: 0,
  
  // Error handling
  maxRetries: 3,
  currentRetries: 0,
  failedUrls: []
};
```

## **Implementation Steps**

### **Phase 1: State Management Infrastructure**

#### **1.1 Create State Manager Class**
```javascript
class CrawlerStateManager {
  constructor() {
    this.storageKey = 'canvas_crawler_state';
    this.sessionId = this.generateSessionId();
  }
  
  async saveState(state) {
    await chrome.storage.local.set({ [this.storageKey]: state });
  }
  
  async loadState() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || null;
  }
  
  async clearState() {
    await chrome.storage.local.remove(this.storageKey);
  }
}
```

#### **1.2 Navigation State Detection**
```javascript
class NavigationDetector {
  constructor(callback) {
    this.lastUrl = window.location.href;
    this.callback = callback;
    this.setupNavigationListener();
  }
  
  setupNavigationListener() {
    // Monitor for URL changes (Canvas SPA navigation)
    setInterval(() => {
      if (window.location.href !== this.lastUrl) {
        const oldUrl = this.lastUrl;
        this.lastUrl = window.location.href;
        this.callback(oldUrl, this.lastUrl);
      }
    }, 500);
    
    // Also listen for actual page loads
    window.addEventListener('beforeunload', () => {
      this.callback(this.lastUrl, 'navigating');
    });
  }
}
```

### **Phase 2: Smart Navigation Logic**

#### **2.1 Navigation Queue Manager**
```javascript
class NavigationQueueManager {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.isNavigating = false;
  }
  
  async addToQueue(url, priority = 5, phase = 'general') {
    const state = await this.stateManager.loadState();
    if (!state) return;
    
    // Avoid duplicates
    if (!state.visitedUrls.has(url) && 
        !state.navigationQueue.some(item => item.url === url)) {
      state.navigationQueue.push({ url, priority, phase, visited: false });
      
      // Sort by priority (lower number = higher priority)
      state.navigationQueue.sort((a, b) => a.priority - b.priority);
      
      await this.stateManager.saveState(state);
    }
  }
  
  async getNextUrl() {
    const state = await this.stateManager.loadState();
    if (!state || !state.isActive) return null;
    
    // Find next unvisited URL
    const nextItem = state.navigationQueue.find(item => !item.visited);
    return nextItem || null;
  }
  
  async markUrlVisited(url) {
    const state = await this.stateManager.loadState();
    if (!state) return;
    
    state.visitedUrls.add(url);
    const queueItem = state.navigationQueue.find(item => item.url === url);
    if (queueItem) {
      queueItem.visited = true;
    }
    
    await this.stateManager.saveState(state);
  }
}
```

#### **2.2 Smart Navigator**
```javascript
class SmartNavigator {
  constructor(stateManager, queueManager) {
    this.stateManager = stateManager;
    this.queueManager = queueManager;
    this.maxNavigationAttempts = 50; // Prevent infinite loops
    this.navigationAttempts = 0;
  }
  
  async navigateToUrl(url) {
    console.log(` Smart navigation to: ${url}`);
    
    // Save state before navigation
    const state = await this.stateManager.loadState();
    state.lastNavigationTime = Date.now();
    state.currentUrl = url;
    await this.stateManager.saveState(state);
    
    // Perform navigation
    if (window.location.href !== url) {
      console.log(` Navigating from ${window.location.href} to ${url}`);
      window.location.href = url;
      // Execution stops here - new content script instance will load
    } else {
      console.log(` Already on target page: ${url}`);
      return true; // Already on page
    }
    
    return false; // Navigation initiated
  }
  
  async processNavigationQueue() {
    if (this.navigationAttempts >= this.maxNavigationAttempts) {
      console.log(' Max navigation attempts reached, stopping crawler');
      await this.stopCrawler();
      return;
    }
    
    const nextItem = await this.queueManager.getNextUrl();
    if (!nextItem) {
      console.log(' Navigation queue empty, crawler complete!');
      await this.stopCrawler();
      return;
    }
    
    this.navigationAttempts++;
    const navigated = await this.navigateToUrl(nextItem.url);
    
    if (navigated) {
      // Already on page, scan immediately
      await this.scanCurrentPage();
      
      // Continue with queue after delay
      setTimeout(() => this.processNavigationQueue(), 2000);
    }
    // If navigation initiated, the new content script instance will resume
  }
  
  async stopCrawler() {
    const state = await this.stateManager.loadState();
    if (state) {
      state.isActive = false;
      state.endTime = Date.now();
      await this.stateManager.saveState(state);
      
      // Report final results
      this.reportCrawlComplete(state);
    }
  }
}
```

### **Phase 3: Enhanced Content Discovery**

#### **3.1 Page Scanner with State Integration**
```javascript
class StatefulPageScanner {
  constructor(stateManager, queueManager) {
    this.stateManager = stateManager;
    this.queueManager = queueManager;
  }
  
  async scanCurrentPage() {
    console.log(` Scanning page: ${window.location.href}`);
    
    // Wait for page to load
    await this.waitForPageLoad();
    
    // Expand all content
    await this.expandAllContent();
    
    // Scan for PDFs
    const pdfs = await this.findPDFsOnPage();
    
    // Find additional URLs to visit
    const newUrls = await this.findLinksToExplore();
    
    // Update state
    const state = await this.stateManager.loadState();
    if (state) {
      // Add found PDFs
      pdfs.forEach(pdf => state.foundPDFs.add(pdf));
      
      // Add new URLs to queue
      for (const urlInfo of newUrls) {
        await this.queueManager.addToQueue(urlInfo.url, urlInfo.priority, urlInfo.phase);
      }
      
      // Mark current URL as visited
      await this.queueManager.markUrlVisited(window.location.href);
      
      state.pagesVisited++;
      state.pdfsFound = state.foundPDFs.size;
      
      await this.stateManager.saveState(state);
      
      console.log(` Page scan complete: ${pdfs.length} PDFs found, ${newUrls.length} new URLs queued`);
    }
  }
  
  async findLinksToExplore() {
    const links = [];
    const currentUrl = window.location.href;
    
    // Module items (high priority)
    document.querySelectorAll('.context_module_item a[href*="/assignments/"], .context_module_item a[href*="/pages/"], .context_module_item a[href*="/files/"]').forEach(link => {
      const href = this.normalizeUrl(link.href);
      if (href && href !== currentUrl) {
        links.push({ url: href, priority: 2, phase: 'module_items' });
      }
    });
    
    // Assignment links (medium priority)
    document.querySelectorAll('a[href*="/assignments/"]').forEach(link => {
      const href = this.normalizeUrl(link.href);
      if (href && href !== currentUrl) {
        links.push({ url: href, priority: 3, phase: 'assignments' });
      }
    });
    
    // File links (high priority)
    document.querySelectorAll('a[href*="/files/"]').forEach(link => {
      const href = this.normalizeUrl(link.href);
      if (href && href !== currentUrl && !href.includes('.pdf')) {
        links.push({ url: href, priority: 2, phase: 'files' });
      }
    });
    
    // Page links (medium priority)
    document.querySelectorAll('a[href*="/pages/"]').forEach(link => {
      const href = this.normalizeUrl(link.href);
      if (href && href !== currentUrl) {
        links.push({ url: href, priority: 4, phase: 'pages' });
      }
    });
    
    return links;
  }
}
```

### **Phase 4: Content Script Integration**

#### **4.1 Modified Content Script Constructor**
```javascript
class CanvasContentScript {
  constructor() {
    this.courseId = this.extractCourseId();
    this.courseName = this.extractCourseName();
    
    // Initialize state management
    this.stateManager = new CrawlerStateManager();
    this.queueManager = new NavigationQueueManager(this.stateManager);
    this.navigator = new SmartNavigator(this.stateManager, this.queueManager);
    this.scanner = new StatefulPageScanner(this.stateManager, this.queueManager);
    
    this.init();
  }
  
  async init() {
    // Check if we're resuming a crawl session
    const existingState = await this.stateManager.loadState();
    
    if (existingState && existingState.isActive) {
      console.log(' Resuming crawler session...');
      await this.resumeCrawlerSession(existingState);
    } else {
      console.log(' Fresh content script initialization');
      this.setupMessageHandlers();
    }
  }
  
  async resumeCrawlerSession(state) {
    console.log(` Resuming crawl session for course ${state.courseId}`);
    
    // Scan current page first
    await this.scanner.scanCurrentPage();
    
    // Wait a bit for scanning to complete
    await this.wait(2000);
    
    // Continue with navigation queue
    await this.navigator.processNavigationQueue();
  }
}
```

#### **4.2 Enhanced Start Crawler Method**
```javascript
async startSmartNavigationCrawl() {
  console.log(' Starting smart navigation crawler...');
  
  // Initialize crawler state
  const initialState = {
    sessionId: this.generateSessionId(),
    isActive: true,
    currentPhase: 'initialization',
    courseId: this.courseId,
    courseName: this.courseName,
    navigationQueue: [],
    foundPDFs: new Set(),
    visitedUrls: new Set(),
    startTime: Date.now(),
    lastNavigationTime: Date.now(),
    pagesVisited: 0,
    pdfsFound: 0,
    maxRetries: 3,
    currentRetries: 0,
    failedUrls: []
  };
  
  await this.stateManager.saveState(initialState);
  
  // Build initial navigation queue
  await this.buildInitialNavigationQueue();
  
  // Start scanning current page
  await this.scanner.scanCurrentPage();
  
  // Start navigation process
  setTimeout(() => {
    this.navigator.processNavigationQueue();
  }, 3000);
}

async buildInitialNavigationQueue() {
  const baseUrl = `${window.location.origin}/courses/${this.courseId}`;
  
  // Define priority pages to visit
  const priorityPages = [
    { url: `${baseUrl}/modules`, priority: 1, phase: 'modules' },
    { url: `${baseUrl}/files`, priority: 2, phase: 'files' },
    { url: `${baseUrl}/assignments`, priority: 3, phase: 'assignments' },
    { url: `${baseUrl}/pages`, priority: 4, phase: 'pages' },
    { url: `${baseUrl}/syllabus`, priority: 5, phase: 'syllabus' }
  ];
  
  // Add to queue
  for (const page of priorityPages) {
    await this.queueManager.addToQueue(page.url, page.priority, page.phase);
  }
  
  console.log(` Built initial navigation queue with ${priorityPages.length} priority pages`);
}
```

## **Error Handling & Recovery**

### **Navigation Failure Recovery**
```javascript
class NavigationErrorHandler {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }
  
  async handleNavigationFailure(url, error) {
    const state = await this.stateManager.loadState();
    if (!state) return;
    
    state.failedUrls.push({ url, error: error.message, timestamp: Date.now() });
    state.currentRetries++;
    
    if (state.currentRetries >= state.maxRetries) {
      console.log(' Max retries reached, stopping crawler');
      state.isActive = false;
    }
    
    await this.stateManager.saveState(state);
  }
}
```

## **Expected Outcomes**

### **Coverage Improvement**
- **Current**: ~20-30% of course PDFs (surface scanning only)
- **Expected**: ~80-90% of course PDFs (deep navigation)

### **PDF Discovery Types**
1. **Module Item PDFs**: PDFs attached to specific module items
2. **Assignment Attachments**: PDFs attached to assignment descriptions
3. **Page Embedded PDFs**: PDFs embedded in Canvas pages
4. **File Browser PDFs**: PDFs in course file directories
5. **Lecture Material PDFs**: PDFs in folders/subfolders

### **Technical Benefits**
1. **State Persistence**: Survives page reloads and navigation
2. **Progress Tracking**: Can resume interrupted crawls
3. **Smart Prioritization**: Visits high-value pages first
4. **Error Recovery**: Handles navigation failures gracefully
5. **Canvas SPA Compatibility**: Works with Canvas single-page application behavior

## **Implementation Timeline**

1. **Phase 1** (Day 1): State management infrastructure
2. **Phase 2** (Day 2): Navigation queue and smart navigator
3. **Phase 3** (Day 3): Enhanced page scanning with state integration
4. **Phase 4** (Day 4): Content script integration and testing
5. **Phase 5** (Day 5): Error handling and polish

## **Testing Strategy**

1. **Unit Tests**: Test state persistence and queue management
2. **Integration Tests**: Test navigation and scanning flow
3. **Course Tests**: Test on various Canvas course structures
4. **Edge Case Tests**: Test error handling and recovery

This implementation should solve the deep PDF crawling problem by actually navigating to Canvas pages while maintaining crawler state across navigation events.