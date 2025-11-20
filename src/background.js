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

// Tab-based fetch queue to prevent overwhelming the browser
const tabFetchQueue = {
  active: 0,
  maxConcurrent: 2, // Maximum 2 temporary tabs at once
  queue: [],
  
  async add(url, originalTabId) {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, originalTabId, resolve, reject });
      this.process();
    });
  },
  
  async process() {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    const item = this.queue.shift();
    this.active++;
    
    try {
      const result = await fetchCanvasPageWithNavigation(item.url, item.originalTabId);
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.active--;
      // Process next item in queue
      setTimeout(() => this.process(), 1000); // 1 second delay between tab creations
    }
  }
};

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action || request.type) {
    case 'AUTHENTICATED_FETCH':
      // Handle authenticated fetch requests from content scripts
      handleAuthenticatedFetch(request, sender, sendResponse);
      return true; // Keep message channel open for async response
      
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
      
    case 'SMART_CRAWL_COMPLETE':
      // Handle smart navigation crawl completion
      console.log('Smart navigation crawl completed:', request.report);
      
      // Store final results
      if (request.report.foundPDFs && request.report.foundPDFs.length > 0) {
        chrome.storage.local.set({
          [`smart_pdfs_${request.report.courseId}`]: {
            courseId: request.report.courseId,
            courseName: request.report.courseName,
            pdfs: request.report.foundPDFs,
            lastScanned: new Date().toISOString(),
            crawlReport: request.report,
            source: 'smart_navigation'
          }
        });
      }
      
      // Notify popup of completion
      chrome.runtime.sendMessage({
        type: 'SMART_CRAWL_COMPLETE',
        report: request.report
      }).catch(() => {}); // Ignore if popup not open
      
      sendResponse({ received: true });
      break;
      
    case 'DOWNLOAD_PDFS':
      // Download PDFs using authenticated requests
      downloadPDFsWithAuth(request.pdfs, request.courseId)
        .then(results => sendResponse({ success: true, results }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'OPEN_AND_SCAN_TAB':
      // Open URL in background tab and scan for PDFs
      openAndScanTab(request.url, request.courseId)
        .then(pdfs => sendResponse({ success: true, pdfs }))
        .catch(error => sendResponse({ success: false, error: error.message, pdfs: [] }));
      return true;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// Handle authenticated fetch requests from content scripts
async function handleAuthenticatedFetch(request, sender, sendResponse) {
  try {
    console.log(`🌐 Background script fetching: ${request.url}`);
    
    // For Canvas pages, we need to actually navigate to them to get proper authentication
    if (request.url.includes('canvas.education.lu.se') || request.url.includes('instructure.com')) {
      // First try regular fetch to see if we already have access
      try {
        const quickResult = await chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          func: async (url) => {
            try {
              const response = await fetch(url, { credentials: 'include' });
              if (response.ok) {
                const html = await response.text();
                return {
                  ok: true,
                  status: response.status,
                  statusText: response.statusText,
                  html: html,
                  method: 'direct_fetch'
                };
              }
              return null;
            } catch (e) {
              return null;
            }
          },
          args: [request.url]
        });
        
        if (quickResult[0].result && quickResult[0].result.ok) {
          console.log(`✅ Direct fetch successful for ${request.url}`);
          sendResponse(quickResult[0].result);
          return;
        }
      } catch (e) {
        console.log(`⚠️ Direct fetch failed, using tab navigation for ${request.url}`);
      }
      
      // If direct fetch fails, use tab navigation
      const result = await tabFetchQueue.add(request.url, sender.tab.id);
      sendResponse(result);
    } else {
      // For non-Canvas URLs, use the original method
      const results = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        func: async (url, options, referer) => {
          const defaultOptions = {
            credentials: 'include',
            headers: {
              'User-Agent': navigator.userAgent,
              'Referer': referer,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'X-Requested-With': 'XMLHttpRequest',
              ...options.headers
            },
            ...options
          };

          try {
            const response = await fetch(url, defaultOptions);
            const html = await response.text();
            
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              html: html,
              headers: Object.fromEntries(response.headers.entries())
            };
          } catch (error) {
            return {
              ok: false,
              status: 0,
              statusText: error.message,
              html: '',
              error: error.message
            };
          }
        },
        args: [request.url, request.options || {}, request.referer]
      });

      const result = results[0].result;
      sendResponse(result);
    }
    
  } catch (error) {
    console.error('Error in authenticated fetch:', error);
    sendResponse({
      ok: false,
      status: 0,
      statusText: error.message,
      html: '',
      error: error.message
    });
  }
}

