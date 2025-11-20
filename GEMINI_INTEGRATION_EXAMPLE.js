// EXAMPLE: How to integrate Gemini RAG into popup.js
// This file shows example code snippets - integrate these into your actual popup.js

// ==================== INITIALIZATION ====================

// Add these global variables at the top of popup.js
let geminiRAG = null;
let saveDocumentGeminiUri, getCourseDocumentsWithGemini, getDocumentsNeedingGeminiUpload, clearExpiredGeminiUris;

// Initialize Gemini RAG after Firebase loads
async function initializeGeminiRAG() {
  try {
    // Get API key from Chrome storage
    const result = await chrome.storage.sync.get(['geminiApiKey']);
    
    if (!result.geminiApiKey) {
      console.warn('⚠️ No Gemini API key found. User needs to set it in settings.');
      return false;
    }
    
    geminiRAG = new GeminiRAGManager(result.geminiApiKey);
    console.log('✅ Gemini RAG initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Gemini RAG:', error);
    return false;
  }
}

// Call this in your DOMContentLoaded event after Firebase helpers load
// await initializeGeminiRAG();

// ==================== STORE API KEY ====================

// Add a settings button to your popup.html UI
// Then add this function:
async function saveGeminiAPIKey(apiKey) {
  try {
    await chrome.storage.sync.set({ geminiApiKey: apiKey });
    console.log('✅ Gemini API key saved');
    
    // Reinitialize
    await initializeGeminiRAG();
    return true;
  } catch (error) {
    console.error('❌ Failed to save API key:', error);
    return false;
  }
}

// ==================== UPLOAD PDFs TO GEMINI ====================

// Modify your existing saveFoundPDFsToFirestore function
// Add Gemini upload after saving to Firestore
async function saveFoundPDFsToFirestore() {
  try {
    // ... existing Firestore save code ...
    
    // After saving to Firestore, upload to Gemini
    if (geminiRAG && foundPDFs.length > 0) {
      status.textContent = `📤 Uploading ${foundPDFs.length} PDFs to Gemini...`;
      result.textContent = 'Preparing files for AI chat...\n\n';
      
      await uploadPDFsToGemini(currentCourseData.courseId, foundPDFs);
    }
    
    // ... rest of existing code ...
  } catch (error) {
    console.error('Error saving PDFs:', error);
  }
}

// New function to upload PDFs to Gemini
async function uploadPDFsToGemini(courseId, pdfs) {
  let uploadCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    
    try {
      status.textContent = `📤 Uploading to Gemini (${i + 1}/${pdfs.length}): ${pdf.title}`;
      
      // Download the PDF as a Blob
      const response = await fetch(pdf.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const blob = await response.blob();
      
      // Upload to Gemini
      const fileData = await geminiRAG.uploadPDF(blob, pdf.title);
      
      // Save Gemini URI to Firestore
      const docId = btoa(pdf.url).replace(/[/+=]/g, '_');
      await saveDocumentGeminiUri(
        db, 
        courseId, 
        docId, 
        fileData.uri, 
        fileData.name
      );
      
      uploadCount++;
      result.textContent += `✅ ${pdf.title}\n`;
    } catch (error) {
      console.error(`Failed to upload ${pdf.title} to Gemini:`, error);
      errorCount++;
      result.textContent += `❌ ${pdf.title} - ${error.message}\n`;
    }
  }
  
  status.textContent = `✅ Gemini upload complete: ${uploadCount} succeeded, ${errorCount} failed`;
}

// ==================== CHAT WITH PDFs ====================

// Add chat UI to popup.html, then use this function:
async function sendChatMessage() {
  const messageInput = document.getElementById('chat-input');
  const chatHistory = document.getElementById('chat-history');
  const message = messageInput.value.trim();
  
  if (!message || !currentCourseData) return;
  
  try {
    // Show user message
    appendChatMessage('user', message);
    messageInput.value = '';
    
    // Show loading
    const loadingId = appendChatMessage('assistant', '🤔 Thinking...');
    
    // Get valid Gemini URIs for this course
    const result = await getCourseDocumentsWithGemini(db, currentCourseData.courseId);
    
    if (!result.success || result.data.length === 0) {
      updateChatMessage(loadingId, '❌ No documents found. Please scan the course first.');
      return;
    }
    
    const fileUris = result.data.map(doc => doc.geminiUri);
    
    // Send to Gemini
    const response = await geminiRAG.chatWithContext(
      message,
      fileUris,
      'gemini-1.5-flash' // or 'gemini-1.5-pro' for better quality
    );
    
    // Update with response
    updateChatMessage(loadingId, response);
  } catch (error) {
    console.error('Chat error:', error);
    appendChatMessage('assistant', `❌ Error: ${error.message}`);
  }
}

