// content-script.js - Runs on Canvas pages to detect and extract content

console.log('Canvas RAG Assistant: Content script file loaded');

// Canvas course information detector and PDF scraper
class CanvasContentScript {
  constructor() {
    this.courseId = this.extractCourseId();
    this.courseName = this.extractCourseName();
    if (this.courseId) {
      console.log('Canvas RAG Assistant: Course detected:', this.courseId, this.courseName);
    }
    this.lastUrl = location.href;
    this.init();
  }

  init() {
    try {
      // Always listen for messages from popup, regardless of course detection
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        this.handleMessage(request, sender, sendResponse);
        return true; // Keep the message channel open for async responses
      });
      
      // Initialize crawler state
      this.crawlerState = {
        isRunning: false,
        visitedUrls: new Set(),
        pendingUrls: [],
        foundPDFs: new Set(),
        currentStep: 'idle'
      };
      
      // Signal that content script is ready
      console.log('Canvas RAG Assistant: Content script initialized successfully');
      
      // Only run Canvas-specific features on Canvas course pages
      if (this.courseId) {
        console.log(`Canvas RAG Assistant: Detected course ${this.courseId} - ${this.courseName}`);
        
        // Use setTimeout to avoid blocking the main thread
        setTimeout(() => {
          try {
            // Store course info in extension storage
            this.storeCourseInfo();
            
            // Scan for PDFs immediately
            this.scanAndReportPDFs();
            
            // Set up mutation observer for single-page navigation
            this.setupNavigationObserver();
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
        console.log('Canvas page navigation detected, re-scanning for PDFs...');
        setTimeout(() => this.scanAndReportPDFs(), 1000); // Wait for content to load
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  scanAndReportPDFs() {
    const pdfs = this.getAllPdfLinks();
    console.log(`Found ${pdfs.length} PDF links on ${location.href}:`, pdfs);
    
    // Track PDFs in crawler state if crawler is running
    if (this.crawlerState?.isRunning) {
      pdfs.forEach(pdf => this.crawlerState.foundPDFs.add(pdf.url));
    }
    
    // Debug log PDF data
    if (pdfs.length > 0) {
      console.log('PDF data being sent to background:', pdfs.map(p => ({
        title: p.title,
        filename: p.filename,
        url: p.url,
        type: p.type
      })));
    }
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'FOUND_PDFS',
      courseId: this.courseId,
      courseName: this.courseName,
      pdfs: pdfs,
      pageUrl: location.href,
      crawlerActive: this.crawlerState?.isRunning || false
    });
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

  storeCourseInfo() {
    const courseInfo = {
      courseId: this.courseId,
      courseName: this.courseName,
      url: window.location.href,
      domain: window.location.hostname,
      lastVisited: new Date().toISOString()
    };

    // Send to background script for storage
    chrome.runtime.sendMessage({
      action: 'storeCourseInfo',
      data: courseInfo
    });
  }

  handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getCourseInfo':
          const response = {
            courseId: this.courseId,
            courseName: this.courseName,
            url: window.location.href
          };
          sendResponse(response);
          break;

      case 'scanPDFs':
        if (!this.courseId) {
          sendResponse({ error: 'No course detected on this page' });
          return;
        }
        const pdfs = this.getAllPdfLinks();
        sendResponse(pdfs);
        break;

      case 'startAutoCrawl':
        console.log('Starting auto crawl...');
        if (!this.courseId) {
          sendResponse({ error: 'No course detected on this page. Please navigate to a Canvas course page.' });
          return;
        }
        this.startEnhancedCrawl();
        sendResponse({ started: true, crawlerState: this.crawlerState });
        break;

      case 'stopAutoCrawl':
        console.log('Stopping auto crawl...');
        this.stopCrawl();
        sendResponse({ stopped: true });
        break;

      case 'getCrawlerStatus':
        sendResponse(this.crawlerState);
        break;

      default:
        console.log('Unknown action:', request.action);
        sendResponse({ error: 'Unknown action' });
    }
    } catch (error) {
      console.error('Canvas RAG Assistant: Error in handleMessage:', error);
      sendResponse({ error: error.message });
    }
  }

