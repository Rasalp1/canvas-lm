# Canvas RAG Assistant

A Chrome extension that helps you extract PDFs from Canvas courses and chat with your course materials using AI.

## Development Setup

### Prerequisites
- Node.js and npm installed

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

### Building the Extension

The extension uses webpack to bundle Firebase and other dependencies.

**Build for production:**
```bash
npm run build
```

**Build and watch for changes during development:**
```bash
npm run watch
```

This will create a `dist/` folder with the bundled extension.

### Loading the Extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder (not the project root!)
5. The extension will appear in your extensions list

### Project Structure

```
src/                    # Source files (edit these)
├── popup.js           # Popup UI logic
├── background.js      # Background service worker
├── content-script.js  # Content script for Canvas pages
└── firebase-config.js # Firebase initialization

dist/                  # Build output (load this in Chrome)
├── All bundled files

Root files:
├── popup.html         # Popup HTML
├── styles.css         # Popup styles
├── manifest.json      # Extension manifest
└── webpack.config.js  # Build configuration
```

### Important Notes

- Always edit files in the `src/` folder, not in `dist/`
- Run `npm run build` after making changes
- Reload the extension in Chrome after building
- The `dist/` folder is gitignored - it's generated from source