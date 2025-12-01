# Architecture Overview: Canvas LM - AI Study Assistant

**Last Updated:** December 1, 2025  
**Version:** 1.1.0

## System Flow Diagram

```

                         USER INTERFACE (React)                        

                                                                        
  popup.html (React App)                    settings.html              
                    
    App.jsx (Main Container)                Settings            
     Header.jsx                           Sign In             
     AuthSection.jsx                                            
     CourseDetection.jsx                       
     CourseSelector.jsx                                            
     CourseInfo.jsx                                                
     ChatSection.jsx                                               
     AllCoursesView.jsx                                            
     CoursePDFDrawer.jsx                                           
                                        
              ↕                                                         
                                        
    popup-logic.js              ← Business Logic Layer               
    (PopupLogic class)                                               
                                        
              ↕                                                         

               
               
                                                                
      
 firestore-          gemini-file-        firebase-         content-    
 helpers.js          search-cloud.js     config.js         script.js   
                                                                       
  Firestore         Cloud             Firebase        Canvas   
 Operations          Functions Client    Init              Page Scan   
      
         ↕                      ↕                     ↕

                     FIREBASE CLOUD INFRASTRUCTURE                     

                                                                        
        
    Firebase Cloud Functions           Firestore Database         
    (europe-north1 - Finland)          (Multi-region)             
                        
                                                                  
     queryCourseStore()          users/{userId}             
       • Lecture context injection     • tier (free/premium/admin)
       • System prompt injection       courses/{courseId}         
       • Usage limit check (40/3hrs)   enrollments/               
       • Rate limit: 50/min            chatSessions/              
       • Enrollment verification       rateLimits/                
                                       userUsageLimits/           
                                       usageLimitConfig/                
     uploadToStore()                                            
       • Rate limit: 20/min            
                                                                     
      createCourseStore()            
       • Rate limit: 5/min         Gemini File Search API     
                                       (Google AI)                
      deleteDocument()                          
       • Rate limit: 30/min                                       
                                        Corpus Storage           
      checkRateLimit()                Semantic Search          
     verifyEnrollment()               RAG Query Engine         
                                        Document Chunking        
        
                                                                        
    
    Chrome Identity API (Google OAuth)                              
    • No Firebase Authentication tokens                             
    • Security via Cloud Functions enrollment verification          
    
                                                                        

```

## Data Flow

### 1. PDF Scanning & Upload Flow

```
Canvas Page
    
     (1) User clicks "Scan Course" or "Re-scan Course"
    
content-script.js
    
     (2) Extracts PDF links from Canvas page DOM
    
App.jsx (React UI)
    
     (3) Determines if re-scan (documents already exist)
        Calls popup-logic.js.handleScan(isRescan)
    
popup-logic.js
    
     (4) Saves course + enrollment to Firestore
        (via firestore-helpers.js)
        Stores _isRescan flag for later use
    
Firestore (courses, enrollments)
    
     (5) Downloads PDF blobs from Canvas
        (using Canvas cookies for auth)
    
popup-logic.js
    
     (6) Calls Cloud Function: uploadToStore()
        (via gemini-file-search-cloud.js)
    
Firebase Cloud Functions
    
     (7) Rate limit check → Enrollment verification
        → Base64 encode PDF → Upload to Gemini
    
Gemini File Search API
    
     (8) Returns corpus document name
    
Cloud Functions
    
     (9) Saves document metadata to Firestore
    
Firestore (courses/{id}/documents/)
```

### 2. Chat Flow (RAG Query)

