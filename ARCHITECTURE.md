# Architecture Overview: Canvas RAG Assistant with Gemini

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  popup.html                        settings.html                 │
│  ┌──────────────┐                  ┌──────────────┐            │
│  │ 🔍 Scan PDFs │                  │ ⚙️ Settings  │            │
│  │ 💬 Chat UI   │                  │ 🔑 API Key   │            │
│  └──────────────┘                  └──────────────┘            │
│         │                                  │                     │
└─────────┼──────────────────────────────────┼─────────────────────┘
          │                                  │
          ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTENSION LOGIC                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  popup.js              settings.js           content-script.js   │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │ Initialize   │     │ Save API Key │     │ Scan Canvas  │   │
│  │ Handle Chat  │     │ to Chrome    │     │ Extract PDFs │   │
│  │ Upload PDFs  │     │ Storage      │     └──────────────┘   │
│  └──────────────┘     └──────────────┘                          │
│         │                                                         │
│         ├──────────────────┬─────────────────┐                  │
│         ▼                  ▼                 ▼                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐       │
│  │ gemini-rag.js│   │firestore-    │   │firebase-     │       │
│  │              │   │helpers.js    │   │config.js     │       │
│  │ RAG Manager  │   │              │   │              │       │
│  └──────────────┘   └──────────────┘   └──────────────┘       │
│         │                  │                 │                  │
└─────────┼──────────────────┼─────────────────┼──────────────────┘
          │                  │                 │
          ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────┐         ┌──────────────────────┐     │
│  │  Gemini File API     │         │  Firebase/Firestore   │     │
│  │  ═══════════════     │         │  ═══════════════      │     │
│  │                      │         │                       │     │
│  │  📤 Upload PDFs      │         │  💾 Store Metadata    │     │
│  │  🔄 Process Files    │         │  📊 User Data         │     │
│  │  💬 Chat with RAG    │         │  📁 Course Data       │     │
│  │  🗑️  Delete Files     │         │  📄 Document URIs     │     │
│  │                      │         │                       │     │
│  │  Endpoint:           │         │  Project:             │     │
│  │  generativelanguage  │         │  canvas-lm            │     │
│  │  .googleapis.com     │         │  .firebaseapp.com     │     │
│  └──────────────────────┘         └──────────────────────┘     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. PDF Scanning & Upload Flow

```
Canvas Page
    │
    │ (1) User clicks "Scan Course"
    ▼
content-script.js
    │
    │ (2) Extracts PDF links
    ▼
popup.js
    │
    │ (3) Saves to Firestore
    ▼
Firestore
    │
    │ (4) Downloads PDF blob
    ▼
gemini-rag.js
    │
    │ (5) Uploads to Gemini
    ▼
Gemini File API
    │
    │ (6) Returns file URI
    ▼
firestore-helpers.js
    │
    │ (7) Saves URI + expiration
    ▼
Firestore
```

### 2. Chat Flow

```
User Question
    │
    │ (1) "What is covered in Chapter 3?"
    ▼
popup.js
    │
    │ (2) Get course documents
    ▼
firestore-helpers.js
    │
    │ (3) Query documents with valid URIs
    ▼
Firestore
    │
    │ (4) Returns: [uri1, uri2, uri3, ...]
    ▼
gemini-rag.js
    │
    │ (5) Send prompt + file URIs
    ▼
Gemini File API
    │
    │ (6) Reads PDFs, generates answer
    ▼
Gemini File API
    │
    │ (7) Returns AI response
    ▼
popup.js
    │
    │ (8) Display answer to user
    ▼
Chat UI
```

## API Key Flow

```
Google AI Studio
    │
    │ (1) User creates API key
    │     (starts with "AIza...")
    ▼
settings.html
    │
    │ (2) User pastes key
    ▼
settings.js
    │
    │ (3) Validates format
    │     (must start with "AIza")
    ▼
Chrome Storage API
    │
    │ (4) Stores securely
    │     chrome.storage.sync
    ▼
popup.js
    │
    │ (5) Retrieves on init
    ▼
GeminiRAGManager
    │
    │ (6) Uses for API calls
    ▼
Gemini File API
```

## File Lifecycle

