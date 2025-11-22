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
      
      // Get course details
      const courseHtml = `
        <div class="text-sm space-y-2">
          <p><strong class="font-semibold">Course:</strong> ${courseName}</p>
          <p><strong class="font-semibold">ID:</strong> ${courseId}</p>
        </div>
      `;
      
      this.uiCallbacks.setCourseDetails?.(courseHtml);
      this.uiCallbacks.setShowCourseInfo?.(true);
      
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
        // Get actual document count for each course
        const coursesWithCounts = await Promise.all(
          coursesResult.data.map(async (course) => {
            const docsResult = await this.firestoreHelpers.getCourseDocuments(this.db, course.id);
            const actualCount = docsResult.success ? docsResult.data.length : 0;
            
            return {
              ...course,
              name: course.courseName || course.name || `Course ${course.id}`,
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

  selectCourse(course) {
    this.currentCourseData = {
      id: course.id,
      name: course.name,
      url: course.url || `Course ${course.id}`
    };
    
    this.uiCallbacks.setStatus?.(`✅ Selected: ${course.name}`);
    
    const courseHtml = `
      <div class="text-sm space-y-2">
        <p><strong class="font-semibold">Course:</strong> ${course.name}</p>
        <p><strong class="font-semibold">ID:</strong> ${course.id}</p>
      </div>
    `;
    
    this.uiCallbacks.setCourseDetails?.(courseHtml);
    this.uiCallbacks.setShowCourseInfo?.(true);
    this.uiCallbacks.setShowCourseSelector?.(false);
  }

  async handleScan() {
    if (!this.currentUser) {
      alert('Please sign in to Chrome first');
      return;
    }
    
    if (!this.currentCourseData) {
      alert('Please navigate to a Canvas course page first');
      return;
    }
    
    this.uiCallbacks.setIsScanning?.(true);
    
    try {
      // Send scan request to background script
      chrome.runtime.sendMessage({
        type: 'START_SMART_SCAN',
        courseId: this.currentCourseData.id,
        courseName: this.currentCourseData.name,
        userId: this.currentUser.id
      });
      
    } catch (error) {
      console.error('Error starting scan:', error);
      alert('Error starting scan: ' + error.message);
      this.uiCallbacks.setIsScanning?.(false);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      console.log('📬 Popup received message:', message);
      
      if (message.type === 'PDF_SCAN_COMPLETE') {
        this.uiCallbacks.setIsScanning?.(false);
        alert(`✅ Scan complete! Found ${message.pdfCount} PDFs`);
      }
    });
  }

  handleLogin() {
    alert('Please sign in to Chrome by clicking your profile icon in the top-right corner of Chrome, then reload this extension.');
  }

  handleDetect() {
    this.detectCanvas();
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
    
    // Add user message
    this.conversationHistory.push({ role: 'user', content: message });
    this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
    this.uiCallbacks.setIsChatLoading?.(true);
    
    try {
      // Query File Search with the store name
      const response = await this.fileSearchManager.queryWithFileSearch(
        message,
        fileSearchStoreName,
        'gemini-2.5-flash'
      );
      
      this.conversationHistory.push({ role: 'assistant', content: response.answer });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      
    } catch (error) {
      console.error('Chat error:', error);
      this.conversationHistory.push({ 
        role: 'assistant', 
        content: '❌ Error: ' + error.message 
      });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
    } finally {
      this.uiCallbacks.setIsChatLoading?.(false);
    }
  }

  handleExpandWindow() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html')
    });
  }
}