```
User Question
    
     (1) "What is covered in Chapter 3?"
    
ChatSection.jsx
    
     (2) Calls popup-logic.js.sendMessage()
    
popup-logic.js
    
     (3) Checks usage limit (checkUsageLimit Cloud Function)
        • Free users: 40 messages per 3 hours
        • Premium/Admin: Unlimited
    
gemini-cloud-functions.js
    
     (4) Gets conversation history + courseId + lectureContext
        • Extracts lecture metadata from current Canvas page
        • Includes: lectureName, moduleNumber, weekNumber
    
gemini-file-search-cloud.js
    
     (5) Calls Cloud Function: queryCourseStore()
    
Firebase Cloud Functions
    
     (6) Rate limit check (50 req/min)
        → Enrollment verification
        → Get shared store name from Firestore
    
Firestore (courses/{id})
    
     (6) Returns fileSearchStoreName
    
Cloud Functions
    
     (7) Builds Gemini request:
        • System prompt (course material focus)
        • Lecture context injection (if available)
          "Currently viewing: Week 3, Module 2, Lecture: Introduction to Algorithms"
        • User question + conversation history
        • File Search tool with corpus reference
    
Gemini File Search API
    
     (8) Semantic search across course PDFs
        → Retrieves relevant chunks
        → Generates contextualized answer
        → STREAMING: Returns response in chunks (NDJSON format)
    
Gemini 2.5 Flash Model
    
     (9) Streams AI response parts with citations
    
Cloud Functions
    
     (10) Aggregates streaming chunks server-side
         • Parses NDJSON stream line-by-line
         • Concatenates all text parts
         • Extracts grounding metadata from final chunk
         • Returns complete response (no truncation)
    
Cloud Functions
    
     (11) Saves complete chat message to Firestore
    
Firestore (chatSessions/)
    
     (12) Returns full response to client
    
popup-logic.js
    
     (13) Records message usage (recordMessageUsage)
        • Free users: Message added to usage tracking
        • Premium/Admin: Usage not recorded
    
popup-logic.js
    
     (14) Streams message to UI (10ms delay for typing effect)
    
ChatSection.jsx
    
     (14) Displays answer with typing animation
    
User sees complete response (no truncation)
```

## Authentication Flow (Chrome Identity API)

```
User clicks "Sign In"
    
     (1) App.jsx → popup-logic.js.handleLogin()
    
chrome.identity.getProfileUserInfo()
    
     (2) Google OAuth via Chrome
         • User may need to select Google account
         • Chrome handles OAuth flow
    
Google Account Selection
    
     (3) Returns userInfo object:
         { id, email }
    
popup-logic.js
    
     (4) Calls firestore-helpers.saveUser()
    
Firestore (users/{userId})
    
     (5) Creates/updates user document:
         • email, displayName
         • createdAt, lastSeenAt
    
App.jsx
    
     (6) Updates UI state: setIsLoggedIn(true)
    
User sees authenticated interface

Note: API key is stored server-side in Cloud Functions .env file
      • Never exposed to client
      • GEMINI_API_KEY environment variable
      • Keeps user's API key secure
```

## File Lifecycle (Gemini File Search Corpus)

```
PDF File (from Canvas)
    
     (1) Upload to Cloud Function
           • File downloaded as blob from Canvas
           • Base64 encoded for transmission
           • Sent to uploadToStore() Cloud Function
    
     (2) Cloud Function Processing
           • Rate limit check (20 req/min)
           • Enrollment verification
           • Creates corpus if not exists
           • Uploads document to Gemini File Search
    
     (3) Gemini Corpus Storage
           • Document added to shared course corpus
           • Automatic chunking and embedding
           • Corpus name: corpora/{random-id}
           • Document name: corpora/{id}/documents/{doc-id}
           • PERSISTENT (no expiration)
    
     (4) Metadata Saved to Firestore
           • courses/{courseId}/documents/{docId}
           • Fields: fileName, geminiDocumentName, uploadedAt
           • fileSearchStoreName saved in course document
    
     (5) Available for RAG Queries
           • Shared across all enrolled users
           • Semantic search enabled
           • Chunks automatically retrieved
    
     (6) Manual Deletion Only
            • User can delete via UI
            • Calls deleteDocument() Cloud Function
            • Removes from Gemini corpus + Firestore
            • No automatic expiration
```

## Database Schema

### Firestore Structure

