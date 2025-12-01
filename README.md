# Canvas LM 

**AI-Powered Study Assistant for Canvas LMS**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/Rasalp1/canvas-lm)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/chrome-v88%2B-brightgreen.svg)](https://www.google.com/chrome/)

Canvas LM transforms your Canvas course materials into an intelligent, conversational study companion. Automatically extract and index PDFs, lecture notes, and course documents, then ask questions and get instant, accurate answers powered by Google's advanced Gemini AI with RAG (Retrieval-Augmented Generation).

---

## Features

### Intelligent Q&A
Ask questions about your course materials in natural language and receive contextual answers with citations from your actual course documents.

### Automatic PDF Extraction
One-click scanning automatically discovers and indexes all PDF files from your Canvas courses, making them searchable and queryable.

### Conversation History
All your study sessions are saved with full conversation history, allowing you to pick up right where you left off.

### Multi-Course Support
Seamlessly switch between multiple courses. Each course maintains its own document store and conversation threads.

### Privacy & Security
- **Chrome Identity authentication** - No passwords stored
- **Server-side API key** - Never exposed to client
- **Rate limiting** - Prevents abuse and controls costs
- **Enrollment verification** - Only access courses you're enrolled in
- **Encrypted storage** - All data encrypted at rest and in transit

### Smart Features
- **Streaming responses** - See AI answers appear in real-time with typing animation (server-side aggregation ensures complete responses)
- **Re-scanning capability** - Easily update your course store with new documents or retry failed uploads
- **Source citations** - Every answer includes references to source documents
- **Shared course stores** - Collaborate with classmates on the same course materials
- **Enhanced status messages** - Clear, contextual feedback throughout the scanning and upload process
- **Modern UI** - Built with React 19 and Tailwind CSS for a polished experience

---

## Quick Start

### Prerequisites

- **Google Chrome** (version 88 or later)
- **Canvas LMS account** with active courses
- **Google Account** for authentication

### Installation

#### Option 1: Chrome Web Store (Coming Soon)
1. Visit the [Canvas LM page](https://chrome.google.com/webstore) on Chrome Web Store
2. Click "Add to Chrome"
3. Confirm the installation

#### Option 2: Manual Installation (Development)
1. Clone this repository:
   ```bash
   git clone https://github.com/Rasalp1/canvas-lm.git
   cd canvas-lm
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `dist/` folder from the project

### First-Time Setup

1. **Sign In**
   - Click the Canvas LM icon in your Chrome toolbar
   - Click "Sign In with Google"
   - Select your Google account

2. **Navigate to a Canvas Course**
   - Go to any Canvas course page on your institution's Canvas site
   - Canvas LM will automatically detect the course

3. **Scan Course Materials**
   - Click "Scan Course for PDFs"
   - Wait for the scan to complete (typically 10-30 seconds)
   - PDFs are automatically uploaded and indexed

4. **Start Chatting**
   - Type your question in the chat box
   - Press Enter or click Send
   - Watch as AI generates an answer based on your course materials!

---

## Usage Guide

### Scanning Courses

**Automatic Detection:**
Canvas LM automatically detects when you're viewing a Canvas course page and displays course information.

**Initial Scanning:**
1. Navigate to any page within your Canvas course
2. Click the Canvas LM extension icon
3. Click "Scan Course for PDFs"
4. Wait for completion - you'll see progress updates

**Re-scanning for Updates:**
When you need to add new documents or retry failed uploads:
1. Navigate to your Canvas course
2. Click "Scan Course for PDFs" again
3. Canvas LM will automatically detect:
   - New documents added since last scan
   - Previously failed uploads that need retry
4. Only new/failed documents will be uploaded (no duplicates)

**What Gets Scanned:**
- PDF files in the Files section
- Lecture notes and readings
- Assignment attachments
- Module resources

### Asking Questions

**Tips for Great Questions:**
- Be specific: "What topics are covered in Chapter 3?" is better than "What's in the readings?"
- Reference documents: "According to the lecture notes, what is..."
- Ask follow-ups: Canvas LM remembers conversation context

**Example Questions:**
- "Summarize the main concepts from today's lecture"
- "What does the textbook say about photosynthesis?"
- "Give me practice problems similar to Assignment 2"
- "Explain the difference between X and Y from the readings"

### Managing Courses

**Switch Courses:**
- Click the course dropdown in the header
- Select any enrolled course
- Your conversation continues in that course's context

**View All Courses:**
- Click "All Courses" in the sidebar
- See all enrolled courses in a grid
- Click any course card to switch

**View Course Documents:**
- Click the document icon in the header
- See all PDFs indexed for the current course
- View file names, sizes, and upload dates
- Delete documents if needed (admin only)

---

## Architecture

Canvas LM uses a modern, secure architecture:

```

          Chrome Extension (React)           
  • App.jsx - Main UI                        
  • popup-logic.js - Business logic          
  • Firebase SDK - Cloud Functions client    

                   
                   ↓

       Firebase Cloud Functions (Node.js)    
  • Rate limiting & security                 
  • Enrollment verification                  
  • Gemini API proxy                         

                   
         
         ↓                   ↓
  
 Firestore DB        Gemini File Search  
  • User data         • RAG queries      
  • Courses           • Document corpus  
  • Chat history      • Semantic search  
  
```

### Key Technologies

- **Frontend:** React 19, Tailwind CSS, Radix UI
- **Backend:** Firebase Cloud Functions (Node.js)
- **Database:** Cloud Firestore
- **AI:** Google Gemini 2.5 Flash with File Search Tool (RAG)
- **Authentication:** Chrome Identity API (Google OAuth)
- **Build:** Webpack 5, Babel

For detailed architecture information, see [ARCHITECTURE.md](documentation/ARCHITECTURE.md).

---

## Development

### Setup Development Environment

1. **Clone and install:**
   ```bash
   git clone https://github.com/Rasalp1/canvas-lm.git
   cd canvas-lm
   npm install
   ```

2. **Configure Firebase:**
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Firestore Database
   - Enable Cloud Functions
   - Copy your Firebase config to `src/firebase-config.js`

3. **Set up Cloud Functions:**
   ```bash
   cd functions
   npm install
   cp .env.example .env
   # Add your GEMINI_API_KEY to .env
   ```

4. **Deploy Cloud Functions:**
   ```bash
   firebase deploy --only functions
   ```

5. **Build and watch:**
   ```bash
   npm run watch  # Development mode with auto-rebuild
   # OR
   npm run build  # Production build
   ```

### Project Structure

```
canvas-lm/
 src/                          # Frontend source code
    App.jsx                   # Main React component
    popup-logic.js            # Business logic
    firebase-config.js        # Firebase initialization
    firestore-helpers.js      # Database operations
    gemini-file-search-cloud.js  # Cloud Functions client
    content-script.js         # Canvas page scanner
    background.js             # Service worker
    components/               # React UI components

 functions/                    # Backend Cloud Functions
    index.js                  # Cloud Functions code
    .env                      # Environment variables

 documentation/                # Project documentation
 dist/                         # Build output (generated)
 manifest.json                 # Chrome extension manifest
```

### Available Scripts

```bash
npm run build          # Production build
npm run watch          # Development mode with hot reload
firebase deploy        # Deploy Cloud Functions
```

### Important Notes

- Always edit files in the `src/` folder, not in `dist/`
- Run `npm run build` after making changes
- Reload the extension in Chrome after building
- The `dist/` folder is gitignored - it's generated from source

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

For bugs or feature requests, open an issue on [GitHub Issues](https://github.com/Rasalp1/canvas-lm/issues).

---

## Roadmap

### Version 1.1 (Q1 2026)
- [ ] Support for PowerPoint and Word documents
- [ ] Flashcard generation from course materials
- [ ] Export chat history to PDF
- [ ] Dark mode
- [ ] Multi-language support

### Version 1.2 (Q2 2026)
- [ ] Browser extension for Firefox and Edge
- [ ] Integration with other LMS platforms (Blackboard, Moodle)
- [ ] Study notes feature
- [ ] Collaborative study sessions
- [ ] Mobile companion app

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Google Gemini** for providing the powerful AI capabilities
- **Firebase** for the backend infrastructure
- **Instructure Canvas** for the LMS platform
- **React** and **Tailwind CSS** for the modern UI framework

---

## Support & Contact

### Get Help

- **Documentation:** [docs](documentation/)
- **Issues:** [GitHub Issues](https://github.com/Rasalp1/canvas-lm/issues)
- **Email:** ralpsten.gdev@gmail.com

### Links

- **GitHub:** https://github.com/Rasalp1/canvas-lm
- **Privacy Policy:** [PRIVACY_POLICY.md](PRIVACY_POLICY.md)
- **Terms of Service:** [TERMS_OF_SERVICE.md](TERMS_OF_SERVICE.md)

---

## Disclaimer

**Canvas LM is an independent project and is not affiliated with, endorsed by, or sponsored by:**
- Instructure, Inc. or Canvas LMS
- Google LLC or Alphabet Inc. (except for use of their services)
- Any educational institution

**Academic Integrity:**
Canvas LM is designed as a **study aid**, not a cheating tool. Users are responsible for:
- Following their institution's academic honesty policies
- Using AI assistance ethically and transparently
- Not submitting AI-generated content as their own work
- Consulting instructors about acceptable AI use

**Use Responsibly:**
- Verify AI-generated information against original sources
- Use Canvas LM to enhance understanding, not replace learning
- Be aware of your institution's policies on AI-assisted learning

---

**Made with  for students, by students**

*Empowering learning through AI*