  async startEnhancedCrawl() {
    console.log('startEnhancedCrawl called, current running state:', this.crawlerState.isRunning);
    
    if (this.crawlerState.isRunning) {
      console.log('Crawler already running');
      return;
    }

    console.log('🚀 Starting enhanced auto-navigation crawler...');
    this.crawlerState.isRunning = true;
    this.crawlerState.visitedUrls.clear();
    this.crawlerState.foundPDFs.clear();
    this.crawlerState.pendingUrls = [];
    this.crawlerState.currentStep = 'Starting crawler...';

    try {
      // Step 1: Expand current page content
      console.log('Step 1: Expanding current page content...');
      this.crawlerState.currentStep = 'Expanding current page content';
      await this.expandCurrentPageContent();
      
      // Step 2: Navigate to key course sections
      console.log('Step 2: Crawling course sections...');
      this.crawlerState.currentStep = 'Crawling course sections';
      await this.crawlCourseSections();
      
      // Step 3: Deep crawl modules
      console.log('Step 3: Deep crawling modules...');
      this.crawlerState.currentStep = 'Deep crawling modules';
      await this.crawlModules();
      
      // Step 4: Crawl assignments and files
      console.log('Step 4: Crawling assignments and files...');
      this.crawlerState.currentStep = 'Crawling assignments and files';
      await this.crawlAssignmentsAndFiles();
      
      // Final report
      console.log('Crawl completed successfully!');
      this.crawlerState.currentStep = 'Completing crawl...';
      
      // Wait a moment to ensure all PDF discovery messages are processed
      await this.wait(2000);
      
      this.crawlerState.currentStep = 'complete';
      this.reportCrawlComplete();
      
    } catch (error) {
      console.error('Crawler error:', error);
      this.crawlerState.currentStep = 'Error: ' + error.message;
      // Still report completion to trigger PDF download
      this.reportCrawlComplete();
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
        // Check if it's actually collapsed before clicking
        const isCollapsed = btn.getAttribute('aria-expanded') === 'false' || 
                          btn.classList.contains('collapsed') ||
                          btn.classList.contains('expand_module_link');
        
        if (isCollapsed) {
          btn.click();
          await this.wait(300); // Wait for expansion animation
        }
      } catch (e) {
        console.log('Could not click expand button:', e);
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
      const text = btn.textContent.toLowerCase();
      return text.includes('show more') || 
             text.includes('load more') || 
             text.includes('see more') ||
             text.includes('view more');
    });
    
    // Combine both sets
    const allLoadMoreButtons = [...loadMoreButtons, ...textBasedButtons];
    console.log(`Found ${allLoadMoreButtons.length} load more buttons`);
    
    for (const btn of allLoadMoreButtons) {
      try {
        if (btn.offsetParent !== null) { // Check if button is visible
          btn.click();
          await this.wait(1000); // Wait for content to load
        }
      } catch (e) {
        console.log('Could not click load more button:', e);
      }
    }
    
    // Handle Canvas-specific folder expansions in files section
    if (window.location.pathname.includes('/files')) {
      await this.expandAllFolders();
    }
    
