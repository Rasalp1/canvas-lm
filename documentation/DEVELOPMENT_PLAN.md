# Canvas-Gemini RAG System - Development Plan

## Project Overview
A Chrome extension that automatically downloads PDFs from Canvas courses and creates an interactive RAG (Retrieval-Augmented Generation) system using Google Gemini File Search for seamless Q&A with course materials.

## Current State Analysis
- **Basic Chrome extension structure**  (manifest v3, popup, basic scripting)
- **Canvas integration**  (PDF scraping and downloading working)
- **Authentication system**  (needs Firebase setup)
- **Backend infrastructure**  (needs Firestore setup)
- **Gemini integration**  (needs File Search API setup)
- **RAG chat interface**  (needs complete UI overhaul)

## Architecture Overview - Google Cloud Native

### System Components (Updated)
1. **Chrome Extension Frontend** (current minimal structure needs expansion)
2. **Chrome Identity API** (Chrome profile authentication, user identification)
3. **Firestore Database** (metadata storage, chat history, user data)
4. **Google Gemini File Search** (PDF storage, indexing, RAG queries)
5. **Cloud Functions** (optional, for complex operations only)
6. **Canvas API Integration** (course detection, PDF extraction)

### Data Flow (Updated)
```
Canvas Page → Extension Detects PDFs → Chrome Identity Check → 
→ Direct Gemini API Calls → Upload PDFs → 
→ Store Metadata in Firestore → Enable RAG Chat Interface
```

## Phase 1: Foundation Setup (Week 1-2)

### 1.1 Google Cloud / Firebase Project Setup
- [ ] Create new Google Cloud project
- [ ] Enable required APIs:
  - [ ] Gemini API (AI Platform)
  - [ ] Firestore API
  - [ ] Cloud Storage API (if needed for temporary files)
- [ ] Set up Firebase project (can be same as GCloud project)
- [ ] Configure Chrome extension with identity permissions
- [ ] Note: Authentication uses Chrome Identity API, not Firebase Auth

### 1.2 Firestore Database Schema
```javascript
// Users collection
users/{userId} = {
  email: string,
  displayName: string,
  fileSearchStoreId: string,
  canvasApiToken: string, // encrypted
  createdAt: timestamp,
  lastLoginAt: timestamp
}

// Documents collection  
documents/{docId} = {
  userId: string,
  courseId: string,
  courseName: string,
  fileName: string,
  fileUrl: string,
  geminiFileId: string,
  fileSize: number,
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed',
  uploadedAt: timestamp
}

// Chat sessions collection
chatSessions/{sessionId} = {
  userId: string,
  courseId: string,
  sessionName: string,
  createdAt: timestamp,
  messages: [
    {
      id: string,
      userMessage: string,
      assistantResponse: string,
      timestamp: timestamp,
      sources?: string[] // Referenced document IDs
    }
  ]
}
```

### 1.3 Direct Gemini API Integration
- [ ] Set up Gemini API credentials
- [ ] Test File Search API directly from extension
- [ ] Implement error handling for API rate limits
- [ ] Create utility functions for API calls

### 1.4 Extension Manifest Updates
- [ ] Update `manifest.json` with required permissions:
  ```json
  {
    "manifest_version": 3,
    "name": "Canvas RAG Assistant",
    "version": "1.0",
    "description": "Interactive RAG system for Canvas course materials",
    "action": {
      "default_popup": "popup.html"
    },
    "permissions": [
      "scripting",
      "activeTab",
      "storage",
      "identity",
      "tabs"
    ],
    "host_permissions": [
      "*://*.instructure.com/*",
      "*://*.canvas.*/*",
      "https://generativelanguage.googleapis.com/*",
      "https://*.googleapis.com/*",
      "https://*.firebaseapp.com/*"
    ],
    "content_scripts": [
      {
        "matches": ["*://*.instructure.com/*", "*://*.canvas.*/*"],
        "js": ["content-script.js"]
      }
    ],
    "background": {
      "service_worker": "background.js"
    }
  }
  ```

