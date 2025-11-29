// popup-logic.js - Business logic wrapper for React UI
import './firebase-config';
import './firestore-helpers';
import './gemini-file-search-cloud';

export class PopupLogic {
  constructor() {
    this.db = null;
    this.currentUser = null;
    this.currentCourseData = null;
    this.fileSearchManager = null;
    this.uiCallbacks = {};
    this.conversationHistory = [];
    this.currentSessionId = null; // Track current chat session
    this.streamingMessageTimer = null; // Timer for streaming animation
    this.isStreaming = false; // Flag to prevent interruptions
    
    // Firestore helper functions
    this.firestoreHelpers = null;
  }

  setUICallbacks(callbacks) {
    this.uiCallbacks = callbacks;
  }

  async initialize() {
    console.log('Initializing PopupLogic...');
    
    // Wait for Firebase
    await this.waitForFirebase();
    
    this.db = window.firebaseDb;
    this.firestoreHelpers = window.firestoreHelpers;
    
    // Initialize File Search Manager
    try {
      this.fileSearchManager = new window.GeminiFileSearchCloudClient(window.firebaseApp, null);
      console.log('✅ File Search Manager initialized');
    } catch (error) {
      console.error('❌ Error initializing File Search Manager:', error);
    }
    
    // Check user authentication
    await this.checkUserSignedIn();
    
    // Detect Canvas course
    await this.detectCanvas();
    
    // Check for pending scan results
    await this.checkPendingScanResults();
    
    // Listen for messages from background script
    this.setupMessageListener();
  }

