// popup.js - Canvas RAG Assistant popup functionality

// Global variables for DOM elements (will be initialized after DOM loads)
let detectBtn, scanBtn, status, result, courseInfo, courseDetails;

// Canvas URL detection and course extraction
class CanvasDetector {
  static isCanvasURL(url) {
    return /canvas\.|instructure\.com/.test(url);
  }
  
  static extractCourseId(url) {
    const match = url.match(/\/courses\/(\d+)/);
    return match ? match[1] : null;
  }
  
  static extractCourseName(title) {
    // Extract course name from page title, removing "Canvas" and other clutter
    return title.replace(/Canvas|\s*-\s*.*$/, '').trim();
  }
}

// This DOMContentLoaded listener is removed - we use the comprehensive one below

// Auto-detect Canvas page on popup open
async function checkCurrentPage() {
  console.log('checkCurrentPage called');
  console.log('Status element:', status);
  
  try {
    console.log('Starting chrome.tabs.query...');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('chrome.tabs.query result:', tabs);
    
    if (!tabs || tabs.length === 0) {
      console.log('No tabs returned from query');
      if (status) status.textContent = 'No active tab found.';
      return;
    }
    
    const tab = tabs[0];
    console.log('Got tab:', tab);
    
    if (!tab || !tab.id) {
      console.log('Invalid tab:', tab);
      if (status) status.textContent = 'No active tab found.';
      return;
    }

    // Check if tab.url exists and is accessible
    if (!tab.url) {
      console.error('Tab URL is undefined!');
      if (status) status.textContent = 'Error: Cannot access tab URL (may be a special page)';
      return;
    }

    // Check for restricted URLs that extensions cannot access
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
      console.log('Cannot access restricted URL:', tab.url);
      if (status) status.textContent = '⚠️ Please navigate to a Canvas course page first';
      if (courseInfo) courseInfo.classList.add('hidden');
      return;
    }

    console.log('Tab URL:', tab.url);
    console.log('Tab title:', tab.title);

    // Check if we're on a supported Canvas domain first
    if (!tab.url.includes('canvas.education.lu.se') && 
        !tab.url.includes('instructure.com') && 
        !tab.url.includes('canvas.com') && 
        !tab.url.includes('canvaslms.com')) {
      console.log('Not on a Canvas page');
      if (status) status.textContent = '❌ Not on a Canvas page. Please navigate to a Canvas course.';
      if (courseInfo) courseInfo.classList.add('hidden');
      return;
    }

    // Try to get course info from content script
    try {
      console.log('Trying to get course info from content script...');
      
      // Add timeout to prevent hanging
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { action: 'getCourseInfo' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Content script timeout')), 2000)
        )
      ]);
      
      console.log('Content script response:', response);
      
      if (response && response.courseId) {
        console.log('Canvas course detected via content script!');
        if (status) status.textContent = '✅ Canvas course detected!';
        showCourseInfo({
          courseId: response.courseId,
          courseName: response.courseName || 'Unknown Course',
          url: response.url || tab.url
        });
      } else {
        console.log('Content script found no course');
        if (status) status.textContent = '⚠️ On Canvas but no course detected. Navigate to a course page.';
        if (courseInfo) courseInfo.classList.add('hidden');
      }
    } catch (connectionError) {
      console.log('Content script not available, trying fallback detection...', connectionError.message);
      
      // Fallback to URL-based detection
      const isCanvas = CanvasDetector.isCanvasURL(tab.url);
      const courseId = CanvasDetector.extractCourseId(tab.url);
      
      console.log('Fallback - Is Canvas:', isCanvas, 'Course ID:', courseId);
      
      if (isCanvas && courseId) {
        console.log('Canvas course detected via fallback!');
        if (status) status.textContent = '✅ Canvas course detected!';
        showCourseInfo({
          courseId,
          courseName: CanvasDetector.extractCourseName(tab.title),
          url: tab.url
        });
        
        // Try to inject content script for future use
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-script.js']
          });
          console.log('Content script injected successfully');
        } catch (injectionError) {
          console.log('Could not inject content script:', injectionError.message);
        }
        
      } else if (isCanvas) {
        console.log('Canvas detected but no course ID');
        if (status) status.textContent = '⚠️ On Canvas but no course page detected.';
        if (courseInfo) courseInfo.classList.add('hidden');
      } else {
        console.log('Not on a Canvas page');
        if (status) status.textContent = '❌ Not on a Canvas page.';
        if (courseInfo) courseInfo.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Error in checkCurrentPage:', err);
    
    // Handle specific Chrome URL access errors
    if (err.message && err.message.includes('chrome://')) {
      if (status) status.textContent = '⚠️ Please navigate to a Canvas course page first';
    } else if (err.message && err.message.includes('Cannot access')) {
      if (status) status.textContent = '⚠️ Cannot access this page - try a regular webpage';
    } else {
      if (status) status.textContent = 'Error: Could not check page.';
    }
    
    if (courseInfo) courseInfo.classList.add('hidden');
  }
}

