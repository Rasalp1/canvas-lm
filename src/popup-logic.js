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
          <p><strong class="font-semibold">Course:</strong> ${courseName}</p>
          <p><strong class="font-semibold">ID:</strong> ${courseId}</p>
          ${docCount > 0 ? `<p class="text-slate-900"><strong class="font-semibold">Documents:</strong> ${docCount} PDFs indexed</p>` : ''}
        </div>
      `;
      
      this.uiCallbacks.setCourseDetails?.(courseHtml);
      this.uiCallbacks.setShowCourseInfo?.(true);
      this.uiCallbacks.setCurrentCourseDocCount?.(docCount);
      
      // Load or create chat session for this course
      await this.loadOrCreateChatSession();
      
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
    this.currentCourseData = {
      id: course.id,
      name: course.name,
      url: course.url || `Course ${course.id}`
    };
    
    this.uiCallbacks.setStatus?.(`✅ Selected: ${course.name}`);
    
    const docCount = course.actualPdfCount || 0;
    
    const courseHtml = `
      <div class="text-sm space-y-2">
        <p><strong class="font-semibold">Course:</strong> ${course.name}</p>
        <p><strong class="font-semibold">ID:</strong> ${course.id}</p>
        ${docCount > 0 ? `<p class="text-slate-900"><strong class="font-semibold">Documents:</strong> ${docCount} PDFs indexed</p>` : ''}
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
    
    // Load or create chat session for this course
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
        
        // Load chat session for this course
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

  /**
   * Load or create a chat session for the current course
   * Loads existing messages if a session exists
   */
  async loadOrCreateChatSession() {
    if (!this.currentUser || !this.currentCourseData || !this.db) {
      console.log('⚠️ Cannot load chat session: missing user or course data');
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
      // Query File Search with the store name
      const response = await this.fileSearchManager.queryWithFileSearch(
        message,
        fileSearchStoreName,
        'gemini-2.5-flash'
      );
      
      this.conversationHistory.push({ role: 'assistant', content: response.answer });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      
      // Save assistant message to Firestore
      await this.firestoreHelpers.addMessageToSession(
        this.db,
        this.currentUser.id,
        this.currentSessionId,
        { role: 'assistant', content: response.answer }
      );
      
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = '❌ Error: ' + error.message;
      this.conversationHistory.push({ 
        role: 'assistant', 
        content: errorMessage
      });
      this.uiCallbacks.setChatMessages?.([...this.conversationHistory]);
      
      // Save error message to Firestore
      await this.firestoreHelpers.addMessageToSession(
        this.db,
        this.currentUser.id,
        this.currentSessionId,
        { role: 'assistant', content: errorMessage }
      );
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
