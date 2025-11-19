// ============================================================================
// SMART NAVIGATION CONTROLLER
// Handles actual navigation with state persistence
// ============================================================================

/**
 * Manages smart navigation with state persistence across page loads
 */
class SmartNavigator {
  constructor(stateManager, queueManager, errorHandler) {
    this.stateManager = stateManager;
    this.queueManager = queueManager;
    this.errorHandler = errorHandler;
    this.isNavigating = false;
    this.navigationTimeout = null;
  }
  
  /**
   * Navigate to a specific URL and handle state persistence
   */
  async navigateToUrl(url) {
    if (this.isNavigating) {
      console.log('⏳ Navigation already in progress, skipping...');
      return false;
    }
    
    this.isNavigating = true;
    console.log(`🧭 Smart navigation to: ${url}`);
    
    try {
      // Update state before navigation
      const state = await this.stateManager.loadState();
      if (!state || !state.isActive) {
        console.log('⚠️ Crawler not active, canceling navigation');
        return false;
      }
      
      state.lastNavigationTime = Date.now();
      state.currentUrl = url;
      state.navigationAttempts++;
      
      await this.stateManager.saveState(state);
      
      // Check if we're already on the target page
      if (this.isAlreadyOnPage(url)) {
        console.log(`✅ Already on target page: ${url}`);
        this.isNavigating = false;
        return true; // Already on page, can scan immediately
      }
      
      // Set navigation timeout
      this.setNavigationTimeout(url);
      
      // Perform navigation
      console.log(`📍 Navigating from ${window.location.href} to ${url}`);
      window.location.href = url;
      
      // Execution stops here - new content script instance will load
      return false; // Navigation initiated, waiting for new page load
      
    } catch (error) {
      console.error('❌ Navigation error:', error);
      await this.errorHandler.handleNavigationFailure(url, error);
      this.isNavigating = false;
      return false;
    }
  }
  
  /**
   * Process the navigation queue systematically
   */
  async processNavigationQueue() {
    const state = await this.stateManager.loadState();
    if (!state || !state.isActive) {
      console.log('⚠️ Crawler not active, cannot process queue');
      return;
    }
    
    // Check navigation limits
    if (state.navigationAttempts >= state.maxNavigationAttempts) {
      console.log('🛑 Max navigation attempts reached, stopping crawler');
      await this.stopCrawler('max_attempts_reached');
      return;
    }
    
    // Get next URL to visit
    const nextItem = await this.queueManager.getNextUrl();
    if (!nextItem) {
      console.log('🎉 Navigation queue empty, crawler complete!');
      await this.stopCrawler('queue_complete');
      return;
    }
    
    console.log(`📋 Processing queue item: ${nextItem.url} (Priority: ${nextItem.priority}, Phase: ${nextItem.phase})`);
    
    // Navigate to next URL
    const navigated = await this.navigateToUrl(nextItem.url);
    
    if (navigated) {
      // Already on page, continue processing after scanning
      console.log('🔍 Already on target page, continuing queue processing...');
      setTimeout(() => this.processNavigationQueue(), 3000);
    }
    // If navigation initiated, the new content script instance will resume
  }
  
  /**
   * Stop the crawler and clean up
   */
  async stopCrawler(reason = 'manual_stop') {
    console.log(`🛑 Stopping crawler: ${reason}`);
    
    const state = await this.stateManager.loadState();
    if (state) {
      state.isActive = false;
      state.endTime = Date.now();
      state.completionStatus = reason === 'queue_complete' ? 'completed' : 'stopped';
      state.stopReason = reason;
      
      await this.stateManager.saveState(state);
      
      // Report final results
      await this.reportCrawlComplete(state);
    }
    
    // Clear navigation timeout
    if (this.navigationTimeout) {
      clearTimeout(this.navigationTimeout);
    }
    
    this.isNavigating = false;
  }
  
  /**
   * Resume crawler session after page navigation
   */
  async resumeCrawlerSession() {
    const state = await this.stateManager.loadState();
    if (!state || !state.isActive) {
      console.log('📋 No active crawler session to resume');
      return false;
    }
    
    console.log(`🔄 Resuming crawler session: ${state.sessionId}`);
    console.log(`📊 Progress: ${state.pagesVisited} pages visited, ${state.pdfsFound} PDFs found`);
    
    // Clear navigation timeout since we successfully loaded
    if (this.navigationTimeout) {
      clearTimeout(this.navigationTimeout);
    }
    
    // Mark current URL as visited if it was the target
    if (state.currentUrl && this.isAlreadyOnPage(state.currentUrl)) {
      await this.queueManager.markUrlVisited(window.location.href);
    }
    
    // Small delay to let page fully load
    setTimeout(() => {
      this.processNavigationQueue();
    }, 2000);
    
    return true;
  }
  