// Show course information
function showCourseInfo(courseData) {
  currentCourseData = courseData; // Store globally for API calls
  
  courseDetails.innerHTML = `
    <p><strong>Course ID:</strong> ${courseData.courseId}</p>
    <p><strong>Course Name:</strong> ${courseData.courseName}</p>
    <p><strong>URL:</strong> ${courseData.url}</p>
  `;
  
  courseInfo.classList.remove('hidden');
  
  // Store course data for later use (with error handling)
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ currentCourse: courseData });
    }
  } catch (err) {
    console.log('Storage not available:', err);
  }
}

function setupEventListeners() {
  // Manual detection button
  detectBtn.addEventListener('click', async () => {
    status.textContent = 'Detecting Canvas course...';
    // Reset course info visibility
    courseInfo.classList.add('hidden');
    result.textContent = '';
    await checkCurrentPage();
  });

  // Enhanced PDF scanning with auto-navigation crawler
  scanBtn.addEventListener('click', async () => {
    console.log('Scan button clicked, currentCourseData:', currentCourseData);
    
    if (!currentCourseData) {
      status.textContent = '❌ No course detected';
      return;
    }
    
    // Set loading state
    const originalText = scanBtn.textContent;
    scanBtn.classList.add('loading');
    scanBtn.textContent = 'Processing...';
    scanBtn.disabled = true;
    
    status.textContent = '🚀 Starting enhanced course crawler...';
    result.textContent = 'The crawler will automatically:\n• Expand all modules and content\n• Navigate through course sections\n• Visit assignments and files\n• Discover all PDFs in the course';
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Got active tab:', tab.id, tab.url);
      
      // Check if we're on a supported Canvas domain
      if (!tab.url.includes('canvas.education.lu.se') && 
          !tab.url.includes('instructure.com') && 
          !tab.url.includes('canvas.com') && 
          !tab.url.includes('canvaslms.com')) {
        throw new Error('Please navigate to a Canvas page first');
      }
      
      let response;
      try {
        // Try to start the enhanced crawler
        console.log('Sending startAutoCrawl message...');
        response = await chrome.tabs.sendMessage(tab.id, { action: 'startAutoCrawl' });
        console.log('Crawler start response:', response);
      } catch (connectionError) {
        console.log('Content script not loaded, injecting...', connectionError.message);
        
        // Inject the content script if it's not already loaded
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-script.js']
          });
          
          // Wait a moment for the script to initialize
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Try again
          console.log('Retrying startAutoCrawl message...');
          response = await chrome.tabs.sendMessage(tab.id, { action: 'startAutoCrawl' });
          console.log('Crawler start response after injection:', response);
        } catch (injectionError) {
          console.error('Failed to inject content script:', injectionError);
          throw new Error('Failed to initialize content script. Please refresh the page and try again.');
        }
      }
      
      // Check if the content script returned an error
      if (response && response.error) {
        throw new Error(response.error);
      }
      
      status.textContent = '🔍 Crawler active - navigating through course...';
      
      // Monitor crawler progress
      let lastFoundCount = 0;
      let stableCount = 0;
      let monitorErrorCount = 0;
      let monitorDuration = 0;
      const maxMonitorTime = 300; // 5 minutes maximum
      
      const monitorInterval = setInterval(async () => {
        monitorDuration++;
        
        // Timeout check - if we've been monitoring for too long, finish
        if (monitorDuration >= maxMonitorTime) {
          console.log('Monitor timeout reached, finishing crawl...');
          clearInterval(monitorInterval);
          status.textContent = '⏱️ Crawler timeout - downloading found PDFs...';
          await downloadFoundPDFs();
          resetScanButton();
          return;
        }
        try {
          const crawlerStatus = await chrome.tabs.sendMessage(tab.id, { action: 'getCrawlerStatus' });
          console.log('Crawler status received:', crawlerStatus);
          
          if (crawlerStatus) {
            // Reset error count on successful communication
            monitorErrorCount = 0;
            
            const step = crawlerStatus.currentStep;
            const visited = crawlerStatus.visitedUrls?.size || 0;
            const found = crawlerStatus.foundPDFs?.size || 0;
            
            status.textContent = `🔍 ${step.replace(/_/g, ' ').toUpperCase()} - Visited: ${visited} pages, Found: ${found} PDFs`;
            
            // Check if PDF count has been stable (fallback mechanism)
            if (found > 0 && found === lastFoundCount) {
              stableCount++;
              if (stableCount >= 10) { // 10 seconds of no new PDFs
                console.log('PDF count stable, initiating download...');
                clearInterval(monitorInterval);
                status.textContent = `✅ Found ${found} PDFs - starting download...`;
                await downloadFoundPDFs();
                return;
              }
            } else {
              stableCount = 0;
            }
            lastFoundCount = found;
            
            if (!crawlerStatus.isRunning) {
              clearInterval(monitorInterval);
              
              if (step === 'complete' || step === 'Completed' || step.includes('Completing')) {
                // Crawler finished, now download PDFs
                status.textContent = '✅ Crawler completed successfully - downloading PDFs...';
                await downloadFoundPDFs();
                resetScanButton();
              } else if (step.includes('error') || step.includes('Error')) {
                status.textContent = '❌ Crawler encountered an error';
                // Still try to download any PDFs found
                if (found > 0) {
                  await downloadFoundPDFs();
                }
                resetScanButton();
              } else if (step === 'stopped') {
                status.textContent = '⏹️ Crawler was stopped';
                // Still try to download any PDFs found
                if (found > 0) {
                  await downloadFoundPDFs();
                }
                resetScanButton();
              } else {
                // Unknown completion state, but if we found PDFs, download them
                if (found > 0) {
                  status.textContent = `✅ Crawler finished - downloading ${found} PDFs...`;
                  await downloadFoundPDFs();
                } else {
                  status.textContent = '⚠️ Crawler finished but found no PDFs';
                  resetScanButton();
                }
              }
            }
          }
        } catch (err) {
          console.error('Monitor communication error:', err);
          
          // Check if this is a communication error vs crawler error
          if (err.message.includes('Could not establish connection') || 
              err.message.includes('message port closed') ||
              err.message.includes('Extension context invalidated')) {
            // Content script might be done or page changed - check for PDFs
            console.log('Content script communication lost, checking for PDFs...');
            clearInterval(monitorInterval);
            status.textContent = '🔍 Crawler completed - checking for PDFs...';
            await downloadFoundPDFs();
            resetScanButton();
          } else {
            // Other error - wait a bit and try again (up to 3 times)
            monitorErrorCount = (monitorErrorCount || 0) + 1;
            if (monitorErrorCount >= 3) {
              clearInterval(monitorInterval);
              status.textContent = '❌ Lost connection to crawler';
              await downloadFoundPDFs();
              resetScanButton();
            }
          }
        }
      }, 1000);
      
      // Set timeout to stop crawler if it runs too long
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'stopAutoCrawl' });
          clearInterval(monitorInterval);
          status.textContent = '⏰ Crawler timed out - downloading found PDFs...';
          await downloadFoundPDFs();
        } catch (err) {
          console.error('Timeout error:', err);
        }
        resetScanButton();
      }, 60000); // 1 minute timeout
      
    } catch (err) {
      status.textContent = '❌ Error starting crawler';
      result.textContent = `Error: ${err.message}\n\nMake sure you're on a Canvas page and try again.`;
      console.error('Crawler start error:', err);
      resetScanButton();
    }
  });
}

