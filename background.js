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
  const titleCounts = new Map(); // Track how many times we've seen each title
  const validPdfs = [];
  
  for (const pdf of pdfs) {
    // Skip if we've already seen this exact URL
    if (seenUrls.has(pdf.url)) {
      console.log(`Skipping duplicate URL: ${pdf.title} (${pdf.url})`);
      continue;
    }
    
    // Check if this looks like a PDF based on available information
    // Be more strict about what we consider a valid PDF
    const isPdf = (
      // Direct PDF links
      pdf.url.match(/\.pdf($|\?)/i) ||
      // Canvas download URLs (but not preview/wrap URLs)
      (pdf.url.includes('/download') && pdf.url.includes('/files/') && !pdf.url.includes('/preview') && !pdf.url.includes('/wrap')) ||
      // Explicitly marked as PDF types
      pdf.type === 'direct_link' ||
      // PDF in filename
      (pdf.filename && pdf.filename.toLowerCase().endsWith('.pdf'))
    ) && (
      // Exclude URLs that are likely to return HTML previews
      !pdf.url.includes('/preview') &&
      !pdf.url.includes('/wrap') &&
      !pdf.url.includes('verifier=')
    );
    
    if (isPdf) {
      seenUrls.add(pdf.url);
      
      // Handle duplicate titles by adding numbers
      const normalizedTitle = pdf.title.toLowerCase().trim();
      if (titleCounts.has(normalizedTitle)) {
        titleCounts.set(normalizedTitle, titleCounts.get(normalizedTitle) + 1);
        const count = titleCounts.get(normalizedTitle);
        pdf.uniqueTitle = `${pdf.title}(${count})`;
        console.log(`📝 Renamed duplicate title: "${pdf.title}" -> "${pdf.uniqueTitle}"`);
      } else {
        titleCounts.set(normalizedTitle, 1);
        pdf.uniqueTitle = pdf.title;
      }
      
      validPdfs.push(pdf);
      console.log(`✅ Valid PDF: ${pdf.uniqueTitle} (${pdf.type || 'unknown type'}) - URL: ${pdf.url}`);
    } else {
      console.log(`❌ Skipping non-PDF: ${pdf.title} (${pdf.type || 'unknown type'}) - URL: ${pdf.url}`);
    }
  }
  
  return validPdfs;
}

// Extract filename from URL as fallback
function extractFilenameFromUrl(url) {
  try {
    const decodedUrl = decodeURIComponent(url);
    
    // Look for PDF filename in URL
    const pdfMatch = decodedUrl.match(/([^/\?]+\.pdf)/i);
    if (pdfMatch) {
      const filename = pdfMatch[1];
      if (filename && filename !== '1.pdf') {
        return filename.replace(/\.pdf$/i, '');
      }
    }
    
    // Check for course files pattern
    const courseFilesMatch = decodedUrl.match(/course files\/(.+?)(?:\?|$)/);
    if (courseFilesMatch) {
      const filename = courseFilesMatch[1].trim();
      if (filename && filename.length > 1 && filename !== '1') {
        return filename.replace(/\.pdf$/i, '');
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// Download PDFs with authentication
async function downloadPDFsWithAuth(pdfs, courseId) {
  const results = [];
  
  // Filter and deduplicate PDFs
  const filteredPdfs = await filterAndDeduplicatePdfs(pdfs);
  console.log(`Filtered ${pdfs.length} items down to ${filteredPdfs.length} valid PDFs`);
  
  for (const pdf of filteredPdfs) {
    try {
      console.log(`Downloading PDF: ${pdf.uniqueTitle || pdf.title} from ${pdf.url}`);
      console.log(`Original filename: ${pdf.filename}`);
      
      // Clean filename for download
      let filename = pdf.filename;
      
      // Check if the extracted filename is generic/meaningless
      const isGenericFilename = !filename || 
                               /^\d+\.pdf$/.test(filename) ||  // Just numbers like "1.pdf"
                               /^file_\d+\.pdf$/.test(filename) || // Canvas file IDs
                               filename === 'download.pdf' ||
                               filename === 'preview.pdf';
      
      // Check if title is meaningful (not generic download text)
      const titleToUse = pdf.uniqueTitle || pdf.title;
      const titleLower = titleToUse.toLowerCase();
      const isGenericTitle = titleLower === 'ladda ner' ||
                            titleLower === 'ladda ned' ||
                            titleLower === 'download' ||
                            titleLower === 'canvas file' ||
                            titleToUse.length <= 2;
      
      // If title is generic, try to extract filename from URL or use a default
      if (isGenericTitle) {
        // Try to extract filename from the URL itself
        const urlFilename = extractFilenameFromUrl(pdf.url);
        if (urlFilename) {
          filename = `${urlFilename}.pdf`;
        } else if (isGenericFilename || !filename) {
          filename = `Canvas_Document_${Date.now()}.pdf`;
        }
      } else if (isGenericFilename || !filename?.toLowerCase().endsWith('.pdf')) {
        // Use meaningful title (with unique suffix if needed)
        const cleanTitle = titleToUse.replace(/[^a-z0-9._åäöÅÄÖ()-]/gi, '_').replace(/_+/g, '_');
        filename = `${cleanTitle}.pdf`;
      }
      
      // Ensure filename doesn't start with dots or have invalid characters
      filename = filename.replace(/^[._]+/, '').replace(/[<>:"/\\|?*]/g, '_');
      
      const cleanFilename = `Canvas_Course_${courseId}/${filename}`;
      
      console.log(`Final download filename: ${cleanFilename}`);
      
      // First, verify the URL actually points to a PDF by ensuring proper download endpoint
      let actualUrl = pdf.url;
      
      // For Canvas file URLs, ensure we use the download endpoint
      if (pdf.url.includes('/files/') && !pdf.url.includes('/download')) {
        const fileIdMatch = pdf.url.match(/\/files\/(\d+)/);
        if (fileIdMatch) {
          const courseIdMatch = pdf.url.match(/\/courses\/(\d+)/);
          if (courseIdMatch) {
            actualUrl = `${new URL(pdf.url).origin}/courses/${courseIdMatch[1]}/files/${fileIdMatch[1]}/download`;
            console.log(`Converted to download URL: ${actualUrl}`);
          }
        }
      }
      
      // Use Chrome downloads API with the verified URL
      const downloadId = await chrome.downloads.download({
        url: actualUrl,
        filename: cleanFilename,
        saveAs: false,
        conflictAction: 'uniquify' // Add numbers if file exists
      });
      
      // Monitor the download to verify it's actually a PDF
      chrome.downloads.onChanged.addListener(function downloadListener(delta) {
        if (delta.id === downloadId && delta.state && delta.state.current === 'complete') {
          chrome.downloads.onChanged.removeListener(downloadListener);
          
          // Get download info to check the final filename
          chrome.downloads.search({id: downloadId}, (downloads) => {
            if (downloads.length > 0) {
              const download = downloads[0];
              // If the file was downloaded as .html, remove it
              if (download.filename && download.filename.toLowerCase().endsWith('.html')) {
                console.log(`⚠️  Removing HTML file that should have been PDF: ${download.filename}`);
                chrome.downloads.removeFile(downloadId);
                chrome.downloads.erase({id: downloadId});
              } else {
                console.log(`✅ Successfully downloaded PDF: ${download.filename}`);
              }
            }
          });
        }
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