```
users/
  {userId}/                          ← Chrome Identity user ID
    email: string
    displayName: string
    tier: string                     ← "free" | "premium" | "admin"
    lastSeenAt: timestamp
    createdAt: timestamp
    
    // Stripe fields (for premium users)
    stripeCustomerId: string         ← Optional
    subscriptionId: string           ← Optional
    subscriptionStatus: string       ← Optional
    subscriptionStartDate: timestamp ← Optional
    
  {userId}/rateLimits/               ← Rate limiting (per user, per operation)
    {operation}/                     ← e.g., "queryCourseStore", "uploadToStore"
      requestTimestamps: array<timestamp>

userUsageLimits/                     ← NEW: Usage limiting for free users
  {userId}/
    messages: array<{
      timestamp: timestamp,
      messageId: string,
      courseChatId: string
    }>
    metadata: {
      totalMessagesAllTime: number,
      lastResetDate: timestamp
    }

usageLimitConfig/                    ← NEW: Usage limit configuration
  default/
    maxMessagesPerWindow: 40
    windowDurationHours: 3
    enabled: boolean

courses/
  {courseId}/                        ← SHARED across all enrolled users
    courseName: string
    courseCode: string
    canvasUrl: string
    canvasInstance: string           ← e.g., "canvas.instructure.com"
    firstScannedAt: timestamp
    lastScannedAt: timestamp
    fileSearchStoreName: string      ← Gemini corpus name (corpora/xxx)
    totalEnrollments: number
    createdBy: string                ← userId of first scanner
    
  {courseId}/documents/              ← SHARED course documents
    {docId}/
      fileName: string
      canvasUrl: string
      fileSize: number
      scannedFrom: string
      uploadedAt: timestamp
      uploadedBy: string             ← userId who uploaded
      geminiDocumentName: string     ← corpora/{id}/documents/{doc-id}
      chunkCount: number             ← Number of chunks created

enrollments/                         ← User-Course relationships
  {enrollmentId}/                    ← Composite ID: {userId}_{courseId}
    userId: string
    courseId: string
    enrolledAt: timestamp
    lastAccessedAt: timestamp
    currentSessionId: string         ← Active chat session

chatSessions/                        ← Root-level chat sessions
  {sessionId}/                       ← Generated UUID
    userId: string
    courseId: string
    title: string                    ← First message preview
    createdAt: timestamp
    lastMessageAt: timestamp
    messageCount: number
    
  {sessionId}/messages/
    {messageId}/
      role: string                   ← "user" or "model"
      content: string
      timestamp: timestamp
      tokens: number                 ← Optional usage tracking
```

## Component Responsibilities

### Frontend (Chrome Extension)

#### `App.jsx` (React Main Component)
-  Main application container
-  State management for UI
-  Route between chat/all courses views
-  Integrate all child components
-  Handle fullscreen mode

#### `popup-logic.js` (Business Logic)
-  Orchestrate all extension operations
-  User authentication (Chrome Identity)
-  Course detection and enrollment
-  PDF scanning coordination (initial scan + re-scan)
-  Re-scan detection (new/failed documents)
-  Enhanced status messaging with context awareness
-  Chat message handling with streaming support
-  Session management
-  Bridge between UI and services

#### `gemini-file-search-cloud.js` (Cloud Functions Client)
-  Call Cloud Functions via Firebase SDK
-  createCourseStore() - Create new corpus
-  uploadToStore() - Upload PDF to corpus
-  queryCourseStore() - RAG query with history
-  deleteDocument() - Remove document
-  Handle network errors and retries

#### `firestore-helpers.js` (Database Operations)
-  User CRUD operations
-  Course and enrollment management
-  Document metadata storage
-  Chat session and message storage
-  Shared course access logic
-  Statistics and analytics queries

#### `content-script.js` (Canvas Page Scanner)
-  Inject into Canvas LMS pages
-  Extract course information from DOM
-  Scan for PDF links in course files
-  Navigate course structure
-  Send data to popup via messaging

#### React Components
- `Header.jsx` - Logo and navigation
- `AuthSection.jsx` - Sign in/out UI
- `CourseDetection.jsx` - Current page course info
- `CourseSelector.jsx` - Switch between courses
- `ChatSection.jsx` - Chat interface with streaming
- `AllCoursesView.jsx` - Grid view of all enrollments
- `CoursePDFDrawer.jsx` - Document list sidebar
- `CourseInfo.jsx` - Course metadata display

### Backend (Firebase Cloud Functions)

#### `functions/index.js`

**Security Functions:**
-  `checkRateLimit()` - Firestore transaction-based rate limiting
-  `verifyEnrollment()` - Check user enrollment in course
-  `getSharedStore()` - Get or create shared corpus

**API Functions (all are `onCall` HTTP functions):**

-  `createCourseStore`
  - Creates new Gemini File Search corpus
  - Associates corpus with course in Firestore
  - Rate limit: 5 requests/minute
  - Requires: userId, courseId, displayName

-  `uploadToStore`
  - Uploads PDF document to corpus
  - Base64 decoding and validation
  - Saves metadata to Firestore
  - Rate limit: 20 requests/minute
  - Requires: userId, courseId, fileData, fileName