// DOM elements (will be initialized after DOM loads)
let currentCourseData = null;

// Initialize everything after DOM loads
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded fired');
  
  // Initialize DOM elements
  detectBtn = document.getElementById('detectCanvas');
  scanBtn = document.getElementById('scanPDFs');
  status = document.getElementById('status');
  result = document.getElementById('result');
  courseInfo = document.getElementById('course-info');
  courseDetails = document.getElementById('course-details');
  
  console.log('DOM elements found:', {
    detectBtn: !!detectBtn,
    scanBtn: !!scanBtn,
    status: !!status,
    result: !!result,
    courseInfo: !!courseInfo,
    courseDetails: !!courseDetails
  });
  
  // Check if all required elements exist
  if (!detectBtn || !scanBtn || !status || !result || !courseInfo || !courseDetails) {
    console.error('Some required DOM elements are missing');
    if (status) status.textContent = 'Error: UI elements not found';
    return;
  }
  
  console.log('Setting up event listeners...');
  // Add event listeners
  setupEventListeners();
  
  console.log('Calling checkCurrentPage...');
  // Initialize
  await checkCurrentPage();
  console.log('checkCurrentPage completed');
});

function resetScanButton() {
  if (scanBtn) {
    scanBtn.classList.remove('loading');
    scanBtn.textContent = 'Start Enhanced Course Crawl';
    scanBtn.disabled = false;
  }
}

