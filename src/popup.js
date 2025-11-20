// popup.js - Canvas RAG Assistant popup functionality

// Firestore helpers will be accessed via window.firestoreHelpers after scripts load
// We'll destructure them after Firebase initializes

// Get Firebase db reference
let db;

// Helper functions (will be assigned after firestore-helpers.js loads)
let saveUser, getUser, saveCourse, getCourse, getUserCourses, updateCoursePdfCount;
let saveDocument, saveDocuments, getCourseDocuments, updateDocumentStatus;
let getUserStats, getCourseStats, waitForFirebase, isFirebaseReady;

// Global variables for DOM elements (will be initialized after DOM loads)
let detectBtn, scanBtn, status, result, courseInfo, courseDetails;
let loginBtn, logoutBtn, loggedInDiv, loggedOutDiv, userPhoto, userName, userEmail;
let currentUser = null;

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
    isFirebaseReady
  } = window.firestoreHelpers);
  
  console.log('Firebase initialized and helpers loaded');
  
  // Listen for crawl completion messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📬 Popup received message:', message);
    
    if (message.type === 'PDF_SCAN_COMPLETE') {
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
    
    console.log(`💾 Preparing to save ${pdfs.length} PDFs to Firestore...`);
    status.textContent = `💾 Saving ${pdfs.length} discovered PDFs to your knowledge base...`;
    result.textContent = `Crawler found PDFs:\n${pdfs.map(pdf => `• ${pdf.title} (${pdf.type})`).join('\n')}`;
    
    // Save course information to Firestore
    console.log('💾 Saving course and PDFs to Firestore...');
    
    const courseResult = await saveCourse(db, currentUser.id, {
      courseId: currentCourseData.courseId,
      courseName: currentCourseData.courseName,
      courseCode: currentCourseData.courseCode || '',
      canvasUrl: currentCourseData.url,
      pdfCount: pdfs.length
    });
    
    if (courseResult.success) {
      console.log('✅ Course saved to Firestore');
      
      // Save all PDF metadata to Firestore (user's dedicated knowledge base)
      const saveResults = await saveDocuments(db, currentCourseData.courseId, pdfs);
      const savedCount = saveResults.filter(r => r.success).length;
      const failedCount = saveResults.filter(r => !r.success).length;
      
      console.log(`✅ Saved ${savedCount}/${pdfs.length} PDF metadata to Firestore`);
      
      status.textContent = `✅ Course scan complete: ${savedCount} PDFs saved to your knowledge base`;
      result.textContent = `📚 Successfully saved to your knowledge base:\n${pdfs.map(pdf => `• ${pdf.title}`).join('\n')}`;
      
      if (failedCount > 0) {
        const failedPdfs = saveResults
          .filter(r => !r.success)
          .map(r => `• ${r.fileName}: ${r.error}`)
          .join('\n');
        result.textContent += `\n\n⚠️ Failed to save:\n${failedPdfs}`;
      }
      
      result.textContent += `\n\n💡 Next: These PDFs will be uploaded to Gemini for AI-powered chat (coming soon!)`;
      
      // Refresh user stats display
      await displayUserStats(currentUser.id);
    } else {
      throw new Error(`Failed to save course: ${courseResult.error}`);
    }
    
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
    
    userPhoto.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random`;
    userName.textContent = user.displayName || 'User';
    userEmail.textContent = user.email;
    
    console.log('UI updated for signed-in user:', user.email);
    
    // Load and display user stats
    await displayUserStats(user.id);
  } else {
    // User is not signed in to Chrome
    currentUser = null;
    loggedInDiv.classList.add('hidden');
    loggedOutDiv.classList.remove('hidden');
    
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
  logoutBtn = document.getElementById('logout-btn');
  loggedInDiv = document.getElementById('logged-in');
  loggedOutDiv = document.getElementById('logged-out');
  userPhoto = document.getElementById('user-photo');
  userName = document.getElementById('user-name');
  userEmail = document.getElementById('user-email');
  
  // Update login button text
  loginBtn.textContent = 'Sign in to Chrome';
  loginBtn.addEventListener('click', () => {
    alert('Please sign in to Chrome by clicking your profile icon in the top-right corner of Chrome, then reload this extension.');
  });
  
  logoutBtn.addEventListener('click', () => {
    alert('Please sign out of Chrome by clicking your profile icon in the top-right corner of Chrome.');
  });
  
  // Check if user is signed into Chrome
  checkUserSignedIn();
}