  /**
   * Check if we're already on the target page
   */
  isAlreadyOnPage(targetUrl) {
    const currentUrl = window.location.href;
    
    // Exact match
    if (currentUrl === targetUrl) return true;
    
    // URL starts with target (for query parameters)
    if (currentUrl.startsWith(targetUrl)) return true;
    
    // Same pathname (ignoring query/hash)
    try {
      const currentPath = new URL(currentUrl).pathname;
      const targetPath = new URL(targetUrl).pathname;
      return currentPath === targetPath;
    } catch {
      return false;
    }
  }
  
  /**
   * Set navigation timeout to handle stuck navigations
   */
  setNavigationTimeout(url) {
    if (this.navigationTimeout) {
      clearTimeout(this.navigationTimeout);
    }
    
    this.navigationTimeout = setTimeout(async () => {
      console.warn(`⏰ Navigation timeout for: ${url}`);
      await this.errorHandler.handleNavigationTimeout(url);
      this.isNavigating = false;
      
      // Try to continue with next item
      setTimeout(() => this.processNavigationQueue(), 1000);
    }, 15000); // 15 second timeout
  }
  
  /**
   * Report crawl completion to popup and background
   */
  async reportCrawlComplete(state) {
    const finalStats = await this.queueManager.getQueueStats();
    const duration = state.endTime - state.startTime;
    
    const report = {
      sessionId: state.sessionId,
      courseId: state.courseId,
      courseName: state.courseName,
      completionStatus: state.completionStatus,
      stopReason: state.stopReason,
      duration: duration,
      pagesVisited: state.pagesVisited,
      pdfsFound: state.pdfsFound,
      foundPDFs: Array.from(state.foundPDFs),
      failedUrls: state.failedUrls,
      queueStats: finalStats,
      timestamp: Date.now()
    };
    
    console.log('📊 Final crawler report:', report);
    
    // Send to background script for popup notification
    try {
      chrome.runtime.sendMessage({
        type: 'SMART_CRAWL_COMPLETE',
        report: report
      });
    } catch (error) {
      console.warn('⚠️ Could not send completion report to background:', error);
    }
    
    // Store final PDFs for this course
    if (state.foundPDFs.size > 0) {
      chrome.runtime.sendMessage({
        type: 'FOUND_PDFS',
        courseId: state.courseId,
        courseName: state.courseName,
        pdfs: Array.from(state.foundPDFs).map(url => ({
          url: url,
          title: this.extractTitleFromUrl(url),
          source: 'smart_navigation_crawler',
          foundAt: Date.now()
        })),
        pageUrl: window.location.href,
        crawlReport: report
      });
    }
  }
  
  /**
   * Extract a reasonable title from a PDF URL
   */
  extractTitleFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/');
      
      // Look for filename-like segment
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (segment && (segment.includes('.') || segment.length > 3)) {
          return decodeURIComponent(segment).replace(/[_-]/g, ' ');
        }
      }
      
      return 'Canvas PDF';
    } catch {
      return 'Canvas PDF';
    }
  }
  
  /**
   * Get current crawl progress for UI updates
   */
  async getCrawlProgress() {
    const state = await this.stateManager.loadState();
    if (!state) return null;
    
    const queueStats = await this.queueManager.getQueueStats();
    const duration = Date.now() - state.startTime;
    
    return {
      isActive: state.isActive,
      sessionId: state.sessionId,
      currentPhase: state.currentPhase,
      pagesVisited: state.pagesVisited,
      pdfsFound: state.pdfsFound,
      queueStats: queueStats,
      duration: duration,
      lastError: state.lastError,
      completionStatus: state.completionStatus
    };
  }
  
  /**
   * Build initial navigation queue with prioritized Canvas pages
   */
  async buildInitialNavigationQueue(courseId) {
    const baseUrl = `${window.location.origin}/courses/${courseId}`;
    
    // Define priority pages to visit (lower priority number = higher priority)
    const priorityPages = [
      { url: `${baseUrl}/modules`, priority: 1, phase: 'modules' },
      { url: `${baseUrl}/files`, priority: 2, phase: 'files' },
      { url: `${baseUrl}/assignments`, priority: 3, phase: 'assignments' },
      { url: `${baseUrl}/pages`, priority: 4, phase: 'pages' },
      { url: `${baseUrl}/syllabus`, priority: 5, phase: 'syllabus' }
    ];
    
    console.log(`📋 Building initial navigation queue for course ${courseId}...`);
    
    let added = 0;
    for (const page of priorityPages) {
      const success = await this.queueManager.addToQueue(
        page.url, 
        page.priority, 
        page.phase,
        { isInitialPage: true }
      );
      if (success) added++;
    }
    
    console.log(`✅ Built initial navigation queue: ${added}/${priorityPages.length} pages added`);
    return added;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SmartNavigator };
}