## Phase 2: Canvas Integration (Week 2-3)

### 2.1 Canvas Detection & API Integration
- [ ] Create `content-script.js` for Canvas page detection
- [ ] Implement Canvas API token management
- [ ] Build course ID extraction from current URL
- [ ] Create PDF detection logic using Canvas API endpoints:
  - `GET /api/v1/courses/{course_id}/files`
  - `GET /api/v1/courses/{course_id}/modules`
  - `GET /api/v1/courses/{course_id}/pages`

### 2.2 PDF Extraction Logic
- [ ] Scan Canvas course for PDF files
- [ ] Handle different PDF locations:
  - Direct file uploads
  - Embedded in pages/modules
  - External links
- [ ] Implement duplicate detection
- [ ] Create download queue management

### 2.3 Content Script Implementation
```javascript
// content-script.js structure
class CanvasScanner {
  constructor() {
    this.courseId = this.extractCourseId();
    this.apiToken = null;
  }
  
  async scanForPDFs() {
    // Implementation for PDF detection
  }
  
  async downloadPDF(fileUrl) {
    // Implementation for PDF download
  }
  
  extractCourseId() {
    // Extract course ID from Canvas URL
  }
}
```

## Phase 3: Direct API Integration (Week 3-4)

### 3.1 Chrome Identity Authentication Setup

**Important: Chrome extensions cannot use Firebase Authentication** because:
- Firebase Auth requires popup-based OAuth flows
- Chrome extension popups close when focus is lost
- OAuth redirects don't work in extension context

**Solution: Use Chrome Identity API instead**

```javascript
// firebase-config.js (Firestore only - no auth)
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  // Your config
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app); // Only Firestore, no auth
```

```javascript
// popup.js - Chrome Identity authentication
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
  const userInfo = await getUserProfile();
  if (userInfo && userInfo.email) {
    // User is signed into Chrome - use their profile
    currentUser = {
      email: userInfo.email,
      id: userInfo.id,
      displayName: userInfo.email.split('@')[0]
    };
    // Store user info in Firestore
    await setDoc(doc(db, 'users', userInfo.id), {
      email: userInfo.email,
      lastSeenAt: Timestamp.now()
    }, { merge: true });
  }
}
```

### 3.2 Direct Gemini API Calls from Extension
```javascript
// gemini-api.js
import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiService {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  async uploadFile(file) {
    // Upload file to Gemini File Search
  }

  async query(question, fileIds) {
    // Query RAG with context from uploaded files
  }
}
```

### 3.3 Chrome Extension API Management

- [ ] Create authentication flow with Chrome Identity API
- [ ] Handle Canvas API token encryption
- [ ] Implement automatic token refresh
- [ ] Add offline capability with local storage fallback
- [ ] Note: User must be signed into Chrome browser for authentication to work

### 3.4 Why This Approach is Better

#### Simplified Architecture
- **Fewer moving parts**: Chrome Extension ↔ Firestore ↔ Gemini API
- **No custom backend code** to maintain
- **Single vendor ecosystem** (Google) for better integration
- **Chrome Identity API** - no separate auth server needed

#### Performance Benefits
- **Direct API calls** = lower latency
- **No proxy overhead** from edge functions
- **Built-in Firebase caching** for Firestore data

#### Cost Optimization
- **No server costs** for Supabase edge functions
- **Pay-per-use** Firebase pricing model
- **Shared quotas** across Google services

#### Security Advantages
- **Firebase Security Rules** for data access control
- **Chrome Identity API** leverages existing Chrome authentication
- **Client-side encryption** for sensitive data before storage
- **No OAuth popup issues** - uses browser's built-in authentication

## Phase 4: Extension UI Overhaul (Week 4-5)

### 4.1 New Popup Interface Design
Replace current minimal popup with comprehensive interface:

