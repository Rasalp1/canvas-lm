// ============================================================================
// SMART NAVIGATION WITH STATE PERSISTENCE (Option 2)
// State Management Infrastructure
// ============================================================================

/**
 * Manages persistent crawler state across page navigations using chrome.storage
 */
class CrawlerStateManager {
  constructor() {
    this.storageKey = 'canvas_crawler_state';
    this.sessionId = this.generateSessionId();
  }
  
  generateSessionId() {
    return 'crawl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  /**
   * Save crawler state to chrome.storage
   */
  async saveState(state) {
    try {
      // Convert Sets to Arrays for JSON serialization
      const serializedState = {
        ...state,
        foundPDFs: Array.from(state.foundPDFs || []),
        visitedUrls: Array.from(state.visitedUrls || [])
      };
      
      await chrome.storage.local.set({ [this.storageKey]: serializedState });
      console.log('💾 Crawler state saved successfully');
    } catch (error) {
      console.error('❌ Failed to save crawler state:', error);
    }
  }
  
  /**
   * Load crawler state from chrome.storage
   */
  async loadState() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const state = result[this.storageKey];
      
      if (!state) {
        console.log('📋 No existing crawler state found');
        return null;
      }
      
      // Convert Arrays back to Sets
      const deserializedState = {
        ...state,
        foundPDFs: new Set(state.foundPDFs || []),
        visitedUrls: new Set(state.visitedUrls || [])
      };
      
      console.log('📋 Crawler state loaded successfully:', {
        sessionId: deserializedState.sessionId,
        isActive: deserializedState.isActive,
        pagesVisited: deserializedState.pagesVisited,
        pdfsFound: deserializedState.pdfsFound,
        queueLength: deserializedState.navigationQueue?.length || 0
      });
      
      return deserializedState;
    } catch (error) {
      console.error('❌ Failed to load crawler state:', error);
      return null;
    }
  }
  
  /**
   * Clear crawler state from storage
   */
  async clearState() {
    try {
      await chrome.storage.local.remove(this.storageKey);
      console.log('🗑️ Crawler state cleared');
    } catch (error) {
      console.error('❌ Failed to clear crawler state:', error);
    }
  }
  
  /**
   * Create initial crawler state
   */
  createInitialState(courseId, courseName) {
    return {
      sessionId: this.sessionId,
      isActive: true,
      currentPhase: 'initialization',
      courseId: courseId,
      courseName: courseName,
      
      // Navigation queue
      navigationQueue: [],
      currentUrlIndex: 0,
      
      // Results
      foundPDFs: new Set(),
      visitedUrls: new Set(),
      
      // Progress tracking
      startTime: Date.now(),
      lastNavigationTime: Date.now(),
      lastActivityTime: Date.now(),
      pagesVisited: 0,
      pdfsFound: 0,
      
      // Configuration
      maxNavigationAttempts: 50,
      navigationAttempts: 0,
      pageLoadTimeoutMs: 15000,
      
      // Error handling
      maxRetries: 3,
      currentRetries: 0,
      failedUrls: [],
      
      // Status
      lastError: null,
      completionStatus: 'in_progress' // 'in_progress', 'completed', 'failed', 'stopped'
    };
  }
}

/**
 * Manages the navigation queue and URL prioritization
 */