// Fetch Canvas page by actually navigating to it in a temporary tab
async function fetchCanvasPageWithNavigation(url, originalTabId) {
  let tempTab = null;
  
  try {
    console.log(`🔗 Creating temporary tab to fetch: ${url}`);
    
    // Notify the content script that we're starting the fetch
    try {
      chrome.tabs.sendMessage(originalTabId, {
        type: 'FETCH_STATUS',
        message: `Accessing Canvas page: ${url.split('/').pop()}...`,
        url: url
      });
    } catch (e) {
      // Ignore if content script can't receive message
    }
    
    // Create a new tab in the background to navigate to the URL
    tempTab = await chrome.tabs.create({
      url: url,
      active: false, // Don't make it the active tab
      openerTabId: originalTabId // Associate with original tab
    });
    
    // Wait for the tab to finish loading with better error handling
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tab loading timeout after 15 seconds'));
      }, 15000);
      
      const listener = (tabId, changeInfo, tab) => {
        if (tabId === tempTab.id) {
          if (changeInfo.status === 'complete') {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          } else if (changeInfo.url && changeInfo.url.includes('error') || 
                     changeInfo.url && changeInfo.url.includes('login')) {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('Authentication required or error page encountered'));
          }
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    // Extract the HTML content from the loaded tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: tempTab.id },
      func: () => {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          html: document.documentElement.outerHTML,
          url: window.location.href
        };
      }
    });
    
    const result = results[0].result;
    console.log(`✅ Successfully fetched ${result.html.length} characters from ${url}`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Failed to fetch Canvas page ${url}:`, error);
    return {
      ok: false,
      status: 0,
      statusText: error.message,
      html: '',
      error: error.message
    };
  } finally {
    // Clean up: close the temporary tab
    if (tempTab) {
      try {
        await chrome.tabs.remove(tempTab.id);
        console.log(`🗑️ Cleaned up temporary tab for ${url}`);
      } catch (cleanupError) {
        console.warn('Error cleaning up temporary tab:', cleanupError);
      }
    }
  }
}

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
      console.log(`❌ Skipping non-PDF: ${pdf.title} (${pdf.type || 'unknown type'}) - URL: ${pdf.url}`, {
        hasUrlPdfMatch: !!pdf.url.match(/\.pdf($|\?)/i),
        hasDownloadUrl: pdf.url.includes('/download') && pdf.url.includes('/files/'),
        hasPreview: pdf.url.includes('/preview'),
        hasWrap: pdf.url.includes('/wrap'),
        filename: pdf.filename,
        type: pdf.type
      });
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
      
      // Ensure filename ends with .pdf but doesn't have double extensions
      if (!filename.toLowerCase().endsWith('.pdf')) {
        filename = `${filename}.pdf`;
      }
      
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

// Open URL in background tab, scan for PDFs, and close the tab
async function openAndScanTab(url, courseId) {
  console.log(`🔄 Opening background tab for: ${url}`);
  
  return new Promise((resolve) => {
    // Create tab in background (not active)
    chrome.tabs.create({ url: url, active: false }, async (newTab) => {
      const tabId = newTab.id;
      let resolved = false;
      
      // Set timeout to ensure we don't wait forever
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.log(`⏱️ Timeout scanning ${url}, closing tab`);
          chrome.tabs.remove(tabId).catch(() => {});
          resolved = true;
          resolve([]);
        }
      }, 15000); // 15 second timeout
      
      // Wait for page to load
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          
          // Wait a bit for content script to initialize
          setTimeout(async () => {
            try {
              // Inject content script if needed
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: ['content-script.js']
                });
                
                // Wait for initialization
                await new Promise(r => setTimeout(r, 1000));
              } catch (e) {
                console.log('Content script already injected or error:', e.message);
              }
              
              // Ping content script to verify it's ready
              let retryCount = 0;
              const maxRetries = 3;
              
              while (retryCount < maxRetries) {
                try {
                  const pingResponse = await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
                      if (chrome.runtime.lastError) {
                        resolve(null);
                      } else {
                        resolve(response);
                      }
                    });
                  });
                  
                  if (pingResponse && pingResponse.ready) {
                    console.log('✓ Content script ready on background tab');
                    break;
                  }
                } catch (e) {
                  console.log(`Ping attempt ${retryCount + 1} failed:`, e.message);
                }
                
                retryCount++;
                if (retryCount < maxRetries) {
                  await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
                }
              }
              
              // Request PDF scan from the tab
              chrome.tabs.sendMessage(tabId, { action: 'getPDFs' }, (response) => {
                clearTimeout(timeout);
                
                if (!resolved) {
                  resolved = true;
                  
                  // Ensure response is an array
                  const pdfs = Array.isArray(response) ? response : [];
                  
                  if (!Array.isArray(response)) {
                    console.warn(`⚠️ getPDFs returned non-array response:`, typeof response, response);
                  }
                  
                  console.log(`✅ Found ${pdfs.length} PDFs in background tab: ${url}`);
                  
                  // Close the background tab
                  chrome.tabs.remove(tabId).catch(() => {});
                  
                  resolve(pdfs);
                }
              });
            } catch (error) {
              clearTimeout(timeout);
              if (!resolved) {
                resolved = true;
                console.error(`❌ Error scanning background tab ${url}:`, error);
                chrome.tabs.remove(tabId).catch(() => {});
                resolve([]);
              }
            }
          }, 2000); // Wait 2 seconds after page load
        }
      });
    });
  });
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