// popup.js - Canvas RAG Assistant popup functionality

// Firestore helpers will be accessed via window.firestoreHelpers after scripts load
// We'll destructure them after Firebase initializes

// Get Firebase db reference
let db;

// Helper functions (will be assigned after firestore-helpers.js loads)
let saveUser, getUser, saveCourse, getCourse, getUserCourses, updateCoursePdfCount;
let saveDocument, saveDocuments, getCourseDocuments, updateDocumentStatus;
let getUserStats, getCourseStats, waitForFirebase, isFirebaseReady;
let saveDocumentFileSearch, getCourseDocumentsWithFileSearch, getDocumentsNeedingFileSearchUpload, saveCourseFileSearchStore;
// NEW: Enrollment and chat functions
let enrollUserInCourse, isUserEnrolled, updateEnrollmentFavorite;
let createChatSession, getUserChatSessions, addMessageToSession, getSessionMessages, deleteChatSession;

// Gemini File Search Manager (will be initialized with API key)
let fileSearchManager = null;

// Global variables for DOM elements (will be initialized after DOM loads)
let detectBtn, scanBtn, status, result, courseInfo, courseDetails;
let loginBtn, logoutBtn, loggedInDiv, loggedOutDiv, userPhoto, userName, userEmail;
let chatSection, chatMessages, chatInput, sendChatBtn;
let currentUser = null;
let conversationHistory = [];

