// content-script.js - Runs on Canvas pages to detect and extract content

console.log('Canvas RAG Assistant: Content script file loaded');

// Canvas course information detector and PDF scraper
class CanvasContentScript {
  constructor() {
    console.log('Canvas RAG Assistant: Initializing content script on:', location.href);
    this.courseId = this.extractCourseId();
    this.courseName = this.extractCourseName();
    
    // Initialize deep crawling infrastructure (legacy DOM mining)
    this.deepCrawlState = {
      fetchQueue: new Map(), // URL -> {level, priority, type, parentUrl}
      fetchedUrls: new Set(),
      maxDepth: 3,
      maxConcurrentRequests: 3,
      activeRequests: 0,
      rateLimitDelay: 1000, // 1 second between requests
      lastRequestTime: 0
    };
    
    // Initialize smart navigation infrastructure (Option 2) - defer until classes are available
    setTimeout(() => {
      this.initializeSmartNavigation();
    }, 100);
    
    if (this.courseId) {
      console.log('Canvas RAG Assistant: ✅ Course detected!', {
        courseId: this.courseId,
        courseName: this.courseName,
        url: location.href
      });
    } else {
      console.log('Canvas RAG Assistant: ⚠️ No course ID found on this page');
    }
    this.lastUrl = location.href;
    this.init();
  }

  // Helper method to ensure deepCrawlState is properly initialized
  ensureDeepCrawlState() {
    if (!this.deepCrawlState) {
      console.error('❌ deepCrawlState was undefined, reinitializing...');
      this.deepCrawlState = {
        fetchQueue: new Map(),
        fetchedUrls: new Set(),
        maxDepth: 3,
        maxConcurrentRequests: 3,
        activeRequests: 0,
        rateLimitDelay: 1000,
        lastRequestTime: 0,
        foundPdfs: []
      };
    }
  }

  init() {
    try {
      console.log('Canvas RAG Assistant: Starting initialization...');
      
      // Check if we're resuming a smart navigation crawl session
      this.checkForSmartNavigationResume();
      
      // Always listen for messages from popup, regardless of course detection
      console.log('Canvas RAG Assistant: Setting up message listener...');
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('📨 Content script received message:', request.action);
        try {
          const result = this.handleMessage(request, sender, sendResponse);
          // Return true only if handleMessage indicates async response
          return result === true;
        } catch (error) {
          console.error('❌ Error in message listener:', error);
          console.error('   Error details:', error.stack);
          sendResponse({ error: error.message, stack: error.stack });
          return false;
        }
      });
      console.log('Canvas RAG Assistant: ✅ Message listener registered');
      
      // Initialize crawler state
      this.crawlerState = {
        isRunning: false,
        visitedUrls: new Set(),
        pendingUrls: [],
        foundPDFs: new Map(), // Map of URL -> {title, filename, context, type}
        currentStep: 'idle'
      };
      
      // Signal that content script is ready
      console.log('Canvas RAG Assistant: Content script initialized successfully');
      
