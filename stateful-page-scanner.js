// ============================================================================
// STATEFUL PAGE SCANNER
// Enhanced PDF scanning with state persistence and dynamic link discovery
// ============================================================================

/**
 * Enhanced page scanner that integrates with state management for deep crawling
 */
class StatefulPageScanner {
  constructor(stateManager, queueManager) {
    this.stateManager = stateManager;
    this.queueManager = queueManager;
    this.scanTimeout = 30000; // 30 second timeout for page scanning
  }
  
  /**
   * Scan current page thoroughly and update state
   */
  async scanCurrentPage() {
    const startTime = Date.now();
    console.log(`🔍 Starting comprehensive page scan: ${window.location.href}`);
    
    try {
      // Wait for page to fully load
      await this.waitForPageLoad();
      
      // Expand all collapsible content
      await this.expandAllContent();
      
      // Scan for PDFs using multiple methods
      const pdfs = await this.findPDFsOnPage();
      
      // Find additional URLs to explore
      const newUrls = await this.findLinksToExplore();
      
      // Update persistent state
      await this.updateCrawlerState(pdfs, newUrls);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Page scan completed in ${duration}ms: ${pdfs.length} PDFs found, ${newUrls.length} new URLs queued`);
      
      return {
        pdfsFound: pdfs.length,
        urlsQueued: newUrls.length,
        duration: duration
      };
      
    } catch (error) {
      console.error('❌ Page scan failed:', error);
      
      // Update state with error
      const state = await this.stateManager.loadState();
      if (state) {
        state.lastError = {
          url: window.location.href,
          error: error.message,
          timestamp: Date.now()
        };
        await this.stateManager.saveState(state);
      }
      
      return { pdfsFound: 0, urlsQueued: 0, duration: Date.now() - startTime };
    }
  }
  
  /**
   * Wait for page to fully load with timeout
   */
  async waitForPageLoad() {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000); // 5 second max wait
      
      if (document.readyState === 'complete') {
        clearTimeout(timeout);
        resolve();
        return;
      }
      
      const checkReadyState = () => {
        if (document.readyState === 'complete') {
          clearTimeout(timeout);
          document.removeEventListener('readystatechange', checkReadyState);
          resolve();
        }
      };
      
      document.addEventListener('readystatechange', checkReadyState);
    });
  }
  
  /**
   * Expand all collapsible content on the page
   */
  async expandAllContent() {
    console.log('📖 Expanding all collapsible content...');
    
    // Canvas-specific expansion selectors
    const expansionSelectors = [
      '.expand_module_link',      // Module expand buttons
      '.collapse_module_link',    // Module collapse buttons (to ensure expanded)
      'button[aria-expanded="false"]', // Generic ARIA expanded buttons
      '.expandable-toggle',       // Generic expandable toggles
      '.accordion-toggle',        // Accordion toggles
      '.show-more',              // Show more buttons
      '.load-more',              // Load more buttons
      '.btn-show-more'           // Button show more
    ];
    
    let expandedCount = 0;
    
    for (const selector of expansionSelectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`Found ${elements.length} elements for selector: ${selector}`);
      
      for (const element of elements) {
        try {
          if (element && element.isConnected && element.offsetParent !== null) {
            // Check if element needs expanding
            const needsExpansion = this.elementNeedsExpansion(element);
            
            if (needsExpansion) {
              element.click();
              expandedCount++;
              await this.wait(200); // Small delay between clicks
            }
          }
        } catch (error) {
          console.log(`Could not expand element: ${error.message}`);
        }
      }
    }
    
    // Special handling for Canvas modules
    await this.expandCanvasModules();
    
    // Special handling for file folders
    if (window.location.pathname.includes('/files')) {
      await this.expandFileFolders();
    }
    
    console.log(`✅ Expanded ${expandedCount} elements`);
    
    // Wait for expansion animations and content loading
    await this.wait(2000);
  }
  
  /**
   * Check if an element needs expansion
   */
  elementNeedsExpansion(element) {
    // Check ARIA expanded state
    if (element.getAttribute('aria-expanded') === 'false') return true;
    
    // Check class names
    if (element.classList.contains('collapsed')) return true;
    if (element.classList.contains('expand_module_link')) return true;
    
    // Check button text
    const text = element.textContent?.toLowerCase() || '';
    if (text.includes('expand') || text.includes('show more') || text.includes('load more')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Expand Canvas modules specifically
   */
  async expandCanvasModules() {
    console.log('📚 Expanding Canvas modules...');
    
    // Find module headers and click them if collapsed
    const moduleHeaders = document.querySelectorAll('.context_module .header, .module-header');
    
    for (const header of moduleHeaders) {
      try {
        const module = header.closest('.context_module');
        if (module && module.classList.contains('collapsed')) {
          header.click();
          await this.wait(300);
        }
      } catch (error) {
        console.log('Could not expand module:', error.message);
      }
    }
  }
  
  /**
   * Expand file folders in Canvas files section
   */
  async expandFileFolders() {
    console.log('📁 Expanding file folders...');
    
    const folderLinks = document.querySelectorAll('.folder .header, .folder-toggle, .ef-item-row[aria-expanded="false"]');
    
    for (const folder of folderLinks) {
      try {
        if (folder.getAttribute('aria-expanded') === 'false') {
          folder.click();
          await this.wait(500);
        }
      } catch (error) {
        console.log('Could not expand folder:', error.message);
      }
    }
  }
  
  /**
   * Find PDFs on current page using comprehensive methods
   */
  async findPDFsOnPage() {
    console.log('🔎 Searching for PDFs on current page...');
    
    const foundPDFs = new Set();
    
    // Method 1: Direct PDF links
    this.findDirectPDFLinks(foundPDFs);
    
    // Method 2: Canvas file links
    this.findCanvasFileLinks(foundPDFs);
    
    // Method 3: Module item attachments
    this.findModuleItemAttachments(foundPDFs);
    
    // Method 4: Assignment attachments
    this.findAssignmentAttachments(foundPDFs);
    
    // Method 5: Embedded iframe PDFs
    this.findEmbeddedPDFs(foundPDFs);
    
    // Method 6: Download links
    this.findDownloadLinks(foundPDFs);
    
    const uniquePDFs = Array.from(foundPDFs).filter(pdf => pdf && pdf.url);
    console.log(`📄 Found ${uniquePDFs.length} unique PDFs on current page`);
    
    return uniquePDFs;
  }
  
  /**
   * Find direct PDF links (href ends with .pdf)
   */
  findDirectPDFLinks(foundPDFs) {
    const directLinks = document.querySelectorAll('a[href$=".pdf"], a[href*=".pdf?"], a[href*=".pdf#"]');
    
    directLinks.forEach(link => {
      const pdf = this.createPDFObject(link, 'direct_link');
      if (pdf) foundPDFs.add(pdf);
    });
  }
  
  /**
   * Find Canvas file links
   */
  findCanvasFileLinks(foundPDFs) {
    const canvasSelectors = [
      '.instructure_file_link_holder a',
      '.instructure_file_holder a',
      'a[href*="/files/"]',
      'a.inline_disabled[href*="/files/"]',
      'a[data-id][href*="/files/"]'
    ];
    
    canvasSelectors.forEach(selector => {
      const links = document.querySelectorAll(selector);
      links.forEach(link => {
        if (this.isPDFLink(link.href, link.textContent)) {
          const pdf = this.createPDFObject(link, 'canvas_file');
          if (pdf) foundPDFs.add(pdf);
        }
      });
    });
  }
  
  /**
   * Find module item attachments
   */
  findModuleItemAttachments(foundPDFs) {
    const moduleItems = document.querySelectorAll('.context_module_item');
    
    moduleItems.forEach(item => {
      const links = item.querySelectorAll('a[href]');
      links.forEach(link => {
        if (this.isPDFLink(link.href, link.textContent)) {
          const pdf = this.createPDFObject(link, 'module_item', {
            moduleTitle: this.getModuleTitle(item),
            itemType: this.getModuleItemType(item)
          });
          if (pdf) foundPDFs.add(pdf);
        }
      });
    });
  }
  
  /**
   * Find assignment attachments
   */
  findAssignmentAttachments(foundPDFs) {
    if (!window.location.pathname.includes('/assignments/')) return;
    
    const attachmentSelectors = [
      '.attachment a',
      '.file-upload a',
      '.submission-attachment a',
      '.user_content a[href*=".pdf"]',
      '.assignment-description a[href*=".pdf"]'
    ];
    
    attachmentSelectors.forEach(selector => {
      const links = document.querySelectorAll(selector);
      links.forEach(link => {
        if (this.isPDFLink(link.href, link.textContent)) {
          const pdf = this.createPDFObject(link, 'assignment_attachment');
          if (pdf) foundPDFs.add(pdf);
        }
      });
    });
  }
  
  /**
   * Find embedded PDFs in iframes
   */
  findEmbeddedPDFs(foundPDFs) {
    const iframes = document.querySelectorAll('iframe[src*=".pdf"], iframe[src*="/files/"]');
    
    iframes.forEach(iframe => {
      const src = iframe.src;
      if (src && this.isPDFLink(src)) {
        const pdf = {
          url: src,
          title: this.extractTitleFromContext(iframe) || 'Embedded PDF',
          source: 'embedded_iframe',
          context: this.getElementContext(iframe)
        };
        foundPDFs.add(pdf);
      }
    });
  }
  
  /**
   * Find download links that might be PDFs
   */
  findDownloadLinks(foundPDFs) {
    const downloadLinks = document.querySelectorAll('a[href*="/download"], a[download]');
    
    downloadLinks.forEach(link => {
      const href = link.href;
      const text = link.textContent?.toLowerCase() || '';
      
      if (href.includes('/files/') || text.includes('pdf') || link.hasAttribute('download')) {
        const pdf = this.createPDFObject(link, 'download_link');
        if (pdf) foundPDFs.add(pdf);
      }
    });
  }
  
  /**
   * Create a standardized PDF object
   */
  createPDFObject(element, sourceType, metadata = {}) {
    const href = element.href || element.src;
    if (!href) return null;
    
    // Skip template URLs
    if (href.includes('{{') || href.includes('%7B%7B')) return null;
    
    const title = this.extractPDFTitle(element, metadata);
    const context = this.getElementContext(element);
    
    return {
      url: href,
      title: title,
      source: sourceType,
      context: context,
      foundAt: Date.now(),
      pageUrl: window.location.href,
      ...metadata
    };
  }
  
  /**
   * Extract meaningful title for PDF
   */
  extractPDFTitle(element, metadata = {}) {
    // Try multiple sources for title
    const candidates = [
      element.textContent?.trim(),
      element.title,
      element.getAttribute('data-title'),
      element.getAttribute('aria-label'),
      metadata.moduleTitle,
      this.extractTitleFromUrl(element.href || element.src)
    ].filter(Boolean);
    
    for (const candidate of candidates) {
      if (candidate && candidate.length > 2 && !candidate.includes('{{')) {
        return candidate.substring(0, 100); // Limit title length
      }
    }
    
    return 'Canvas PDF';
  }
  
  /**
   * Extract title from URL
   */
  extractTitleFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/');
      
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (segment && segment.includes('.')) {
          return decodeURIComponent(segment).replace(/[-_]/g, ' ');
        }
      }
    } catch (error) {
      // Ignore URL parsing errors
    }
    
    return null;
  }
  
  /**
   * Check if a link is likely a PDF
   */
  isPDFLink(url, text = '') {
    if (!url) return false;
    
    const lowerUrl = url.toLowerCase();
    const lowerText = text.toLowerCase();
    
    // Direct PDF indicators
    if (lowerUrl.includes('.pdf')) return true;
    if (lowerText.includes('pdf')) return true;
    
    // Canvas file indicators
    if (lowerUrl.includes('/files/') && (
      lowerText.includes('pdf') ||
      lowerText.includes('document') ||
      lowerUrl.includes('download')
    )) return true;
    
    return false;
  }
  
  /**
   * Get context information for an element
   */
  getElementContext(element) {
    const context = {};
    
    // Module context
    const moduleItem = element.closest('.context_module_item');
    if (moduleItem) {
      context.moduleTitle = this.getModuleTitle(moduleItem);
      context.itemType = this.getModuleItemType(moduleItem);
    }
    
    // Assignment context
    if (window.location.pathname.includes('/assignments/')) {
      context.assignmentTitle = document.querySelector('.assignment-title, h1')?.textContent?.trim();
    }
    
    // Page context
    if (window.location.pathname.includes('/pages/')) {
      context.pageTitle = document.querySelector('.page-title, h1')?.textContent?.trim();
    }
    
    return context;
  }
  
  /**
   * Find additional URLs to explore
   */
  async findLinksToExplore() {
    console.log('🔗 Finding additional URLs to explore...');
    
    const linksToExplore = [];
    const currentUrl = window.location.href;
    
    // High priority: Module items
    this.addModuleItemLinks(linksToExplore, currentUrl);
    
    // Medium priority: Assignment links
    this.addAssignmentLinks(linksToExplore, currentUrl);
    
    // Medium priority: Page links
    this.addPageLinks(linksToExplore, currentUrl);
    
    // Lower priority: File folder links
    this.addFileFolderLinks(linksToExplore, currentUrl);
    
    // Remove duplicates and invalid URLs
    const uniqueLinks = this.deduplicateLinks(linksToExplore);
    
    console.log(`🔗 Found ${uniqueLinks.length} unique URLs to explore`);
    return uniqueLinks;
  }
  
  /**
   * Add module item links to exploration queue
   */
  addModuleItemLinks(links, currentUrl) {
    const moduleItemSelectors = [
      '.context_module_item a[href*="/assignments/"]',
      '.context_module_item a[href*="/pages/"]',
      '.context_module_item a[href*="/files/"]',
      '.context_module_item a[href*="/external_tools/"]'
    ];
    
    moduleItemSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(link => {
        const href = this.normalizeUrl(link.href);
        if (href && href !== currentUrl && this.isValidExplorationUrl(href)) {
          links.push({
            url: href,
            priority: 2, // High priority
            phase: 'module_items',
            title: link.textContent?.trim(),
            source: 'module_item'
          });
        }
      });
    });
  }
  
  /**
   * Add assignment links to exploration queue
   */
  addAssignmentLinks(links, currentUrl) {
    const assignmentLinks = document.querySelectorAll('a[href*="/assignments/"]');
    
    assignmentLinks.forEach(link => {
      const href = this.normalizeUrl(link.href);
      if (href && href !== currentUrl && this.isValidExplorationUrl(href)) {
        links.push({
          url: href,
          priority: 3, // Medium priority
          phase: 'assignments',
          title: link.textContent?.trim(),
          source: 'assignment_link'
        });
      }
    });
  }
  
  /**
   * Add page links to exploration queue
   */
  addPageLinks(links, currentUrl) {
    const pageLinks = document.querySelectorAll('a[href*="/pages/"]');
    
    pageLinks.forEach(link => {
      const href = this.normalizeUrl(link.href);
      if (href && href !== currentUrl && this.isValidExplorationUrl(href)) {
        links.push({
          url: href,
          priority: 4, // Medium priority
          phase: 'pages',
          title: link.textContent?.trim(),
          source: 'page_link'
        });
      }
    });
  }
  
  /**
   * Add file folder links to exploration queue
   */
  addFileFolderLinks(links, currentUrl) {
    const folderLinks = document.querySelectorAll('a[href*="/files/folder/"], .folder a[href*="/files/"]');
    
    folderLinks.forEach(link => {
      const href = this.normalizeUrl(link.href);
      if (href && href !== currentUrl && this.isValidExplorationUrl(href) && !href.includes('.pdf')) {
        links.push({
          url: href,
          priority: 5, // Lower priority
          phase: 'file_folders',
          title: link.textContent?.trim(),
          source: 'folder_link'
        });
      }
    });
  }
  
  /**
   * Update crawler state with found PDFs and new URLs
   */
  async updateCrawlerState(pdfs, newUrls) {
    const state = await this.stateManager.loadState();
    if (!state) return;
    
    // Add found PDFs to state
    let newPDFCount = 0;
    pdfs.forEach(pdf => {
      if (!Array.from(state.foundPDFs).some(existing => existing.url === pdf.url)) {
        state.foundPDFs.add(pdf);
        newPDFCount++;
      }
    });
    
    // Add new URLs to queue
    let newURLCount = 0;
    for (const urlInfo of newUrls) {
      const added = await this.queueManager.addToQueue(
        urlInfo.url, 
        urlInfo.priority, 
        urlInfo.phase,
        { title: urlInfo.title, source: urlInfo.source }
      );
      if (added) newURLCount++;
    }
    
    // Mark current URL as visited
    await this.queueManager.markUrlVisited(window.location.href);
    
    // Update stats
    state.pdfsFound = state.foundPDFs.size;
    state.lastActivityTime = Date.now();
    
    await this.stateManager.saveState(state);
    
    console.log(`📊 State updated: +${newPDFCount} PDFs, +${newURLCount} URLs queued`);
  }
  
  /**
   * Helper methods
   */
  
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      urlObj.hash = '';
      return urlObj.href;
    } catch {
      return null;
    }
  }
  
  isValidExplorationUrl(url) {
    if (!url || !url.includes('/courses/')) return false;
    
    const skipPatterns = [
      '/quizzes/',
      '/discussion_topics/',
      '/announcements/',
      '/gradebook',
      '/grades',
      '/users/',
      '.pdf'
    ];
    
    return !skipPatterns.some(pattern => url.includes(pattern));
  }
  
  deduplicateLinks(links) {
    const seen = new Set();
    return links.filter(link => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
  }
  
  getModuleTitle(moduleItem) {
    const module = moduleItem.closest('.context_module');
    return module?.querySelector('.header .name, .module-title')?.textContent?.trim();
  }
  
  getModuleItemType(moduleItem) {
    const classList = Array.from(moduleItem.classList);
    for (const className of classList) {
      if (className.endsWith('_item')) {
        return className.replace('_item', '');
      }
    }
    return 'unknown';
  }
  
  extractTitleFromContext(element) {
    const parent = element.parentElement;
    if (!parent) return null;
    
    // Look for nearby text that might be a title
    const titleElements = parent.querySelectorAll('.title, .name, h1, h2, h3, h4, h5, h6');
    for (const titleEl of titleElements) {
      const text = titleEl.textContent?.trim();
      if (text && text.length > 2) return text;
    }
    
    return null;
  }
  
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StatefulPageScanner };
}