// Helper function to convert base64 to blob
function base64ToBlob(base64, mimeType = 'application/pdf') {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

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

// Detect if we're in tab mode or popup mode
async function detectViewMode() {
  try {
    // Check if the URL is a chrome-extension:// URL
    // When opened as a tab, the URL will be chrome-extension://...
    // When opened as a popup, the URL is also chrome-extension but we can check other factors
    
    // Most reliable way: check if we're in a popup view
    const views = chrome.extension.getViews({ type: 'popup' });
    const isPopupView = views.includes(window);
    
    console.log('View detection:', {
      url: window.location.href,
      isPopupView,
      popupViewsCount: views.length,
      windowWidth: window.innerWidth
    });
    
    // If we're explicitly a popup view, return false
    if (isPopupView) {
      return false; // popup mode
    }
    
    // If we're not a popup view, we must be in a tab
    return true; // tab mode
  } catch (error) {
    console.error('Error detecting view mode:', error);
    return false;
  }
}

// Show course selector for tab mode
async function showCourseSelector() {
  const courseSelector = document.getElementById('course-selector');
  const canvasDetection = document.getElementById('canvas-detection');
  const courseList = document.getElementById('course-list');
  
  if (!courseSelector || !canvasDetection || !courseList) {
    console.error('Course selector elements not found');
    return;
  }
  
  // Hide canvas detection, show course selector
  canvasDetection.classList.add('hidden');
  courseSelector.classList.remove('hidden');
  
  if (!currentUser) {
    courseList.innerHTML = '<p class="loading-courses">Please sign in to view your courses.</p>';
    return;
  }
  
  try {
    // Get user's enrolled courses
    const courses = await getUserCourses(currentUser.uid);
    
    if (!courses || courses.length === 0) {
      courseList.innerHTML = `
        <div class="alert alert-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="M12 16V12M12 8H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <small>No courses found. Visit a Canvas course page and scan it first to add courses to your library.</small>
        </div>
      `;
      return;
    }
    
    // Render course items
    courseList.innerHTML = courses.map(course => `
      <div class="course-item" data-course-id="${course.courseId}">
        <div class="course-item-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 3H8C9.06087 3 10.0783 3.42143 10.8284 4.17157C11.5786 4.92172 12 5.93913 12 7V21C12 20.2044 11.6839 19.4413 11.1213 18.8787C10.5587 18.3161 9.79565 18 9 18H2V3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 3H16C14.9391 3 13.9217 3.42143 13.1716 4.17157C12.4214 4.92172 12 5.93913 12 7V21C12 20.2044 12.3161 19.4413 12.8787 18.8787C13.4413 18.3161 14.2044 18 15 18H22V3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="course-item-details">
          <div class="course-item-name">${course.courseName || 'Untitled Course'}</div>
          <div class="course-item-meta">
            <span class="course-item-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${course.pdfCount || 0} PDFs
            </span>
          </div>
        </div>
      </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.course-item').forEach(item => {
      item.addEventListener('click', async () => {
        const courseId = item.dataset.courseId;
        const course = courses.find(c => c.courseId === courseId);
        if (course) {
          await selectCourse(course);
        }
      });
    });
    
  } catch (error) {
    console.error('Error loading courses:', error);
    courseList.innerHTML = `
      <div class="alert alert-error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <path d="M15 9L9 15M9 9L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <small>Error loading courses. Please try again.</small>
      </div>
    `;
  }
}

// Select a course from the selector
async function selectCourse(course) {
  console.log('Course selected:', course);
  
  // Hide course selector
  const courseSelector = document.getElementById('course-selector');
  if (courseSelector) {
    courseSelector.classList.add('hidden');
  }
  
  // Set current course data
  currentCourseData = {
    courseId: course.courseId,
    courseName: course.courseName,
    url: course.url || `https://canvas.instructure.com/courses/${course.courseId}`
  };
  
  // Show course info
  if (courseInfo) {
    courseInfo.classList.remove('hidden');
  }
  
  if (courseDetails) {
    courseDetails.innerHTML = `
      <p><strong>Course:</strong> ${course.courseName}</p>
      <p><strong>Course ID:</strong> ${course.courseId}</p>
      <p><strong>PDFs:</strong> ${course.pdfCount || 0}</p>
    `;
  }
  
  // Show chat section if there are PDFs
  if (course.pdfCount > 0) {
    if (chatSection) {
      chatSection.classList.remove('hidden');
    }
    
    // Initialize chat for this course
    conversationHistory = [];
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="chat-message system">
          <div class="message-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2"/>
              <path d="M8 14C8 14 9.5 16 12 16C14.5 16 16 14 16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M9 9H9.01M15 9H15.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>Hello! I'm ready to answer questions about ${course.courseName}. Ask me anything!</p>
          </div>
        </div>
      `;
    }
  }
  
  if (status) {
    status.textContent = `✅ Selected: ${course.courseName}`;
  }
}

// Auto-detect Canvas page on popup open  
async function checkCurrentPage() {
  console.log('checkCurrentPage called');
  console.log('Status element:', status);
  
  // Add timeout protection to prevent getting stuck
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('checkCurrentPage timeout')), 10000);
  });
  
  try {
    console.log('Starting chrome.tabs.query...');
    const tabs = await Promise.race([
      chrome.tabs.query({ active: true, currentWindow: true }),
      timeoutPromise
    ]);
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

    // Try to get course info from content script with timeout
    try {
      console.log('Trying to get course info from content script...');
      const messageTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Content script timeout')), 3000);
      });
      
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { action: 'getCourseInfo' }),
        messageTimeout
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
        if (status) status.textContent = '✅ Canvas course detected! (content script loading...)';
        showCourseInfo({
          courseId,
          courseName: CanvasDetector.extractCourseName(tab.title),
          url: tab.url
        });
        
        // Try to inject content script for future use
        try {
          const injectionPromise = chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-script.js']
          });
          
          const injectionTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Content script injection timeout')), 5000);
          });
          
          await Promise.race([injectionPromise, injectionTimeout]);
          console.log('Content script injected successfully');
          if (status) status.textContent = '✅ Canvas course detected!';
          
          // Wait a moment and try to verify the content script is responding
          setTimeout(async () => {
            try {
              const testResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getCourseInfo' });
              if (testResponse && testResponse.courseId) {
                console.log('Content script is responding properly');
                if (status) status.textContent = '✅ Canvas course detected!';
              }
            } catch (testError) {
              console.log('Content script not responding after injection:', testError.message);
              if (status) status.textContent = '✅ Canvas course detected! (basic mode)';
            }
          }, 2000);
          
        } catch (injectionError) {
          console.log('Could not inject content script:', injectionError.message);
          if (status) status.textContent = '✅ Canvas course detected! (basic mode)';
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
async function showCourseInfo(courseData) {
  currentCourseData = courseData; // Store globally for API calls
  
  courseDetails.innerHTML = `
    <p><strong>Course ID:</strong> ${courseData.courseId}</p>
    <p><strong>Course Name:</strong> ${courseData.courseName}</p>
    <p><strong>URL:</strong> ${courseData.url}</p>
  `;
  
  courseInfo.classList.remove('hidden');
  
  // Show debug section
  const debugSection = document.getElementById('debug-section');
  if (debugSection) {
    debugSection.classList.remove('hidden');
  }
  
  // Store course data for later use (with error handling)
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ currentCourse: courseData });
    }
  } catch (err) {
    console.log('Storage not available:', err);
  }
  
  // Check if this course has documents and show chat interface if available
  if (currentUser && db) {
    await showChatInterface();
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
  
  // Chat functionality
  sendChatBtn.addEventListener('click', handleChatSend);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  });
  
  // Auto-resize textarea as user types
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
  });

  // Debug: List all stores button
  const listStoresBtn = document.getElementById('listStoresBtn');
  if (listStoresBtn) {
    listStoresBtn.addEventListener('click', async () => {
      const debugOutput = document.getElementById('debugOutput');
      debugOutput.innerHTML = '<p style="color: #666;">Loading stores...</p>';
      
      try {
        if (!fileSearchManager || !currentUser) {
          debugOutput.innerHTML = '<p style="color: red;">❌ Not signed in or File Search not initialized</p>';
          return;
        }
        
        const result = await fileSearchManager.listStores();
        
        if (result.stores && result.stores.length > 0) {
          debugOutput.innerHTML = `<p><strong>✅ Found ${result.stores.length} store(s):</strong></p>` +
            result.stores.map((store, i) => 
              `<div style="padding: 8px; border-bottom: 1px solid #ddd; margin-bottom: 5px;">
                <strong>${i+1}. Store:</strong> ${store.name}<br>
                <small style="color: #666;">Display: ${store.displayName || 'N/A'}</small>
              </div>`
            ).join('');
        } else {
          debugOutput.innerHTML = '<p style="color: orange;">⚠️ No stores found</p>';
        }
      } catch (error) {
        console.error('Error listing stores:', error);
        debugOutput.innerHTML = `<p style="color: red;">❌ Error: ${error.message}</p>`;
      }
    });
  }

  // Debug: List documents button
  const listDocumentsBtn = document.getElementById('listDocumentsBtn');
  if (listDocumentsBtn) {
    listDocumentsBtn.addEventListener('click', async () => {
      const debugOutput = document.getElementById('debugOutput');
      debugOutput.innerHTML = '<p style="color: #666;">Loading documents...</p>';
      
      try {
        if (!fileSearchManager || !currentUser) {
          debugOutput.innerHTML = '<p style="color: red;">❌ Not signed in or File Search not initialized</p>';
          return;
        }
        
        if (!currentCourseData || !currentCourseData.courseId) {
          debugOutput.innerHTML = '<p style="color: red;">❌ No course detected</p>';
          return;
        }
        
        // Get the store name from Firestore using helper function
        const courseResult = await window.firestoreHelpers.getCourse(db, currentCourseData.courseId);
        const storeName = courseResult.success ? courseResult.data.fileSearchStoreName : null;
        
        if (!storeName) {
          debugOutput.innerHTML = '<p style="color: orange;">⚠️ No File Search store found for this course. Try scanning first.</p>';
          return;
        }
        
        // Call the listDocuments function
        const result = await fileSearchManager.listDocuments(storeName);
        
        if (result.documents && result.documents.length > 0) {
          debugOutput.innerHTML = `<p><strong>✅ Found ${result.documents.length} documents in ${storeName}:</strong></p>` +
            result.documents.map((doc, i) => 
              `<div style="padding: 5px; border-bottom: 1px solid #ddd;">
                ${i+1}. ${doc.displayName || doc.name || 'Unnamed'}<br>
                <small style="color: #666;">${doc.name}</small>
              </div>`
            ).join('');
        } else {
          debugOutput.innerHTML = '<p style="color: orange;">⚠️ No documents found in store</p>';
        }
      } catch (error) {
        console.error('Error listing documents:', error);
        debugOutput.innerHTML = `<p style="color: red;">❌ Error: ${error.message}</p>`;
      }
    });
  }

  // Debug: System reset button
  const systemResetBtn = document.getElementById('systemResetBtn');
  if (systemResetBtn) {
    systemResetBtn.addEventListener('click', async () => {
      const debugOutput = document.getElementById('debugOutput');
      
      const confirmed = confirm('⚠️ WARNING: This will delete ALL File Search stores and documents for your account. This cannot be undone. Continue?');
      if (!confirmed) {
        debugOutput.innerHTML = '<p style="color: #666;">Reset cancelled</p>';
        return;
      }
      
      debugOutput.innerHTML = '<p style="color: #666;">Deleting all stores...</p>';
      
      try {
        if (!fileSearchManager || !currentUser) {
          debugOutput.innerHTML = '<p style="color: red;">❌ Not signed in or File Search not initialized</p>';
          return;
        }
        
        // First, list all stores
        const listResult = await fileSearchManager.listStores();
        
        if (!listResult.stores || listResult.stores.length === 0) {
          debugOutput.innerHTML = '<p style="color: orange;">⚠️ No stores to delete</p>';
          return;
        }
        
        let output = `<p><strong>Found ${listResult.stores.length} store(s). Deleting...</strong></p>`;
        debugOutput.innerHTML = output;
        
        // Delete each store
        let deleted = 0;
        let failed = 0;
        for (const store of listResult.stores) {
          try {
            output += `<p style="color: #666;">Deleting: ${store.name}...</p>`;
            debugOutput.innerHTML = output;
            
            await fileSearchManager.deleteStore(store.name);
            deleted++;
            output += `<p style="color: green;">✅ Deleted: ${store.name}</p>`;
            debugOutput.innerHTML = output;
          } catch (err) {
            failed++;
            output += `<p style="color: red;">❌ Failed to delete ${store.name}: ${err.message}</p>`;
            debugOutput.innerHTML = output;
          }
        }
        
        output += `<p><strong>Complete! Deleted: ${deleted}, Failed: ${failed}</strong></p>`;
        debugOutput.innerHTML = output;
        
      } catch (error) {
        console.error('Error during system reset:', error);
        debugOutput.innerHTML = `<p style="color: red;">❌ Error: ${error.message}</p>`;
      }
    });
  }

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
    
    status.textContent = '🧭 Starting Smart Navigation System...';
    result.textContent = 'Smart Navigation will intelligently:\n• Expand all modules and content\n• Navigate through course sections systematically\n• Visit pages, assignments, and files\n• Discover and download all PDFs in the course\n\n⚡ Using Smart Navigation (primary system)';
    
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
      
      status.textContent = '🧭 Smart Navigation active - intelligently exploring course...';
      
      // Monitor crawler progress
      let lastFoundCount = 0;
      let stableCount = 0;
      let monitorErrorCount = 0;
      let monitorDuration = 0;
      const maxMonitorTime = 300; // 5 minutes maximum
      
      const monitorInterval = setInterval(async () => {
        monitorDuration++;
        
        // Timeout check - if we've been monitoring for too long, stop monitoring
        if (monitorDuration >= maxMonitorTime) {
          console.log('Monitor timeout reached, stopping monitoring...');
          clearInterval(monitorInterval);
          status.textContent = '⏱️ Crawler timeout - check console for details';
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
            
            status.textContent = `🧭 ${step.replace(/_/g, ' ').toUpperCase()} - ${visited} pages, ${found} PDFs`;
            result.textContent = `Smart Navigation Status:\n📍 Current: ${step.replace(/_/g, ' ')}\n📑 Pages scanned: ${visited}\n📎 PDFs found: ${found}\n\n💡 Opening pages in background tabs...`;
            
            // Only download when crawler actually completes
            if (!crawlerStatus.isRunning) {
              clearInterval(monitorInterval);
              
              if (step === 'complete' || step === 'Completed' || step.includes('Completing')) {
                // Crawler finished, now download PDFs
                status.textContent = '✅ Crawler completed successfully - downloading PDFs...';
                await saveFoundPDFsToFirestore();
              } else if (step.includes('error') || step.includes('Error')) {
                status.textContent = '❌ Crawler encountered an error';
                // Still try to download any PDFs found
                if (found > 0) {
                  await saveFoundPDFsToFirestore();
                }
                resetScanButton();
              } else if (step === 'stopped') {
                status.textContent = '⏹️ Crawler was stopped';
                // Still try to download any PDFs found
                if (found > 0) {
                  await saveFoundPDFsToFirestore();
                }
                resetScanButton();
              } else {
                // Unknown completion state, but if we found PDFs, download them
                if (found > 0) {
                  status.textContent = `✅ Crawler finished - downloading ${found} PDFs...`;
                  await saveFoundPDFsToFirestore();
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
            await saveFoundPDFsToFirestore();
            resetScanButton();
          } else {
            // Other error - wait a bit and try again (up to 3 times)
            monitorErrorCount = (monitorErrorCount || 0) + 1;
            if (monitorErrorCount >= 3) {
              clearInterval(monitorInterval);
              status.textContent = '❌ Lost connection to crawler';
              await saveFoundPDFsToFirestore();
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
          await saveFoundPDFsToFirestore();
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
  
  // Wait for Firebase to be ready (using temporary function)
  await (async function waitForFirebaseTemp() {
    const startTime = Date.now();
    while (!window.firebaseDb || !window.firestoreHelpers) {
      if (Date.now() - startTime > 5000) {
        throw new Error('Firebase initialization timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  })();
  
  db = window.firebaseDb;
  
  // Destructure Firestore helper functions
  ({
    saveUser,
    getUser,
    saveCourse,
    getCourse,
    getUserCourses,
    updateCoursePdfCount,
    saveDocument,
    saveDocuments,
    getCourseDocuments,
    updateDocumentStatus,
    getUserStats,
    getCourseStats,
    waitForFirebase,
    isFirebaseReady,
    saveDocumentFileSearch,
    getCourseDocumentsWithFileSearch,
    getDocumentsNeedingFileSearchUpload,
    saveCourseFileSearchStore,
    // NEW: Enrollment and chat functions
    enrollUserInCourse,
    isUserEnrolled,
    updateEnrollmentFavorite,
    createChatSession,
    getUserChatSessions,
    addMessageToSession,
    getSessionMessages,
    deleteChatSession
  } = window.firestoreHelpers);
  
  // Initialize Gemini File Search Manager with Cloud Functions
  // Note: userId will be set after user authentication
  try {
    // No API key needed - uses Cloud Functions!
    fileSearchManager = new window.GeminiFileSearchCloudClient(window.firebaseApp, null);
    console.log('✅ File Search Manager initialized (using Cloud Functions - userId will be set after auth)');
  } catch (error) {
    console.error('❌ Error initializing File Search Manager:', error);
  }
  
  console.log('Firebase initialized and helpers loaded');
  
  // Track processed crawl completions to prevent duplicates
  const processedCrawls = new Set();
  
  // Listen for crawl completion messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📬 Popup received message:', message);
    
    if (message.type === 'PDF_SCAN_COMPLETE') {
      // Create unique key for this crawl
      const crawlKey = `${message.courseId}_${message.pdfCount}`;
      
      // Check if we've already processed this crawl
      if (processedCrawls.has(crawlKey)) {
        console.log('⏭️ Duplicate PDF_SCAN_COMPLETE ignored for:', crawlKey);
        sendResponse({ received: true, duplicate: true });
        return true;
      }
      
      // Mark as processed
      processedCrawls.add(crawlKey);
      
      console.log('🎉 PDF_SCAN_COMPLETE received! PDFs found:', message.pdfCount);
      console.log('🚀 Calling saveFoundPDFsToFirestore()...');
      
      // PDFs are now stored in chrome.storage, safe to save to Firestore
      saveFoundPDFsToFirestore().then(() => {
        console.log('✅ saveFoundPDFsToFirestore() completed successfully');
      }).catch(err => {
        console.error('❌ Error in saveFoundPDFsToFirestore:', err);
      });
      
      sendResponse({ received: true });
    }
    
    return true; // Keep listener active for async response
  });
  
  // Initialize Firebase Auth first
  initializeAuth();
  
  // Initialize DOM elements
  detectBtn = document.getElementById('detectCanvas');
  scanBtn = document.getElementById('scanPDFs');
  status = document.getElementById('status');
  result = document.getElementById('result');
  courseInfo = document.getElementById('course-info');
  courseDetails = document.getElementById('course-details');
  chatSection = document.getElementById('chat-section');
  chatMessages = document.getElementById('chat-messages');
  chatInput = document.getElementById('chat-input');
  sendChatBtn = document.getElementById('send-chat');
  
  // Add expand window button handler
  const expandWindowBtn = document.getElementById('expand-window-btn');
  if (expandWindowBtn) {
    expandWindowBtn.addEventListener('click', () => {
      // Open popup.html in a new tab
      chrome.tabs.create({
        url: chrome.runtime.getURL('popup.html')
      });
    });
  }
  
  console.log('DOM elements found:', {
    detectBtn: !!detectBtn,
    scanBtn: !!scanBtn,
    status: !!status,
    result: !!result,
    courseInfo: !!courseInfo,
    courseDetails: !!courseDetails,
    chatSection: !!chatSection,
    chatMessages: !!chatMessages,
    chatInput: !!chatInput,
    sendChatBtn: !!sendChatBtn,
    expandWindowBtn: !!expandWindowBtn
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
  
  // Detect if we're in tab mode or popup mode
  const isTabMode = await detectViewMode();
  console.log('View mode:', isTabMode ? 'TAB' : 'POPUP');
  
  if (isTabMode) {
    // In tab mode, show course selector instead of auto-detection
    console.log('Tab mode detected - showing course selector');
    
    if (currentUser) {
      await showCourseSelector();
    } else {
      // Show course selector anyway, it will show a message to sign in
      const courseSelector = document.getElementById('course-selector');
      const canvasDetection = document.getElementById('canvas-detection');
      if (courseSelector && canvasDetection) {
        canvasDetection.classList.add('hidden');
        courseSelector.classList.remove('hidden');
      }
    }
  } else {
    // In popup mode, do auto-detection
    console.log('Popup mode detected - calling checkCurrentPage...');
    await checkCurrentPage();
    console.log('checkCurrentPage completed');
  }
});

function resetScanButton() {
  if (scanBtn) {
    scanBtn.classList.remove('loading');
    scanBtn.textContent = '🚀 Scan Course & Build Knowledge Base';
    scanBtn.disabled = false;
  }
}

async function saveFoundPDFsToFirestore() {
  console.log('📥 saveFoundPDFsToFirestore() called');
  
  // Prevent multiple simultaneous saves
  if (saveFoundPDFsToFirestore.isSaving) {
    console.log('⚠️ Save already in progress, skipping...');
    return;
  }
  saveFoundPDFsToFirestore.isSaving = true;
  
  try {
    console.log('🔍 Checking user sign-in status...');
    console.log('Current user:', currentUser);
    console.log('Database:', db ? 'initialized' : 'NOT initialized');
    
    // Check if user is signed in
    if (!currentUser || !db) {
      console.log('❌ User not signed in or DB not initialized');
      status.textContent = '❌ Please sign in to Chrome to save PDFs';
      result.textContent = 'You need to be signed into Chrome browser to save PDFs to your knowledge base.';
      resetScanButton();
      return;
    }
    
    // Check if File Search Manager is initialized
    if (!fileSearchManager) {
      console.warn('⚠️ File Search Manager not initialized');
      status.textContent = '⚠️ File Search not available';
      result.textContent = 'File Search service is not available. Please check your internet connection.';
      resetScanButton();
      return;
    }
    
    console.log('✅ User authenticated, fetching PDFs from storage...');
    console.log('Looking for key:', `pdfs_${currentCourseData.courseId}`);
    
    // Get all PDFs found during crawling
    const storedData = await chrome.storage.local.get([`pdfs_${currentCourseData.courseId}`]);
    console.log('📦 Storage data retrieved:', storedData);
    
    const pdfs = storedData[`pdfs_${currentCourseData.courseId}`]?.pdfs || [];
    console.log(`📄 Found ${pdfs.length} PDFs in storage`);
    
    if (pdfs.length === 0) {
      console.log('⚠️ No PDFs found in storage');
      status.textContent = '❌ No PDFs found during crawl';
      result.textContent = 'The crawler completed but found no PDFs. This could mean:\n• Course has no PDF files\n• PDFs are in restricted areas\n• Course uses external links';
      resetScanButton();
      return;
    }
    
    console.log(`💾 Preparing to save ${pdfs.length} PDFs to Firestore and File Search...`);
    status.textContent = `💾 Saving ${pdfs.length} discovered PDFs to your knowledge base...`;
    result.textContent = `Crawler found PDFs:\n${pdfs.map(pdf => `• ${pdf.title} (${pdf.type})`).join('\n')}`;
    
    // Step 1: Get or create File Search store for this course
    const courseStoreName = `course_${currentCourseData.courseId}`;
    let fileSearchStore;
    
    // Step 1: Get or create shared File Search store for this course
    status.textContent = '🗄️ Setting up File Search store for course...';
    console.log('🗄️ Getting or creating shared File Search store...');
    
    // NEW: Use createCourseStore which handles shared store logic
    const storeResult = await fileSearchManager.createCourseStore(
      currentCourseData.courseId,
      `${currentCourseData.courseName} (${currentCourseData.courseId})`
    );
    
    fileSearchStore = { name: storeResult.name };
    
    if (storeResult.alreadyExists) {
      console.log('📦 Using existing shared store (created by another user or previous scan)');
    } else {
      console.log('✅ New shared store created for course');
    }
    
    // Step 2: Save course information to Firestore with File Search store name (SHARED)
    console.log('💾 Saving shared course and creating enrollment...');
    
    const courseResult = await saveCourse(db, currentUser.id, {
      courseId: currentCourseData.courseId,
      courseName: currentCourseData.courseName,
      courseCode: currentCourseData.courseCode || '',
      canvasUrl: currentCourseData.url,
      pdfCount: pdfs.length,
      fileSearchStoreName: fileSearchStore.name
    });
    
    if (!courseResult.success) {
      throw new Error(`Failed to save course: ${courseResult.error}`);
    }
    
    console.log(`✅ ${courseResult.isNewCourse ? 'New shared course created' : 'Existing course updated'}`);
    
    // Step 2.5: Create user enrollment (PRIVATE)
    const enrollmentResult = await enrollUserInCourse(db, currentUser.id, {
      courseId: currentCourseData.courseId,
      courseName: currentCourseData.courseName
    });
    
    if (!enrollmentResult.success) {
      throw new Error(`Failed to create enrollment: ${enrollmentResult.error}`);
    }
    
    console.log(`✅ ${enrollmentResult.isNewEnrollment ? 'User enrolled in course' : 'Enrollment updated'}`);
    
    // Step 3: Save all PDF metadata to Firestore
    const saveResults = await saveDocuments(db, currentCourseData.courseId, pdfs);
    const savedCount = saveResults.filter(r => r.success).length;
    const failedCount = saveResults.filter(r => !r.success).length;
    
    console.log(`✅ Saved ${savedCount}/${pdfs.length} PDF metadata to Firestore`);
    
    // Step 4: Upload PDFs to File Search store
    status.textContent = `📤 Uploading ${pdfs.length} PDFs to File Search...`;
    result.textContent = `Uploading to permanent cloud storage:\n${pdfs.map(pdf => `• ${pdf.title}`).join('\n')}`;
    
    let uploadedCount = 0;
    let uploadFailedCount = 0;
    
    for (let i = 0; i < pdfs.length; i++) {
      const pdf = pdfs[i];
      const docId = btoa(pdf.url).replace(/[/+=]/g, '_');
      
      try {
        status.textContent = `📤 Uploading ${i + 1}/${pdfs.length}: ${pdf.title}...`;
        
        // Download PDF from Canvas via background script (avoids CORS)
        console.log(`📥 Requesting PDF blob from background: ${pdf.url}`);
        const blobResponse = await chrome.runtime.sendMessage({
          action: 'FETCH_PDF_BLOB',
          url: pdf.url
        });
        
        if (!blobResponse.success) {
          throw new Error(`Failed to download PDF: ${blobResponse.error}`);
        }
        
        // Convert base64 back to blob
        const pdfBlob = base64ToBlob(blobResponse.base64Data, blobResponse.mimeType);
        console.log(`✅ Received PDF blob: ${pdfBlob.size} bytes`);
        
        // Upload to File Search store with metadata
        const uploadResult = await fileSearchManager.uploadToStore(
          fileSearchStore.name,
          pdfBlob,
          pdf.title,
          {
            courseId: currentCourseData.courseId,
            courseName: currentCourseData.courseName,
            source: pdf.type,
            originalUrl: pdf.url
          }
        );
        
        // Save File Search document reference to Firestore
        await saveDocumentFileSearch(db, currentCourseData.courseId, docId, uploadResult.name);
        
        uploadedCount++;
        console.log(`✅ [${uploadedCount}/${pdfs.length}] Uploaded: ${pdf.title}`);
      } catch (uploadError) {
        uploadFailedCount++;
        console.error(`❌ Failed to upload ${pdf.title}:`, uploadError);
        await updateDocumentStatus(db, currentCourseData.courseId, docId, 'failed');
      }
    }
    
    // Final status
    if (uploadedCount > 0) {
      status.textContent = `✅ Course setup complete: ${uploadedCount} PDFs uploaded to File Search`;
      result.textContent = `📚 Successfully uploaded to permanent storage:\n${uploadedCount} PDFs ready for AI chat\n\n${uploadFailedCount > 0 ? `⚠️ ${uploadFailedCount} uploads failed\n\n` : ''}💬 Chat interface now available below!`;
      
      // Show chat interface
      await showChatInterface();
    } else {
      status.textContent = `❌ Upload failed for all PDFs`;
      result.textContent = `Failed to upload PDFs. Please check:\n• Your Gemini API key is valid\n• PDFs are accessible\n• You have internet connection`;
    }
    
    // Refresh user stats display
    await displayUserStats(currentUser.id);
    
  } catch (err) {
    status.textContent = '❌ Error saving PDFs to knowledge base';
    result.textContent = `Save error: ${err.message}`;
    console.error(err);
  } finally {
    saveFoundPDFsToFirestore.isSaving = false;
    resetScanButton();
  }
}

// ==================== Chrome Identity Authentication ====================

async function getUserProfile() {
  return new Promise((resolve, reject) => {
    chrome.identity.getProfileUserInfo((userInfo) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(userInfo);
      }
    });
  });
}

async function checkUserSignedIn() {
  try {
    const userInfo = await getUserProfile();
    console.log('Chrome profile info:', userInfo);
    
    if (userInfo && userInfo.email) {
      // User is signed into Chrome
      currentUser = {
        email: userInfo.email,
        id: userInfo.id,
        displayName: userInfo.email.split('@')[0], // Use email prefix as name
        photoURL: null // Chrome identity doesn't provide photo URL
      };
      
      updateUIForUser(currentUser);
      
      // Save/update user in Firestore using helper function
      const result = await saveUser(db, userInfo.id, currentUser);
      if (result.success) {
        console.log('User data saved to Firestore via helper');
      } else {
        console.error('Error saving user to Firestore:', result.error);
      }
      
      // Set userId in File Search Manager for user isolation
      if (fileSearchManager) {
        fileSearchManager.setUserId(userInfo.id);
        console.log('✅ File Search Manager userId set:', userInfo.id);
      }
    } else {
      // User not signed into Chrome or email not available
      console.warn('No email found in Chrome profile. User might need to grant permission.');
      updateUIForUser(null);
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    updateUIForUser(null);
  }
}

async function updateUIForUser(user) {
  if (user) {
    // User is signed in to Chrome
    currentUser = user;
    loggedInDiv.classList.remove('hidden');
    loggedOutDiv.classList.add('hidden');
    
    // Update header user info
    const headerUserInfo = document.getElementById('header-user-info');
    const headerUserPhoto = document.getElementById('header-user-photo');
    const headerUserName = document.getElementById('header-user-name');
    
    if (headerUserInfo && headerUserPhoto && headerUserName) {
      headerUserInfo.classList.remove('hidden');
      headerUserPhoto.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random`;
      headerUserName.textContent = user.displayName || 'User';
    }
    
    console.log('UI updated for signed-in user:', user.email);
    
    // Load and display user stats
    await displayUserStats(user.id);
  } else {
    // User is not signed in to Chrome
    currentUser = null;
    loggedInDiv.classList.add('hidden');
    loggedOutDiv.classList.remove('hidden');
    
    // Hide header user info
    const headerUserInfo = document.getElementById('header-user-info');
    if (headerUserInfo) {
      headerUserInfo.classList.add('hidden');
    }
    
    console.log('UI updated for signed-out state');
  }
}

async function displayUserStats(userId) {
  const statsText = document.getElementById('stats-text');
  if (!statsText || !db) return;
  
  try {
    statsText.textContent = '📊 Loading stats...';
    
    const stats = await getUserStats(db, userId);
    
    if (stats.success) {
      const { totalCourses, totalPDFs, totalSizeMB } = stats.data;
      statsText.textContent = `📊 ${totalCourses} courses • ${totalPDFs} PDFs saved • ${totalSizeMB} MB`;
    } else {
      statsText.textContent = '📊 No data yet - scan a course to get started!';
    }
  } catch (error) {
    console.error('Error loading user stats:', error);
    statsText.textContent = '📊 Stats unavailable';
  }
}

function initializeAuth() {
  // Get auth UI elements
  loginBtn = document.getElementById('login-btn');
  loggedInDiv = document.getElementById('logged-in');
  loggedOutDiv = document.getElementById('logged-out');
  
  // Update login button text
  loginBtn.textContent = 'Sign in to Chrome';
  loginBtn.addEventListener('click', () => {
    alert('Please sign in to Chrome by clicking your profile icon in the top-right corner of Chrome, then reload this extension.');
  });
  
  // Check if user is signed into Chrome
  checkUserSignedIn();
}

// ==================== CHAT FUNCTIONALITY ====================

async function handleChatSend() {
  const message = chatInput.value.trim();
  if (!message) return;
  
  // Check prerequisites
  if (!currentUser || !db) {
    addChatMessage('system', '❌ Please sign in to use chat');
    return;
  }
  
  if (!fileSearchManager) {
    addChatMessage('system', '❌ File Search service not available');
    return;
  }
  
  if (!currentCourseData) {
    addChatMessage('system', '❌ Please navigate to a Canvas course first');
    return;
  }
  
  // Get course and check if File Search store exists
  const courseResult = await getCourse(db, currentCourseData.courseId);
  if (!courseResult.success || !courseResult.data.fileSearchStoreName) {
    addChatMessage('system', '❌ Please scan the course first to build the knowledge base');
    return;
  }
  
  const fileSearchStoreName = courseResult.data.fileSearchStoreName;
  
  // Add user message to chat
  addChatMessage('user', message);
  chatInput.value = '';
  chatInput.disabled = true;
  sendChatBtn.disabled = true;
  
  // Add loading message
  const loadingId = addChatMessage('system', '🤔 Thinking...');
  
  try {
    // Send message to File Search (Cloud Functions)
    const response = await fileSearchManager.queryWithFileSearch(
      message,
      fileSearchStoreName,
      'gemini-2.5-flash'
    );
    
    // Remove loading message
    removeChatMessage(loadingId);
    
    // Add AI response
    addChatMessage('assistant', response.answer);
    
    // Update conversation history for context
    conversationHistory.push(
      { role: 'user', text: message },
      { role: 'model', text: response.answer }
    );
    
    // Limit history to last 10 exchanges
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
    
  } catch (error) {
    removeChatMessage(loadingId);
    addChatMessage('system', `❌ Error: ${error.message}`);
    console.error('Chat error:', error);
  } finally {
    chatInput.disabled = false;
    sendChatBtn.disabled = false;
    chatInput.focus();
  }
}

function addChatMessage(role, text) {
  const messageId = `msg-${Date.now()}-${Math.random()}`;
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  messageDiv.id = messageId;
  
  const icon = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : 'ℹ️';
  
  // Escape HTML and preserve line breaks
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  messageDiv.innerHTML = `<span class="message-icon">${icon}</span><p>${escapedText}</p>`;
  
  chatMessages.appendChild(messageDiv);
  
  // Smooth scroll to bottom
  setTimeout(() => {
    chatMessages.scrollTo({
      top: chatMessages.scrollHeight,
      behavior: 'smooth'
    });
  }, 100);
  
  return messageId;
}

function removeChatMessage(messageId) {
  const messageEl = document.getElementById(messageId);
  if (messageEl) {
    messageEl.remove();
  }
}

async function showChatInterface() {
  if (!currentCourseData) return;
  
  // Check if course has uploaded documents
  const courseResult = await getCourse(db, currentCourseData.courseId);
  if (courseResult.success && courseResult.data.fileSearchStoreName) {
    // Check if course has documents (simpler and more reliable than querying individual docs)
    const pdfCount = courseResult.data.pdfCount || 0;
    if (pdfCount > 0) {
      chatSection.classList.remove('hidden');
      conversationHistory = []; // Reset conversation
      console.log(`✅ Chat interface shown - ${pdfCount} documents in store`);
    } else {
      console.log('⚠️ Store exists but no documents yet');
    }
  }
}