      // Only run Canvas-specific features on Canvas course pages
      if (this.courseId) {
        console.log(`Canvas RAG Assistant: Detected course ${this.courseId} - ${this.courseName}`);
        
        // Store course info immediately for immediate access
        this.storeCourseInfo();
        
        // Use setTimeout only for heavy operations to avoid blocking the main thread
        setTimeout(() => {
          try {
            console.log('Canvas RAG Assistant: Course detected, waiting for user to start scan...');
            // Don't scan automatically - wait for user to click the start button
            // this.scanAndReportPDFs();
            
            // Set up mutation observer for single-page navigation
            this.setupNavigationObserver();
            console.log('Canvas RAG Assistant: Course initialization completed');
          } catch (asyncError) {
            console.error('Canvas RAG Assistant: Error in async initialization:', asyncError);
          }
        }, 100);
        
      } else {
        console.log('Canvas RAG Assistant: No course ID detected, but message listener is active');
      }
    } catch (error) {
      console.error('Canvas RAG Assistant: Error during initialization:', error);
    }
  }

  setupNavigationObserver() {
    const observer = new MutationObserver(() => {
      if (location.href !== this.lastUrl) {
        this.lastUrl = location.href;
        console.log('Canvas page navigation detected, waiting for user to start scan...');
        // Don't scan automatically on navigation
        // setTimeout(() => this.scanAndReportPDFs(), 1000);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ============================================================================
  // PHASE 1: INFRASTRUCTURE - Authenticated Fetch & HTML Parsing Utilities
  // ============================================================================

  async authenticatedFetch(url, options = {}) {
    // Ensure deepCrawlState is initialized
    this.ensureDeepCrawlState();
    
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.deepCrawlState.lastRequestTime;
    if (timeSinceLastRequest < this.deepCrawlState.rateLimitDelay) {
      await this.wait(this.deepCrawlState.rateLimitDelay - timeSinceLastRequest);
    }
    this.deepCrawlState.lastRequestTime = Date.now();

    try {
      console.log(`🌐 Fetching via background script: ${url}`);
      this.deepCrawlState.activeRequests++;

      // Use background script for authenticated cross-origin requests
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timeout after 30 seconds'));
        }, 30000);

        chrome.runtime.sendMessage({
          action: 'AUTHENTICATED_FETCH',
          url: url,
          options: options,
          referer: window.location.href
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });

      if (response.status === 429) {
        console.warn(`Rate limited on ${url}, increasing delay`);
        this.deepCrawlState.rateLimitDelay = Math.min(this.deepCrawlState.rateLimitDelay * 2, 5000);
        throw new Error(`Rate limited: ${response.status}`);
      } else if (response.status === 403) {
        throw new Error(`Access forbidden: ${response.status}`);
      } else if (response.status === 404) {
        throw new Error(`Not found: ${response.status}`);
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`✅ Fetched ${response.html.length} characters from ${url}`);
      return response.html;

    } catch (error) {
      console.error(`❌ Background fetch failed for ${url}:`, error.message);
      
      // Fallback: Try direct fetch if background script fails
      console.log(`🔄 Trying fallback direct fetch for ${url}...`);
      try {
        const fallbackOptions = {
          credentials: 'include',
          headers: {
            'User-Agent': navigator.userAgent,
            'Referer': window.location.href,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers
          },
          ...options
        };
        
        const response = await fetch(url, fallbackOptions);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        console.log(`✅ Fallback fetch successful: ${html.length} characters from ${url}`);
        return html;
        
      } catch (fallbackError) {
        console.error(`❌ Fallback fetch also failed for ${url}:`, fallbackError.message);
        throw new Error(`Both background and direct fetch failed: ${error.message} | ${fallbackError.message}`);
      }
    } finally {
      this.deepCrawlState.activeRequests--;
    }
  }

  parseHTMLForPDFs(html, sourceUrl) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const foundPDFs = [];

      // Canvas-specific selectors for better PDF detection
      const canvasSelectors = [
        '.context_module_item.attachment .item_link',  // Canvas attachments
        '.context_module_item .item_link',             // All module items
        '.instructure_file_link_holder a',             // Embedded file links (lectures, etc.)
        '.instructure_file_holder a',                  // File holder links
        'a.inline_disabled[href*="/files/"]',          // Canvas inline file links
        'a[data-id][href*="/files/"]',                 // Files with data-id attributes
        'a[href*="/files/"]',                          // Direct file links
        'a[href*="/modules/items/"]',                  // Module item links
        'a[href*=".pdf"]',                            // Direct PDF links
        'a[href*="/download"]'                        // Download links
      ];
      
      // Process Canvas-specific links first
      canvasSelectors.forEach(selector => {
        const links = doc.querySelectorAll(selector);
        links.forEach(a => {
          this.processParsedLink(a, sourceUrl, foundPDFs, 'canvas_specific');
        });
      });
      
      // Then process all other links for any patterns we missed
      const allLinks = doc.querySelectorAll('a[href]');
      allLinks.forEach(a => {
        const href = a.getAttribute('href');
        if (href && (href.includes('/files/') || href.includes('/modules/items/') || 
                     href.includes('.pdf') || href.includes('/download'))) {
          this.processParsedLink(a, sourceUrl, foundPDFs, 'general_scan');
        }
      });
      
      console.log(`📄 Extracted ${foundPDFs.length} PDFs from ${sourceUrl}`);
      return foundPDFs;

    } catch (error) {
      console.error(`Error parsing HTML from ${sourceUrl}:`, error);
      return [];
    }
  }
  
  processParsedLink(element, sourceUrl, foundPDFs, source) {
    const href = element.getAttribute('href');
    const text = element.textContent?.trim() || '';
    
    // Skip template placeholder URLs early
    if (href && (href.includes('%7B%7B') || href.includes('{{'))) {
      console.warn(`⚠️ Skipping template placeholder URL in HTML parsing: ${href}`);
      return;
    }
    
    // Convert relative URLs to absolute
    let absoluteUrl;
    try {
      absoluteUrl = new URL(href, sourceUrl).href;
    } catch {
      return; // Skip invalid URLs
    }
    
    // Double-check for template placeholders in absolute URL
    if (absoluteUrl.includes('%7B%7B') || absoluteUrl.includes('{{')) {
      console.warn(`⚠️ Skipping template placeholder URL in absolute URL: ${absoluteUrl}`);
      return;
    }
    
    // Avoid duplicates (check both current batch and existing surface PDFs)
    if (foundPDFs.some(pdf => pdf.url === absoluteUrl)) return;
    
    // Also check against existing surface PDFs to avoid duplicates
    const existingSurfacePdfs = this.crawlerState?.surfacePDFs || [];
    if (existingSurfacePdfs.some(pdf => pdf.url === absoluteUrl)) return;
    
    // Check if it's a PDF using enhanced logic
    if (this.isPDFLink(absoluteUrl, text, element)) {
      // Get Canvas-specific context with improved detection
      const moduleItem = element.closest('.context_module_item');
      const fileHolder = element.closest('.instructure_file_holder, .instructure_file_link_holder');
      
      // Try multiple ways to detect item type (Canvas may populate this dynamically)
      let itemType = moduleItem?.querySelector('.type')?.textContent?.trim();
      if (!itemType && moduleItem) {
        // Fallback: check class names for wiki_page, attachment, etc.
        if (moduleItem.classList.contains('wiki_page')) itemType = 'wiki_page';
        else if (moduleItem.classList.contains('attachment')) itemType = 'attachment';
        else if (moduleItem.querySelector('span[style*="display: none"]')?.textContent === 'wiki_page') itemType = 'wiki_page';
      }
      
      const isAttachment = moduleItem?.classList.contains('attachment');
      const isEmbeddedFile = !!fileHolder;
      const fileId = element.getAttribute('data-id');
      
      let pdfType = 'deep_crawl_pdf';
      let contextDescription = 'PDF';
      
      if (isEmbeddedFile) {
        pdfType = 'deep_crawl_embedded_file';
        contextDescription = 'embedded file';
      } else if (isAttachment) {
        pdfType = 'deep_crawl_attachment';
        contextDescription = 'attachment';
      }
      
      foundPDFs.push({
        url: this.convertToDownloadURL(absoluteUrl),
        title: this.extractBetterTitle(element, absoluteUrl) || text || 'Canvas PDF',
        filename: this.extractFilename(absoluteUrl),
        context: `Found in: ${sourceUrl}`,
        type: pdfType,
        sourceUrl: sourceUrl,
        canvasItemType: itemType,
        isAttachment: isAttachment,
        isEmbeddedFile: isEmbeddedFile,
        fileId: fileId,
        source: source,
        needsRedirectResolution: absoluteUrl.includes('/modules/items/')
      });
      
      console.log(`📎 Deep crawl found ${contextDescription}: "${text}" -> ${absoluteUrl} (source: ${source}, type: ${itemType || 'unknown'})`);
    }
  }

  isPDFLink(url, text, element) {
    // Direct PDF URLs
    if (url.match(/\.pdf($|\?)/i)) return true;
    
    // Canvas download URLs
    if (url.includes('/download') && url.includes('/files/')) return true;
    
    // Canvas file URLs (even without .pdf extension)
    if (url.match(/\/courses\/\d+\/files\/\d+/)) return true;
    
    // Canvas embedded files (very high probability)
    if (element) {
      const fileHolder = element.closest('.instructure_file_holder, .instructure_file_link_holder');
      const hasFileId = element.hasAttribute('data-id');
      const isInlineDisabled = element.classList.contains('inline_disabled');
      
      if (fileHolder || hasFileId || isInlineDisabled) return true;
    }
    
    // Canvas module items - ALL module items are potential PDFs (pattern-based approach)
    if (url.includes('/modules/items/')) {
      // Always consider module items as potential PDFs
      // The pattern detection will have already filtered for likely lecture content
      return true;
      
      // Legacy detailed checking (kept as fallback)
      if (element) {
        const moduleItem = element.closest('.context_module_item');
        if (moduleItem) {
          // Check if it's an attachment type
          const isAttachment = moduleItem.classList.contains('attachment');
          let itemType = moduleItem.querySelector('.type')?.textContent?.trim();
          
          // Fallback for parsed HTML where .type might not be populated
          if (!itemType) {
            if (moduleItem.classList.contains('wiki_page')) itemType = 'wiki_page';
            else if (moduleItem.classList.contains('attachment')) itemType = 'attachment';
            // Check for hidden spans that might contain the type
            const hiddenTypeSpan = moduleItem.querySelector('span[style*="display: none"]');
            if (hiddenTypeSpan && hiddenTypeSpan.textContent === 'wiki_page') itemType = 'wiki_page';
          }
          
          if (isAttachment || itemType === 'attachment') return true;
          
          // Wiki pages are very likely to contain PDFs (lectures, etc.)
          if (itemType === 'wiki_page') return true;
          
          // Check for PDF-like or lecture-like text in Canvas context
          if (text) {
            const lowerText = text.toLowerCase();
            if (lowerText.includes('pdf') || lowerText.includes('manual') || 
                lowerText.includes('lab') || lowerText.includes('guide') ||
                lowerText.includes('document') || lowerText.includes('handout') ||
                lowerText.includes('föreläsning') || lowerText.includes('lecture') ||
                lowerText.includes('fö') || lowerText.includes('opt')) {
              return true;
            }
          }
        }
      }
      // If no element context, still consider module items as potential PDFs
      return true;
    }
    
    // Text-based indicators
    if (text) {
      const lowerText = text.toLowerCase();
      if (lowerText.includes('pdf') || lowerText.includes('.pdf')) return true;
      
      // Canvas-specific text patterns with academic context
      const academicTerms = ['manual', 'lab', 'guide', 'document', 'handout', 'assignment', 
                            'worksheet', 'instructions', 'slides', 'notes', 'reading'];
      if (academicTerms.some(term => lowerText.includes(term))) {
        // Additional check for Canvas context
        if (url.includes('/courses/') || url.includes('/files/') || url.includes('/modules/')) return true;
      }
    }
    
    // Element-based indicators
    if (element) {
      // Canvas attachment icons
      if (element.querySelector('.icon-paperclip, .icon-document')) return true;
      
      // PDF icons
      if (element.querySelector('.icon-pdf, .file-icon[class*="pdf"], i[class*="pdf"]')) return true;
      
      // Canvas file type indicators
      if (element.querySelector('.type[title*="pdf"], .file-type[class*="pdf"]')) return true;
      
      // Check parent elements for Canvas attachment patterns
      const moduleItem = element.closest('.context_module_item');
      if (moduleItem && moduleItem.classList.contains('attachment')) return true;
    }
    
    return false;
  }

  convertToDownloadURL(url) {
    // Handle module items - these need to be resolved by fetching the redirect
    if (url.includes('/modules/items/')) {
      console.warn('⚠️ Module item URL should be resolved first:', url);
      return null; // Signal that resolution is needed
    }
    
    // Convert Canvas file URLs to download URLs
    if (url.includes('/files/')) {
      const fileIdMatch = url.match(/\/files\/(\d+)/);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        const baseUrl = url.split('/files/')[0];
        
        // Always use /download endpoint
        const downloadUrl = `${baseUrl}/files/${fileId}/download`;
        
        // Add query params to force download (not preview)
        return `${downloadUrl}?download_frd=1`;
      }
    }
    
    // Handle preview URLs
    if (url.includes('/preview')) {
      return url.replace('/preview', '/download');
    }
    
    // Already a download URL or direct PDF
    if (url.includes('/download') || url.endsWith('.pdf')) {
      return url;
    }
    
    return url;
  }
  
  async resolveModuleItemUrl(moduleItemUrl, originalTitle = null) {
    try {
      console.log(`🔄 Resolving module item: ${moduleItemUrl}`);
      if (originalTitle) {
        console.log(`📝 Preserving original title: "${originalTitle}"`);
      }
      
      // Directly use HTML parsing approach since iframe might not work in content script context
      const resolvedUrl = await this.resolveModuleItemFromHTML(moduleItemUrl);
      
      // Return both the URL and the original title if available
      if (resolvedUrl && originalTitle) {
        return { url: resolvedUrl, title: originalTitle };
      }
      
      return resolvedUrl ? { url: resolvedUrl, title: null } : null;
      
    } catch (error) {
      console.error(`❌ Error resolving module item ${moduleItemUrl}:`, error);
      return null;
    }
  }

  async resolveModuleItemFromHTML(moduleItemUrl) {
    try {
      // Skip template placeholder URLs
      if (moduleItemUrl.includes('%7B%7B') || moduleItemUrl.includes('{{')) {
        console.warn(`⚠️ Skipping template placeholder URL: ${moduleItemUrl}`);  
        return null;
      }
      
      // Fallback method: fetch the HTML content and parse it
      const html = await this.authenticatedFetch(moduleItemUrl);
      
      // Parse the HTML to look for various patterns
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Method 1: Look for direct file links in href attributes  
      const fileLinks = doc.querySelectorAll('a[href*="/files/"]');
      for (const link of fileLinks) {
        const href = link.getAttribute('href');
        if (href && href.includes('/files/')) {
          const fileUrl = this.makeAbsoluteUrl(href, moduleItemUrl);
          const downloadUrl = fileUrl.includes('/download') ? fileUrl : `${fileUrl.split('?')[0]}/download`;
          console.log(`✅ Found file link in HTML: ${downloadUrl}`);
          return downloadUrl;
        }
      }
      
      // Method 2: Look for wiki page links
      const pageLinks = doc.querySelectorAll('a[href*="/pages/"]');
      for (const link of pageLinks) {
        const href = link.getAttribute('href');
        if (href && href.includes('/pages/')) {
          const pageUrl = this.makeAbsoluteUrl(href, moduleItemUrl);
          console.log(`📄 Found wiki page link in HTML: ${pageUrl}`);
          return pageUrl;
        }
      }
      
      // Method 3: Look for redirect patterns in raw HTML
      const fileMatch = html.match(/['"]([^'"]*\/courses\/\d+\/files\/\d+[^'"]*)['"]/);
      if (fileMatch) {
        const fileUrl = this.makeAbsoluteUrl(fileMatch[1], moduleItemUrl);
        const downloadUrl = fileUrl.includes('/download') ? fileUrl : `${fileUrl.split('?')[0]}/download`;
        console.log(`✅ Found file in HTML content: ${downloadUrl}`);
        return downloadUrl;
      }
      
      // Method 4: Look for wiki page patterns in raw HTML
      const wikiPageMatch = html.match(/['"]([^'"]*\/courses\/\d+\/pages\/[\w-]+[^'"]*)['"]/);
      if (wikiPageMatch) {
        const wikiPageUrl = this.makeAbsoluteUrl(wikiPageMatch[1], moduleItemUrl);
        console.log(`📄 Found wiki page in HTML content: ${wikiPageUrl}`);
        return wikiPageUrl;
      }
      
      // Method 5: Look for JavaScript redirects or meta refreshes
      const jsRedirectMatch = html.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
      if (jsRedirectMatch) {
        const redirectUrl = this.makeAbsoluteUrl(jsRedirectMatch[1], moduleItemUrl);
        console.log(`🔄 Found JavaScript redirect: ${redirectUrl}`);
        return redirectUrl;
      }
      
      const metaRefreshMatch = html.match(/<meta[^>]+http-equiv=['"]refresh['"][^>]+content=['"][^;]*;\s*url=([^'"]+)['"]/i);
      if (metaRefreshMatch) {
        const redirectUrl = this.makeAbsoluteUrl(metaRefreshMatch[1], moduleItemUrl);
        console.log(`🔄 Found meta refresh redirect: ${redirectUrl}`);
        return redirectUrl;
      }
      
      // Method 6: Look for Canvas-specific redirect indicators
      const canvasRedirectMatch = html.match(/data-api-endpoint=['"]([^'"]+)['"]/);
      if (canvasRedirectMatch) {
        const apiUrl = this.makeAbsoluteUrl(canvasRedirectMatch[1], moduleItemUrl);
        console.log(`🔍 Found Canvas API endpoint: ${apiUrl}`);
        // Convert API endpoint to downloadable file URL if it's a file
        if (apiUrl.includes('/files/')) {
          const downloadUrl = `${apiUrl.split('?')[0]}/download`;
          console.log(`✅ Converted API endpoint to download URL: ${downloadUrl}`);
          return downloadUrl;
        }
      }
      
      console.warn(`⚠️ Could not resolve module item from HTML: ${moduleItemUrl}`);
      console.log(`📝 HTML snippet (first 500 chars):`, html.substring(0, 500));
      return null;
    } catch (error) {
      console.error(`❌ Error in resolveModuleItemFromHTML for ${moduleItemUrl}:`, error);
      return null;
    }
  }

  async queueUrlForDeepCrawl(url, level = 1, priority = 1, type = 'unknown', parentUrl = null) {
    // Ensure deepCrawlState is initialized
    this.ensureDeepCrawlState();
    
    // Skip template placeholder URLs before they enter the queue
    if (url.includes('%7B%7B') || url.includes('{{')) {
      console.warn(`⚠️ Skipping template placeholder URL from queue: ${url}`);
      return;
    }
    
    if (level > this.deepCrawlState.maxDepth || 
        this.deepCrawlState.fetchedUrls.has(url) ||
        this.deepCrawlState.fetchQueue.has(url)) {
      return;
    }

    this.deepCrawlState.fetchQueue.set(url, {
      level,
      priority,
      type,
      parentUrl,
      addedAt: Date.now()
    });

    console.log(`📋 Queued for deep crawl: ${type} (level ${level}) - ${url}`);
  }

  // ============================================================================
  // END PHASE 1 INFRASTRUCTURE
  // ============================================================================

  // ============================================================================
  // CANVAS MODULE PATTERN DETECTION
  // ============================================================================
  
  // Detect and batch process similar Canvas module items
  detectCanvasModulePatterns() {
    const patterns = [];
    const processedModules = new Set();
    
    // Find all context modules
    const modules = document.querySelectorAll('.context_module');
    
    modules.forEach(module => {
      const moduleId = module.id;
      if (processedModules.has(moduleId)) return;
      processedModules.add(moduleId);
      
      // Find all module items in this module
      const moduleItems = module.querySelectorAll('.context_module_item');
      
      if (moduleItems.length < 2) return; // Skip modules with single items
      
      // Group items by structural similarity
      const groups = this.groupModuleItemsByStructure(moduleItems);
      
      // Look for groups with lecture-like patterns
      groups.forEach(group => {
        if (group.items.length >= 2 && this.isLecturePattern(group)) {
          patterns.push({
            moduleId: moduleId,
            type: 'lecture_series',
            items: group.items,
            pattern: group.pattern,
            confidence: group.confidence
          });
          
          console.log(`📚 Detected lecture series pattern in ${moduleId}: ${group.items.length} items (${group.pattern})`);
        }
      });
    });
    
    return patterns;
  }
  
  groupModuleItemsByStructure(moduleItems) {
    const groups = [];
    const itemsByStructure = new Map();
    
    moduleItems.forEach(item => {
      const structure = this.getModuleItemStructure(item);
      const key = `${structure.type}_${structure.hasLink}_${structure.hasHiddenType}`;
      
      if (!itemsByStructure.has(key)) {
        itemsByStructure.set(key, {
          pattern: structure,
          items: [],
          confidence: 0
        });
      }
      
      itemsByStructure.get(key).items.push(item);
    });
    
    itemsByStructure.forEach(group => {
      group.confidence = this.calculatePatternConfidence(group);
      groups.push(group);
    });
    
    return groups.sort((a, b) => b.confidence - a.confidence);
  }
  
  getModuleItemStructure(item) {
    const classList = Array.from(item.classList);
    const link = item.querySelector('a[href*="/modules/items/"]');
    const typeSpan = item.querySelector('.type');
    const itemType = typeSpan?.textContent?.trim();
    
    // Filter out template placeholder URLs
    const linkHref = link?.getAttribute('href');
    const hasValidLink = link && linkHref && !linkHref.includes('%7B%7B') && !linkHref.includes('{{');
    
    return {
      type: itemType || 'unknown',
      hasLink: hasValidLink,
      hasHiddenType: !!typeSpan,
      isWikiPage: classList.includes('wiki_page'),
      classes: classList,
      linkHref: hasValidLink ? linkHref : null
    };
  }
  
  isLecturePattern(group) {
    const structure = group.pattern;
    const items = group.items;
    
    // High confidence: wiki page module items with sequential IDs
    if (structure.isWikiPage && structure.hasLink && items.length >= 3) {
      // Check for sequential or lecture-like naming
      const hasSequentialIds = this.hasSequentialModuleIds(items);
      const hasLectureNames = this.hasLectureNames(items);
      
      return hasSequentialIds || hasLectureNames;
    }
    
    return false;
  }
  
  hasSequentialModuleIds(items) {
    const ids = items.map(item => {
      const link = item.querySelector('a[href*="/modules/items/"]');
      const href = link?.getAttribute('href');
      // Skip template placeholder URLs
      if (!href || href.includes('%7B%7B') || href.includes('{{')) return null;
      const match = href.match(/\/modules\/items\/(\d+)/);
      return match ? parseInt(match[1]) : null;
    }).filter(id => id !== null).sort((a, b) => a - b);
    
    if (ids.length < 3) return false;
    
    // Check if IDs are roughly sequential (allow gaps of 1-2)
    let sequential = 0;
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] - ids[i-1] <= 3) sequential++;
    }
    
    return sequential / (ids.length - 1) > 0.7; // 70% sequential
  }
  
  hasLectureNames(items) {
    const names = items.map(item => {
      const link = item.querySelector('a[href*="/modules/items/"]');
      const href = link?.getAttribute('href');
      // Skip template placeholder URLs
      if (!href || href.includes('%7B%7B') || href.includes('{{')) return '';
      return link?.textContent?.trim() || '';
    });
    
    const lectureNames = names.filter(name => 
      name.toLowerCase().includes('optfö') ||
      name.toLowerCase().includes('simfö') ||
      name.toLowerCase().includes('föreläsning') ||
      name.toLowerCase().includes('lecture')
    );
    
    return lectureNames.length >= 2;
  }
  
  calculatePatternConfidence(group) {
    let confidence = 0;
    const structure = group.pattern;
    const items = group.items;
    
    // Base confidence for structure
    if (structure.isWikiPage) confidence += 30;
    if (structure.hasLink) confidence += 20;
    if (structure.hasHiddenType) confidence += 10;
    
    // Bonus for quantity
    confidence += Math.min(items.length * 5, 25);
    
    // Bonus for lecture patterns
    if (this.hasLectureNames(items)) confidence += 25;
    if (this.hasSequentialModuleIds(items)) confidence += 20;
    
    return confidence;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // PHASE 2: ENHANCED URL DISCOVERY - Canvas Content Categorization & Discovery
  // ============================================================================

  discoverCanvasUrls() {
    const discoveredUrls = new Set();
    const currentUrl = window.location.href;
    
    console.log('🔍 Discovering Canvas URLs for deep crawling...');

    // Canvas-specific selectors based on actual DOM structure
    const canvasSelectors = [
      // Module items (primary target)
      '.context_module_item .item_link',     // Canvas module item links
      '.ig-title.item_link',                 // Canvas item links with ig-title class
      'a.item_link[href*="/modules/items/"]', // Direct module item links
      
      // Embedded file links (wiki pages, assignments, etc.)
      '.instructure_file_link_holder a',     // Canvas embedded file links
      '.instructure_file_holder a',          // Canvas file holder links
      'a.inline_disabled[href*="/files/"]',  // Canvas inline file links
      
      // File and assignment links
      'a[href*="/files/"]',                  // Direct file links
      'a[href*="/assignments/"]',            // Assignment links
      'a[href*="/pages/"]',                  // Wiki page links
      
      // General Canvas course links
      'a[href*="/courses/"][href*="/modules"]', // Module navigation
      'a[href*="/courses/"][href*="/files"]'   // File navigation
    ];
    
    // Also get all links and filter for Canvas patterns
    const allLinks = document.querySelectorAll('a[href]');
    const canvasLinks = document.querySelectorAll(canvasSelectors.join(', '));
    
    console.log(`🔗 Found ${allLinks.length} total links, ${canvasLinks.length} Canvas-specific links`);
    
    // First, add all items from detected module patterns (highest priority)
    const modulePatterns = this.detectCanvasModulePatterns();
    modulePatterns.forEach(pattern => {
      pattern.items.forEach(item => {
        const link = item.querySelector('a[href*="/modules/items/"]');
        const href = link?.getAttribute('href');
        // Skip template placeholder URLs
        if (link && href && !href.includes('%7B%7B') && !href.includes('{{')) {
          this.processDiscoveredLink(link, currentUrl, discoveredUrls, 'module_pattern');
        }
      });
    });
    
    // Process Canvas-specific links (high priority)
    canvasLinks.forEach(link => {
      this.processDiscoveredLink(link, currentUrl, discoveredUrls, 'canvas_specific');
    });
    
    // Special handling for course main pages with many module items
    const isCourseFrontPage = currentUrl.match(/\/courses\/\d+\/?(?:\?.*)?$/);
    if (isCourseFrontPage) {
      // Look for module items that might be wiki pages with lectures
      const moduleItems = document.querySelectorAll('.context_module_item .item_link');
      console.log(`📋 Course front page: found ${moduleItems.length} module items to analyze`);
      
      moduleItems.forEach(link => {
        const moduleItem = link.closest('.context_module_item');
        const itemType = moduleItem?.querySelector('.type')?.textContent?.trim();
        const linkText = link.textContent?.trim() || '';
        
        // Prioritize wiki pages (likely lecture content)
        if (itemType === 'wiki_page') {
          this.processDiscoveredLink(link, currentUrl, discoveredUrls, 'course_main_wiki_pages');
        }
      });
    }
    
    // Process remaining links for any Canvas patterns we might have missed
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.includes('/modules/items/') || href.includes('/files/') || 
                   href.includes('/assignments/') || href.includes('/pages/'))) {
        this.processDiscoveredLink(link, currentUrl, discoveredUrls, 'general_scan');
      }
    });

    // Add specific Canvas API endpoints if we can construct them
    this.addCanvasApiUrls(discoveredUrls);
    
    console.log(`📋 Discovered ${discoveredUrls.size} URLs for deep crawling`);
    
    // Debug: Show pattern-based discoveries
    const patternUrls = Array.from(discoveredUrls).filter(item => item.source === 'module_pattern');
    if (patternUrls.length > 0) {
      console.log(`📋 Pattern-based discoveries:`, patternUrls.map(item => `"${item.linkText}" -> ${item.url}`));
    }
    
    return Array.from(discoveredUrls).sort((a, b) => a.priority - b.priority);
  }
  
  processDiscoveredLink(link, currentUrl, discoveredUrls, source) {
    const href = link.getAttribute('href');
    const text = link.textContent?.trim() || '';
    
    // Skip template placeholder URLs early
    if (href && (href.includes('%7B%7B') || href.includes('{{'))) {
      console.warn(`⚠️ Skipping template placeholder URL in processDiscoveredLink: ${href}`);
      return;
    }
    
    const absoluteUrl = this.makeAbsoluteUrl(href, currentUrl);
    
    if (!absoluteUrl || !this.isValidCanvasUrl(absoluteUrl)) return;
    
    // Double-check for template placeholders in absolute URL
    if (absoluteUrl.includes('%7B%7B') || absoluteUrl.includes('{{')) {
      console.warn(`⚠️ Skipping template placeholder URL in absolute URL (processDiscoveredLink): ${absoluteUrl}`);
      return;
    }
    
    // Check if we already have this URL
    const existingUrl = Array.from(discoveredUrls).find(item => item.url === absoluteUrl);
    if (existingUrl) return;
    
    const urlInfo = this.categorizeCanvasUrl(absoluteUrl, text, link);
    if (urlInfo.shouldCrawl) {
      // Get additional context from Canvas DOM structure
      const moduleItem = link.closest('.context_module_item');
      const fileHolder = link.closest('.instructure_file_holder, .instructure_file_link_holder');
      const itemType = moduleItem?.querySelector('.type')?.textContent?.trim();
      const isAttachment = moduleItem?.classList.contains('attachment');
      const isEmbeddedFile = !!fileHolder;
      const fileId = link.getAttribute('data-id');
      const apiEndpoint = link.getAttribute('data-api-endpoint');
      
      discoveredUrls.add({
        url: absoluteUrl,
        linkText: text,
        canvasItemType: itemType,
        isAttachment: isAttachment,
        isEmbeddedFile: isEmbeddedFile,
        fileId: fileId,
        apiEndpoint: apiEndpoint,
        source: source,
        ...urlInfo
      });
      
      const contextInfo = isEmbeddedFile ? 'embedded_file' : (itemType || 'unknown');
      console.log(`➕ ${source}: ${urlInfo.type} (${contextInfo}) - "${text}" - ${absoluteUrl}`);
    }
  }

  categorizeCanvasUrl(url, linkText = '', element = null) {
    const urlPath = new URL(url).pathname;
    const searchParams = new URL(url).searchParams;
    
    // Get Canvas-specific context from DOM
    const moduleItem = element?.closest('.context_module_item');
    const fileHolder = element?.closest('.instructure_file_holder, .instructure_file_link_holder');
    const itemType = moduleItem?.querySelector('.type')?.textContent?.trim();
    const isAttachment = moduleItem?.classList.contains('attachment');
    const isEmbeddedFile = !!fileHolder;
    const hasFileId = element?.hasAttribute('data-id');
    
    // Very high priority: Embedded Canvas files (lectures, assignments, etc.)
    if (isEmbeddedFile || hasFileId || element?.classList.contains('inline_disabled')) {
      return {
        type: 'canvas_embedded_file',
        priority: 1,
        shouldCrawl: true,
        reason: 'Canvas embedded file - very likely to be a PDF or document'
      };
    }
    
    // High priority: Attachments (most likely to be PDFs)
    if (isAttachment || itemType === 'attachment') {
      return {
        type: 'canvas_attachment',
        priority: 1,
        shouldCrawl: true,
        reason: 'Canvas attachment - very likely to be a PDF file'
      };
    }
    
    // High priority: Module items (especially wiki pages with lectures)
    if (urlPath.includes('/modules/') && urlPath.includes('/items/')) {
      const lowerText = linkText.toLowerCase();
      const isPDFLike = lowerText.includes('pdf') || lowerText.includes('manual') || 
                        lowerText.includes('lab') || lowerText.includes('guide') ||
                        lowerText.includes('document') || lowerText.includes('handout');
      
      // Check if it's a wiki page type (common for lecture pages)
      const isWikiPageType = itemType === 'wiki_page';
      
      // High priority for wiki pages (often contain lecture content)
      const isLectureLike = lowerText.includes('föreläsning') || lowerText.includes('lecture') ||
                           lowerText.includes('fö') || lowerText.includes('opt') ||
                           lowerText.includes('introduktion') || lowerText.includes('intro');
      
      let priority = 2; // Default priority
      let reason = 'Module item may contain resources';
      
      if (isWikiPageType && isLectureLike) {
        priority = 1;
        reason = 'Wiki page module item - likely contains lecture PDFs';
      } else if (isPDFLike) {
        priority = 1;
        reason = 'Module item with PDF-like title';
      } else if (isWikiPageType) {
        priority = 1;
        reason = 'Wiki page module item - may contain embedded files';
      }
      
      return {
        type: isWikiPageType ? 'wiki_page_module_item' : 'module_item',
        priority: priority,
        shouldCrawl: true,
        reason: reason
      };
    }
    
    
    // High priority: Assignment pages
    if (urlPath.includes('/assignments/')) {
      return {
        type: 'assignment',
        priority: 1,
        shouldCrawl: true,
        reason: 'Assignment pages often contain PDF attachments and linked resources'
      };
    }
    
    // Medium priority: Wiki pages
    if (urlPath.includes('/pages/') || itemType === 'wiki_page') {
      return {
        type: 'wiki_page',
        priority: 2,
        shouldCrawl: true,
        reason: 'Wiki pages may embed PDFs and external content'
      };
    }
    
    // Medium priority: Course content areas
    if (urlPath.includes('/modules') && !urlPath.includes('/items/')) {
      return {
        type: 'modules_index',
        priority: 2,
        shouldCrawl: true,
        reason: 'Modules index contains links to all module items'
      };
    }
    
    if (urlPath.includes('/files') && !urlPath.includes('/download')) {
      return {
        type: 'file_browser',
        priority: 2,
        shouldCrawl: true,
        reason: 'File browser may show additional PDFs not visible on course front page'
      };
    }
    
    // External links that might contain PDFs
    if (!url.includes(window.location.hostname)) {
      const domain = new URL(url).hostname;
      if (this.isAcademicDomain(domain) || linkText.toLowerCase().includes('pdf')) {
        return {
          type: 'external_academic',
          priority: 3,
          shouldCrawl: true,
          reason: 'External academic link may contain course-related PDFs'
        };
      }
    }
    
    // Skip low-value pages
    if (urlPath.includes('/quizzes') || 
        urlPath.includes('/discussion_topics') || 
        urlPath.includes('/announcements') ||
        urlPath.includes('/grades')) {
      return {
        type: 'skip',
        priority: 0,
        shouldCrawl: false,
        reason: 'Low probability of containing PDFs'
      };
    }
    
    // Default: crawl unknown Canvas pages at low priority
    if (url.includes('/courses/')) {
      return {
        type: 'canvas_page',
        priority: 3,
        shouldCrawl: true,
        reason: 'Unknown Canvas page - might contain PDFs'
      };
    }
    
    return {
      type: 'other',
      priority: 0,
      shouldCrawl: false,
      reason: 'Not a Canvas course page'
    };
  }

  addCanvasApiUrls(discoveredUrls) {
    const courseId = this.courseId;
    if (!courseId) return;
    
    const baseUrl = `${window.location.origin}/courses/${courseId}`;
    const currentUrl = window.location.href;
    
    // Add key Canvas endpoints that may contain PDF links
    const apiUrls = [
      { url: `${baseUrl}/assignments`, type: 'assignments_index', priority: 1 },
      { url: `${baseUrl}/modules`, type: 'modules_index', priority: 1 },
      { url: `${baseUrl}/files`, type: 'files_index', priority: 2 },
      { url: `${baseUrl}/pages`, type: 'pages_index', priority: 2 }
    ];
    
    // If we're already on the modules page, don't add it again
    if (currentUrl.includes('/modules')) {
      apiUrls.splice(1, 1); // Remove modules URL
    }
    
    apiUrls.forEach(apiUrl => {
      if (!Array.from(discoveredUrls).some(item => item.url === apiUrl.url)) {
        discoveredUrls.add({
          ...apiUrl,
          shouldCrawl: true,
          reason: 'Canvas API endpoint likely to contain PDF references'
        });
      }
    });
  }

  isValidCanvasUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Must be HTTP/HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) return false;
      
      // Skip fragments and javascript links
      if (url.startsWith('#') || url.startsWith('javascript:')) return false;
      
      // Skip common file types that won't contain HTML
      if (url.match(/\.(jpg|jpeg|png|gif|css|js|ico|svg)($|\?)/i)) return false;
      
      return true;
    } catch {
      return false;
    }
  }

  isAcademicDomain(domain) {
    const academicTlds = ['.edu', '.ac.', '.edu.'];
    return academicTlds.some(tld => domain.includes(tld)) ||
           ['arxiv.org', 'jstor.org', 'springer.com', 'wiley.com', 'elsevier.com', 
            'ieee.org', 'acm.org', 'researchgate.net', 'academia.edu'].includes(domain);
  }

  makeAbsoluteUrl(href, baseUrl) {
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return null;
    }
  }

  // Check if URL contains Canvas template placeholders
  isTemplateUrl(url) {
    if (!url) return true; // Treat empty URLs as invalid
    return url.includes('{{') || 
           url.includes('}}') || 
           url.includes('%7B%7B') || 
           url.includes('%7D%7D');
  }

  // ============================================================================
  // END PHASE 2 URL DISCOVERY
  // ============================================================================

  // ============================================================================
  // PHASE 3: MULTI-LEVEL FETCH CRAWLER - Deep PDF Discovery Engine
  // ============================================================================

  async testAuthentication() {
    // Test if we can access Canvas API endpoints
    try {
      const apiTestUrl = `${window.location.origin}/api/v1/courses/${this.courseId}`;
      console.log(`🔐 Testing Canvas API access: ${apiTestUrl}`);
      
      const response = await this.authenticatedFetch(apiTestUrl);
      console.log('✅ Canvas API access successful');
      return true;
    } catch (error) {
      console.warn('⚠️ Canvas API access test failed:', error.message);
      console.warn('   This may affect deep crawl performance but surface scanning should still work');
      return false;
    }
  }

  async startDeepCrawl() {
    console.log('🔮 Starting LEGACY deep crawl for embedded PDFs...');
    console.log('⚠️  Note: This is the legacy system. Smart navigation (startEnhancedCrawl) is now primary.');
    
    // Test authentication before starting deep crawl
    await this.testAuthentication();
    
    // Ensure deepCrawlState is initialized
    this.ensureDeepCrawlState();
    
    // Reset deep crawl state but preserve any surface PDFs already found
    this.deepCrawlState.fetchQueue.clear();
    this.deepCrawlState.fetchedUrls.clear();
    
    // Preserve surface PDFs if they exist
    const existingSurfacePdfs = this.crawlerState?.surfacePDFs || [];
    this.deepCrawlState.foundPdfs = [...existingSurfacePdfs]; // Start with surface PDFs
    console.log(`🏁 Starting deep crawl with ${existingSurfacePdfs.length} surface PDFs already found`);
    
    try {
      // Phase 1: Queue Canvas module items from surface scan that need resolution
      const allSurfacePdfs = this.getAllPdfLinks();
      const moduleItemsToResolve = allSurfacePdfs.filter(pdf => 
        pdf.needsRedirectResolution && pdf.url.includes('/modules/items/')
      );
      
      console.log(`🔄 Found ${moduleItemsToResolve.length} Canvas module items to resolve during deep crawl`);
      if (moduleItemsToResolve.length > 0) {
        console.log('📋 Canvas module items to resolve:', moduleItemsToResolve.map(item => `"${item.title}" -> ${item.url}`));
      }
      
      for (const moduleItem of moduleItemsToResolve) {
        await this.queueUrlForDeepCrawl(
          moduleItem.url,
          1, // Level 1 for module items
          1, // High priority
          'canvas_module_item',
          window.location.href
        );
        console.log(`📋 Queued module item for resolution: ${moduleItem.title} -> ${moduleItem.url}`);
      }
      
      // Phase 2: Discover all crawlable URLs on current page
      const discoveredUrls = this.discoverCanvasUrls();
      
      // Phase 3: Ensure current page is processed first (to catch any surface PDFs that weren't found)
      await this.queueUrlForDeepCrawl(
        window.location.href,
        0, // Level 0 for current page
        0, // Highest priority
        'current_page',
        null
      );
      
      // Queue discovered URLs by priority
      for (const urlInfo of discoveredUrls) {
        await this.queueUrlForDeepCrawl(
          urlInfo.url, 
          1, // Start at level 1
          urlInfo.priority, 
          urlInfo.type,
          window.location.href
        );
      }
      
      // Phase 3: Process queue with concurrency control
      await this.processDeepCrawlQueue();
      
      const totalPdfs = this.deepCrawlState.foundPdfs.length;
      const surfacePdfs = this.crawlerState?.surfacePDFs?.length || 0;
      const deepOnlyPdfs = totalPdfs - surfacePdfs;
      
      console.log(`🎆 Deep crawl complete! Total: ${totalPdfs} PDFs (${surfacePdfs} surface + ${deepOnlyPdfs} deep crawl)`);
      
      // Report all PDFs (surface + deep crawl combined)
      if (this.deepCrawlState.foundPdfs.length > 0) {
        chrome.runtime.sendMessage({
          action: "pdfsFound",
          pdfs: this.deepCrawlState.foundPdfs,
          source: "combined_scan",
          surfacePdfCount: surfacePdfs,
          deepCrawlPdfCount: deepOnlyPdfs,
          courseInfo: {
            title: document.title,
            url: window.location.href,
            courseId: this.courseId
          }
        });
      }
      
      return this.deepCrawlState.foundPdfs;
      
    } catch (error) {
      console.error('❌ Deep crawl failed:', error);
      return [];
    }
  }

  async processDeepCrawlQueue() {
    // Ensure deepCrawlState is initialized
    this.ensureDeepCrawlState();
    
    console.log(`📋 Processing ${this.deepCrawlState.fetchQueue.size} URLs in crawl queue...`);
    
    // Convert queue to sorted array by priority
    const sortedQueue = Array.from(this.deepCrawlState.fetchQueue.entries())
      .sort(([, a], [, b]) => a.priority - b.priority); // Lower number = higher priority
    
    const processingPromises = [];
    
    for (const [url, queueInfo] of sortedQueue) {
      // Wait for available slot if at max concurrent requests
      while (this.deepCrawlState.activeRequests >= this.deepCrawlState.maxConcurrentRequests) {
        await this.wait(100);
      }
      
      // Start processing this URL
      const promise = this.processDeepCrawlUrl(url, queueInfo)
        .catch(error => {
          console.error(`❌ Failed to process ${url}:`, error.message);
          return []; // Return empty array on failure
        });
      
      processingPromises.push(promise);
    }
    
    // Wait for all requests to complete
    const results = await Promise.all(processingPromises);
    
    // Flatten and add all found PDFs
    const allFoundPdfs = results.flat();
    this.deepCrawlState.foundPdfs.push(...allFoundPdfs);
    
    console.log(`✅ Processed ${sortedQueue.length} URLs, found ${allFoundPdfs.length} PDFs`);
  }

  async processDeepCrawlUrl(url, queueInfo) {
    if (this.deepCrawlState.fetchedUrls.has(url)) {
      return []; // Already processed
    }
    
    console.log(`🔮 Processing: ${queueInfo.type} (level ${queueInfo.level}) - ${url}`);
    
    try {
      // Mark as fetched before processing to prevent duplicates
      this.deepCrawlState.fetchedUrls.add(url);
      
      let htmlToProcess, urlToProcess = url;
      
      // Special handling for Canvas module items
      if (url.includes('/modules/items/')) {
        console.log(`🔄 Special handling for Canvas module item: ${url}`);
        const resolvedUrl = await this.resolveModuleItemUrl(url);
        if (resolvedUrl && resolvedUrl.includes('/pages/')) {
          console.log(`📄 Module item resolved to wiki page: ${resolvedUrl}`);
          htmlToProcess = await this.authenticatedFetch(resolvedUrl);
          urlToProcess = resolvedUrl;
        } else if (resolvedUrl && resolvedUrl.includes('/files/')) {
          console.log(`📎 Module item resolved to direct file: ${resolvedUrl}`);
          // Return a synthetic PDF object for direct file links
          return [{
            url: resolvedUrl,
            title: this.extractFilename(resolvedUrl) || 'Canvas File',
            filename: this.extractFilename(resolvedUrl),
            type: 'resolved_module_file',
            originalModuleUrl: url,
            context: `Resolved from Canvas module item: ${url}`
          }];
        } else {
          // Fallback: fetch the module item page directly
          console.log(`⚠️ Module item resolution failed, fetching directly: ${url}`);
          htmlToProcess = await this.authenticatedFetch(url);
        }
      } else {
        // Normal page processing
        htmlToProcess = await this.authenticatedFetch(url);
      }
      
      // Parse for PDFs
      const foundPdfs = this.parseHTMLForPDFs(htmlToProcess, urlToProcess);
      
      // Resolve any remaining module items that were found
      const resolvedPdfs = await this.resolveModuleItems(foundPdfs);
      
      // If we're not at max depth, queue more URLs from this page
      if (queueInfo.level < this.deepCrawlState.maxDepth) {
        await this.discoverNestedUrls(htmlToProcess, url, queueInfo.level + 1);
      }
      
      return resolvedPdfs;
      
    } catch (error) {
      console.error(`❌ Error processing ${url}:`, error.message);
      
      // Enhanced error reporting for debugging
      if (error.message.includes('403') || error.message.includes('forbidden')) {
        console.error(`🔒 Authentication issue detected for ${url}. This may indicate:`);
        console.error(`   • The page requires additional authentication`);
        console.error(`   • Canvas session may have expired`);
        console.error(`   • Page requires direct navigation to access`);
        console.error(`   • CSRF token or additional headers needed`);
      } else if (error.message.includes('404')) {
        console.error(`🔍 Page not found: ${url} may have been moved or deleted`);
      } else if (error.message.includes('429')) {
        console.error(`⏳ Rate limited when accessing ${url}. Crawler will slow down.`);
      }
      
      return [];
    }
  }
  
  async resolveModuleItems(pdfs) {
    const resolvedPdfs = [];
    const wikiPagesToProcess = [];
    
    for (const pdf of pdfs) {
      if (pdf.needsRedirectResolution && pdf.url.includes('/modules/items/')) {
        console.log(`🔄 Resolving module item: ${pdf.title}`);
        
        const resolvedUrl = await this.resolveModuleItemUrl(pdf.url);
        if (resolvedUrl) {
          if (resolvedUrl.includes('/pages/')) {
            // This is a wiki page - we need to fetch and parse it for PDFs
            console.log(`📄 Module item resolved to wiki page, will process: ${resolvedUrl}`);
            wikiPagesToProcess.push({
              ...pdf,
              url: resolvedUrl,
              type: 'resolved_wiki_page',
              originalModuleUrl: pdf.url,
              needsRedirectResolution: false
            });
          } else if (resolvedUrl.includes('/files/')) {
            // Direct file resolution
            resolvedPdfs.push({
              ...pdf,
              url: resolvedUrl,
              title: pdf.title !== 'Canvas Module Item' ? pdf.title : this.extractFilename(resolvedUrl) || 'Canvas PDF',
              filename: this.extractFilename(resolvedUrl),
              type: 'resolved_module_item',
              originalModuleUrl: pdf.url,
              needsRedirectResolution: false
            });
          }
        } else {
          console.warn(`⚠️ Could not resolve module item: ${pdf.url}`);
        }
      } else {
        resolvedPdfs.push(pdf);
      }
    }
    
    // Process any wiki pages we found
    for (const wikiPage of wikiPagesToProcess) {
      console.log(`🔍 Processing wiki page for PDFs: ${wikiPage.url}`);
      try {
        const html = await this.authenticatedFetch(wikiPage.url);
        const wikiPdfs = this.parseHTMLForPDFs(html, wikiPage.url);
        
        // Add context about the original module item
        wikiPdfs.forEach(wikiPdf => {
          wikiPdf.originalModuleTitle = wikiPage.title;
          wikiPdf.originalModuleUrl = wikiPage.originalModuleUrl;
          wikiPdf.type = 'wiki_page_pdf';
          wikiPdf.context = `Found in wiki page: ${wikiPage.url} (from module: ${wikiPage.title})`;
        });
        
        resolvedPdfs.push(...wikiPdfs);
        console.log(`✅ Found ${wikiPdfs.length} PDFs in wiki page: ${wikiPage.title}`);
      } catch (error) {
        console.error(`❌ Error processing wiki page ${wikiPage.url}:`, error);
      }
    }
    
    return resolvedPdfs;
  }

  async discoverNestedUrls(html, sourceUrl, level) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('a[href]');
      
      for (const link of links) {
        const href = link.getAttribute('href');
        const text = link.textContent?.trim() || '';
        const absoluteUrl = this.makeAbsoluteUrl(href, sourceUrl);
        
        if (absoluteUrl && this.isValidCanvasUrl(absoluteUrl)) {
          const urlInfo = this.categorizeCanvasUrl(absoluteUrl, text, link);
          
          if (urlInfo.shouldCrawl && !this.deepCrawlState.fetchedUrls.has(absoluteUrl)) {
            await this.queueUrlForDeepCrawl(
              absoluteUrl,
              level,
              urlInfo.priority + 1, // Lower priority for nested URLs
              urlInfo.type,
              sourceUrl
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error discovering nested URLs from ${sourceUrl}:`, error);
    }
  }

  // ============================================================================
  // END PHASE 3 MULTI-LEVEL CRAWLER
  // ============================================================================

  // ============================================================================
  // MAIN SCANNING METHODS
  // ============================================================================

  async scanAndReportPDFs() {
    console.log('🔍 [LEGACY] Starting surface PDF scan...');
    console.log('⚠️  Note: For comprehensive scanning, use startEnhancedCrawl() instead'); 
    
    // Phase 1: Surface scan (existing functionality)
    const surfacePdfs = this.getAllPdfLinks();
    
    // Only report new surface PDFs (avoid duplicate reporting)
    const newSurfacePdfs = [];
    const currentPageKey = location.href;
    
    if (!this.lastReportedPdfs) {
      this.lastReportedPdfs = new Map();
    }
    
    // Check for new PDFs on this page
    for (const pdf of surfacePdfs) {
      const pdfKey = `${currentPageKey}:${pdf.url}`;
      if (!this.lastReportedPdfs.has(pdfKey)) {
        // Skip Canvas module items that need resolution - they'll be processed by deep crawl
        if (pdf.needsRedirectResolution && pdf.url.includes('/modules/items/')) {
          console.log(`🔄 Holding back Canvas module item for deep crawl: ${pdf.title}`);
          this.lastReportedPdfs.set(pdfKey, pdf); // Mark as seen to avoid duplicates
          continue;
        }
        
        this.lastReportedPdfs.set(pdfKey, pdf);
        newSurfacePdfs.push(pdf);
      }
    }
    
    if (newSurfacePdfs.length > 0) {
      console.log(`📋 Found ${newSurfacePdfs.length} NEW surface PDFs on ${location.href}:`, newSurfacePdfs.map(p => p.title));
      
      // If crawler is running, accumulate PDFs AND store full PDF objects (not just URLs)
      if (this.crawlerState?.isRunning) {
        newSurfacePdfs.forEach(pdf => {
          this.crawlerState.foundPDFs.set(pdf.url, {
            title: pdf.title || 'Canvas PDF',
            filename: pdf.filename || this.extractFilename(pdf.url),
            context: pdf.context || 'Surface Scan',
            type: pdf.type || 'surface_scan'
          });
          // Also store the full PDF object for final reporting
          if (!this.crawlerState.surfacePDFs) {
            this.crawlerState.surfacePDFs = [];
          }
          this.crawlerState.surfacePDFs.push(pdf);
        });
        console.log(`📊 Total unique PDFs found so far: ${this.crawlerState.foundPDFs.size} (${newSurfacePdfs.length} from surface scan)`);
        console.log('🔍 Surface PDFs details:', newSurfacePdfs.map(p => `"${p.title}" -> ${p.url}`));
      } else {
        // If not crawling, report immediately (for single-page scans)
        console.log('Sending immediate surface PDF report (not crawling)');
        chrome.runtime.sendMessage({
          type: 'FOUND_PDFS',
          courseId: this.courseId,
          courseName: this.courseName,
          pdfs: newSurfacePdfs,
          pageUrl: location.href,
          crawlerActive: false,
          source: 'surface_scan'
        });
      }
    } else {
      console.log(`📄 No new surface PDFs found on ${location.href} (${surfacePdfs.length} already found on this page)`);
    }
    
    // Phase 2: Deep crawl is now handled by smart navigation system (startEnhancedCrawl)
    // Legacy deep crawl can still be triggered manually via 'startDeepCrawl' message
    console.log('ℹ️  Legacy deep crawl skipped - use smart navigation (startEnhancedCrawl) for comprehensive scanning');
  }
  
  shouldPerformDeepCrawl() {
    const currentUrl = window.location.href;
    
    // Perform deep crawl on various Canvas content pages
    const isCourseFrontPage = currentUrl.match(/\/courses\/\d+\/?(?:\?.*)?$/);
    const isModulesPage = currentUrl.match(/\/courses\/\d+\/modules\/?(?:\?.*)?$/);
    const isWikiPage = currentUrl.match(/\/courses\/\d+\/pages\/[\w-]+\/?(?:\?.*)?$/);
    const isAssignmentPage = currentUrl.match(/\/courses\/\d+\/assignments\/\d+\/?(?:\?.*)?$/);
    const isFilesPage = currentUrl.match(/\/courses\/\d+\/files\/?(?:\?.*)?$/);
    
    const isRelevantPage = isCourseFrontPage || isModulesPage || isWikiPage || isAssignmentPage || isFilesPage;
    
    // Check if there are Canvas module items that need resolution
    const allPdfs = this.getAllPdfLinks();
    const hasUnresolvedModuleItems = allPdfs.some(pdf => 
      pdf.needsRedirectResolution && pdf.url.includes('/modules/items/')
    );
    
    // Don't repeat deep crawl on same page unless there are unresolved module items
    const alreadyCrawled = this.deepCrawlState.fetchedUrls.has(currentUrl);
    
    // Only crawl if we have a valid course ID
    const hasValidCourse = this.courseId && this.courseId !== 'unknown';
    
    console.log(`🔍 Deep crawl check: relevantPage=${isRelevantPage} (front=${isCourseFrontPage}, modules=${isModulesPage}, wiki=${isWikiPage}, assignment=${isAssignmentPage}, files=${isFilesPage}), alreadyCrawled=${alreadyCrawled}, hasUnresolvedModuleItems=${hasUnresolvedModuleItems}, validCourse=${hasValidCourse}`);
    
    // Allow deep crawl if on relevant page, have valid course, and either haven't crawled or have unresolved module items
    return isRelevantPage && hasValidCourse && (!alreadyCrawled || hasUnresolvedModuleItems);
  }
  
  // Method to manually trigger comprehensive PDF scanning (called from popup)
  async triggerPDFScan() {
    console.log('📝 Manual PDF scan triggered from popup - starting smart navigation scan...');
    await this.startEnhancedCrawl();
  }
  
  // Method to manually trigger legacy deep crawl only (alternative system)
  async triggerDeepCrawlOnly() {
    console.log('🔮 Manual LEGACY deep crawl triggered - bypassing normal restrictions...');
    console.log('⚠️  Note: This uses the legacy deep crawl system, not the smart navigation system');
    
    try {
      const deepPdfs = await this.startDeepCrawl();
      console.log(`🎆 Manual legacy deep crawl complete! Found ${deepPdfs.length} PDFs`);
      return deepPdfs;
    } catch (error) {
      console.error('❌ Manual legacy deep crawl failed:', error);
      return [];
    }
  }
  
  // Debug method to see what URLs would be discovered
  debugUrlDiscovery() {
    console.log('🐛 DEBUG: Analyzing URL discovery...');
    
    const discoveredUrls = this.discoverCanvasUrls();
    console.table(discoveredUrls.map(url => ({
      URL: url.url,
      Type: url.type,
      Priority: url.priority,
      ShouldCrawl: url.shouldCrawl,
      Reason: url.reason,
      LinkText: url.linkText || 'No text',
      CanvasItemType: url.canvasItemType || 'N/A',
      IsEmbeddedFile: url.isEmbeddedFile || false,
      Source: url.source
    })));
    
    // Analyze by type
    const typeCount = {};
    discoveredUrls.forEach(url => {
      typeCount[url.type] = (typeCount[url.type] || 0) + 1;
    });
    
    console.log('📊 URL Discovery Summary:');
    console.table(typeCount);
    
    return discoveredUrls;
  }
  
  // Debug method to test PDF detection on current page
  debugPDFDetection() {
    console.log('🐛 DEBUG: Testing PDF detection...');
    
    const allLinks = document.querySelectorAll('a[href]');
    const results = [];
    
    allLinks.forEach((link, index) => {
      const href = link.getAttribute('href');
      const text = link.textContent?.trim() || '';
      const absoluteUrl = this.makeAbsoluteUrl(href, window.location.href);
      
      if (absoluteUrl) {
        const isPdf = this.isPDFLink(absoluteUrl, text, link);
        
        if (isPdf || href?.includes('/files/') || href?.includes('/modules/items/')) {
          results.push({
            Index: index,
            URL: absoluteUrl,
            Text: text,
            IsPDF: isPdf,
            HasFiles: href?.includes('/files/') || false,
            HasModuleItems: href?.includes('/modules/items/') || false,
            Element: link
          });
        }
      }
    });
    
    console.table(results);
    console.log(`🔍 Found ${results.length} potential PDF/file links out of ${allLinks.length} total links`);
    
    return results;
  }

  extractCourseId() {
    const match = window.location.pathname.match(/\/courses\/(\d+)/);
    return match ? match[1] : null;
  }

  extractCourseName() {
    // Try multiple selectors to get course name
    const selectors = [
      '#crumb_course',
      '.course-title',
      'h1.course-name',
      '[data-testid="course-name"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element.textContent.trim();
      }
    }

    // Fallback to page title extraction
    return document.title.replace(/Canvas|^\s*-\s*|\s*-\s*.*$/, '').trim();
  }

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

  storeCourseInfo() {
    const courseInfo = {
      courseId: this.courseId,
      courseName: this.courseName,
      url: window.location.href,
      domain: window.location.hostname,
      lastVisited: new Date().toISOString()
    };

    console.log('Canvas RAG Assistant: Storing course info:', courseInfo);

    // Send to background script for storage
    chrome.runtime.sendMessage({
      action: 'storeCourseInfo',
      data: courseInfo
    }).then(() => {
      console.log('Canvas RAG Assistant: Course info stored successfully');
    }).catch(error => {
      console.error('Canvas RAG Assistant: Failed to store course info:', error);
    });
  }

  handleMessage(request, sender, sendResponse) {
    try {
      // Handle messages from background script (not popup)
      if (request.type === 'FETCH_STATUS') {
        console.log(`📡 Background fetch status: ${request.message}`);
        return false; // Synchronous, no response needed
      }
      
      switch (request.action) {
        case 'getCourseInfo':
          const response = {
            courseId: this.courseId,
            courseName: this.courseName,
            url: window.location.href
          };
          console.log('✅ Sending course info response:', response);
          sendResponse(response);
          return false; // Synchronous response

      case 'scanPDFs':
        if (!this.courseId) {
          sendResponse({ error: 'No course detected on this page' });
          return false; // Synchronous response
        }
        const pdfs = this.getAllPdfLinks();
        sendResponse(pdfs);
        return false; // Synchronous response

      case 'getPDFs':
        try {
          const pdfLinks = this.getAllPdfLinks();
          console.log(`📎 getPDFs returning ${pdfLinks.length} PDFs`);
          sendResponse(pdfLinks);
        } catch (error) {
          console.error('Error getting PDFs:', error);
          sendResponse([]);
        }
        return false; // Synchronous response

      case 'ping':
        // Respond to ping to verify content script is ready
        const readyStatus = {
          ready: true,
          courseId: this.courseId,
          courseName: this.courseName,
          url: window.location.href,
          timestamp: Date.now()
        };
        console.log('🏓 Ping received, responding with ready status:', readyStatus);
        sendResponse(readyStatus);
        return false; // Synchronous response

      case 'getCurrentFileContext':
        try {
          const context = this.getCurrentFileMetadata();
          console.log('📄 Current file context:', context);
          sendResponse({ success: true, context: context });
        } catch (error) {
          console.error('Error getting file context:', error);
          sendResponse({ success: false, error: error.message });
        }
        return false; // Synchronous response

      case 'startAutoCrawl':
        console.log('Starting auto crawl...');
        if (!this.courseId) {
          sendResponse({ error: 'No course detected on this page. Please navigate to a Canvas course page.' });
          return false; // Synchronous response
        }
        this.startEnhancedCrawl();
        sendResponse({ started: true, crawlerState: this.crawlerState });
        return false; // Synchronous response

      case 'stopAutoCrawl':
        console.log('Stopping auto crawl...');
        this.stopCrawl();
        sendResponse({ stopped: true });
        return false; // Synchronous response

      case 'getCrawlerStatus':
        sendResponse(this.crawlerState);
        return false; // Synchronous response

      case 'startDeepCrawl':
        console.log('🔮 Manual LEGACY deep crawl requested from popup...');
        console.log('⚠️  Note: This uses the legacy system. For smart navigation, use startAutoCrawl instead.');
        if (!this.courseId) {
          sendResponse({ error: 'No course detected on this page' });
          return false; // Synchronous response
        }
        
        // Start legacy deep crawl asynchronously
        this.triggerDeepCrawlOnly()
          .then(pdfs => {
            console.log(`✅ Legacy deep crawl completed, found ${pdfs.length} PDFs`);
            // Note: PDFs are already reported via chrome.runtime.sendMessage in startDeepCrawl
          })
          .catch(error => {
            console.error('❌ Legacy deep crawl failed:', error);
          });
        
        sendResponse({ started: true, message: 'Legacy deep crawl started' });
        return false; // Synchronous response

      case 'triggerScan':
        console.log('📄 Manual comprehensive scan requested from popup (using smart navigation)...');
        if (!this.courseId) {
          sendResponse({ error: 'No course detected on this page' });
          return false; // Synchronous response
        }
        
        // Start comprehensive scan asynchronously using smart navigation
        this.triggerPDFScan()
          .then(() => {
            console.log('✅ Smart navigation scan completed');
          })
          .catch(error => {
            console.error('❌ Smart navigation scan failed:', error);
          });
        
        sendResponse({ started: true, message: 'Comprehensive scan started' });
        return false; // Synchronous response

      // Smart Navigation (Option 2) Message Handlers
      case 'startSmartCrawl':
        console.log('🚀 Smart crawl requested from popup (using background tab scanning)...');
        
        if (!this.courseId) {
          console.error('❌ No course ID found on current page');
          sendResponse({ success: false, error: 'No course detected on this page' });
          return true; // Keep channel open for response
        }
        
        // Use the enhanced crawl system that opens background tabs (works better)
        console.log('ℹ️  Using background tab scanning system for better stability');
        this.startEnhancedCrawl()
          .then(() => {
            console.log('✅ Enhanced crawl started successfully');
            sendResponse({ success: true, message: 'Background tab scanning started' });
          })
          .catch(error => {
            console.error('❌ Enhanced crawl start error:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep message channel open for async response

      case 'stopSmartCrawl':
        console.log('🛑 Stop smart navigation crawl requested...');
        if (!this.stateManager) {
          sendResponse({ error: 'Smart navigation not initialized' });
          return false; // Synchronous response
        }
        
        this.stopSmartNavigationCrawl()
          .then(result => {
            sendResponse(result);
          })
          .catch(error => {
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep message channel open for async response

      case 'getSmartCrawlProgress':
        if (!this.stateManager) {
          sendResponse({ active: false, error: 'Smart navigation not initialized' });
          return false; // Synchronous response
        }
        
        this.getSmartNavigationProgress()
          .then(result => {
            sendResponse(result);
          })
          .catch(error => {
            sendResponse({ active: false, error: error.message });
          });
        return true; // Keep message channel open for async response

      case 'clearSmartCrawlState':
        console.log('🗑️ Clear smart navigation state requested...');
        if (!this.stateManager) {
          sendResponse({ success: false, error: 'Smart navigation not initialized' });
          return false; // Synchronous response
        }
        
        this.stateManager.clearState()
          .then(() => {
            sendResponse({ success: true });
          })
          .catch(error => {
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep message channel open for async response

      default:
        console.log('Unknown action:', request.action);
        sendResponse({ error: 'Unknown action' });
        return false; // Synchronous response
    }
    } catch (error) {
      console.error('Canvas RAG Assistant: Error in handleMessage:', error);
      sendResponse({ error: error.message });
      return false; // Synchronous response
    }
  }

  async startEnhancedCrawl() {
    console.log('startEnhancedCrawl called, current running state:', this.crawlerState.isRunning);
    
    if (this.crawlerState.isRunning) {
      console.log('Crawler already running');
      return;
    }

    console.log('🚀 Starting SMART NAVIGATION crawler (primary system)...');
    console.log('ℹ️  This uses intelligent page navigation instead of legacy deep crawl');
    this.crawlerState.isRunning = true;
    this.crawlerState.visitedUrls.clear();
    this.crawlerState.foundPDFs.clear();
    this.crawlerState.pendingUrls = [];
    this.crawlerState.currentStep = 'Starting crawler...';
    
    // Notify background script that scan has started
    chrome.runtime.sendMessage({
      action: 'SCAN_STARTED',
      courseId: this.courseId,
      courseName: this.courseName
    }).catch(() => {
      console.log('Could not notify background of scan start');
    });

    try {
      // Step 1: Expand current page content
      console.log('Step 1: Expanding current page content...');
      this.crawlerState.currentStep = 'Expanding current page content';
      try {
        await this.expandCurrentPageContent();
        console.log('✅ Step 1 completed successfully');
      } catch (step1Error) {
        console.error('❌ Step 1 failed:', step1Error.message);
        throw step1Error;
      }
      
      // Step 2: Navigate to key course sections
      console.log('Step 2: Crawling course sections...');
      this.crawlerState.currentStep = 'Crawling course sections';
      try {
        await this.crawlCourseSections();
        console.log('✅ Step 2 completed successfully');
      } catch (step2Error) {
        console.error('❌ Step 2 failed:', step2Error.message);
        throw step2Error;
      }
      
      // Step 3: Deep crawl modules
      console.log('Step 3: Deep crawling modules...');
      this.crawlerState.currentStep = 'Deep crawling modules';
      try {
        await this.crawlModules();
        console.log('✅ Step 3 completed successfully');
      } catch (step3Error) {
        console.error('❌ Step 3 failed:', step3Error.message);
        throw step3Error;
      }
      
      // Step 4: Crawl assignments and files
      console.log('Step 4: Crawling assignments and files...');
      this.crawlerState.currentStep = 'Crawling assignments and files';
      try {
        await this.crawlAssignmentsAndFiles();
        console.log('✅ Step 4 completed successfully');
      } catch (step4Error) {
        console.error('❌ Step 4 failed:', step4Error.message);
        throw step4Error;
      }
      
      // Final report
      console.log('Crawl completed successfully!');
      this.crawlerState.currentStep = 'Completing crawl...';
      
      // Wait a moment to ensure all PDF discovery messages are processed
      await this.wait(2000);
      
      this.crawlerState.currentStep = 'complete';
      await this.reportCrawlComplete();
      
    } catch (error) {
      console.error('❌ CRITICAL CRAWLER ERROR:');
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Full error object:', error);
      console.error('Current step was:', this.crawlerState.currentStep);
      console.error('PDFs found before error:', this.crawlerState.foundPDFs.size);
      
      // Also try to get more details for DOMExceptions
      if (error instanceof DOMException) {
        console.error('DOMException code:', error.code);
        console.error('DOMException details:', error.toString());
      }
      
      this.crawlerState.currentStep = 'Error: ' + (error.message || error.name || 'Unknown error');
      
      // Only report completion if we actually found some PDFs
      // Otherwise the scan failed too early and shouldn't report success
      if (this.crawlerState.foundPDFs.size > 0) {
        console.log(`⚠️ Scan encountered error but found ${this.crawlerState.foundPDFs.size} PDFs, reporting partial results...`);
        await this.reportCrawlComplete();
      } else {
        console.error('❌ Scan failed with no PDFs found - NOT reporting completion');
        // Send error message to popup
        chrome.runtime.sendMessage({
          type: 'CRAWL_ERROR',
          courseId: this.courseId,
          error: error.message || 'Unknown error during scan',
          step: this.crawlerState.currentStep
        }).catch(() => {});
      }
    } finally {
      this.crawlerState.isRunning = false;
      console.log('Crawler finished, final state:', this.crawlerState);
    }
  }

  async expandCurrentPageContent() {
    this.crawlerState.currentStep = 'expanding_current_page';
    console.log('📖 Expanding current page content...');
    
    // Expand all collapsible content (modules, accordions, etc.)
    const expandButtons = document.querySelectorAll(
      '.expand_module_link, .collapse_module_link, .expand-btn, .collapse-btn, ' +
      '.module-header, .context_module .header, .toggle-details, .show-details, ' +
      'button[aria-expanded="false"], .expandable-toggle, .accordion-toggle'
    );
    
    console.log(`Found ${expandButtons.length} expandable elements`);
    
    for (const btn of expandButtons) {
      try {
        // Check if element is still in DOM and visible
        if (!btn || !btn.isConnected || btn.offsetParent === null) {
          continue;
        }
        
        // Check if it's actually collapsed before clicking
        const isCollapsed = btn.getAttribute('aria-expanded') === 'false' || 
                          btn.classList.contains('collapsed') ||
                          btn.classList.contains('expand_module_link');
        
        if (isCollapsed && btn.offsetParent !== null) { // Only click visible elements
          btn.click();
          await this.wait(300); // Wait for expansion animation
        }
      } catch (e) {
        console.log('Could not click expand button:', {
          error: e.message || e.name,
          element: btn.tagName,
          className: btn.className
        });
      }
    }
    
    // Click "Show more" / "Load more" buttons
    const loadMoreButtons = document.querySelectorAll(
      '.show-more, .load-more, .btn-show-more, .more-link, ' +
      '.paginate-more, .show-all-link'
    );
    
    // Also find buttons by text content (since :contains() doesn't work)
    const allButtons = document.querySelectorAll('button, .btn, a[role="button"]');
    const textBasedButtons = Array.from(allButtons).filter(btn => {
      try {
        if (!btn || !btn.isConnected) return false;
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('show more') || 
               text.includes('load more') || 
               text.includes('see more') ||
               text.includes('view more');
      } catch (e) {
        return false;
      }
    });
    
    // Combine both sets
    const allLoadMoreButtons = [...loadMoreButtons, ...textBasedButtons];
    console.log(`Found ${allLoadMoreButtons.length} load more buttons`);
    
    for (const btn of allLoadMoreButtons) {
      try {
        if (btn && btn.isConnected && btn.offsetParent !== null) { // Check if button is visible and in DOM
          btn.click();
          await this.wait(1000); // Wait for content to load
        }
      } catch (e) {
        console.log('Could not click load more button:', {
          error: e.message || e.name,
          element: btn?.tagName,
          className: btn?.className
        });
      }
    }
    
    // Handle Canvas-specific folder expansions in files section
    if (window.location.pathname.includes('/files')) {
      await this.expandAllFolders();
    }
    
    // Scan current page after expansion (smart navigation mode - surface scan only)
    const pdfs = this.getAllPdfLinks();
    for (const pdf of pdfs) {
      if (!this.crawlerState.foundPDFs.has(pdf.url)) {
        let finalUrl = pdf.url;
        let finalTitle = pdf.title;
        
        // Resolve module items
        if (pdf.needsRedirectResolution && pdf.url.includes('/modules/items/')) {
          console.log(`🔄 [expandCurrentPageContent] Resolving module item: ${pdf.url}`);
          const resolved = await this.resolveModuleItemUrl(pdf.url, pdf.title);
          
          if (resolved && resolved.url) {
            finalUrl = this.convertToDownloadURL(resolved.url);
            // Preserve original title if we have it
            if (resolved.title) {
              finalTitle = resolved.title;
            }
            console.log(`✅ [expandCurrentPageContent] Resolved to: ${finalUrl} with title: "${finalTitle}"`);
          } else {
            console.warn(`⚠️ [expandCurrentPageContent] Could not resolve: ${pdf.url}`);
            continue; // Skip unresolved module items
          }
        } else {
          finalUrl = this.convertToDownloadURL(pdf.url);
        }
        
        if (finalUrl) {
          this.crawlerState.foundPDFs.set(finalUrl, {
            title: finalTitle,
            filename: pdf.filename || this.extractFilename(finalUrl),
            context: pdf.context || 'After Expansion',
            type: pdf.type || 'expanded_content'
          });
          console.log(`📎 Smart Navigation found: ${finalTitle} -> ${finalUrl}`);
        }
      }
    }
  }

  async crawlCourseSections() {
    this.crawlerState.currentStep = 'crawling_sections';
    console.log('🗂️ Systematically crawling ALL course sections for PDF content...');
    
    const sectionsToVisit = [
      { path: 'modules', name: 'Modules', priority: 1, deepCrawl: true },       // Highest priority - contains most content
      { path: 'files', name: 'Files', priority: 2, deepCrawl: true },           // High priority - direct file browser
      { path: 'pages', name: 'Pages', priority: 3, deepCrawl: true },           // High priority - often contains embedded PDFs
      { path: 'assignments', name: 'Assignments', priority: 4, deepCrawl: true }, // Medium priority - attachments
      { path: 'syllabus', name: 'Syllabus', priority: 5, deepCrawl: false }    // Usually single page
    ];
    
    // Sort by priority (lower number = higher priority)
    sectionsToVisit.sort((a, b) => a.priority - b.priority);
    
    for (const section of sectionsToVisit) {
      if (!this.crawlerState.isRunning) {
        console.log('Crawler stopped, aborting section crawl');
        break;
      }

      const url = `${window.location.origin}/courses/${this.courseId}/${section.path}`;
      
      console.log(`📁 Visiting ${section.name} section (priority ${section.priority})...`);
      this.crawlerState.currentStep = `Crawling ${section.name}`;
      
      await this.navigateAndScan(url);
      
      // Special deep crawling for important sections
      if (section.deepCrawl) {
        switch (section.path) {
          case 'files':
            await this.deepCrawlFilesSection();
            break;
          case 'modules':
            await this.deepCrawlModulesSection();
            break;
          case 'pages':
            await this.deepCrawlPagesSection();
            break;
          case 'assignments':
            await this.deepCrawlAssignmentsSection();
            break;
        }
      }
    }
  }

  async deepCrawlFilesSection() {
    console.log('📂 Deep crawling files section...');
    this.crawlerState.currentStep = 'deep_crawl_files';
    
    // Wait for files to load
    await this.wait(2000);
    
    // Expand all folders first
    await this.expandAllFolders();
    
    // Look for file links in the files section
    let fileLinks = [];
    try {
      const selector = `.ef-item-row a[href*="/files/"], ` +
                      `.file-link a, ` +
                      `.instructure_file_link, ` +
                      `a[href*="/courses/${this.courseId}/files/"], ` +
                      `a[href$=".pdf"], ` +
                      `a[data-file-id]`;
      
      fileLinks = document.querySelectorAll(selector);
      console.log(`Found ${fileLinks.length} potential file links in files section`);
    } catch (selectorError) {
      console.error('Error with file links selector:', selectorError.message);
      // Fallback to simpler selectors
      fileLinks = document.querySelectorAll('a[href*="/files/"], a[href$=".pdf"]');
      console.log(`Found ${fileLinks.length} file links using fallback selector`);
    }
    
    for (const link of fileLinks) {
      const href = link.href;
      if (href && !this.crawlerState.visitedUrls.has(href)) {
        // Skip template URLs
        if (this.isTemplateUrl(href)) {
          console.warn(`⚠️ Skipping template URL in files section: ${href}`);
          continue;
        }
        // Check if it's a PDF or file preview link
        if (href.includes('.pdf') || href.includes('/preview') || href.includes('/download')) {
          console.log(`🔍 Examining file: ${link.textContent?.trim()}`);
          await this.navigateAndScan(href);
        }
      }
    }
  }

  async deepCrawlPagesSection() {
    console.log('📄 Deep crawling pages section...');
    this.crawlerState.currentStep = 'deep_crawl_pages';
    
    // Wait for pages to load
    await this.wait(2000);
    
    // Find all individual page links
    const pageLinks = document.querySelectorAll(
      '.pages .page-title a, ' +
      '.wiki-page-link, ' +
      'a[href*="/pages/"], ' +
      '.page-list a, ' +
      '.wiki-page-menu-item a'
    );
    
    console.log(`Found ${pageLinks.length} pages to crawl`);
    
    for (const link of pageLinks) {
      const href = link.href;
      if (href && !this.crawlerState.visitedUrls.has(href) && href.includes(this.courseId)) {
        // Skip template URLs
        if (this.isTemplateUrl(href)) {
          console.warn(`⚠️ Skipping template URL in pages section: ${href}`);
          continue;
        }
        console.log(`📖 Crawling page: ${link.textContent?.trim()}`);
        await this.navigateAndScan(href);
        
        // After navigating to the page, specifically look for embedded content
        await this.scanPageForEmbeddedContent();
      }
    }
  }

  async expandAllFolders() {
    console.log('📁 Expanding all folders...');
    
    try {
      // Canvas files section folder expansion
      const folderToggles = document.querySelectorAll(
        '.ef-folder .ef-name-col button, ' +
        '.folder-toggle, ' +
        '.ef-folder-toggle, ' +
        'button[aria-label*="folder"], ' +
        '.icon-folder button'
      );
      
      console.log(`Found ${folderToggles.length} folder toggles`);
      
      for (const toggle of folderToggles) {
        try {
          if (toggle && toggle.isConnected && toggle.offsetParent !== null) {
            toggle.click();
            await this.wait(300); // Wait for folder to expand
          }
        } catch (e) {
          console.log('Could not expand folder:', {
            error: e.message || e.name,
            element: toggle?.tagName,
            className: toggle?.className
          });
        }
      }
    } catch (e) {
      console.error('Error in expandAllFolders:', {
        name: e.name,
        message: e.message,
        error: e
      });
    }
  }

  async scanPageForEmbeddedContent() {
    console.log('🔍 Scanning page for embedded content...');
    
    // Wait for page content to fully load
    await this.wait(1000);
    
    // Look for iframes that might contain PDFs
    const iframes = document.querySelectorAll('iframe');
    console.log(`Found ${iframes.length} iframes to examine`);
    
    for (const iframe of iframes) {
      const src = iframe.src;
      if (src) {
        console.log(`Iframe src: ${src}`);
        
        // Extract Canvas file IDs from iframe sources
        if (src.includes('/files/') || src.includes('file_contents') || src.includes('preview')) {
          this.extractFileFromIframe(iframe, src);
        }
      }
    }
    
    // Look for embedded file viewers (Canvas often uses these)
    const fileViewers = document.querySelectorAll(
      '.file-preview, ' +
      '.canvas-file-viewer, ' +
      '[data-file-id], ' +
      '[data-file-url], ' +
      '.attachment-link'
    );
    
    for (const viewer of fileViewers) {
      this.extractFileFromElement(viewer);
    }
  }

  async crawlModules() {
    this.crawlerState.currentStep = 'crawling_modules';
    console.log('📚 Deep crawling modules with sub-link exploration...');
    
    // Navigate to modules page if not already there
    const modulesUrl = `${window.location.origin}/courses/${this.courseId}/modules`;
    await this.navigateAndScan(modulesUrl);
    
    // Expand all modules first
    await this.expandCurrentPageContent();
    
    // Find all module items and visit them
    const moduleItems = document.querySelectorAll(
      '.context_module_item a, .module-item-title a, .ig-title a, .module-item a'
    );
    
    console.log(`Found ${moduleItems.length} module items to explore`);
    
    for (const item of moduleItems) {
      const href = item.href;
      if (href && !this.crawlerState.visitedUrls.has(href) && href.includes(this.courseId)) {
        // Skip quizzes, discussions, and announcements in modules
        if (href.includes('/quizzes/') || 
            href.includes('/discussion_topics/') || 
            href.includes('/announcements/')) {
          console.log(`⏭️ Skipping ${this.getUrlType(href)}: ${item.textContent?.trim()}`);
          continue;
        }
        
        console.log(`📄 Visiting module item: ${item.textContent?.trim()} (${this.getUrlType(href)})`);
        await this.navigateAndScan(href);
        
        // Explore sub-links on each module item page (2 layers deep)
        await this.exploreSubLinks(href, 2);
      }
    }
  }

  async crawlAssignmentsAndFiles() {
    this.crawlerState.currentStep = 'crawling_assignments_files';
    console.log('📋 Crawling assignments and files...');
    
    // Navigate to assignments page
    const assignmentsUrl = `${window.location.origin}/courses/${this.courseId}/assignments`;
    await this.navigateAndScan(assignmentsUrl);
    
    // Find all assignment links
    const assignmentLinks = document.querySelectorAll(
      '.assignment_list a, .assignment-list a, .assignment-title a'
    );
    
    for (const link of assignmentLinks) {
      const href = link.href;
      if (href && !this.crawlerState.visitedUrls.has(href) && href.includes(this.courseId)) {
        console.log(`📝 Visiting assignment: ${link.textContent?.trim()}`);
        await this.navigateAndScan(href);
      }
    }
    
    // Navigate to files page
    const filesUrl = `${window.location.origin}/courses/${this.courseId}/files`;
    await this.navigateAndScan(filesUrl);
  }

  async deepCrawlModulesSection() {
    console.log('📚 Deep crawling modules section with systematic approach...');
    this.crawlerState.currentStep = 'deep_crawl_modules';
    
    // Wait for modules to load
    await this.wait(2000);
    
    // Expand all modules first
    await this.expandCurrentPageContent();
    
    // Look for all module items and clickable content
    const moduleItems = document.querySelectorAll(
      '.context_module_item a, ' +
      '.module-item a, ' +
      '.ig-row a, ' +
      '.module_item_title a, ' +
      '.item-group-container a'
    );
    
    console.log(`Found ${moduleItems.length} module items to examine`);
    
    const itemsToVisit = [];
    
    // Collect all unique module item URLs
    for (const item of moduleItems) {
      const href = item.href;
      if (href && href.includes(this.courseId) && !this.crawlerState.visitedUrls.has(href)) {
        // Skip template URLs
        if (this.isTemplateUrl(href)) {
          console.warn(`⚠️ Skipping template URL in modules section: ${href}`);
          continue;
        }
        // Focus on content types most likely to contain PDFs (exclude quizzes/discussions)
        if (href.includes('/files/') || 
            href.includes('/pages/') || 
            href.includes('/assignments/') ||
            href.includes('/external_tools/')) {
          
          itemsToVisit.push({
            url: href,
            title: item.textContent?.trim() || 'Module Item',
            type: this.getUrlType(href)
          });
        }
      }
    }
    
    console.log(`Will systematically visit ${itemsToVisit.length} module items (excluding quizzes/discussions/announcements)`);
    
    // Visit each module item and look for sub-links
    for (const item of itemsToVisit) {
      if (!this.crawlerState.isRunning) break;
      
      console.log(`📖 Visiting module item: ${item.title} (${item.type})`);
      await this.navigateAndScan(item.url);
      
      // After visiting the main item, look for sub-links on that page (go 2 layers deep)
      await this.exploreSubLinks(item.url, 2);
      
      // If it's a page, scan for embedded content
      if (item.type === 'page') {
        await this.scanPageForEmbeddedContent();
      }
    }
  }

  async deepCrawlAssignmentsSection() {
    console.log('📝 Deep crawling assignments section...');
    this.crawlerState.currentStep = 'deep_crawl_assignments';
    
    await this.wait(2000);
    
    // Find all assignment links
    const assignmentLinks = document.querySelectorAll(
      '.assignment_list a[href*="/assignments/"], ' +
      '.assignment-list a, ' +
      'a[href*="/assignments/"], ' +
      '.assignment-title a'
    );
    
    console.log(`Found ${assignmentLinks.length} assignments to examine`);
    
    for (const link of assignmentLinks) {
      if (!this.crawlerState.isRunning) break;
      
      const href = link.href;
      if (href && href.includes(this.courseId) && !this.crawlerState.visitedUrls.has(href)) {
        // Skip template URLs
        if (this.isTemplateUrl(href)) {
          console.warn(`⚠️ Skipping template URL in assignments section: ${href}`);
          continue;
        }
        console.log(`📋 Visiting assignment: ${link.textContent?.trim()}`);
        await this.navigateAndScan(href);
        
        // Look for file attachments on assignment pages
        await this.scanForFileAttachments();
      }
    }
  }

  async navigateAndScan(url) {
    // Check for template URLs first
    if (this.isTemplateUrl(url)) {
      console.warn(`⚠️ Skipping template URL: ${url}`);
      return;
    }
    
    if (this.crawlerState.visitedUrls.has(url) || !this.crawlerState.isRunning) {
      console.log(`⏭️ Skipping ${url} (already visited or crawler stopped)`);
      return;
    }
    
    this.crawlerState.visitedUrls.add(url);
    
    try {
      console.log(`🧭 Smart Navigation opening: ${url}`);
      
      // Check if we're already on the target page
      if (window.location.href === url || 
          window.location.href.startsWith(url) ||
          window.location.pathname === new URL(url).pathname) {
        console.log('✅ Already on target page, performing scan...');
        await this.wait(1000);
        await this.performThoroughPageScan();
      } else {
        // Check if it's a module item that needs resolution
        if (url.includes('/modules/items/')) {
          console.log(`🔄 Module item detected, resolving: ${url}`);
          const resolvedUrl = await this.resolveModuleItemUrl(url);
          
          if (resolvedUrl) {
            const downloadUrl = this.convertToDownloadURL(resolvedUrl);
            if (downloadUrl && !this.crawlerState.foundPDFs.has(downloadUrl)) {
              this.crawlerState.foundPDFs.set(downloadUrl, {
                title: this.extractFilename(downloadUrl) || 'Canvas PDF',
                filename: this.extractFilename(downloadUrl) || 'document.pdf',
                context: 'Resolved Module Item',
                type: 'resolved_module_item'
              });
              console.log(`✅ Resolved and added module item: ${downloadUrl}`);
            }
          }
          return;
        }
        
        // Check if URL itself is a PDF
        if (url.includes('.pdf') || url.includes('/download')) {
          console.log(`📄 Direct PDF URL detected: ${url}`);
          const titleFromUrl = this.extractFilename(url) || 'Canvas PDF';
          this.crawlerState.foundPDFs.set(url, {
            title: titleFromUrl,
            filename: this.extractFilename(url) || 'document.pdf',
            context: 'Direct PDF Link',
            type: 'direct_pdf'
          });
          console.log(`✅ Added direct PDF: ${titleFromUrl}`);
          return;
        }
        
        // Open URL in background tab and scan it
        console.log(`🔄 Opening background tab for: ${url}`);
        
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: 'OPEN_AND_SCAN_TAB',
            url: url,
            courseId: this.courseId
          }, (response) => {
            if (response && response.pdfs) {
              console.log(`✅ Background tab scan found ${response.pdfs.length} PDFs from ${url}`);
              response.pdfs.forEach(pdf => {
                if (!this.crawlerState.foundPDFs.has(pdf.url)) {
                  this.crawlerState.foundPDFs.set(pdf.url, {
                    title: pdf.title || 'Canvas PDF',
                    filename: pdf.filename || this.extractFilename(pdf.url),
                    context: pdf.context || 'Background Tab Scan',
                    type: pdf.type || 'background_scan'
                  });
                  console.log(`📎 Smart Navigation found: ${pdf.title}`);
                }
              });
            }
            resolve();
          });
        });
      }
      
    } catch (error) {
      console.error(`Error with ${url}:`, error);
      // Just scan current page as fallback (smart navigation mode)
      const pdfs = this.getAllPdfLinks();
      pdfs.forEach(pdf => {
        if (!this.crawlerState.foundPDFs.has(pdf.url)) {
          // Skip module items in fallback - they need proper resolution
          if (pdf.needsRedirectResolution && pdf.url.includes('/modules/items/')) {
            console.warn(`⚠️ Skipping module item in fallback scan (needs resolution): ${pdf.title}`);
            return;
          }
          
          this.crawlerState.foundPDFs.set(pdf.url, {
            title: pdf.title || 'Canvas PDF',
            filename: pdf.filename || this.extractFilename(pdf.url),
            context: pdf.context || 'Fallback Scan',
            type: pdf.type || 'fallback_scan'
          });
          console.log(`📎 Smart Navigation found: ${pdf.title}`);
        }
      });
    }
  }



  async performThoroughPageScan() {
    console.log(`🔍 Performing thorough page scan on: ${window.location.href}`);
    
    // Wait for page to fully load
    await this.wait(2000);
    
    // Expand all content first
    await this.expandCurrentPageContent();
    
    // Get PDF count before scan
    const pdfsBeforeScan = this.crawlerState.foundPDFs.size;
    
    // Scan for PDFs (smart navigation mode - surface scan only)
    const pdfs = this.getAllPdfLinks();
    
    // Resolve module items to actual PDFs
    for (const pdf of pdfs) {
      if (!this.crawlerState.foundPDFs.has(pdf.url)) {
        let finalUrl = pdf.url;
        let finalTitle = pdf.title;
        
        // Resolve module items
        if (pdf.needsRedirectResolution && pdf.url.includes('/modules/items/')) {
          console.log(`🔄 Resolving module item: ${pdf.url}`);
          const resolved = await this.resolveModuleItemUrl(pdf.url, pdf.title);
          
          if (resolved && resolved.url) {
            finalUrl = this.convertToDownloadURL(resolved.url);
            // Preserve original title if we have it
            if (resolved.title) {
              finalTitle = resolved.title;
            }
            console.log(`✅ Resolved module item to: ${finalUrl} with title: "${finalTitle}"`);
          } else {
            console.warn(`⚠️ Could not resolve module item: ${pdf.url}`);
            continue; // Skip unresolved module items
          }
        } else {
          finalUrl = this.convertToDownloadURL(pdf.url);
        }
        
        if (finalUrl) {
          this.crawlerState.foundPDFs.set(finalUrl, {
            title: finalTitle,
            filename: pdf.filename || this.extractFilename(finalUrl),
            context: pdf.context || 'Smart Navigation',
            type: pdf.type || 'resolved_pdf'
          });
          console.log(`📎 Smart Navigation found: ${finalTitle} -> ${finalUrl}`);
        }
      }
    }
    
    // Additional scans for embedded content
    await this.scanPageForEmbeddedContent();
    
    // Scan for file attachments
    await this.scanForFileAttachments();
    
    // Log results
    const pdfsAfterScan = this.crawlerState.foundPDFs.size;
    const newPdfsFound = pdfsAfterScan - pdfsBeforeScan;
    console.log(`✅ Thorough page scan completed: ${newPdfsFound} new PDFs found on ${window.location.href}`);
    
    // If we found 0 PDFs, let's be more aggressive and look for any file links
    if (newPdfsFound === 0) {
      console.log('🔎 No PDFs found, scanning for any file links as backup...');
      const allLinks = document.querySelectorAll('a[href]');
      let potentialPdfs = 0;
      
      allLinks.forEach(link => {
        const href = link.href;
        const text = link.textContent?.toLowerCase() || '';
        
        // Look for any file-related links
        if (href.includes('/files/') || 
            href.includes('/download') || 
            text.includes('pdf') ||
            text.includes('file') ||
            text.includes('attachment')) {
          console.log(`🔗 Potential file link: "${link.textContent?.trim()}" -> ${href}`);
          potentialPdfs++;
        }
      });
      
      console.log(`📊 Found ${potentialPdfs} potential file links on page`);
    }
  }

  async handleFilesPage() {
    console.log('📁 Handling files page...');
    
    // Click "Load more" buttons if they exist
    const loadMoreButtons = document.querySelectorAll('.load-more, .show-more, .btn-show-more');
    for (const btn of loadMoreButtons) {
      try {
        btn.click();
        await this.wait(1000);
      } catch (e) {
        console.log('Could not click load more:', e);
      }
    }
    
    // Expand all folders
    await this.expandAllFolders();
  }

  async handleIndividualPage() {
    console.log('📄 Handling individual page...');
    
    // Wait for page content to render
    await this.wait(1500);
    
    // Look for "Show more" content toggles
    const showMoreButtons = document.querySelectorAll('.show-more, .toggle-details, .expand-content');
    for (const btn of showMoreButtons) {
      try {
        btn.click();
        await this.wait(500);
      } catch (e) {
        console.log('Could not click show more:', e);
      }
    }
    
    // Scan for embedded content
    await this.scanPageForEmbeddedContent();
  }

  async handleAssignmentPage() {
    console.log('📝 Handling assignment page...');
    
    // Look for assignment attachments
    const attachmentLinks = document.querySelectorAll(
      '.attachment a, .file-upload a, .submission-attachment a, ' +
      'a[href*="download"], a[href*="files/"]'
    );
    
    console.log(`Found ${attachmentLinks.length} potential assignment attachments`);
    
    for (const link of attachmentLinks) {
      const href = link.href;
      if (href && (href.includes('.pdf') || href.includes('/files/'))) {
        const title = link.textContent?.trim() || this.extractFilename(href);
        console.log(`📎 Found assignment attachment: ${title}`);
        this.crawlerState.foundPDFs.set(href, {
          title: title,
          filename: this.extractFilename(href) || 'document.pdf',
          context: 'Assignment Attachment',
          type: 'assignment_attachment'
        });
      }
    }
  }

  async waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }
      
      const checkLoaded = () => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          setTimeout(checkLoaded, 100);
        }
      };
      
      checkLoaded();
    });
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getUrlType(url) {
    if (url.includes('/files/')) return 'file';
    if (url.includes('/pages/')) return 'page';
    if (url.includes('/assignments/')) return 'assignment';
    if (url.includes('/quizzes/')) return 'quiz';
    if (url.includes('/discussion_topics/')) return 'discussion';
    if (url.includes('/external_tools/')) return 'external_tool';
    return 'unknown';
  }
  
  async exploreSubLinks(pageUrl, maxDepth = 2, currentDepth = 1) {
    if (currentDepth > maxDepth || !this.crawlerState.isRunning) return;
    
    console.log(`🔍 Exploring sub-links on current page (depth ${currentDepth}/${maxDepth})`);
    
    // Wait for page content to load
    await this.wait(1500);
    
    // Look for links that might lead to PDFs
    const subLinks = document.querySelectorAll(
      'a[href*=".pdf"], ' +
      'a[href*="/files/"], ' +
      'a[href*="/download"], ' +
      'a[href*="/preview"], ' +
      '.instructure_file_link, ' +
      '.file-link a, ' +
      'a[data-file-id], ' +
      '.attachment a, ' +
      '.file a, ' +
      '.document a'
    );
    
    const directPdfLinks = new Set();
    const pageLinksToExplore = new Set();
    
    for (const link of subLinks) {
      const href = link.href;
      const text = link.textContent?.trim() || '';
      
      if (href && 
          !this.crawlerState.visitedUrls.has(href) && 
          (href.includes(this.courseId) || href.includes('.pdf'))) {
        
        // Separate direct PDF links from page links
        if (href.includes('.pdf') || 
            href.includes('/download') || 
            text.toLowerCase().includes('pdf')) {
          directPdfLinks.add({url: href, title: text});
        } else if (href.includes('/pages/') || 
                  href.includes('/assignments/') ||
                  href.includes('/files/')) {
          pageLinksToExplore.add({url: href, title: text});
        }
      }
    }
    
    console.log(`Found ${directPdfLinks.size} direct PDF links and ${pageLinksToExplore.size} pages to explore at depth ${currentDepth}`);
    
    // Process direct PDF links immediately
    for (const pdfLink of directPdfLinks) {
      if (!this.crawlerState.isRunning) break;
      
      console.log(`📄 Noted direct PDF: ${pdfLink.title} -> ${pdfLink.url}`);
      this.crawlerState.foundPDFs.set(pdfLink.url, {
        title: pdfLink.title || this.extractFilename(pdfLink.url),
        filename: this.extractFilename(pdfLink.url) || 'document.pdf',
        context: 'Sub-link Exploration',
        type: 'sublink_pdf'
      });
      this.crawlerState.visitedUrls.add(pdfLink.url);
    }
    
    // For pages, only explore if we haven't reached max depth
    if (currentDepth < maxDepth) {
      for (const pageLink of pageLinksToExplore) {
        if (!this.crawlerState.isRunning) break;
        
        console.log(`🔗 Would explore page: ${pageLink.title} -> ${pageLink.url}`);
        // Mark as visited but don't actually navigate to avoid complexity
        this.crawlerState.visitedUrls.add(pageLink.url);
      }
    }
  }

  async scanForFileAttachments() {
    console.log('🔍 Scanning for file attachments...');
    
    // Wait for page to load
    await this.wait(1000);
    
    // Multiple selectors for file attachments across different Canvas page types
    const fileSelectors = [
      'a[href*="/files/"]',                    // Direct file links
      '.attachment a',                         // Attachment links
      '.instructure_file_link',               // Canvas file links
      'a[href$=".pdf"]',                      // Direct PDF links
      '.file-link a',                         // File link containers
      'iframe[src*="/files/"]',               // Embedded file iframes
      '.user_content a[href*="/files/"]',     // User content file links
      '.message a[href*="/files/"]',          // Message attachments
      '.submission-file a[href*="/files/"]'   // Submission files
    ];
    
    for (const selector of fileSelectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`Found ${elements.length} elements with selector: ${selector}`);
      
      for (const element of elements) {
        if (element.tagName === 'IFRAME') {
          this.extractFileFromIframe(element, element.src);
        } else if (element.href) {
          this.extractFileFromElement(element);
        }
      }
    }
    
    // Also scan current page for any PDFs we might have missed (smart navigation mode)
    const pdfs = this.getAllPdfLinks();
    for (const pdf of pdfs) {
      if (!this.crawlerState.foundPDFs.has(pdf.url)) {
        let finalUrl = pdf.url;
        let finalTitle = pdf.title;
        
        // Resolve module items
        if (pdf.needsRedirectResolution && pdf.url.includes('/modules/items/')) {
          console.log(`🔄 [scanPageForEmbeddedContent] Resolving module item: ${pdf.url}`);
          const resolved = await this.resolveModuleItemUrl(pdf.url, pdf.title);
          
          if (resolved && resolved.url) {
            finalUrl = this.convertToDownloadURL(resolved.url);
            // Preserve original title if we have it
            if (resolved.title) {
              finalTitle = resolved.title;
            }
            console.log(`✅ [scanPageForEmbeddedContent] Resolved to: ${finalUrl} with title: "${finalTitle}"`);
          } else {
            console.warn(`⚠️ [scanPageForEmbeddedContent] Could not resolve: ${pdf.url}`);
            continue; // Skip unresolved module items
          }
        } else {
          finalUrl = this.convertToDownloadURL(pdf.url);
        }
        
        if (finalUrl) {
          this.crawlerState.foundPDFs.set(finalUrl, {
            title: finalTitle,
            filename: pdf.filename || this.extractFilename(finalUrl),
            context: pdf.context || 'Embedded Content Scan',
            type: pdf.type || 'embedded_scan'
          });
          console.log(`📎 Smart Navigation found: ${finalTitle} -> ${finalUrl}`);
        }
      }
    }
  }

  stopCrawl() {
    console.log('🛑 Stopping crawler...');
    this.crawlerState.isRunning = false;
    this.crawlerState.currentStep = 'stopped';
  }

  async reportCrawlComplete() {
    const totalPDFs = this.crawlerState.foundPDFs.size;
    const totalPages = this.crawlerState.visitedUrls.size;
    const visitedUrlsArray = Array.from(this.crawlerState.visitedUrls);
    
    console.log(`🏁 Crawl complete! Summary:`, {
      pagesVisited: totalPages,
      pdfsFound: totalPDFs,
      visitedPages: visitedUrlsArray
    });
    
    // Send final batch of all found PDFs (no duplicates since we used a Map)
    if (totalPDFs > 0) {
      console.log(`🔄 Processing ${totalPDFs} PDFs for final report, resolving any remaining module items...`);
      
      const resolvedPdfs = [];
      const entries = Array.from(this.crawlerState.foundPDFs.entries());
      
      for (const [url, metadata] of entries) {
        // If this is still an unresolved module item URL, resolve it now
        if (url.includes('/modules/items/')) {
          console.log(`🔄 Resolving unresolved module item in final report: ${metadata.title} -> ${url}`);
          try {
            const resolved = await this.resolveModuleItemUrl(url, metadata.title);
            if (resolved && resolved.url) {
              const downloadUrl = this.convertToDownloadURL(resolved.url);
              resolvedPdfs.push({
                url: downloadUrl,
                title: resolved.title || metadata.title || this.extractFilename(downloadUrl) || 'Canvas PDF',
                filename: this.extractFilename(downloadUrl) || 'document.pdf',
                context: metadata.context || 'Final Crawl Results (Resolved)',
                type: 'resolved_module_item'
              });
              console.log(`✅ Resolved in final report: ${metadata.title} -> ${downloadUrl}`);
            } else {
              console.warn(`⚠️ Could not resolve module item in final report: ${url}`);
            }
          } catch (error) {
            console.error(`❌ Error resolving module item in final report: ${url}`, error);
          }
        } else {
          // Already resolved or direct PDF link
          resolvedPdfs.push({
            url: url,
            title: metadata.title || this.extractFilename(url) || 'Canvas PDF',
            filename: metadata.filename || this.extractFilename(url) || 'document.pdf',
            context: metadata.context || 'Final Crawl Results',
            type: metadata.type || 'crawl_result'
          });
        }
      }
      
      console.log(`📦 Sending final batch of ${resolvedPdfs.length} unique PDFs to background script (from ${totalPDFs} total, resolved all module items)`);
      
      chrome.runtime.sendMessage({
        type: 'FOUND_PDFS',
        courseId: this.courseId,
        courseName: this.courseName,
        pdfs: resolvedPdfs,
        pageUrl: location.href,
        crawlerActive: false
      });
    }
    
    chrome.runtime.sendMessage({
      type: 'CRAWL_COMPLETE',
      courseId: this.courseId,
      pagesVisited: totalPages,
      pdfsFound: totalPDFs,
      visitedUrls: visitedUrlsArray
    });
    
    this.crawlerState.currentStep = 'complete';
  }

  getAllPdfLinks() {
    const links = new Set();
    const pdfData = [];
    
    // First, detect Canvas module patterns for systematic discovery
    const modulePatterns = this.detectCanvasModulePatterns();
    console.log(`🔍 Detected ${modulePatterns.length} Canvas module patterns`);
    
    // Process all items in detected lecture series patterns
    modulePatterns.forEach(pattern => {
      pattern.items.forEach(item => {
        const link = item.querySelector('a[href*="/modules/items/"]');
        if (link) {
          const href = link.getAttribute('href');
          const text = link.textContent?.trim() || '';
          const absoluteUrl = this.makeAbsoluteUrl(href, window.location.href);
          
          // Skip template placeholder URLs
          if (absoluteUrl && (absoluteUrl.includes('{{') || absoluteUrl.includes('%7B%7B'))) {
            console.log(`🚫 Skipping template placeholder URL: ${absoluteUrl}`);
            return;
          }
          
          if (absoluteUrl && !links.has(absoluteUrl)) {
            links.add(absoluteUrl);
            pdfData.push({
              url: absoluteUrl,
              title: text || `Canvas Module Item (${pattern.type})`,
              filename: this.extractFilename(absoluteUrl),
              context: `Module pattern: ${pattern.type} (confidence: ${pattern.confidence})`,
              type: 'canvas_module_pattern',
              needsRedirectResolution: true,
              patternType: pattern.type,
              confidence: pattern.confidence
            });
            
            console.log(`📋 Added from pattern: "${text}" -> ${absoluteUrl}`);
          }
        }
      });
    });

    // 1. Direct PDF URLs (.pdf at end or in query)
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      const cleanText = this.extractCleanLinkText(a);

      if (href.match(/\.pdf($|\?)/i)) {
        links.add(href);
        pdfData.push({
          url: href,
          title: cleanText || this.extractFilename(href) || 'Untitled PDF',
          filename: this.extractFilename(href),
          context: this.findContext(a),
          type: 'direct_link'
        });
      }

      // Canvas file viewer links (enhanced patterns) - only include if likely to be PDF
      if (href.includes('/files/') && !href.includes('folder')) {
        const cleanText = this.extractCleanLinkText(a);
        
        // Additional checks to see if this might be a PDF based on context
        const isProbablyPDF = cleanText?.toLowerCase().includes('pdf') || 
                             cleanText?.toLowerCase().includes('.pdf') ||
                             a.querySelector('.icon-pdf, .file-icon[class*="pdf"]') ||
                             a.closest('.attachment')?.textContent?.toLowerCase().includes('pdf');
        
        // Only process if it's probably a PDF or if it's a download link
        if (isProbablyPDF || href.includes('/download')) {
          // Try multiple methods to get a good title
          let betterTitle = this.extractBetterTitle(a, href);
          
          const finalTitle = betterTitle || 
                            this.extractFilename(href) ||
                            'Canvas File';
          
          // Convert to download URL if it's not already
          let downloadUrl = href;
          if (!href.includes('/download') && href.includes('/files/')) {
            const fileIdMatch = href.match(/\/files\/(\d+)/);
            if (fileIdMatch) {
              downloadUrl = `${window.location.origin}/courses/${this.courseId}/files/${fileIdMatch[1]}/download`;
            }
          }
          
          links.add(downloadUrl);
          pdfData.push({
            url: downloadUrl,
            title: finalTitle,
            filename: this.extractFilename(downloadUrl),
            context: this.findContext(a),
            type: 'canvas_pdf',
            isProbablyPDF: isProbablyPDF
          });
        }
      }

      // Skip Canvas file redirection links as they often redirect to HTML previews
      // These URLs with 'file_contents' or 'verifier=' are often preview links, not download links

      // Canvas course files URLs
      if (href.includes(`/courses/${this.courseId}/files/`) && href.includes('/download')) {
        links.add(href);
        pdfData.push({
          url: href,
          title: cleanText || 'Course File',
          filename: this.extractFilename(href),
          context: this.findContext(a),
          type: 'course_file'
        });
      }
    });

    // 2. Embedded PDFs inside iframes
    document.querySelectorAll('iframe').forEach(frame => {
      const src = frame.src;
      if (!src) return;

      if (src.match(/\.pdf($|\?)/i)) {
        links.add(src);
        pdfData.push({
          url: src,
          title: 'Embedded PDF',
          filename: this.extractFilename(src),
          context: this.findContext(frame),
          type: 'iframe_embed'
        });
      }

      // Only process iframe Canvas files if they're clearly PDF files
      if (src.includes('/files/') && (src.includes('.pdf') || src.includes('/download'))) {
        // Convert to download URL if it's not already
        let downloadUrl = src;
        if (!src.includes('/download') && src.includes('/files/')) {
          const fileIdMatch = src.match(/\/files\/(\d+)/);
          if (fileIdMatch) {
            downloadUrl = `${window.location.origin}/courses/${this.courseId}/files/${fileIdMatch[1]}/download`;
          }
        }
        
        links.add(downloadUrl);
        pdfData.push({
          url: downloadUrl,
          title: 'Embedded PDF File',
          filename: this.extractFilename(downloadUrl),
          context: this.findContext(frame),
          type: 'iframe_canvas'
        });
      }

      if (src.includes('file_contents')) {
        links.add(src);
        pdfData.push({
          url: src,
          title: 'Embedded File Content',
          filename: this.extractFilename(src),
          context: this.findContext(frame),
          type: 'iframe_content'
        });
      }
    });

    // 3. PDFs referenced in data attributes (Canvas LOVES this)
    document.querySelectorAll('[data-href], [data-file-url], [data-url]').forEach(el => {
      const attrs = ['data-href', 'data-file-url', 'data-url'];
      attrs.forEach(attrName => {
        const value = el.getAttribute(attrName);
        if (!value) return;

        if (value.match(/\.pdf($|\?)/i)) {
          const absoluteUrl = new URL(value, location.origin).href;
          links.add(absoluteUrl);
          pdfData.push({
            url: absoluteUrl,
            title: el.textContent?.trim() || 'Data Attribute PDF',
            filename: this.extractFilename(value),
            context: this.findContext(el),
            type: 'data_attribute',
            attribute: attrName
          });
        }
        
        if (value.includes('/files/')) {
          const absoluteUrl = new URL(value, location.origin).href;
          links.add(absoluteUrl);
          pdfData.push({
            url: absoluteUrl,
            title: el.textContent?.trim() || 'Data Attribute File',
            filename: this.extractFilename(value),
            context: this.findContext(el),
            type: 'data_file',
            attribute: attrName
          });
        }
      });
    });

    // Remove duplicates and normalize URLs
    const uniquePDFs = this.deduplicatePDFs(pdfData);

    return uniquePDFs;
  }

  deduplicatePDFs(pdfData) {
    const seenFiles = new Map(); // file ID -> best PDF object
    const seenUrls = new Set(); // track exact URLs to avoid true duplicates
    const seenTitles = new Set(); // track titles to avoid duplicates
    const uniquePDFs = [];
    
    // Generic titles that should be filtered out
    const genericTitles = [
      'ladda ner', 'ladda ned', 'download', 
      'förhandsvisning', 'preview',
      'canvas file', 'canvas pdf', 'untitled pdf'
    ];
    
    for (const pdf of pdfData) {
      // Skip if we've already seen this exact URL
      if (seenUrls.has(pdf.url)) {
        console.log(`⏭️ Skipping duplicate URL: ${pdf.url}`);
        continue;
      }
      
      // Extract Canvas file ID if present
      const fileIdMatch = pdf.url.match(/\/files\/(\d+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : null;
      
      // Create a normalized title for comparison
      const normalizedTitle = pdf.title.toLowerCase().trim().replace(/\.pdf$/i, '');
      const isGenericTitle = genericTitles.some(gt => normalizedTitle.includes(gt));
      
      if (fileId) {
        // This is a Canvas file - deduplicate by file ID
        if (seenFiles.has(fileId)) {
          const existing = seenFiles.get(fileId);
          
          // Determine which entry is better
          const hasDownloadUrl = pdf.url.includes('/download?download_frd=');
          const existingHasDownloadUrl = existing.url.includes('/download?download_frd=');
          const hasBetterTitle = !isGenericTitle && (existing.title.length < pdf.title.length || 
                                                      genericTitles.some(gt => existing.title.toLowerCase().includes(gt)));
          
          // Prefer entries with: 1) Better titles, 2) Download URLs with filenames
          const preferThis = hasBetterTitle || (hasDownloadUrl && !existingHasDownloadUrl);
          
          if (preferThis) {
            console.log(`🔄 Replacing file ${fileId}: "${existing.title}" -> "${pdf.title}"`);
            seenUrls.delete(existing.url); // Remove old URL from seen list
            seenFiles.set(fileId, pdf);
            seenUrls.add(pdf.url);
          } else {
            console.log(`✓ Keeping existing file ${fileId}: "${existing.title}"`);
            seenUrls.add(pdf.url); // Mark this URL as seen even though we're not using it
          }
        } else {
          // First time seeing this file ID
          seenFiles.set(fileId, pdf);
          seenUrls.add(pdf.url);
        }
      } else {
        // Not a Canvas file ID - deduplicate by title
        if (!seenTitles.has(normalizedTitle) && !isGenericTitle) {
          seenTitles.add(normalizedTitle);
          seenUrls.add(pdf.url);
          uniquePDFs.push(pdf);
        }
      }
    }
    
    // Add all Canvas files (they're already deduplicated by file ID)
    uniquePDFs.push(...seenFiles.values());
    
    // Final URL-based deduplication as fallback
    const finalUnique = uniquePDFs.filter((pdf, index, self) => 
      index === self.findIndex(p => p.url === pdf.url)
    );
    
    console.log(`Deduplicated ${pdfData.length} PDF entries down to ${finalUnique.length} unique files`);
    return finalUnique;
  }

  extractFileFromIframe(iframe, src) {
    console.log(`Analyzing iframe: ${src}`);
    
    // Extract file ID from Canvas iframe URLs
    const fileIdMatch = src.match(/\/files\/(\d+)/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      const downloadUrl = `${window.location.origin}/courses/${this.courseId}/files/${fileId}/download`;
      
      // Get title from surrounding context
      const title = this.getIframeTitle(iframe);
      
      this.crawlerState.foundPDFs.set(downloadUrl, {
        title: title || this.extractFilename(downloadUrl),
        filename: this.extractFilename(downloadUrl) || 'document.pdf',
        context: 'Embedded Iframe',
        type: 'embedded_iframe'
      });
      
      console.log(`📄 Noted iframe PDF: ${title} (${downloadUrl})`);
    }
  }

  extractFileFromElement(element) {
    const fileId = element.dataset.fileId || element.dataset.fileUrl;
    const fileUrl = element.dataset.fileUrl || element.href;
    const title = element.textContent?.trim() || element.title || this.extractFilename(fileUrl);
    
    if (fileId) {
      const downloadUrl = `${window.location.origin}/courses/${this.courseId}/files/${fileId}/download`;
      this.crawlerState.foundPDFs.set(downloadUrl, {
        title: title || 'Canvas File',
        filename: this.extractFilename(downloadUrl) || 'document.pdf',
        context: 'File Attachment',
        type: 'file_attachment'
      });
    } else if (fileUrl && (fileUrl.includes('.pdf') || fileUrl.includes('/files/'))) {
      this.crawlerState.foundPDFs.set(fileUrl, {
        title: title || this.extractFilename(fileUrl),
        filename: this.extractFilename(fileUrl) || 'document.pdf',
        context: 'File Link',
        type: 'file_link'
      });
    }
  }

  getIframeTitle(iframe) {
    // Look for title in surrounding elements
    const parent = iframe.closest('.attachment, .file-block, .content-block');
    if (parent) {
      const titleEl = parent.querySelector('.title, .filename, .attachment-name, h3, h4');
      if (titleEl) {
        return titleEl.textContent.trim();
      }
    }
    
    // Look for preceding heading or label
    let prev = iframe.previousElementSibling;
    while (prev) {
      if (prev.tagName && prev.tagName.match(/^H[1-6]$/)) {
        return prev.textContent.trim();
      }
      prev = prev.previousElementSibling;
    }
    
    return 'Embedded File';
  }

  scanForAllContent() {
    return {
      pdfs: this.scanForPDFs(),
      courseInfo: {
        courseId: this.courseId,
        courseName: this.courseName,
        url: window.location.href
      },
      pageType: this.detectPageType(),
      modules: this.extractModules(),
      files: this.extractFileList()
    };
  }

  findContext(element) {
    const context = {
      module: null,
      page: null,
      section: null
    };

    // Look for module context
    const moduleItem = element.closest('.module-item, .context_module_item');
    if (moduleItem) {
      const moduleHeader = document.querySelector('.module-header, .context_module .header');
      context.module = moduleHeader?.textContent?.trim() || null;
    }

    // Look for page context
    const pageElement = element.closest('.page-content, .show-content');
    if (pageElement) {
      const pageTitle = document.querySelector('h1, .page-title');
      context.page = pageTitle?.textContent?.trim() || null;
    }

    // Look for section context
    const section = element.closest('.content-section, .assignment-section');
    if (section) {
      const sectionHeader = section.querySelector('h2, h3, .section-title');
      context.section = sectionHeader?.textContent?.trim() || null;
    }

    return context;
  }

  extractCleanLinkText(linkElement) {
    // Extract the meaningful text from a link, excluding download buttons and action text
    // Common patterns in Canvas: <a><span class="name">file.pdf</span><span>Ladda ner</span></a>
    
    // First try to find specific filename/name elements
    const nameSelectors = [
      '.name',
      '.filename', 
      '.file-name',
      '.title',
      '.item_name',
      'span:first-child' // Often the first span contains the actual name
    ];
    
    for (const selector of nameSelectors) {
      const nameEl = linkElement.querySelector(selector);
      if (nameEl) {
        const text = nameEl.textContent?.trim();
        // Make sure it's not a generic action text
        if (text && !this.isGenericActionText(text)) {
          return text;
        }
      }
    }
    
    // Fallback to full text content, but clean it up
    const fullText = linkElement.textContent?.trim() || '';
    
    // Remove common action suffixes (Swedish and English)
    const cleanedText = fullText
      .replace(/\s*(Ladda\s*ner|Ladda\s*ned|Download|Förhandsvisning|Preview)\s*$/gi, '')
      .trim();
    
    return cleanedText || null;
  }
  
  isGenericActionText(text) {
    const genericTexts = [
      'ladda ner', 'ladda ned', 'download', 
      'förhandsvisning', 'preview',
      'visa', 'view', 'öppna', 'open'
    ];
    const lower = text.toLowerCase().trim();
    return genericTexts.includes(lower);
  }

  extractBetterTitle(linkElement, url) {
    try {
      // First, try to get clean text from the link element itself
      const cleanLinkText = this.extractCleanLinkText(linkElement);
      if (cleanLinkText && !this.isGenericActionText(cleanLinkText)) {
        return cleanLinkText;
      }
      
      // Second, check if the URL itself contains the filename (for redirected Canvas URLs or direct URLs)
      const decodedUrl = decodeURIComponent(url);
      
      // Handle canvas-user-content URLs with course files
      if (url.includes('canvas-user-content.com') || decodedUrl.includes('course files/')) {
        const filenameMatch = decodedUrl.match(/course files\/(.+?)(?:\?|$)/);
        if (filenameMatch) {
          const filename = filenameMatch[1].trim();
          if (filename && filename.length > 1 && filename !== '1') {
            return filename.replace(/\.pdf$/i, '');
          }
        }
      }
      
      // Check for any PDF filename in the URL path or query
      const pdfMatch = decodedUrl.match(/([^/\?]+\.pdf)/i);
      if (pdfMatch) {
        const filename = pdfMatch[1];
        if (filename && filename !== '1.pdf') {
          return filename.replace(/\.pdf$/i, '');
        }
      }
      
      // Try to get filename from URL query parameters
      const urlObj = new URL(url);
      const downloadParam = urlObj.searchParams.get('download_frd');
      if (downloadParam) {
        const decodedName = decodeURIComponent(downloadParam);
        if (decodedName && decodedName !== '1') {
          return decodedName.replace(/\.pdf$/i, ''); // Remove .pdf extension as it will be added later
        }
      }
      
      // Try to find filename in the URL path
      const pathParts = urlObj.pathname.split('/');
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && !/^\d+$/.test(lastPart) && lastPart !== 'download') {
        const decoded = decodeURIComponent(lastPart);
        if (decoded.length > 1) {
          return decoded.replace(/\.pdf$/i, '');
        }
      }
      
      // Look for filename in surrounding elements
      const parent = linkElement.parentElement;
      if (parent) {
        // Check for file name in sibling elements
        const siblings = parent.querySelectorAll('.file-name, .filename, .title, .name');
        for (const sibling of siblings) {
          const siblingText = sibling.textContent?.trim();
          if (siblingText && siblingText !== 'Ladda ner' && siblingText !== 'Download') {
            return siblingText.replace(/\.pdf$/i, '');
          }
        }
        
        // Check parent's text content for clues
        const parentText = parent.textContent?.trim();
        if (parentText && !parentText.toLowerCase().includes('ladda ner') && !parentText.toLowerCase().includes('download')) {
          // Extract meaningful part before "Ladda ner" if present
          const beforeDownload = parentText.split(/ladda ner|download/i)[0]?.trim();
          if (beforeDownload && beforeDownload.length > 2) {
            return beforeDownload.replace(/\.pdf$/i, '');
          }
        }
      }
      
      // Look for data attributes that might contain the filename
      const dataAttrs = ['data-filename', 'data-name', 'title'];
      for (const attr of dataAttrs) {
        const value = linkElement.getAttribute(attr);
        if (value && value !== 'Ladda ner' && value !== 'Download') {
          return value.replace(/\.pdf$/i, '');
        }
      }
      
      return null;
    } catch (e) {
      console.log('Error extracting better title:', e);
      return null;
    }
  }

  extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // For Canvas URLs, try to extract meaningful filename
      if (pathname.includes('/files/')) {
        // Canvas file URLs might have the filename in query params
        const downloadMatch = urlObj.searchParams.get('download_frd');
        if (downloadMatch) {
          const decodedFilename = decodeURIComponent(downloadMatch);
          return this.ensurePdfExtension(decodedFilename);
        }
        
        // For URLs with wrap=1, return null to force using title
        const wrapMatch = urlObj.searchParams.get('wrap');
        if (wrapMatch === '1') {
          return null; // Let the title be used instead
        }
      }
      
      // Extract filename from path
      const filename = pathname.split('/').pop();
      const decodedFilename = decodeURIComponent(filename);
      
      // If the filename looks like a file ID or generic name, return null to use title
      if (/^\d+$/.test(decodedFilename) || 
          decodedFilename === 'download' || 
          decodedFilename === 'preview' ||
          /^file_\d+/.test(decodedFilename)) {
        return null;
      }
      
      return this.ensurePdfExtension(decodedFilename);
    } catch (e) {
      const filename = url.split('/').pop();
      return this.ensurePdfExtension(filename);
    }
  }
  
  ensurePdfExtension(filename) {
    if (!filename) return null;
    
    // If filename already has .pdf extension, return as is
    if (filename.toLowerCase().endsWith('.pdf')) {
      return filename;
    }
    
    // If filename has another extension, replace it with .pdf
    const extensionMatch = filename.match(/\.[a-zA-Z0-9]+$/);
    if (extensionMatch) {
      return filename.replace(extensionMatch[0], '.pdf');
    }
    
    // No extension found, add .pdf
    return filename + '.pdf';
  }

  detectPageType() {
    const path = window.location.pathname;
    
    if (path.includes('/modules')) return 'modules';
    if (path.includes('/files')) return 'files';
    if (path.includes('/assignments')) return 'assignments';
    if (path.includes('/pages')) return 'pages';
    if (path.includes('/announcements')) return 'announcements';
    if (path.includes('/discussions')) return 'discussions';
    
    return 'course-home';
  }

  extractModules() {
    const modules = [];
    const moduleElements = document.querySelectorAll('.context_module');
    
    moduleElements.forEach(moduleEl => {
      const titleEl = moduleEl.querySelector('.module-header .name, .header .name');
      const title = titleEl?.textContent?.trim();
      
      if (title) {
        const items = [];
        const itemElements = moduleEl.querySelectorAll('.context_module_item');
        
        itemElements.forEach(itemEl => {
          const itemTitle = itemEl.querySelector('.item_name')?.textContent?.trim();
          const itemType = itemEl.className.match(/\b(\w+)_item\b/)?.[1] || 'unknown';
          
          if (itemTitle) {
            items.push({
              title: itemTitle,
              type: itemType,
              element: itemEl
            });
          }
        });
        
        modules.push({
          title,
          items
        });
      }
    });
    
    return modules;
  }

  extractFileList() {
    const files = [];
    const fileElements = document.querySelectorAll('.file, .file-link, .instructure_file_link');
    
    fileElements.forEach(fileEl => {
      const title = fileEl.textContent?.trim();
      const href = fileEl.href;
      
      if (title && href) {
        files.push({
          title,
          url: href,
          type: this.getFileType(href),
          size: fileEl.dataset.fileSize || null
        });
      }
    });
    
    return files;
  }

  getFileType(url) {
    const extension = url.split('.').pop().toLowerCase();
    const typeMap = {
      'pdf': 'PDF Document',
      'doc': 'Word Document',
      'docx': 'Word Document',
      'ppt': 'PowerPoint',
      'pptx': 'PowerPoint',
      'xls': 'Excel Spreadsheet',
      'xlsx': 'Excel Spreadsheet',
      'txt': 'Text File',
      'mp4': 'Video',
      'mov': 'Video',
      'avi': 'Video'
    };
    
    return typeMap[extension] || 'Unknown';
  }

  // ============================================================================
  // SMART NAVIGATION WITH STATE PERSISTENCE (Option 2)
  // ============================================================================

  /**
   * Initialize smart navigation components
   */
  initializeSmartNavigation() {
    console.log('🔧 Initializing smart navigation infrastructure...');
    
    try {
      // Check if classes are available
      if (typeof CrawlerStateManager === 'undefined') {
        console.error('❌ CrawlerStateManager class not found - may not be loaded yet');
        throw new Error('CrawlerStateManager class not found');
      }
      if (typeof NavigationQueueManager === 'undefined') {
        console.error('❌ NavigationQueueManager class not found');
        throw new Error('NavigationQueueManager class not found');
      }
      if (typeof NavigationErrorHandler === 'undefined') {
        console.error('❌ NavigationErrorHandler class not found');
        throw new Error('NavigationErrorHandler class not found');
      }
      if (typeof SmartNavigator === 'undefined') {
        console.error('❌ SmartNavigator class not found');
        throw new Error('SmartNavigator class not found');
      }
      if (typeof StatefulPageScanner === 'undefined') {
        console.error('❌ StatefulPageScanner class not found');
        throw new Error('StatefulPageScanner class not found');
      }
      
      // Initialize state management components
      console.log('Creating CrawlerStateManager...');
      this.stateManager = new CrawlerStateManager();
      
      console.log('Creating NavigationQueueManager...');
      this.queueManager = new NavigationQueueManager(this.stateManager);
      
      console.log('Creating NavigationErrorHandler...');
      this.errorHandler = new NavigationErrorHandler(this.stateManager);
      
      console.log('Creating SmartNavigator...');
      this.smartNavigator = new SmartNavigator(this.stateManager, this.queueManager, this.errorHandler);
      
      console.log('Creating StatefulPageScanner...');
      this.statefulScanner = new StatefulPageScanner(this.stateManager, this.queueManager);
      
      // Set up navigation detection
      console.log('Creating NavigationDetector...');
      this.navigationDetector = new NavigationDetector((eventType, data) => {
        this.handleNavigationEvent(eventType, data);
      });
      
      console.log('✅ Smart navigation infrastructure initialized successfully');
      this.smartNavigationEnabled = true;
    } catch (error) {
      console.error('❌ Failed to initialize smart navigation:', error);
      console.error('Error details:', error.stack);
      console.warn('⚠️ Smart navigation disabled - content script will still respond to messages but smart features may not work');
      // Fall back to legacy crawler if smart navigation fails
      this.smartNavigationEnabled = false;
    }
  }

  /**
   * Check if we need to resume a smart navigation crawl session
   */
  async checkForSmartNavigationResume() {
    if (!this.stateManager) return;
    
    try {
      const existingState = await this.stateManager.loadState();
      
      if (existingState && existingState.isActive) {
        console.log('🔄 Smart navigation session detected, resuming...');
        
        // Verify this is the right course
        if (existingState.courseId === this.courseId) {
          setTimeout(() => {
            this.resumeSmartNavigationSession(existingState);
          }, 1000);
        } else {
          console.log('⚠️ Course ID mismatch, clearing stale session');
          await this.stateManager.clearState();
        }
      }
    } catch (error) {
      console.error('❌ Error checking for smart navigation resume:', error);
    }
  }

  /**
   * Resume smart navigation crawl session
   */
  async resumeSmartNavigationSession(state) {
    console.log(`📋 Resuming smart navigation session: ${state.sessionId}`);
    console.log(`📊 Current progress: ${state.pagesVisited} pages, ${state.pdfsFound} PDFs`);
    
    try {
      // Scan current page first
      const scanResult = await this.statefulScanner.scanCurrentPage();
      console.log(`✅ Current page scanned: ${scanResult.pdfsFound} PDFs found`);
      
      // Wait for scanning to complete
      await this.wait(2000);
      
      // Continue with navigation queue
      await this.smartNavigator.processNavigationQueue();
      
    } catch (error) {
      console.error('❌ Error resuming smart navigation session:', error);
      await this.errorHandler.handleNavigationFailure(window.location.href, error);
    }
  }

  /**
   * Start smart navigation crawl
   */
  async startSmartNavigationCrawl() {
    if (!this.courseId) {
      console.error('❌ Cannot start smart navigation: no course ID detected');
      return { success: false, error: 'No course detected' };
    }

    console.log('🚀 Starting smart navigation crawler...');

    try {
      // Create initial crawler state
      const initialState = this.stateManager.createInitialState(this.courseId, this.courseName);
      await this.stateManager.saveState(initialState);

      // Build initial navigation queue
      const queuedPages = await this.smartNavigator.buildInitialNavigationQueue(this.courseId);
      console.log(`📋 Initial queue built with ${queuedPages} pages`);

      // Scan current page first
      console.log('🔍 Scanning current page...');
      const scanResult = await this.statefulScanner.scanCurrentPage();
      console.log(`✅ Initial scan: ${scanResult.pdfsFound} PDFs found`);

      // Start navigation process after a delay
      setTimeout(() => {
        console.log('▶️ Starting navigation queue processing...');
        this.smartNavigator.processNavigationQueue();
      }, 3000);

      return { 
        success: true, 
        sessionId: initialState.sessionId,
        queuedPages: queuedPages,
        initialPDFs: scanResult.pdfsFound
      };

    } catch (error) {
      console.error('❌ Failed to start smart navigation crawl:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop smart navigation crawl
   */
  async stopSmartNavigationCrawl() {
    console.log('🛑 Stopping smart navigation crawl...');
    
    try {
      if (this.smartNavigator) {
        await this.smartNavigator.stopCrawler('manual_stop');
      }
      return { success: true };
    } catch (error) {
      console.error('❌ Error stopping smart navigation crawl:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get smart navigation crawl progress
   */
  async getSmartNavigationProgress() {
    if (!this.smartNavigator) {
      return { active: false, error: 'Smart navigation not initialized' };
    }

    try {
      const progress = await this.smartNavigator.getCrawlProgress();
      return { active: true, progress: progress };
    } catch (error) {
      console.error('❌ Error getting smart navigation progress:', error);
      return { active: false, error: error.message };
    }
  }

  /**
   * Handle navigation events
   */
  handleNavigationEvent(eventType, data) {
    console.log(`🔄 Navigation event: ${eventType}`, data);
    
    switch (eventType) {
      case 'url_changed':
        // URL changed due to Canvas SPA navigation
        break;
      case 'page_loaded':
        // Full page reload occurred
        break;
      case 'page_visible':
        // Page became visible (tab switching)
        break;
    }
  }

}

// ============================================================================
// SMART NAVIGATION COMPONENT DEFINITIONS
// (Inline definitions to avoid separate file loading issues)
// ============================================================================

/**
 * State management for smart navigation
 */
class CrawlerStateManager {
  constructor() {
    this.storageKey = 'canvas_crawler_state';
    this.sessionId = this.generateSessionId();
  }
  
  generateSessionId() {
    return 'crawl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  async saveState(state) {
    try {
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
  
  async loadState() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const state = result[this.storageKey];
      
      if (!state) return null;
      
      const deserializedState = {
        ...state,
        foundPDFs: new Set(state.foundPDFs || []),
        visitedUrls: new Set(state.visitedUrls || [])
      };
      
      return deserializedState;
    } catch (error) {
      console.error('❌ Failed to load crawler state:', error);
      return null;
    }
  }
  
  async clearState() {
    try {
      await chrome.storage.local.remove(this.storageKey);
      console.log('🗑️ Crawler state cleared');
    } catch (error) {
      console.error('❌ Failed to clear crawler state:', error);
    }
  }
  
  createInitialState(courseId, courseName) {
    return {
      sessionId: this.sessionId,
      isActive: true,
      currentPhase: 'initialization',
      courseId: courseId,
      courseName: courseName,
      navigationQueue: [],
      foundPDFs: new Set(),
      visitedUrls: new Set(),
      startTime: Date.now(),
      lastNavigationTime: Date.now(),
      lastActivityTime: Date.now(),
      pagesVisited: 0,
      pdfsFound: 0,
      maxNavigationAttempts: 50,
      navigationAttempts: 0,
      maxRetries: 3,
      currentRetries: 0,
      failedUrls: [],
      completionStatus: 'in_progress'
    };
  }
}

/**
 * Navigation queue management
 */
class NavigationQueueManager {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }
  
  async addToQueue(url, priority = 5, phase = 'general', metadata = {}) {
    const state = await this.stateManager.loadState();
    if (!state || !state.isActive) return false;
    
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl || !this.isValidCanvasUrl(normalizedUrl)) return false;
    
    if (state.visitedUrls.has(normalizedUrl) || 
        state.navigationQueue.some(item => item.url === normalizedUrl)) {
      return false;
    }
    
    state.navigationQueue.push({
      url: normalizedUrl,
      priority: priority,
      phase: phase,
      visited: false,
      addedAt: Date.now(),
      metadata: metadata
    });
    
    state.navigationQueue.sort((a, b) => a.priority - b.priority);
    await this.stateManager.saveState(state);
    return true;
  }
  
  async getNextUrl() {
    const state = await this.stateManager.loadState();
    if (!state || !state.isActive) return null;
    
    return state.navigationQueue.find(item => !item.visited) || null;
  }
  
  async markUrlVisited(url) {
    const state = await this.stateManager.loadState();
    if (!state) return;
    
    const normalizedUrl = this.normalizeUrl(url);
    state.visitedUrls.add(normalizedUrl);
    
    const queueItem = state.navigationQueue.find(item => item.url === normalizedUrl);
    if (queueItem) {
      queueItem.visited = true;
      queueItem.visitedAt = Date.now();
    }
    
    state.pagesVisited++;
    state.lastActivityTime = Date.now();
    await this.stateManager.saveState(state);
  }
  
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      urlObj.hash = '';
      return urlObj.href;
    } catch {
      return null;
    }
  }
  
  isValidCanvasUrl(url) {
    if (!url || !url.includes('/courses/')) return false;
    
    const skipPatterns = [
      '/quizzes/', '/discussion_topics/', '/announcements/',
      '/gradebook', '/grades', '/users/', '.pdf', '/download'
    ];
    
    return !skipPatterns.some(pattern => url.includes(pattern));
  }
}

/**
 * Smart navigator with state persistence
 */
class SmartNavigator {
  constructor(stateManager, queueManager, errorHandler) {
    this.stateManager = stateManager;
    this.queueManager = queueManager;
    this.errorHandler = errorHandler;
    this.isNavigating = false;
  }
  
  async navigateToUrl(url) {
    if (this.isNavigating) return false;
    
    this.isNavigating = true;
    console.log(`🧭 Smart navigation to: ${url}`);
    
    try {
      const state = await this.stateManager.loadState();
      if (!state || !state.isActive) return false;
      
      state.lastNavigationTime = Date.now();
      state.currentUrl = url;
      state.navigationAttempts++;
      await this.stateManager.saveState(state);
      
      if (this.isAlreadyOnPage(url)) {
        this.isNavigating = false;
        return true;
      }
      
      console.log(`📍 Navigating to: ${url}`);
      window.location.href = url;
      return false;
      
    } catch (error) {
      this.isNavigating = false;
      throw error;
    }
  }
  
  async processNavigationQueue() {
    const state = await this.stateManager.loadState();
    if (!state || !state.isActive) return;
    
    if (state.navigationAttempts >= state.maxNavigationAttempts) {
      await this.stopCrawler('max_attempts_reached');
      return;
    }
    
    const nextItem = await this.queueManager.getNextUrl();
    if (!nextItem) {
      await this.stopCrawler('queue_complete');
      return;
    }
    
    const navigated = await this.navigateToUrl(nextItem.url);
    if (navigated) {
      setTimeout(() => this.processNavigationQueue(), 3000);
    }
  }
  
  async stopCrawler(reason = 'manual_stop') {
    const state = await this.stateManager.loadState();
    if (state) {
      state.isActive = false;
      state.endTime = Date.now();
      state.completionStatus = reason === 'queue_complete' ? 'completed' : 'stopped';
      await this.stateManager.saveState(state);
    }
    this.isNavigating = false;
  }
  
  async buildInitialNavigationQueue(courseId) {
    const baseUrl = `${window.location.origin}/courses/${courseId}`;
    const priorityPages = [
      { url: `${baseUrl}/modules`, priority: 1, phase: 'modules' },
      { url: `${baseUrl}/files`, priority: 2, phase: 'files' },
      { url: `${baseUrl}/assignments`, priority: 3, phase: 'assignments' },
      { url: `${baseUrl}/pages`, priority: 4, phase: 'pages' }
    ];
    
    let added = 0;
    for (const page of priorityPages) {
      const success = await this.queueManager.addToQueue(page.url, page.priority, page.phase);
      if (success) added++;
    }
    
    return added;
  }
  
  isAlreadyOnPage(targetUrl) {
    const currentUrl = window.location.href;
    if (currentUrl === targetUrl) return true;
    if (currentUrl.startsWith(targetUrl)) return true;
    
    try {
      return new URL(currentUrl).pathname === new URL(targetUrl).pathname;
    } catch {
      return false;
    }
  }
  
  async getCrawlProgress() {
    const state = await this.stateManager.loadState();
    if (!state) return null;
    
    return {
      isActive: state.isActive,
      sessionId: state.sessionId,
      pagesVisited: state.pagesVisited,
      pdfsFound: state.pdfsFound,
      completionStatus: state.completionStatus
    };
  }
}

/**
 * Stateful page scanner
 */
class StatefulPageScanner {
  constructor(stateManager, queueManager) {
    this.stateManager = stateManager;
    this.queueManager = queueManager;
  }
  
  async scanCurrentPage() {
    console.log(`🔍 Scanning page: ${window.location.href}`);
    
    await this.waitForPageLoad();
    const pdfs = await this.findPDFsOnPage();
    const newUrls = await this.findLinksToExplore();
    await this.updateCrawlerState(pdfs, newUrls);
    
    return { pdfsFound: pdfs.length, urlsQueued: newUrls.length };
  }
  
  async waitForPageLoad() {
    return new Promise(resolve => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        const timeout = setTimeout(resolve, 3000);
        document.addEventListener('readystatechange', () => {
          if (document.readyState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        });
      }
    });
  }
  
  async findPDFsOnPage() {
    const pdfs = [];
    const links = document.querySelectorAll('a[href]');
    
    links.forEach(link => {
      const href = link.href;
      if (href && (href.includes('.pdf') || 
                   (href.includes('/files/') && link.textContent.toLowerCase().includes('pdf')))) {
        pdfs.push({
          url: href,
          title: link.textContent?.trim() || 'Canvas PDF',
          source: 'smart_navigation_scan'
        });
      }
    });
    
    return pdfs;
  }
  
  async findLinksToExplore() {
    const links = [];
    const currentUrl = window.location.href;
    
    // Module items
    document.querySelectorAll('.context_module_item a[href*="/assignments/"], .context_module_item a[href*="/pages/"]').forEach(link => {
      const href = link.href;
      if (href && href !== currentUrl && href.includes('/courses/')) {
        links.push({ url: href, priority: 2, phase: 'module_items' });
      }
    });
    
    return links;
  }
  
  async updateCrawlerState(pdfs, newUrls) {
    const state = await this.stateManager.loadState();
    if (!state) return;
    
    pdfs.forEach(pdf => {
      if (typeof pdf === 'string') {
        // Legacy: just a URL
        state.foundPDFs.set(pdf, {
          title: this.extractFilename(pdf) || 'Canvas PDF',
          filename: this.extractFilename(pdf) || 'document.pdf',
          context: 'State Update',
          type: 'state_update'
        });
      } else {
        // New: full PDF object
        state.foundPDFs.set(pdf.url, {
          title: pdf.title || this.extractFilename(pdf.url),
          filename: pdf.filename || this.extractFilename(pdf.url),
          context: pdf.context || 'State Update',
          type: pdf.type || 'state_update'
        });
      }
    });
    
    for (const urlInfo of newUrls) {
      await this.queueManager.addToQueue(urlInfo.url, urlInfo.priority, urlInfo.phase);
    }
    
    await this.queueManager.markUrlVisited(window.location.href);
    state.pdfsFound = state.foundPDFs.size;
    await this.stateManager.saveState(state);
  }
}

/**
 * Navigation error handler
 */
class NavigationErrorHandler {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }
  
  async handleNavigationFailure(url, error) {
    console.error(`❌ Navigation failed for ${url}:`, error);
  }
}

/**
 * Navigation detector
 */
class NavigationDetector {
  constructor(callback) {
    this.lastUrl = window.location.href;
    this.callback = callback;
    
    setInterval(() => {
      if (window.location.href !== this.lastUrl) {
        const oldUrl = this.lastUrl;
        this.lastUrl = window.location.href;
        this.callback('url_changed', { from: oldUrl, to: this.lastUrl });
      }
    }, 500);
  }
}

// Initialize the content script when DOM is ready
let canvasContentScript = null;

// Add global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('Canvas RAG Assistant: Uncaught error:', event.error);
});

try {
  console.log('Canvas RAG Assistant: Starting initialization...');
  if (document.readyState === 'loading') {
    console.log('Canvas RAG Assistant: Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('Canvas RAG Assistant: DOMContentLoaded fired, initializing...');
      try {
        canvasContentScript = new CanvasContentScript();
        console.log('Canvas RAG Assistant: ✅ Successfully initialized');
      } catch (error) {
        console.error('Canvas RAG Assistant: ❌ Error during initialization:', error);
        console.error('Canvas RAG Assistant: Stack trace:', error.stack);
      }
    });
  } else {
    console.log('Canvas RAG Assistant: DOM already ready, initializing immediately...');
    canvasContentScript = new CanvasContentScript();
    console.log('Canvas RAG Assistant: ✅ Successfully initialized');
  }
} catch (error) {
  console.error('Canvas RAG Assistant: ❌ Error during initialization:', error);
  console.error('Canvas RAG Assistant: Stack trace:', error.stack);
}