    // Scan current page after expansion
    this.scanAndReportPDFs();
  }

  async crawlCourseSections() {
    this.crawlerState.currentStep = 'crawling_sections';
    console.log('🗂️ Systematically crawling ALL course sections for PDF content...');
    
    const sectionsToVisit = [
      { path: 'files', name: 'Files', priority: 1, deepCrawl: true },           // Highest priority - direct file browser
      { path: 'modules', name: 'Modules', priority: 1, deepCrawl: true },       // High priority - contains most content
      { path: 'pages', name: 'Pages', priority: 1, deepCrawl: true },           // High priority - often contains embedded PDFs
      { path: 'assignments', name: 'Assignments', priority: 2, deepCrawl: true }, // Medium priority - attachments
      { path: 'quizzes', name: 'Quizzes', priority: 2, deepCrawl: true },       // Quizzes can have PDF attachments
      { path: 'announcements', name: 'Announcements', priority: 3, deepCrawl: true },
      { path: 'discussion_topics', name: 'Discussions', priority: 3, deepCrawl: true },
      { path: 'syllabus', name: 'Syllabus', priority: 3, deepCrawl: false },    // Usually single page
      { path: 'gradebook', name: 'Gradebook', priority: 4, deepCrawl: false },  // Less likely to have PDFs
      { path: 'people', name: 'People', priority: 4, deepCrawl: false }         // Rarely has PDFs
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
          case 'quizzes':
            await this.deepCrawlQuizzesSection();
            break;
          case 'announcements':
            await this.deepCrawlAnnouncementsSection();
            break;
          case 'discussion_topics':
            await this.deepCrawlDiscussionsSection();
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
    const fileLinks = document.querySelectorAll(
      '.ef-item-row a[href*="/files/"], ' +
      '.file-link a, ' +
      '.instructure_file_link, ' +
      'a[href*="/courses/" + this.courseId + "/files/"], ' +
      'a[href$=".pdf"], ' +
      'a[data-file-id]'
    );
    
    console.log(`Found ${fileLinks.length} potential file links in files section`);
    
    for (const link of fileLinks) {
      const href = link.href;
      if (href && !this.crawlerState.visitedUrls.has(href)) {
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
        console.log(`📖 Crawling page: ${link.textContent?.trim()}`);
        await this.navigateAndScan(href);
        
        // After navigating to the page, specifically look for embedded content
        await this.scanPageForEmbeddedContent();
      }
    }
  }

  async expandAllFolders() {
    console.log('📁 Expanding all folders...');
    
    // Canvas files section folder expansion
    const folderToggles = document.querySelectorAll(
      '.ef-folder .ef-name-col button, ' +
      '.folder-toggle, ' +
      '.ef-folder-toggle, ' +
      'button[aria-label*="folder"], ' +
      '.icon-folder button'
    );
    
    for (const toggle of folderToggles) {
      try {
        toggle.click();
        await this.wait(300); // Wait for folder to expand
      } catch (e) {
        console.log('Could not expand folder:', e);
      }
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
    console.log('📚 Deep crawling modules...');
    
    // Navigate to modules page if not already there
    const modulesUrl = `${window.location.origin}/courses/${this.courseId}/modules`;
    await this.navigateAndScan(modulesUrl);
    
    // Find all module items and visit them
    const moduleItems = document.querySelectorAll(
      '.context_module_item a, .module-item-title a, .ig-title a'
    );
    
    console.log(`Found ${moduleItems.length} module items to explore`);
    
    for (const item of moduleItems) {
      const href = item.href;
      if (href && !this.crawlerState.visitedUrls.has(href) && href.includes(this.courseId)) {
        console.log(`📄 Visiting module item: ${item.textContent?.trim()}`);
        await this.navigateAndScan(href);
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
        // Filter for content that might contain PDFs
        if (href.includes('/files/') || 
            href.includes('/pages/') || 
            href.includes('/assignments/') ||
            href.includes('/discussion_topics/') ||
            href.includes('/external_tools/') ||
            href.includes('/quizzes/')) {
          
          itemsToVisit.push({
            url: href,
            title: item.textContent?.trim() || 'Module Item',
            type: this.getUrlType(href)
          });
        }
      }
    }
    
    console.log(`Will systematically visit ${itemsToVisit.length} module items`);
    
    // Visit each module item
    for (const item of itemsToVisit) {
      if (!this.crawlerState.isRunning) break;
      
      console.log(`📖 Visiting module item: ${item.title} (${item.type})`);
      await this.navigateAndScan(item.url);
      
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
        console.log(`📋 Visiting assignment: ${link.textContent?.trim()}`);
        await this.navigateAndScan(href);
        
        // Look for file attachments on assignment pages
        await this.scanForFileAttachments();
      }
    }
  }

  async deepCrawlQuizzesSection() {
    console.log('🧪 Deep crawling quizzes section...');
    this.crawlerState.currentStep = 'deep_crawl_quizzes';
    
    await this.wait(2000);
    
    // Find all quiz links
    const quizLinks = document.querySelectorAll(
      '.quiz_list a[href*="/quizzes/"], ' +
      '.quiz-list a, ' +
      'a[href*="/quizzes/"], ' +
      '.quiz-title a'
    );
    
    console.log(`Found ${quizLinks.length} quizzes to examine`);
    
    for (const link of quizLinks) {
      if (!this.crawlerState.isRunning) break;
      
      const href = link.href;
      if (href && href.includes(this.courseId) && !this.crawlerState.visitedUrls.has(href)) {
        console.log(`🧪 Visiting quiz: ${link.textContent?.trim()}`);
        await this.navigateAndScan(href);
        
        // Look for file attachments on quiz pages
        await this.scanForFileAttachments();
      }
    }
  }

  async deepCrawlAnnouncementsSection() {
    console.log('📢 Deep crawling announcements section...');
    this.crawlerState.currentStep = 'deep_crawl_announcements';
    
    await this.wait(2000);
    
    // Find all announcement links
    const announcementLinks = document.querySelectorAll(
      '.announcement-list a[href*="/discussion_topics/"], ' +
      '.topic_list a, ' +
      'a[href*="/announcements/"], ' +
      '.discussion-title a'
    );
    
    console.log(`Found ${announcementLinks.length} announcements to examine`);
    
    for (const link of announcementLinks) {
      if (!this.crawlerState.isRunning) break;
      
      const href = link.href;
      if (href && href.includes(this.courseId) && !this.crawlerState.visitedUrls.has(href)) {
        console.log(`📢 Visiting announcement: ${link.textContent?.trim()}`);
        await this.navigateAndScan(href);
        await this.scanForFileAttachments();
      }
    }
  }

  async deepCrawlDiscussionsSection() {
    console.log('💬 Deep crawling discussions section...');
    this.crawlerState.currentStep = 'deep_crawl_discussions';
    
    await this.wait(2000);
    
    // Find all discussion links
    const discussionLinks = document.querySelectorAll(
      '.discussion-list a[href*="/discussion_topics/"], ' +
      '.topic_list a, ' +
      'a[href*="/discussion_topics/"], ' +
      '.discussion-title a'
    );
    
    console.log(`Found ${discussionLinks.length} discussions to examine`);
    
    for (const link of discussionLinks) {
      if (!this.crawlerState.isRunning) break;
      
      const href = link.href;
      if (href && href.includes(this.courseId) && !this.crawlerState.visitedUrls.has(href)) {
        console.log(`💬 Visiting discussion: ${link.textContent?.trim()}`);
        await this.navigateAndScan(href);
        await this.scanForFileAttachments();
      }
    }
  }

  async navigateAndScan(url) {
    if (this.crawlerState.visitedUrls.has(url) || !this.crawlerState.isRunning) {
      return;
    }
    
    this.crawlerState.visitedUrls.add(url);
    
    try {
      console.log(`🧭 Planning to visit: ${url}`);
      
      // For now, be conservative and don't navigate to avoid getting stuck
      // Just scan current page content and note that we would visit this URL
      if (window.location.href === url || 
          window.location.href.startsWith(url) ||
          window.location.pathname === new URL(url).pathname) {
        console.log('Already on target page or similar, performing scan...');
        await this.wait(1000);
        await this.performThoroughPageScan();
      } else {
        console.log(`Would visit: ${url} (navigation disabled for stability)`);
        // Still scan current page for any content that might be relevant
        this.scanAndReportPDFs();
      }
      
    } catch (error) {
      console.error(`Error with ${url}:`, error);
      // Just scan current page as fallback
      this.scanAndReportPDFs();
    }
  }



  async performThoroughPageScan() {
    console.log('🔍 Performing thorough page scan...');
    
    // Wait for page to fully load
    await this.wait(2000);
    
    // Expand all content first
    await this.expandCurrentPageContent();
    
    // Scan for PDFs with current method
    this.scanAndReportPDFs();
    
    // Additional scans for embedded content
    await this.scanPageForEmbeddedContent();
    
    // Scan for file attachments
    await this.scanForFileAttachments();
    
    console.log('✅ Thorough page scan completed');
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
        console.log(`📎 Found assignment attachment: ${link.textContent?.trim()}`);
        this.crawlerState.foundPDFs.add(href);
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
    
    // Also scan current page for any PDFs we might have missed
    this.scanAndReportPDFs();
  }

  stopCrawl() {
    console.log('🛑 Stopping crawler...');
    this.crawlerState.isRunning = false;
    this.crawlerState.currentStep = 'stopped';
  }

  reportCrawlComplete() {
    const totalPDFs = this.crawlerState.foundPDFs.size;
    const totalPages = this.crawlerState.visitedUrls.size;
    
    console.log(`✅ Crawl complete! Visited ${totalPages} pages, found ${totalPDFs} unique PDFs`);
    
    chrome.runtime.sendMessage({
      type: 'CRAWL_COMPLETE',
      courseId: this.courseId,
      pagesVisited: totalPages,
      pdfsFound: totalPDFs,
      visitedUrls: Array.from(this.crawlerState.visitedUrls)
    });
    
    this.crawlerState.currentStep = 'complete';
  }

  getAllPdfLinks() {
    const links = new Set();
    const pdfData = [];

    // 1. Direct PDF URLs (.pdf at end or in query)
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      const text = a.textContent.trim();

      if (href.match(/\.pdf($|\?)/i)) {
        links.add(href);
        pdfData.push({
          url: href,
          title: text || 'Untitled PDF',
          filename: this.extractFilename(href),
          context: this.findContext(a),
          type: 'direct_link'
        });
      }

      // Canvas file viewer links (enhanced patterns) - only include if likely to be PDF
      if (href.includes('/files/') && !href.includes('folder')) {
        // Additional checks to see if this might be a PDF based on context
        const isProbablyPDF = text.toLowerCase().includes('pdf') || 
                             text.toLowerCase().includes('.pdf') ||
                             a.querySelector('.icon-pdf, .file-icon[class*="pdf"]') ||
                             a.closest('.attachment')?.textContent?.toLowerCase().includes('pdf');
        
        // Only process if it's probably a PDF or if it's a download link
        if (isProbablyPDF || href.includes('/download')) {
          // Try to get a better title than just "Ladda ner" or "Download"
          let betterTitle = this.extractBetterTitle(a, href);
          
          // Don't use generic download text as title
          const isGenericText = text.toLowerCase() === 'ladda ner' || 
                              text.toLowerCase() === 'download' ||
                              text.toLowerCase() === 'ladda ned';
          
          const finalTitle = betterTitle || 
                            (!isGenericText ? text : null) ||
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
          title: text || 'Course File',
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
    const seenTitles = new Set(); // track titles to avoid duplicates
    const uniquePDFs = [];
    
    for (const pdf of pdfData) {
      // Extract Canvas file ID if present
      const fileIdMatch = pdf.url.match(/\/files\/(\d+)/);
      const fileId = fileIdMatch ? fileIdMatch[1] : null;
      
      // Create a normalized title for comparison
      const normalizedTitle = pdf.title.toLowerCase().trim().replace(/\.pdf$/i, '');
      
      if (fileId) {
        // This is a Canvas file - check if we already have it
        if (seenFiles.has(fileId)) {
          const existing = seenFiles.get(fileId);
          
          // Prefer download URLs over other URLs, and better titles
          const preferThis = (pdf.url.includes('/download') && !existing.url.includes('/download')) || 
                            (pdf.title.length > existing.title.length && pdf.title !== 'Ladda ner' && !pdf.title.toLowerCase().includes('download'));
          
          if (preferThis) {
            console.log(`Replacing file entry for ID ${fileId}: "${existing.title}" (${existing.url}) -> "${pdf.title}" (${pdf.url})`);
            seenFiles.set(fileId, pdf);
          } else {
            console.log(`Keeping existing file entry for ID ${fileId}: "${existing.title}" (${existing.url})`);
          }
        } else {
          seenFiles.set(fileId, pdf);
        }
      } else {
        // Not a Canvas file ID - check by title
        if (!seenTitles.has(normalizedTitle) && normalizedTitle !== 'ladda ner' && normalizedTitle !== 'download') {
          seenTitles.add(normalizedTitle);
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
      
      this.crawlerState.foundPDFs.add(downloadUrl);
      
      // Also report this PDF
      chrome.runtime.sendMessage({
        type: 'FOUND_PDFS',
        courseId: this.courseId,
        courseName: this.courseName,
        pdfs: [{
          url: downloadUrl,
          title: title,
          filename: `file_${fileId}.pdf`,
          context: this.findContext(iframe),
          type: 'iframe_extracted'
        }],
        pageUrl: location.href,
        crawlerActive: this.crawlerState?.isRunning || false
      });
    }
  }

  extractFileFromElement(element) {
    const fileId = element.dataset.fileId || element.dataset.fileUrl;
    const fileUrl = element.dataset.fileUrl || element.href;
    
    if (fileId) {
      const downloadUrl = `${window.location.origin}/courses/${this.courseId}/files/${fileId}/download`;
      this.crawlerState.foundPDFs.add(downloadUrl);
    } else if (fileUrl && (fileUrl.includes('.pdf') || fileUrl.includes('/files/'))) {
      this.crawlerState.foundPDFs.add(fileUrl);
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

  extractBetterTitle(linkElement, url) {
    try {
      // First, check if the URL itself contains the filename (for redirected Canvas URLs or direct URLs)
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
}

// Initialize the content script when DOM is ready
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new CanvasContentScript();
    });
  } else {
    new CanvasContentScript();
  }
} catch (error) {
  console.error('Canvas RAG Assistant: Error during initialization:', error);
}