// Helper functions for chat UI
function appendChatMessage(role, content) {
  const chatHistory = document.getElementById('chat-history');
  const messageId = `msg-${Date.now()}`;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  messageDiv.id = messageId;
  messageDiv.innerHTML = `
    <div class="message-role">${role === 'user' ? '👤 You' : '🤖 AI Assistant'}</div>
    <div class="message-content">${content}</div>
  `;
  
  chatHistory.appendChild(messageDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  return messageId;
}

function updateChatMessage(messageId, content) {
  const messageDiv = document.getElementById(messageId);
  if (messageDiv) {
    const contentDiv = messageDiv.querySelector('.message-content');
    contentDiv.textContent = content;
  }
}

// ==================== CHECK & RE-UPLOAD EXPIRED FILES ====================

// Call this when opening popup or when user wants to chat
async function ensureValidGeminiFiles(courseId) {
  try {
    // Check for expired files
    await clearExpiredGeminiUris(db, courseId);
    
    // Get documents that need upload
    const result = await getDocumentsNeedingGeminiUpload(db, courseId);
    
    if (!result.success) {
      console.error('Failed to check for expired files:', result.error);
      return;
    }
    
    if (result.data.length > 0) {
      console.log(`⚠️ ${result.data.length} documents need re-upload to Gemini`);
      
      // Show notification to user
      status.textContent = `⚠️ ${result.data.length} files expired. Click to re-upload.`;
      
      // Optionally auto-reupload
      // await reuploadExpiredFiles(courseId, result.data);
    }
  } catch (error) {
    console.error('Error checking Gemini files:', error);
  }
}

async function reuploadExpiredFiles(courseId, documents) {
  for (const doc of documents) {
    try {
      // Download PDF again
      const response = await fetch(doc.fileUrl);
      const blob = await response.blob();
      
      // Upload to Gemini
      const fileData = await geminiRAG.uploadPDF(blob, doc.fileName);
      
      // Update Firestore
      await saveDocumentGeminiUri(
        db,
        courseId,
        doc.id,
        fileData.uri,
        fileData.name
      );
      
      console.log(`✅ Re-uploaded ${doc.fileName} to Gemini`);
    } catch (error) {
      console.error(`Failed to re-upload ${doc.fileName}:`, error);
    }
  }
}

// ==================== EXAMPLE CHAT UI HTML ====================

/*
Add this to your popup.html after the scan section:

<div id="chat-section" class="section hidden">
  <h3>💬 Chat with Course Materials</h3>
  <div id="chat-history" class="chat-history"></div>
  <div class="chat-input-container">
    <input type="text" id="chat-input" placeholder="Ask a question about your course materials..." />
    <button id="send-chat-btn" class="primary-btn">Send</button>
  </div>
</div>

Add this to your styles.css:

.chat-history {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  background: #f9f9f9;
}

.chat-message {
  margin-bottom: 15px;
  padding: 10px;
  border-radius: 8px;
}

.chat-message.user {
  background: #e3f2fd;
  margin-left: 20px;
}

.chat-message.assistant {
  background: #f5f5f5;
  margin-right: 20px;
}

.message-role {
  font-weight: bold;
  margin-bottom: 5px;
  font-size: 12px;
}

.message-content {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.chat-input-container {
  display: flex;
  gap: 10px;
}

#chat-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}
*/

// ==================== EVENT LISTENERS ====================

/*
Add these to your DOMContentLoaded event:

// Initialize Gemini RAG
await initializeGeminiRAG();

// Load Gemini helpers from window.firestoreHelpers
saveDocumentGeminiUri = window.firestoreHelpers.saveDocumentGeminiUri;
getCourseDocumentsWithGemini = window.firestoreHelpers.getCourseDocumentsWithGemini;
getDocumentsNeedingGeminiUpload = window.firestoreHelpers.getDocumentsNeedingGeminiUpload;
clearExpiredGeminiUris = window.firestoreHelpers.clearExpiredGeminiUris;

// Chat send button
const sendChatBtn = document.getElementById('send-chat-btn');
const chatInput = document.getElementById('chat-input');

if (sendChatBtn) {
  sendChatBtn.addEventListener('click', sendChatMessage);
}

if (chatInput) {
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

// Show chat section when course is detected and has PDFs
function showChatIfReady() {
  const chatSection = document.getElementById('chat-section');
  if (currentCourseData && chatSection) {
    chatSection.classList.remove('hidden');
    ensureValidGeminiFiles(currentCourseData.courseId);
  }
}
*/