async function downloadFoundPDFs() {
  try {
    // Get all PDFs found during crawling
    const storedData = await chrome.storage.local.get([`pdfs_${currentCourseData.courseId}`]);
    const pdfs = storedData[`pdfs_${currentCourseData.courseId}`]?.pdfs || [];
    
    if (pdfs.length === 0) {
      status.textContent = '❌ No PDFs found during crawl';
      result.textContent = 'The crawler completed but found no PDFs. This could mean:\n• Course has no PDF files\n• PDFs are in restricted areas\n• Course uses external links';
      resetScanButton();
      return;
    }
    
    status.textContent = `📥 Downloading ${pdfs.length} discovered PDFs...`;
    result.textContent = `Crawler found PDFs:\n${pdfs.map(pdf => `• ${pdf.title} (${pdf.type})`).join('\n')}`;
    
    // Download all PDFs using background script
    const downloadResult = await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PDFS',
      pdfs: pdfs,
      courseId: currentCourseData.courseId
    });
    
    if (downloadResult.success) {
      const successful = downloadResult.results.filter(r => r.status === 'success').length;
      const failed = downloadResult.results.filter(r => r.status === 'failed').length;
      
      status.textContent = `✅ Enhanced crawl complete: ${successful} PDFs downloaded, ${failed} failed`;
      
      if (failed > 0) {
        const failedPdfs = downloadResult.results
          .filter(r => r.status === 'failed')
          .map(r => `• ${r.pdf.title}: ${r.error}`)
          .join('\n');
        result.textContent += `\n\n❌ Failed downloads:\n${failedPdfs}`;
      }
    } else {
      throw new Error(downloadResult.error);
    }
    
  } catch (err) {
    status.textContent = '❌ Error downloading PDFs';
    result.textContent = `Download error: ${err.message}`;
    console.error(err);
  }
  
  resetScanButton();
}
