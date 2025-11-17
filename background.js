// background.js - Service worker for Canvas RAG Assistant

// Auto-reload extension during development
chrome.management.getSelf((info) => {
  if (info.installType === 'development') {
    console.log('Canvas RAG Assistant: Development mode detected');
    
    // Listen for file changes and reload extension
    // Note: This is a basic implementation - for more advanced auto-reload,
    // you'd need a file watcher or websocket connection
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action || request.type) {
    case 'storeCourseInfo':
      // Store course information in extension storage
      chrome.storage.local.set({
        [`course_${request.data.courseId}`]: request.data
      }).then(() => {
        console.log('Course info stored:', request.data);
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Error storing course info:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async response
      
    case 'getCourseInfo':
      // Retrieve course information
      const courseId = request.courseId;
      chrome.storage.local.get(`course_${courseId}`).then(result => {
        sendResponse(result[`course_${courseId}`] || null);
      }).catch(error => {
        console.error('Error retrieving course info:', error);
        sendResponse(null);
      });
      return true;
      
    case 'FOUND_PDFS':
      // Handle PDF discovery from content script
      console.log(`Found ${request.pdfs.length} PDFs in course ${request.courseId}:`, request.pdfs);
      
      // Store PDFs for this course
      chrome.storage.local.set({
        [`pdfs_${request.courseId}`]: {
          courseId: request.courseId,
          courseName: request.courseName,
          pdfs: request.pdfs,
          lastScanned: new Date().toISOString(),
          pageUrl: request.pageUrl
        }
      });
      
      // Notify popup if it's open
      chrome.runtime.sendMessage({
        type: 'PDF_SCAN_COMPLETE',
        courseId: request.courseId,
        pdfCount: request.pdfs.length
      }).catch(() => {}); // Ignore if popup not open
      
      sendResponse({ received: true });
      break;
      
    case 'DOWNLOAD_PDFS':
      // Download PDFs using authenticated requests
      downloadPDFsWithAuth(request.pdfs, request.courseId)
        .then(results => sendResponse({ success: true, results }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// Filter and deduplicate PDFs
async function filterAndDeduplicatePdfs(pdfs) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const validPdfs = [];
  
  for (const pdf of pdfs) {
    // Skip if we've already seen this URL or a very similar title
    const normalizedTitle = pdf.title.toLowerCase().trim();
    
    // Don't use generic download titles for deduplication
    const isGenericTitle = normalizedTitle === 'ladda ner' || 
                          normalizedTitle === 'download' ||
                          normalizedTitle === 'canvas file';
    
    if (seenUrls.has(pdf.url) || (!isGenericTitle && seenTitles.has(normalizedTitle))) {
      console.log(`Skipping duplicate: ${pdf.title} (${pdf.url})`);
      continue;
    }
    
    // Check if this looks like a PDF based on available information
    const isPdf = pdf.url.includes('.pdf') ||
                 pdf.title.toLowerCase().includes('.pdf') ||
                 pdf.type === 'canvas_pdf' ||
                 pdf.type === 'direct_link' ||
                 (pdf.url.includes('/files/') && pdf.url.includes('canvas')) ||
                 pdf.filename?.toLowerCase().includes('.pdf');
    
    if (isPdf) {
      seenUrls.add(pdf.url);
      seenTitles.add(normalizedTitle);
      validPdfs.push(pdf);
      console.log(`✅ Valid PDF: ${pdf.title} (${pdf.type || 'unknown type'})`);
    } else {
      console.log(`❌ Skipping non-PDF: ${pdf.title} (${pdf.type || 'unknown type'})`);
    }
  }
  
  return validPdfs;
}

// Download PDFs with authentication
async function downloadPDFsWithAuth(pdfs, courseId) {
  const results = [];
  
  // Filter and deduplicate PDFs
  const filteredPdfs = await filterAndDeduplicatePdfs(pdfs);
  console.log(`Filtered ${pdfs.length} items down to ${filteredPdfs.length} valid PDFs`);
  
  for (const pdf of filteredPdfs) {
    try {
      console.log(`Downloading PDF: ${pdf.title} from ${pdf.url}`);
      console.log(`Original filename: ${pdf.filename}`);
      
      // Clean filename for download
      let filename = pdf.filename;
      
      // Check if the extracted filename is generic/meaningless
      const isGenericFilename = !filename || 
                               /^\d+\.pdf$/.test(filename) ||  // Just numbers like "1.pdf"
                               /^file_\d+\.pdf$/.test(filename) || // Canvas file IDs
                               filename === 'download.pdf' ||
                               filename === 'preview.pdf';
      
      // If filename is generic or missing, use the title instead
      if (isGenericFilename || !filename.toLowerCase().endsWith('.pdf')) {
        const cleanTitle = pdf.title.replace(/[^a-z0-9._åäöÅÄÖ-]/gi, '_').replace(/_+/g, '_');
        filename = `${cleanTitle}.pdf`;
      }
      
      // Ensure filename doesn't start with dots or have invalid characters
      filename = filename.replace(/^[._]+/, '').replace(/[<>:"/\\|?*]/g, '_');
      
      const cleanFilename = `Canvas_Course_${courseId}/${filename}`;
      
      console.log(`Final download filename: ${cleanFilename}`);
      
      // Use Chrome downloads API directly with the URL
      const downloadId = await chrome.downloads.download({
        url: pdf.url,
        filename: cleanFilename,
        saveAs: false,
        conflictAction: 'uniquify' // Add numbers if file exists
      });
      
      results.push({
        pdf: pdf,
        status: 'success',
        downloadId: downloadId,
        filename: cleanFilename
      });
      
      console.log(`✅ Started download: ${pdf.title} (ID: ${downloadId})`);
      
    } catch (error) {
      console.error(`❌ Failed to download ${pdf.title}:`, error);
      results.push({
        pdf: pdf,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  return results;
}

// Extension installation/update handler
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Canvas RAG Assistant installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // First time installation
    console.log('Welcome to Canvas RAG Assistant!');
    
    // Set default settings
    chrome.storage.local.set({
      extensionSettings: {
        autoDetectCanvas: true,
        autoscanPDFs: false,
        debugMode: false
      }
    });
  }
  
  if (details.reason === 'update') {
    // Extension updated
    console.log('Canvas RAG Assistant updated to version:', chrome.runtime.getManifest().version);
  }
});

// Tab update listener - detect when user navigates to Canvas pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act when page is completely loaded
  if (changeInfo.status === 'complete' && tab.url) {
    const isCanvas = /canvas\.|instructure\.com/.test(tab.url);
    const courseMatch = tab.url.match(/\/courses\/(\d+)/);
    
    if (isCanvas && courseMatch) {
      console.log(`Canvas course detected: ${courseMatch[1]} on tab ${tabId}`);
      
      // Badge the extension icon when on Canvas
      chrome.action.setBadgeText({
        text: '📚',
        tabId: tabId
      });
      
      chrome.action.setBadgeBackgroundColor({
        color: '#4CAF50',
        tabId: tabId
      });
    } else {
      // Clear badge when not on Canvas
      chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    }
  }
});

// Development helper: Log all storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log('Storage changed in', namespace, ':', changes);
});