-  `queryCourseStore`
  - RAG query with Gemini 2.5 Flash
  - **Streaming API** (`streamGenerateContent`) for complete responses
  - Server-side stream aggregation (parses NDJSON chunks)
  - System prompt injection (course focus)
  - Conversation history support (last 10 messages)
  - Saves chat messages to Firestore
  - Rate limit: 50 requests/minute
  - Timeout: 180 seconds (3 minutes)
  - Requires: userId, courseId, question

-  `deleteDocument`
  - Removes document from corpus
  - Deletes Firestore metadata
  - Rate limit: 30 requests/minute
  - Requires: userId, courseId, documentName

## API Endpoints Used

### Gemini File API

```
POST   /v1beta/files              - Upload file (resumable)
GET    /v1beta/files/{name}       - Get file metadata
GET    /v1beta/files              - List all files
DELETE /v1beta/files/{name}       - Delete file

POST   /v1beta/models/{model}:streamGenerateContent
                                   - Chat with streaming (USED)
                                   - Returns NDJSON stream
                                   - Handles multi-part responses
                                   - Prevents response truncation
```

### Firebase/Firestore

```
setDoc()    - Save document
getDoc()    - Get document
getDocs()   - Query collection
updateDoc() - Update document
deleteDoc() - Delete document
```

## Security Architecture

### Multi-Layer Security Model

```

 Layer 1: Chrome Identity (OAuth)     
   • Google account authentication    
   • No passwords stored             
   • Chrome handles OAuth flow       

           
           

 Layer 2: Firestore Rules            
   • Intentionally permissive         
   • No Firebase Auth tokens         
   • Rate limits collection locked   
   • Security enforced in Layer 3    

           
           

 Layer 3: Cloud Functions Security   
   • Enrollment verification         
   • Rate limiting (per user/op)     
   • Input validation                
   • API key never exposed           

           
           

 Layer 4: Google Cloud Security      
   • TLS encryption (HTTPS)          
   • Gemini API validation           
   • Firestore encryption at rest    
   • GCP infrastructure security     

```

### API Key Protection
```
GEMINI_API_KEY
    
     Stored: functions/.env file (server-side)
       • NEVER in client code
       • NEVER in version control (.gitignore)
       • NEVER exposed to users
    
     Access: Cloud Functions environment only
       • process.env.GEMINI_API_KEY
       • Not accessible from client
    
     Usage: Direct Gemini API calls
        • Transmitted over HTTPS only
        • Google validates key server-side
```

### Data Security
```
User Data
    
     Personal Info: Firestore encrypted at rest
       • Email, displayName
       • Users can only harm themselves (no Auth)
    
     Course Materials: Shared corpus storage
       • PDFs stored in Gemini File Search
       • Accessible to all enrolled students
       • Enrollment verified by Cloud Functions
    
     Chat History: Private per user
        • chatSessions filtered by userId
        • Cannot access other users' chats
```

### Rate Limiting (Firestore Transaction-Based)
```
Operation           Limit        Enforcement
    
queryCourseStore    50/min       checkRateLimit()
uploadToStore       20/min       checkRateLimit()
createCourseStore   5/min        checkRateLimit()
deleteDocument      30/min       checkRateLimit()

Storage: users/{userId}/rateLimits/{operation}
  • requestTimestamps: array of timestamps
  • Old timestamps cleaned up automatically
  • Firestore transaction ensures atomicity
```

## Performance Considerations

```
Bottlenecks:
 PDF Upload: 2-10 sec per file
   Solution: Batch upload with progress

 Processing: 5-30 sec per file
   Solution: Background processing, show status

 Chat: 2-5 sec response time
   Solution: Use gemini-1.5-flash for speed

 Large files: Memory intensive
    Solution: Stream uploads, limit file size
```

## Error Handling

```
Common Errors:
 Invalid API key
   Action: Show settings page

 File too large (>2GB)
   Action: Skip file, notify user

 Processing timeout
   Action: Retry with exponential backoff

 Expired file URI
   Action: Re-upload file automatically

 Rate limit exceeded
   Action: Queue requests, slow down

 Network failure
    Action: Retry with exponential backoff
```

This architecture provides a robust, scalable system for RAG-powered course assistance!