#### `popup.html` - New Structure
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Canvas RAG Assistant</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app-container">
    <!-- Authentication Section -->
    <div id="auth-section" class="section">
      <h2>Canvas RAG Assistant</h2>
      <button id="login-btn">Sign in with Google</button>
      <div id="canvas-token-setup">
        <input type="text" id="canvas-token" placeholder="Canvas API Token">
        <button id="save-token">Save Token</button>
      </div>
    </div>

    <!-- Course Detection Section -->
    <div id="course-section" class="section hidden">
      <h3>Current Course</h3>
      <div id="course-info"></div>
      <button id="scan-pdfs">Scan for PDFs</button>
    </div>

    <!-- PDF Management Section -->
    <div id="pdf-section" class="section hidden">
      <h3>Found PDFs</h3>
      <div id="pdf-list"></div>
      <button id="upload-all">Upload All to RAG</button>
    </div>

    <!-- Chat Interface Section -->
    <div id="chat-section" class="section hidden">
      <h3>Ask Questions</h3>
      <div id="chat-history"></div>
      <div id="chat-input-container">
        <textarea id="chat-input" placeholder="Ask about your course materials..."></textarea>
        <button id="send-message">Send</button>
      </div>
    </div>

    <!-- Status Section -->
    <div id="status-section" class="section">
      <div id="status-message"></div>
      <div id="progress-bar" class="hidden"></div>
    </div>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

### 4.2 Enhanced Popup JavaScript
Complete rewrite of `popup.js` with:
- [ ] Authentication management
- [ ] Course detection and display
- [ ] PDF scanning and listing
- [ ] Upload progress tracking
- [ ] Real-time chat interface
- [ ] Error handling and user feedback

### 4.3 Improved Styling
Update `styles.css` with:
- [ ] Modern, clean interface design
- [ ] Responsive layout for different popup sizes
- [ ] Loading states and animations
- [ ] Chat bubble styling
- [ ] Progress indicators

## Phase 5: RAG Implementation (Week 5-6)

### 5.1 Gemini File Search Integration
- [ ] Implement file upload with signed URLs
- [ ] Handle large file uploads (chunking if needed)
- [ ] Set up file search store per user
- [ ] Implement file indexing verification

### 5.2 Chat System
- [ ] Create conversational interface
- [ ] Implement context-aware questioning
- [ ] Add typing indicators
- [ ] Store chat history
- [ ] Enable session management

### 5.3 Advanced RAG Features
- [ ] Source citation in responses
- [ ] Confidence scoring
- [ ] Multi-document querying
- [ ] Query refinement suggestions

## Phase 6: Testing & Polish (Week 6-7)

### 6.1 Comprehensive Testing
- [ ] Unit tests for all components
- [ ] Integration tests with Canvas API
- [ ] End-to-end testing scenarios
- [ ] Performance testing with large PDFs
- [ ] Error handling validation

### 6.2 User Experience Polish
- [ ] Loading states and progress indicators
- [ ] Error message improvements
- [ ] Keyboard shortcuts
- [ ] Accessibility improvements
- [ ] Mobile-responsive design

### 6.3 Security & Privacy
- [ ] Data encryption at rest

- [ ] Privacy policy creation
- [ ] GDPR compliance check
- [ ] Security audit

## Phase 7: Deployment & Distribution (Week 7-8)

### 7.1 Chrome Web Store Preparation
- [ ] Create store listing
- [ ] Generate screenshots and videos
- [ ] Write detailed description
- [ ] Set up analytics
- [ ] Submit for review

### 7.2 Documentation
- [ ] User guide creation
- [ ] Installation instructions
- [ ] Troubleshooting guide
- [ ] API documentation
- [ ] Developer setup guide

## Technical Requirements

### Development Environment
- **Node.js** (v18+)
- **TypeScript** (for Supabase functions)
- **Supabase CLI**
- **Google Cloud SDK**
- **Chrome Developer Tools**

### Key Dependencies
```json
{
  "firebase": "^10.0.0",
  "@google/generative-ai": "^0.1.0",
  "chrome-types": "^0.1.0"
}
```