```
PDF File
    │
    ├─► (1) Upload        ──► Gemini receives file
    │
    ├─► (2) Processing    ──► Gemini analyzes content
    │                          (5-30 seconds)
    │
    ├─► (3) Active        ──► Ready for chat
    │                          URI: files/abc123xyz
    │                          Valid for 48 hours
    │
    ├─► (4) Chat          ──► Referenced in prompts
    │                          Multiple times
    │
    └─► (5) Expiration    ──► Auto-deleted after 48h
                               Need to re-upload
```

## Database Schema

### Firestore Structure

```
users/
  {userId}/
    email: string
    displayName: string
    lastSeenAt: timestamp
    createdAt: timestamp

courses/
  {courseId}/
    userId: string
    courseName: string
    courseCode: string
    canvasUrl: string
    lastScannedAt: timestamp
    pdfCount: number
    createdAt: timestamp
    
    documents/
      {docId}/
        fileName: string
        fileUrl: string
        fileSize: number
        fileType: string
        scannedFrom: string
        uploadedAt: timestamp
        uploadStatus: string
        
        // Gemini-specific fields
        geminiUri: string           ← File URI from Gemini
        geminiFileName: string      ← files/abc123xyz
        geminiUploadedAt: timestamp ← When uploaded
        geminiExpiresAt: timestamp  ← 48 hours from upload
```

## Component Responsibilities

### `gemini-rag.js`
- ✅ Upload files to Gemini
- ✅ Wait for processing
- ✅ Generate chat responses
- ✅ Manage file lifecycle
- ✅ Handle API errors

### `firestore-helpers.js`
- ✅ Save/retrieve documents
- ✅ Store Gemini URIs
- ✅ Track expiration
- ✅ Find expired files
- ✅ Clean up old data

### `popup.js`
- ✅ Orchestrate scanning
- ✅ Handle user interactions
- ✅ Upload PDFs to Gemini
- ✅ Process chat messages
- ✅ Display results

### `settings.js`
- ✅ Manage API key
- ✅ Validate input
- ✅ Store securely
- ✅ Show connection status

### `content-script.js`
- ✅ Scan Canvas pages
- ✅ Extract PDF links
- ✅ Navigate course structure
- ✅ Send data to popup

## API Endpoints Used

### Gemini File API

```
POST   /v1beta/files              - Upload file (resumable)
GET    /v1beta/files/{name}       - Get file metadata
GET    /v1beta/files              - List all files
DELETE /v1beta/files/{name}       - Delete file

POST   /v1beta/models/{model}:generateContent
                                   - Chat with context
```

### Firebase/Firestore

```
setDoc()    - Save document
getDoc()    - Get document
getDocs()   - Query collection
updateDoc() - Update document
deleteDoc() - Delete document
```

## Security Layers

```
API Key
    │
    ├─► Stored in Chrome sync storage
    │   (Encrypted by Chrome)
    │
    ├─► Never exposed in code
    │   (Retrieved at runtime)
    │
    ├─► Transmitted over HTTPS
    │   (TLS encrypted)
    │
    └─► Validated on server
        (Google verifies key)

PDFs
    │
    ├─► Uploaded to Google servers
    │   (Secure transmission)
    │
    ├─► Processed by Gemini
    │   (Google's secure infrastructure)
    │
    └─► Auto-deleted after 48h
        (No permanent storage)
```

## Performance Considerations

```
Bottlenecks:
├─► PDF Upload: 2-10 sec per file
│   Solution: Batch upload with progress
│
├─► Processing: 5-30 sec per file
│   Solution: Background processing, show status
│
├─► Chat: 2-5 sec response time
│   Solution: Use gemini-1.5-flash for speed
│
└─► Large files: Memory intensive
    Solution: Stream uploads, limit file size
```

## Error Handling

```
Common Errors:
├─► Invalid API key
│   Action: Show settings page
│
├─► File too large (>2GB)
│   Action: Skip file, notify user
│
├─► Processing timeout
│   Action: Retry with exponential backoff
│
├─► Expired file URI
│   Action: Re-upload file automatically
│
├─► Rate limit exceeded
│   Action: Queue requests, slow down
│
└─► Network failure
    Action: Retry with exponential backoff
```

This architecture provides a robust, scalable system for RAG-powered course assistance!