  async waitForFirebase() {
    const startTime = Date.now();
    while (!window.firebaseDb || !window.firestoreHelpers) {
      if (Date.now() - startTime > 5000) {
        throw new Error('Firebase initialization timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async checkUserSignedIn() {
    try {
      const userInfo = await this.getUserProfile();
      console.log('Chrome profile info:', userInfo);
      
      if (userInfo && userInfo.email) {
        this.currentUser = {
          email: userInfo.email,
          id: userInfo.id,
          displayName: userInfo.email.split('@')[0],
          photoURL: null
        };
        
        this.updateUIForUser(this.currentUser);
        
        // Save user to Firestore
        const result = await this.firestoreHelpers.saveUser(this.db, userInfo.id, this.currentUser);
        if (result.success) {
          console.log('User data saved to Firestore');
        }
        
        // Set userId in File Search Manager
        if (this.fileSearchManager) {
          this.fileSearchManager.setUserId(userInfo.id);
        }
      } else {
        this.updateUIForUser(null);
      }
    } catch (error) {
      console.error('Error getting user profile:', error);
      this.updateUIForUser(null);
    }
  }

  async getUserProfile() {
    return new Promise((resolve) => {
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
        resolve(userInfo);
      });
    });
  }

  async updateUIForUser(user) {
    if (user) {
      this.currentUser = user;
      this.uiCallbacks.setUser?.(user);
      this.uiCallbacks.setIsLoggedIn?.(true);
      
      // Load stats
      await this.displayUserStats(user.id);
    } else {
      this.currentUser = null;
      this.uiCallbacks.setUser?.(null);
      this.uiCallbacks.setIsLoggedIn?.(false);
    }
  }

  async displayUserStats(userId) {
    try {
      const statsResult = await this.firestoreHelpers.getUserStats(this.db, userId);
      
      if (statsResult && statsResult.success && statsResult.data) {
        const stats = statsResult.data;
        const statsText = `📚 ${stats.totalCourses || 0} courses • 📄 ${stats.totalPDFs || 0} documents`;
        this.uiCallbacks.setUserStats?.(statsText);
        console.log('✅ Stats displayed:', statsText);
      } else {
        this.uiCallbacks.setUserStats?.('📊 No stats available yet');
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
      this.uiCallbacks.setUserStats?.('📊 Stats unavailable');
    }
  }

  async detectCanvas() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        this.uiCallbacks.setStatus?.('❌ Cannot detect active tab');
        return;
      }
      
      // Check if we're on an extension page (opened in a tab)
      const isExtensionPage = tab.url.startsWith('chrome-extension://');
      
      if (isExtensionPage) {
        // Show course selector instead
        this.uiCallbacks.setStatus?.('Select a course from your enrolled courses');
        await this.showCourseSelector();
        return;
      }
      
      const isCanvas = /canvas\.|instructure\.com/.test(tab.url);
      
      if (!isCanvas) {
        this.uiCallbacks.setStatus?.('❌ Not on a Canvas page');
        this.uiCallbacks.setShowCourseInfo?.(false);
        return;
      }
      
      const courseIdMatch = tab.url.match(/\/courses\/(\d+)/);
      
      if (!courseIdMatch) {
        this.uiCallbacks.setStatus?.('❌ No course detected on this Canvas page');
        this.uiCallbacks.setShowCourseInfo?.(false);
        return;
      }
      
      const courseId = courseIdMatch[1];
      const courseName = tab.title.split(':')[0]?.trim() || `Course ${courseId}`;
      
      this.currentCourseData = {
        id: courseId,
        name: courseName,
        url: tab.url
      };
      
      this.uiCallbacks.setStatus?.(`✅ Detected: ${courseName}`);
      
      // Check if course has documents and enrollment status
      let docCount = 0;
      let courseExists = false;
      let isEnrolled = false;
      
      if (this.currentUser) {
        try {
          // Check if course exists in database
          const courseResult = await this.firestoreHelpers.getCourse(this.db, courseId);
          courseExists = courseResult.success && courseResult.data;
          
          // Check if user is enrolled
          const enrollmentResult = await this.firestoreHelpers.isUserEnrolled(this.db, this.currentUser.id, courseId);
          isEnrolled = enrollmentResult.success && enrollmentResult.isEnrolled;
          
          // Get document count
          const docsResult = await this.firestoreHelpers.getCourseDocuments(this.db, courseId);
          docCount = docsResult.success ? docsResult.data.length : 0;
        } catch (error) {
          console.error('Error checking course status:', error);
        }
      }
      
      // Update enrollment status
      this.uiCallbacks.setEnrollmentStatus?.({
        courseExists,
        isEnrolled,
        checking: false
      });
      
      // Get course details
      const courseHtml = `
        <div class="text-sm space-y-2">
          <p><strong class="font-semibold">${courseName}</strong> | ID: ${courseId}</p>
          ${docCount > 0 ? `<p class="text-slate-900">${docCount} PDFs scanned</p>` : ''}
        </div>
      `;
      
      this.uiCallbacks.setCourseDetails?.(courseHtml);
      this.uiCallbacks.setShowCourseInfo?.(true);
      this.uiCallbacks.setCurrentCourseDocCount?.(docCount);
      
      // Only load chat session if user is enrolled
      if (isEnrolled) {
        await this.loadOrCreateChatSession();
      }
      
    } catch (error) {
      console.error('Error detecting Canvas:', error);
      this.uiCallbacks.setStatus?.('❌ Error detecting course');
    }
  }

  async showCourseSelector() {
    try {
      if (!this.currentUser) {
        this.uiCallbacks.setShowCourseSelector?.(false);
        return;
      }

      // Get user's courses
      const coursesResult = await this.firestoreHelpers.getUserCourses(this.db, this.currentUser.id);
      
      if (coursesResult.success && coursesResult.data.length > 0) {
        // Get actual document count for each course (only successfully uploaded)
        const coursesWithCounts = await Promise.all(
          coursesResult.data.map(async (course) => {
            const docsResult = await this.firestoreHelpers.getCourseDocuments(this.db, course.id, true);
            const actualCount = docsResult.success ? docsResult.data.length : 0;
            
            return {
              ...course,
              name: course.courseName || `Course ${course.id}`,
              actualPdfCount: actualCount
            };
          })
        );
        
        this.uiCallbacks.setShowCourseSelector?.(true);
        this.uiCallbacks.setCourseList?.(coursesWithCounts);
      } else {
        this.uiCallbacks.setShowCourseSelector?.(false);
        this.uiCallbacks.setStatus?.('No courses found. Visit a Canvas course page to get started.');
      }
    } catch (error) {
      console.error('Error loading courses:', error);
    }
  }

  async loadAllCourses() {
    try {
      const { collection, getDocs } = window.firebaseModules;
      
      // Get all courses from the shared courses collection
      const coursesRef = collection(this.db, 'courses');
      const coursesSnap = await getDocs(coursesRef);
      
      const allCourses = await Promise.all(
        coursesSnap.docs.map(async (courseDoc) => {
          const courseData = courseDoc.data();
          const courseId = courseDoc.id;
          
          // Get document count for this course
          const docsResult = await this.firestoreHelpers.getCourseDocuments(this.db, courseId);
          const documentCount = docsResult.success ? docsResult.data.length : 0;
          
          return {
            id: courseId,
            name: courseData.courseName || `Course ${courseId}`,
            canvasInstance: courseData.canvasInstance,
            totalEnrollments: courseData.totalEnrollments,
            lastScannedAt: courseData.lastScannedAt,
            documentCount
          };
        })
      );
      
      // Sort by document count (descending)
      allCourses.sort((a, b) => b.documentCount - a.documentCount);
      
      console.log(`✅ Loaded ${allCourses.length} total courses from database`);
      return allCourses;
    } catch (error) {
      console.error('Error loading all courses:', error);
      return [];
    }
  }

  async selectCourse(course) {
    // Use full course name from courseName field
    const displayName = course.courseName || course.name || `Course ${course.id}`;
    
    this.currentCourseData = {
      id: course.id,
      name: displayName,
      url: course.url || `Course ${course.id}`
    };
    
    this.uiCallbacks.setStatus?.(`✅ Selected: ${displayName}`);
    
    const docCount = course.actualPdfCount || 0;
    
    const courseHtml = `
      <div class="text-sm space-y-2">
        <p><strong class="font-semibold">${displayName}</strong> | ID: ${course.id}</p>
        ${docCount > 0 ? `<p class="text-slate-900">${docCount} PDFs scanned</p>` : ''}
      </div>
    `;
    
    this.uiCallbacks.setCourseDetails?.(courseHtml);
    this.uiCallbacks.setShowCourseInfo?.(true);
    this.uiCallbacks.setShowCourseSelector?.(false);
    this.uiCallbacks.setCurrentCourseDocCount?.(docCount);
    
    // Set enrollment status - user is enrolled if they're in the course list
    this.uiCallbacks.setEnrollmentStatus?.({
      courseExists: true,
      isEnrolled: true,
      checking: false
    });
    
    // Load or create chat session for this enrolled course
    await this.loadOrCreateChatSession();
  }

  async enrollInCurrentCourse() {
    if (!this.currentUser) {
      console.error('No user signed in');
      alert('Please sign in to enroll in courses.');
      return;
    }

    if (!this.currentCourseData) {
      console.error('No course data available');
      return;
    }

    try {
      console.log('📝 Enrolling user in course:', this.currentCourseData.id);
      
      const enrollmentResult = await this.firestoreHelpers.enrollUserInCourse(
        this.db,
        this.currentUser.id,
        {
          courseId: this.currentCourseData.id,
          courseName: this.currentCourseData.name
        }
      );

      if (enrollmentResult.success) {
        console.log('✅ User enrolled successfully');
        
        // Update enrollment status
        this.uiCallbacks.setEnrollmentStatus?.({
          courseExists: true,
          isEnrolled: true,
          checking: false
        });
        
        // Refresh course list
        await this.loadAllCourses();
        
        // Now that user is enrolled, create/load chat session
        await this.loadOrCreateChatSession();
        
        // Show success message
        this.uiCallbacks.setStatus?.(`✅ Enrolled in ${this.currentCourseData.name}`);
      } else {
        console.error('Failed to enroll:', enrollmentResult.error);
        alert('Failed to enroll in course. Please try again.');
      }
    } catch (error) {
      console.error('Error enrolling in course:', error);
      alert('An error occurred while enrolling in the course.');
    }
  }

  async removeEnrollment(courseId) {
    if (!this.currentUser) {
      console.error('No user signed in');
      return;
    }

    try {
      const result = await this.firestoreHelpers.removeUserEnrollment(
        this.db,
        this.currentUser.id,
        courseId
      );

      if (result.success) {
        console.log(`✅ Removed enrollment for course ${courseId}`);
        
        // Refresh the course list
        await this.loadAllCourses();
        
        // If we were viewing this course, update enrollment status and clear chat
        if (this.currentCourseData && this.currentCourseData.id === courseId) {
          // Update enrollment status to reflect un-enrollment
          this.uiCallbacks.setEnrollmentStatus?.({
            courseExists: true,
            isEnrolled: false,
            checking: false
          });
          
          this.currentSessionId = null;
          this.conversationHistory = [];
          this.uiCallbacks.setChatMessages?.([]);
          this.uiCallbacks.setCurrentCourseDocCount?.(0);
          
          // Don't clear currentCourseData so the course info stays visible
          // This allows the user to re-enroll if desired
        }
      } else {
        console.error('Failed to remove enrollment:', result.error);
        alert('Failed to remove enrollment. Please try again.');
      }
    } catch (error) {
      console.error('Error removing enrollment:', error);
      alert('An error occurred while removing enrollment.');
    }
  }

  backToCourseSelector() {
    // Clear current course and show course selector
    this.currentCourseData = null;
    this.currentSessionId = null;
    this.conversationHistory = [];
    this.uiCallbacks.setShowCourseInfo?.(false);
    this.uiCallbacks.setShowCourseSelector?.(true);
    this.uiCallbacks.setChatMessages?.([]);
    this.uiCallbacks.setStatus?.('Select a course from your enrolled courses');
    console.log('✅ Navigated back to course selector');
  }

  async checkPendingScanResults() {
    if (!this.currentCourseData) return;
    
    try {
      const scanStatusKey = `scan_status_${this.currentCourseData.id}`;
      const result = await chrome.storage.local.get(scanStatusKey);
      const scanStatus = result[scanStatusKey];
      
      if (!scanStatus) return;
      
      const ageMinutes = (Date.now() - scanStatus.timestamp) / 1000 / 60;
      
      if (scanStatus.status === 'scanning') {
        // If scan status is older than 5 minutes, consider it stale/failed
        if (ageMinutes > 5) {
          console.log('🧹 Clearing stale scan status (age: ' + Math.round(ageMinutes) + ' min)');
          chrome.storage.local.remove(scanStatusKey);
          return;
        }
        
        // Scan is in progress - restore the scanning UI state
        console.log('⏳ Active scan detected (age: ' + Math.round(ageMinutes) + ' min)');
        console.log('   Restoring scanning UI state...');
        
        // Restore scanning UI state
        this.uiCallbacks.setIsScanning?.(true);
        
        // Calculate elapsed time and restore progress indicators
        const elapsedMs = Date.now() - scanStatus.timestamp;
        const estimatedTotal = 120000; // 2 minutes estimated
        const progress = Math.min((elapsedMs / estimatedTotal) * 100, 95); // Cap at 95% until complete
        const timeLeft = Math.max(0, Math.ceil((estimatedTotal - elapsedMs) / 1000));
        
        this.uiCallbacks.setScanStartTime?.(scanStatus.timestamp);
        this.uiCallbacks.setScanProgress?.(progress);
        this.uiCallbacks.setScanTimeLeft?.(timeLeft);
        
        this.uiCallbacks.setStatus?.(`🔄 Scan in progress... (${Math.round(progress)}%)`);
      } else if (scanStatus.status === 'complete' && ageMinutes < 30) {
        // Scan completed while popup was closed
        console.log('🎉 Found completed scan results:', scanStatus);
        
        // Clear the status
        chrome.storage.local.remove(scanStatusKey);
        
        // Notify user
        const message = `✅ Scan completed! Found ${scanStatus.pdfCount} PDFs while you were away.`;
        this.uiCallbacks.setStatus?.(message);
        
        // Process the results
        await this.saveFoundPDFsToFirestore();
        
        // Refresh course details
        await this.detectCanvas();
      } else {
        // Old or unknown status - clear it
        console.log('🧹 Clearing old/unknown scan status:', scanStatus.status);
        chrome.storage.local.remove(scanStatusKey);
      }
    } catch (error) {
      console.error('Error checking pending scan results:', error);
    }
  }

  async handleScan(isRescan = false) {
    if (!this.currentUser) {
      alert('Please sign in to Chrome first');
      return;
    }
    
    if (!this.currentCourseData) {
      alert('Please navigate to a Canvas course page first');
      return;
    }
    
    // Store re-scan flag for later use
    this._isRescan = isRescan;
    
    // Notify background that scan is starting
    chrome.runtime.sendMessage({
      action: 'SCAN_STARTED',
      courseId: this.currentCourseData.id,
      courseName: this.currentCourseData.name
    }).catch(() => {});
    
    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }
      
      console.log('🚀 Starting smart scan for course:', this.currentCourseData);
      
      // Set scanning state
      this.uiCallbacks.setIsScanning?.(true);
      
      // Set up a safety timeout to reset UI if scan takes too long or gets stuck
      const SCAN_TIMEOUT = 10 * 60 * 1000; // 10 minutes
      this._scanTimeoutId = setTimeout(() => {
        console.warn('⚠️ Scan timeout reached, resetting UI...');
        this.resetScanningState();
        alert('Scan timed out after 10 minutes. Please try again.');
      }, SCAN_TIMEOUT);
      
      // Wait for content script to be ready with retry logic
      // Content scripts defined in manifest inject automatically but may not be ready immediately
      let retries = 5;
      let scriptReady = false;
      
      while (retries > 0 && !scriptReady) {
        try {
          const pingResponse = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
              if (chrome.runtime.lastError) {
                resolve(null);
              } else {
                resolve(response);
              }
            });
          });
          
          if (pingResponse && pingResponse.ready) {
            scriptReady = true;
            console.log('✅ Content script is ready');
            break;
          }
        } catch (e) {
          console.log(`Ping attempt ${6 - retries} failed:`, e);
        }
        
        retries--;
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 300));
        }
      }
      
      if (!scriptReady) {
        throw new Error('Content script is not responding. Please refresh the Canvas page and try again.');
      }
      
      // Now send the scan message
      chrome.tabs.sendMessage(tab.id, {
        action: 'startSmartCrawl',
        courseId: this.currentCourseData.id,
        courseName: this.currentCourseData.name,
        userId: this.currentUser.id
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to content script:', chrome.runtime.lastError);
          alert('Error: Content script not responding. Please refresh the page and try again.');
          this.resetScanningState();
          return;
        }
        
        if (response?.error) {
          console.error('Content script error:', response.error);
          alert('Error: ' + response.error);
          this.resetScanningState();
        } else if (!response?.success && !response?.started) {
          console.error('Unexpected response from content script:', response);
          alert('Error: Scan failed to start properly');
          this.resetScanningState();
        } else {
          console.log('✅ Smart scan started successfully:', response);
        }
      });
      
    } catch (error) {
      console.error('Error starting scan:', error);
      alert('Error starting scan: ' + error.message);
      this.resetScanningState();
    }
  }

  /**
   * Reset the UI scanning state and clear any pending timeouts
   */
  resetScanningState() {
    console.log('🔄 Resetting scanning state...');
    
    // Clear scan timeout if it exists
    if (this._scanTimeoutId) {
      clearTimeout(this._scanTimeoutId);
      this._scanTimeoutId = null;
    }
    
    // Reset UI state
    this.uiCallbacks.setIsScanning?.(false);
    this.uiCallbacks.setScanProgress?.(0);
    this.uiCallbacks.setScanTimeLeft?.(0);
    this.uiCallbacks.setStatus?.('Ready');
    
    // Clear re-scan flag
    this._isRescan = false;
    
    // Clear scan status from storage
    if (this.currentCourseData?.id) {
      chrome.storage.local.remove(`scan_status_${this.currentCourseData.id}`);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      console.log('📬 Popup received message:', message);
      
      if (message.type === 'PDF_SCAN_COMPLETE') {
        console.log('🎉 PDF_SCAN_COMPLETE received! PDFs found:', message.pdfCount);
        console.log('🚀 Calling saveFoundPDFsToFirestore()...');
        
        // Show progress update - 90% means we're preparing uploads
        this.uiCallbacks.setScanProgress?.(90);
        this.uiCallbacks.setStatus?.(`🔍 Preparing to upload ${message.pdfCount} PDFs...`);
        
        // PDFs are now stored in chrome.storage, safe to save to Firestore
        this.saveFoundPDFsToFirestore().then(() => {
          console.log('✅ saveFoundPDFsToFirestore() completed successfully');
          
          // Clear scan timeout since we completed successfully
          if (this._scanTimeoutId) {
            clearTimeout(this._scanTimeoutId);
            this._scanTimeoutId = null;
          }
          
          // Set to 100% and show completion
          this.uiCallbacks.setScanProgress?.(100);
          this.uiCallbacks.setStatus?.('Scan complete!');
          this.uiCallbacks.setScanTimeLeft?.(0);
          
          // Wait a moment to show completion
          setTimeout(() => {
            this.uiCallbacks.setIsScanning?.(false);
            this.uiCallbacks.setScanProgress?.(0);
            this.uiCallbacks.setStatus?.('Ready');
            // Refresh course details to show updated document count
            this.detectCanvas();
          }, 1500);
        }).catch(err => {
          console.error('❌ Error in saveFoundPDFsToFirestore:', err);
          this.resetScanningState();
          this.uiCallbacks.setStatus?.('Error: ' + err.message);
          alert('Error saving PDFs: ' + err.message);
        });
      }
      
      // Handle CRAWL_COMPLETE (the actual message sent by content script)
      if (message.type === 'CRAWL_COMPLETE') {
        console.log('🎉 CRAWL_COMPLETE received!', message);
        
        // Set progress to 100% before stopping
        this.uiCallbacks.setScanProgress?.(100);
        this.uiCallbacks.setScanTimeLeft?.(0);
        this.uiCallbacks.setStatus?.('Finalizing scan...');
        
        const pdfCount = message.pdfCount || message.pdfsFound || 0;
        
        // Clear scan status from storage
        if (message.courseId) {
          chrome.storage.local.remove(`scan_status_${message.courseId}`);
        }
        
        console.log(`✅ Scan complete! Found ${pdfCount} PDFs`);
      }
      
      // Also support SMART_CRAWL_COMPLETE for backward compatibility
      if (message.type === 'SMART_CRAWL_COMPLETE') {
        console.log('🎉 SMART_CRAWL_COMPLETE received!', message);
        
        // Set progress to 100% before stopping
        this.uiCallbacks.setScanProgress?.(100);
        this.uiCallbacks.setScanTimeLeft?.(0);
        this.uiCallbacks.setStatus?.('Finalizing scan...');
        
        const pdfCount = message.pdfCount || message.pdfsFound || 0;
        
        // Clear scan status from storage
        if (message.courseId) {
          chrome.storage.local.remove(`scan_status_${message.courseId}`);
        }
        
        console.log(`✅ Smart scan complete! Found ${pdfCount} PDFs`);
      }
      
      if (message.type === 'SMART_CRAWL_PROGRESS') {
        // Update UI with progress information
        console.log('📊 Smart scan progress:', message);
        if (message.progress !== undefined) {
          this.uiCallbacks.setScanProgress?.(message.progress);
        }
        if (message.status) {
          this.uiCallbacks.setStatus?.(message.status);
        }
      }
      
      if (message.type === 'CRAWL_ERROR') {
        console.error('❌ Crawl error:', message);
        this.resetScanningState();
        alert(`Scan error: ${message.error}\nStep: ${message.step}`);
      }
    });
  }

  async saveFoundPDFsToFirestore() {
    console.log('📥 saveFoundPDFsToFirestore() called');
    
    try {
      console.log('🔍 Checking user sign-in status...');
      console.log('Current user:', this.currentUser);
      console.log('Database:', this.db ? 'initialized' : 'NOT initialized');
      
      // Check if user is signed in
      if (!this.currentUser || !this.db) {
        console.log('❌ User not signed in or DB not initialized');
        this.resetScanningState();
        alert('Please sign in to Chrome to save PDFs');
        return;
      }
      
      // Check if File Search Manager is initialized
      if (!this.fileSearchManager) {
        console.warn('⚠️ File Search Manager not initialized');
        this.resetScanningState();
        alert('File Search service is not available. Please check your internet connection.');
        return;
      }
      
      console.log('✅ User authenticated, fetching PDFs from storage...');
      console.log('Looking for key:', `pdfs_${this.currentCourseData.id}`);
      
      // Get all PDFs found during crawling
      const storedData = await chrome.storage.local.get([`pdfs_${this.currentCourseData.id}`]);
      console.log('📦 Storage data retrieved:', storedData);
      
      const pdfs = storedData[`pdfs_${this.currentCourseData.id}`]?.pdfs || [];
      console.log(`📄 Found ${pdfs.length} PDFs in storage`);
      
      if (pdfs.length === 0) {
        console.log('⚠️ No PDFs found in storage');
        this.resetScanningState();
        alert('No PDFs found during crawl');
        return;
      }
      
      console.log(`💾 Preparing to save ${pdfs.length} PDFs to Firestore and File Search...`);
      
      // Step 1: Get or create File Search store for this course
      console.log('🗄️ Getting or creating shared File Search store...');
      
      const storeResult = await this.fileSearchManager.createCourseStore(
        this.currentCourseData.id,
        this.currentCourseData.name
      );
      
      const fileSearchStore = { name: storeResult.name };
      
      if (storeResult.alreadyExists) {
        console.log('📦 Using existing shared store (created by another user or previous scan)');
      } else {
        console.log('✅ New shared store created for course');
      }
      
      // Step 2: Save course information to Firestore with File Search store name
      console.log('💾 Saving shared course and creating enrollment...');
      
      const courseResult = await this.firestoreHelpers.saveCourse(this.db, this.currentUser.id, {
        courseId: this.currentCourseData.id,
        courseName: this.currentCourseData.name,
        courseCode: this.currentCourseData.courseCode || '',
        canvasUrl: this.currentCourseData.url,
        fileSearchStoreName: fileSearchStore.name
      });
      
      if (!courseResult.success) {
        throw new Error(`Failed to save course: ${courseResult.error}`);
      }
      
      console.log(`✅ ${courseResult.isNewCourse ? 'New shared course created' : 'Existing course updated'}`);
      
      // Step 2.5: Create user enrollment
      const enrollmentResult = await this.firestoreHelpers.enrollUserInCourse(this.db, this.currentUser.id, {
        courseId: this.currentCourseData.id,
        courseName: this.currentCourseData.name
      });
      
      if (!enrollmentResult.success) {
        throw new Error(`Failed to create enrollment: ${enrollmentResult.error}`);
      }
      
      console.log(`✅ ${enrollmentResult.isNewEnrollment ? 'User enrolled in course' : 'Enrollment updated'}`);
      
      // Step 3: Detect new documents and failed uploads if this is a re-scan
      let pdfsToUpload = pdfs;
      
      if (this._isRescan) {
        console.log('🔄 Re-scan detected, checking for new and failed documents...');
        this.uiCallbacks.setStatus?.('🔍 Analyzing documents...');
        
        const existingDocsResult = await this.firestoreHelpers.getCourseDocuments(this.db, this.currentCourseData.id, false);
        
        if (existingDocsResult.success && existingDocsResult.data.length > 0) {
          // Separate documents by upload status
          const successfulDocs = existingDocsResult.data.filter(doc => doc.uploadStatus === 'completed');
          const failedOrPendingDocs = existingDocsResult.data.filter(doc => doc.uploadStatus !== 'completed');
          
          const successfulUrls = new Set(successfulDocs.map(doc => doc.fileUrl));
          const failedUrls = new Set(failedOrPendingDocs.map(doc => doc.fileUrl));
          
          // Find truly new PDFs (not in Firestore at all)
          const newPdfs = pdfs.filter(pdf => !successfulUrls.has(pdf.url) && !failedUrls.has(pdf.url));
          
          // Find failed/pending PDFs that need retry
          const retryPdfs = pdfs.filter(pdf => failedUrls.has(pdf.url));
          
          console.log(`📊 Scan analysis:`);
          console.log(`   - Total PDFs found: ${pdfs.length}`);
          console.log(`   - Already uploaded successfully: ${successfulDocs.length}`);
          console.log(`   - New PDFs to upload: ${newPdfs.length}`);
          console.log(`   - Failed/pending PDFs to retry: ${retryPdfs.length}`);
          
          // Combine new and retry PDFs
          pdfsToUpload = [...newPdfs, ...retryPdfs];
          
          if (pdfsToUpload.length === 0) {
            this._isRescan = false;
            this.uiCallbacks.setNewDocumentsFound?.(0);
            this.resetScanningState();
            this.uiCallbacks.setStatus?.('✅ All documents up to date');
            alert('✅ All documents are already uploaded successfully. Course is up to date!');
            return;
          }
          
          console.log(`📤 Will upload ${pdfsToUpload.length} PDFs total`);
          this.uiCallbacks.setStatus?.(`📋 Found ${newPdfs.length} new, ${retryPdfs.length} to retry. Starting upload...`);
        }
      }
      
      // Step 5: Upload PDFs to File Search store and save metadata ONLY on success
      let uploadedCount = 0;
      let uploadFailedCount = 0;
      
      for (let i = 0; i < pdfsToUpload.length; i++) {
        const pdf = pdfsToUpload[i];
        const docId = btoa(pdf.url).replace(/[/+=]/g, '_');
        
        // Ensure we have a proper title
        const pdfTitle = pdf.title || pdf.fileName || pdf.filename || `Document ${i + 1}`;
        
        // Calculate progress percentage (90-100% range for upload phase)
        const uploadProgress = 90 + Math.floor((i / pdfsToUpload.length) * 10);
        
        try {
          console.log(`📤 Uploading ${i + 1}/${pdfsToUpload.length}: ${pdfTitle}...`);
          console.log(`   URL: ${pdf.url}`);
          
          // Update status: Downloading
          this.uiCallbacks.setScanProgress?.(uploadProgress);
          this.uiCallbacks.setStatus?.(`📥 [${i + 1}/${pdfsToUpload.length}] Downloading: ${pdfTitle}`);
          
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
          const pdfBlob = this.base64ToBlob(blobResponse.base64Data, blobResponse.mimeType);
          const fileSizeMB = (pdfBlob.size / 1024 / 1024).toFixed(2);
          console.log(`✅ Received PDF blob: ${fileSizeMB} MB`);
          
          // Update status: Uploading
          this.uiCallbacks.setStatus?.(`📤 [${i + 1}/${pdfsToUpload.length}] Uploading: ${pdfTitle} (${fileSizeMB} MB)`);
          
          // Upload to File Search store with metadata
          const uploadResult = await this.fileSearchManager.uploadToStore(
            fileSearchStore.name,
            pdfBlob,
            pdfTitle,
            {
              courseId: this.currentCourseData.id,
              courseName: this.currentCourseData.name,
              source: pdf.type || pdf.context,
              originalUrl: pdf.url
            }
          );
          
          // Update status: Saving metadata
          this.uiCallbacks.setStatus?.(`💾 [${i + 1}/${pdfsToUpload.length}] Saving metadata: ${pdfTitle}`);
          
          // ONLY save to Firestore after successful upload
          console.log(`💾 Saving document metadata to Firestore...`);
          const saveResult = await this.firestoreHelpers.saveDocument(this.db, this.currentCourseData.id, pdf);
          
          if (!saveResult.success) {
            console.warn(`⚠️ Uploaded to File Search but failed to save metadata: ${saveResult.error}`);
          }
          
          // Update status to 'completed' and save File Search document reference
          await this.firestoreHelpers.saveDocumentFileSearch(this.db, this.currentCourseData.id, docId, uploadResult.name);
          await this.firestoreHelpers.updateDocumentStatus(this.db, this.currentCourseData.id, docId, 'completed');
          
          uploadedCount++;
          console.log(`✅ [${uploadedCount}/${pdfsToUpload.length}] Uploaded: ${pdfTitle}`);
          
          // Update status: Success
          this.uiCallbacks.setStatus?.(`✅ [${uploadedCount}/${pdfsToUpload.length}] Completed: ${pdfTitle}`);
          
        } catch (uploadError) {
          uploadFailedCount++;
          const errorMsg = uploadError.message || String(uploadError);
          console.error(`❌ Failed to upload ${pdfTitle}:`, errorMsg);
          
          // Update status: Failed
          this.uiCallbacks.setStatus?.(`❌ [${i + 1}/${pdfsToUpload.length}] Failed: ${pdfTitle}`);
          
          // Save the document with failed status so we can retry later
          await this.firestoreHelpers.saveDocument(this.db, this.currentCourseData.id, pdf);
          await this.firestoreHelpers.updateDocumentStatus(this.db, this.currentCourseData.id, docId, 'failed');
          
          // Brief pause to show error before moving to next
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Final status - notify user
      if (this._isRescan) {
        // Re-scan completed
        if (uploadedCount > 0) {
          this.uiCallbacks.setNewDocumentsFound?.(uploadedCount);
          const failureMsg = uploadFailedCount > 0 ? `\n⚠️ ${uploadFailedCount} failed (will retry on next scan)` : '';
          alert(`✅ Re-scan complete! Uploaded ${uploadedCount} document${uploadedCount !== 1 ? 's' : ''}!${failureMsg}`);
        } else if (uploadFailedCount > 0) {
          alert(`❌ All ${uploadFailedCount} uploads failed. Please check your internet connection and try again.`);
        }
      } else {
        // Initial scan completed
        if (uploadedCount > 0) {
          const failureMsg = uploadFailedCount > 0 ? `\n⚠️ ${uploadFailedCount} failed (will retry on next scan)` : '';
          alert(`✅ Successfully uploaded ${uploadedCount} PDF${uploadedCount !== 1 ? 's' : ''} to File Search!${failureMsg}`);
        } else {
          alert(`❌ Upload failed for all PDFs. Please check your internet connection and try scanning again.`);
        }
      }
      
      // Reset re-scan flag
      this._isRescan = false;
      
    } catch (err) {
      console.error('Error in saveFoundPDFsToFirestore:', err);
      this.resetScanningState();
      throw err;
    }
  }

  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  /**
   * Animate message streaming word-by-word
   * @param {string} fullMessage - The complete message to stream
   * @param {number} delay - Delay between words in ms (default 10ms)
   */
  async streamMessage(fullMessage, delay = 10) {
    // Clear any existing streaming animation
    if (this.streamingMessageTimer) {
      clearInterval(this.streamingMessageTimer);
    }

    this.isStreaming = true;

    // Split message into words (preserving whitespace and newlines)
    const tokens = fullMessage.split(/(?<=\s)|(?=\s)/);
    let currentText = '';
    let tokenIndex = 0;

    // Add empty assistant message that we'll update
    this.conversationHistory.push({ role: 'assistant', content: '' });
    this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);

    return new Promise((resolve) => {
      this.streamingMessageTimer = setInterval(() => {
        if (tokenIndex >= tokens.length) {
          clearInterval(this.streamingMessageTimer);
          this.streamingMessageTimer = null;
          this.isStreaming = false;
          
          // Ensure final message is complete
          this.conversationHistory[this.conversationHistory.length - 1].content = fullMessage;
          this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
          resolve();
          return;
        }

        currentText += tokens[tokenIndex];
        tokenIndex++;

        // Update the last message in the conversation
        this.conversationHistory[this.conversationHistory.length - 1].content = currentText;
        this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      }, delay);
    });
  }

  handleLogin() {
    alert('Please sign in to Chrome by clicking your profile icon in the top-right corner of Chrome, then reload this extension.');
  }

  handleDetect() {
    this.detectCanvas();
  }

  /**
   * Load or create a chat session for the current course
   * Loads existing messages if a session exists
   */
  async loadOrCreateChatSession() {
    if (!this.currentUser || !this.currentCourseData || !this.db) {
      console.log('⚠️ Cannot load chat session: missing user or course data');
      return;
    }

    // Verify user is enrolled before creating/loading session
    const enrollmentResult = await this.firestoreHelpers.isUserEnrolled(
      this.db,
      this.currentUser.id,
      this.currentCourseData.id
    );
    
    if (!enrollmentResult.success || !enrollmentResult.isEnrolled) {
      console.log('⚠️ User not enrolled in course, skipping chat session creation');
      return;
    }

    try {
      // Get existing chat sessions for this course
      const sessionsResult = await this.firestoreHelpers.getUserChatSessions(
        this.db, 
        this.currentUser.id, 
        this.currentCourseData.id
      );

      let sessionId;

      if (sessionsResult.success && sessionsResult.data.length > 0) {
        // Use the most recent session (sessions are sorted by lastMessageAt)
        sessionId = sessionsResult.data[0].id;
        console.log('✅ Using existing chat session:', sessionId);

        // Load existing messages
        const messagesResult = await this.firestoreHelpers.getSessionMessages(
          this.db,
          this.currentUser.id,
          sessionId
        );

        if (messagesResult.success) {
          // Convert Firestore messages to UI format
          this.conversationHistory = messagesResult.data.map(msg => ({
            role: msg.role,
            content: msg.content
          }));
          this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
          console.log(`✅ Loaded ${this.conversationHistory.length} messages from session`);
        }
      } else {
        // Create a new session
        const createResult = await this.firestoreHelpers.createChatSession(
          this.db,
          this.currentUser.id,
          {
            courseId: this.currentCourseData.id,
            title: `Chat - ${this.currentCourseData.name}`
          }
        );

        if (createResult.success) {
          sessionId = createResult.sessionId;
          this.conversationHistory = [];
          this.uiCallbacks.setChatMessages?.([]);
          console.log('✅ Created new chat session:', sessionId);
        } else {
          console.error('❌ Failed to create chat session');
          return;
        }
      }

      this.currentSessionId = sessionId;
    } catch (error) {
      console.error('❌ Error loading/creating chat session:', error);
    }
  }

  async handleChatSend(message) {
    if (!this.currentUser || !this.db) {
      this.conversationHistory.push({ 
        role: 'assistant', 
        content: '❌ Please sign in to use chat' 
      });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      return;
    }
    
    if (!this.fileSearchManager) {
      this.conversationHistory.push({ 
        role: 'assistant', 
        content: '❌ File Search service not available' 
      });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      return;
    }
    
    if (!this.currentCourseData) {
      this.conversationHistory.push({ 
        role: 'assistant', 
        content: '❌ Please navigate to a Canvas course first' 
      });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      return;
    }
    
    // Get course and check if File Search store exists
    const courseResult = await this.firestoreHelpers.getCourse(this.db, this.currentCourseData.id);
    if (!courseResult.success || !courseResult.data.fileSearchStoreName) {
      this.conversationHistory.push({ 
        role: 'assistant', 
        content: '❌ Please scan the course first to build the knowledge base' 
      });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      return;
    }
    
    const fileSearchStoreName = courseResult.data.fileSearchStoreName;
    
    // Ensure we have a chat session
    if (!this.currentSessionId) {
      await this.loadOrCreateChatSession();
      if (!this.currentSessionId) {
        this.conversationHistory.push({ 
          role: 'assistant', 
          content: '❌ Unable to create chat session' 
        });
        this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
        return;
      }
    }
    
    // Add user message
    this.conversationHistory.push({ role: 'user', content: message });
    this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
    this.uiCallbacks.setIsChatLoading?.(true);
    
    // Save user message to Firestore
    await this.firestoreHelpers.addMessageToSession(
      this.db,
      this.currentUser.id,
      this.currentSessionId,
      { role: 'user', content: message }
    );
    
    try {
      // Get last 10 messages (excluding the current one) for context
      // Convert to Gemini format: {role: 'user'|'model', parts: [{text: '...'}]}
      const historyForGemini = this.conversationHistory
        .slice(-10)
        .map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));
      
      // Query course store with the course ID and conversation history
      const response = await this.fileSearchManager.queryCourseStore(
        message,
        this.currentCourseData.id,
        'gemini-2.5-flash',
        null,
        5,
        historyForGemini
      );
      
      // Turn off loading indicator once we receive the response
      this.uiCallbacks.setIsChatLoading?.(false);
      
      // Stream the response word-by-word
      await this.streamMessage(response.answer, 20);
      
      // Save assistant message to Firestore (after streaming completes)
      await this.firestoreHelpers.addMessageToSession(
        this.db,
        this.currentUser.id,
        this.currentSessionId,
        { role: 'assistant', content: response.answer }
      );
      
    } catch (error) {
      console.error('Chat error:', error);
      
      // Turn off loading indicator on error
      this.uiCallbacks.setIsChatLoading?.(false);
      
      const errorMessage = '❌ Error: ' + error.message;
      
      // Stream error message too
      await this.streamMessage(errorMessage, 20);
      
      // Save error message to Firestore
      await this.firestoreHelpers.addMessageToSession(
        this.db,
        this.currentUser.id,
        this.currentSessionId,
        { role: 'assistant', content: errorMessage }
      );
    }
  }

  handleExpandWindow() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    });
  }

  async getCourseDocumentsForDrawer(courseId) {
    try {
      if (!this.db || !this.firestoreHelpers) {
        console.error('Database not initialized');
        return [];
      }

      const result = await this.firestoreHelpers.getCourseDocuments(this.db, courseId);
      
      if (result.success && result.data) {
        console.log(`✅ Retrieved ${result.data.length} documents for drawer`);
        return result.data;
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching course documents for drawer:', error);
      return [];
    }
  }
}