class NavigationQueueManager {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }
  
  /**
   * Add URL to navigation queue with priority and phase information
   */
  async addToQueue(url, priority = 5, phase = 'general', metadata = {}) {
    const state = await this.stateManager.loadState();
    if (!state || !state.isActive) {
      console.log('⚠️ Cannot add to queue: crawler not active');
      return false;
    }
    
    // Normalize URL
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl || !this.isValidCanvasUrl(normalizedUrl)) {
      console.log('⚠️ Skipping invalid URL:', url);
      return false;
    }
    
    // Avoid duplicates
    if (state.visitedUrls.has(normalizedUrl) || 
        state.navigationQueue.some(item => item.url === normalizedUrl)) {
      console.log('⏭️ URL already in queue or visited:', normalizedUrl);
      return false;
    }
    
    // Add to queue
    const queueItem = {
      url: normalizedUrl,
      priority: priority,
      phase: phase,
      visited: false,
      addedAt: Date.now(),
      metadata: metadata
    };
    
    state.navigationQueue.push(queueItem);
    
    // Sort by priority (lower number = higher priority)
    state.navigationQueue.sort((a, b) => a.priority - b.priority);
    
    await this.stateManager.saveState(state);
    console.log(`➕ Added to queue [Priority ${priority}]: ${normalizedUrl}`);
    return true;
  }
  
  /**
   * Get next URL to visit from the queue
   */
  async getNextUrl() {
    const state = await this.stateManager.loadState();
    if (!state || !state.isActive) {
      return null;
    }
    
    // Find next unvisited URL
    const nextItem = state.navigationQueue.find(item => !item.visited);
    return nextItem || null;
  }
  
  /**
   * Mark URL as visited
   */
  async markUrlVisited(url) {
    const state = await this.stateManager.loadState();
    if (!state) return;
    
    const normalizedUrl = this.normalizeUrl(url);
    state.visitedUrls.add(normalizedUrl);
    
    // Mark in queue as well
    const queueItem = state.navigationQueue.find(item => item.url === normalizedUrl);
    if (queueItem) {
      queueItem.visited = true;
      queueItem.visitedAt = Date.now();
    }
    
    state.pagesVisited++;
    state.lastActivityTime = Date.now();
    
    await this.stateManager.saveState(state);
    console.log(`✅ Marked as visited: ${normalizedUrl}`);
  }
  
  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const state = await this.stateManager.loadState();
    if (!state) return null;
    
    const total = state.navigationQueue.length;
    const visited = state.navigationQueue.filter(item => item.visited).length;
    const remaining = total - visited;
    
    return {
      total,
      visited,
      remaining,
      progress: total > 0 ? (visited / total * 100).toFixed(1) : 0
    };
  }
  
  /**
   * Normalize URL for consistent comparison
   */
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      // Remove hash and some query parameters
      urlObj.hash = '';
      return urlObj.href;
    } catch (error) {
      console.warn('⚠️ Failed to normalize URL:', url, error);
      return null;
    }
  }
  
  /**
   * Check if URL is a valid Canvas URL worth visiting
   */
  isValidCanvasUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Must be Canvas URL
    if (!url.includes('/courses/')) return false;
    
    // Skip certain URL patterns
    const skipPatterns = [
      '/quizzes/',
      '/discussion_topics/',
      '/announcements/',
      '/gradebook',
      '/grades',
      '/users/',
      '/calendar',
      '.pdf', // Don't navigate to PDFs, just collect them
      '/download',
      '/preview'
    ];
    
    return !skipPatterns.some(pattern => url.includes(pattern));
  }
}

/**
 * Detects navigation events and triggers appropriate responses
 */
class NavigationDetector {
  constructor(callback) {
    this.lastUrl = window.location.href;
    this.callback = callback;
    this.setupNavigationListener();
  }
  
  setupNavigationListener() {
    // Monitor for URL changes (Canvas SPA navigation)
    const checkUrlChange = () => {
      if (window.location.href !== this.lastUrl) {
        const oldUrl = this.lastUrl;
        this.lastUrl = window.location.href;
        console.log(`🔄 Navigation detected: ${oldUrl} → ${this.lastUrl}`);
        this.callback('url_changed', { from: oldUrl, to: this.lastUrl });
      }
    };
    
    // Check every 500ms for URL changes
    setInterval(checkUrlChange, 500);
    
    // Also listen for page load events
    window.addEventListener('load', () => {
      console.log('📄 Page load event detected');
      this.callback('page_loaded', { url: window.location.href });
    });
    
    // Listen for page visibility changes (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        console.log('👁️ Page became visible');
        this.callback('page_visible', { url: window.location.href });
      }
    });
  }
}

/**
 * Handles navigation errors and recovery strategies
 */
class NavigationErrorHandler {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }
  
  async handleNavigationFailure(url, error) {
    console.error(`❌ Navigation failed for ${url}:`, error);
    
    const state = await this.stateManager.loadState();
    if (!state) return;
    
    // Record the failure
    state.failedUrls.push({
      url: url,
      error: error.message || error.toString(),
      timestamp: Date.now(),
      attempt: state.currentRetries + 1
    });
    
    state.currentRetries++;
    state.lastError = {
      url: url,
      error: error.message || error.toString(),
      timestamp: Date.now()
    };
    
    // Check if we should stop the crawler
    if (state.currentRetries >= state.maxRetries) {
      console.log('🛑 Max retries reached, stopping crawler');
      state.isActive = false;
      state.completionStatus = 'failed';
    }
    
    await this.stateManager.saveState(state);
  }
  
  async handleNavigationTimeout(url) {
    const error = new Error(`Navigation timeout after ${15000}ms`);
    await this.handleNavigationFailure(url, error);
  }
}

// Export for use in main content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CrawlerStateManager,
    NavigationQueueManager,
    NavigationDetector,
    NavigationErrorHandler
  };
}