### Configuration (No Environment Variables Needed!)
```javascript
// All config stored in Firebase project settings
// No server-side environment variables required

const firebaseConfig = {
  apiKey: "your-firebase-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

## Potential Challenges & Solutions

### Challenge 1: Canvas API Rate Limits
**Solution**: Implement exponential backoff and request queuing

### Challenge 2: Large PDF Upload Limits
**Solution**: Use Gemini's signed upload URLs (already planned)

### Challenge 3: Cross-Origin Restrictions
- [ ] Chrome extension host permissions + Firebase/Gemini APIs support CORS

### Challenge 4: User Data Privacy
**Solution**: Firebase Security Rules + client-side encryption for sensitive tokens

### Challenge 5: PDF Processing Time
**Solution**: Implement background processing with status updates

## Success Metrics

### Technical Metrics
- [ ] Successfully authenticate 95%+ of users
- [ ] Process PDFs up to 100MB without timeout
- [ ] Respond to queries within 3 seconds
- [ ] Handle 100+ concurrent users

### User Experience Metrics
- [ ] One-click PDF scanning
- [ ] Sub-5-second upload initiation
- [ ] Intuitive chat interface
- [ ] 95%+ uptime

## MVP Definition

### Core Features for V1.0
1.  Canvas course detection
2.  PDF scanning and extraction
3.  Google authentication
4.  Basic RAG chat functionality
5.  File upload to Gemini File Search

### Nice-to-Have Features for V1.1+
- [ ] Multiple file format support (DOCX, PPTX)
- [ ] Advanced search filters
- [ ] Collaborative features
- [ ] Mobile app companion
- [ ] Offline chat history

## Timeline Summary

| Phase | Duration | Key Deliverables | Status |
|-------|----------|------------------|--------|
| 1 | Week 1-2 | Firebase setup, Gemini API, Updated manifest |  In Progress |
| 2 | Week 2-3 | Canvas integration, PDF detection |  Complete |
| 3 | Week 3-4 | Backend functions, Authentication | ⏳ Next |
| 4 | Week 4-5 | New UI, Enhanced popup | ⏳ Planned |
| 5 | Week 5-6 | RAG implementation, Chat system | ⏳ Planned |
| 6 | Week 6-7 | Testing, Polish, Security | ⏳ Planned |
| 7 | Week 7-8 | Deployment, Documentation | ⏳ Planned |

**Total Estimated Time**: 7-8 weeks for full implementation

---

## Next Steps (Current Priority)

### Phase 3: Firebase & Gemini API Integration
1. **Set up Firebase project** - Create Google Cloud/Firebase project
2. **Enable required APIs** - Firestore, Gemini API (Auth uses Chrome Identity, not Firebase)
3. **Configure Firestore database** - Set up collections and security rules
4. **Update extension manifest** - Add Firebase/Gemini permissions
5. **Implement authentication** - Google OAuth sign-in flow
6. **Integrate Gemini API** - Direct API calls for file upload and RAG queries

## Why Google Cloud Native Architecture

### Simplified Development
- **Single vendor ecosystem** - All Google services work seamlessly together
- **No backend server code** - Direct API calls from extension
- **Built-in integrations** - Chrome Identity + Firestore + Gemini API
- **Faster development** - Fewer dependencies and moving parts

### Better Performance  
- **Direct API calls** - No proxy overhead or additional latency
- **Google's infrastructure** - Global CDN and edge locations
- **Chrome optimization** - Same vendor as the browser itself

### Cost Effectiveness
- **No server hosting** - Eliminates backend infrastructure costs
- **Pay-per-use pricing** - Only pay for what you actually use
- **Generous free tiers** - Firebase and Gemini both offer free quotas

### Security & Reliability
- **Enterprise-grade infrastructure** - Google's proven security model
- **Built-in DDoS protection** - Automatic scaling and protection
- **Unified identity** - Single sign-on across all services
- **99.9% SLA** - Production-grade reliability guarantees

This plan provides a comprehensive roadmap for building a production-ready Canvas RAG system. Each phase builds upon the previous one, ensuring a solid foundation while maintaining development momentum.