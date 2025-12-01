## Chrome Extension Development Workflow

### 1. **Development Process**
- Write code in VS Code (HTML, CSS, JS files)
- Load extension in Chrome for testing
- Use Chrome DevTools for debugging
- Iterate and reload extension

### 2. **Loading Extension in Chrome**
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select your project folder
5. Extension appears in Chrome toolbar

### 3. **Seeing the UI During Development**

#### **Popup UI (what users click on):**
- Click the extension icon in Chrome toolbar
- Popup opens showing your popup.html
- Right-click popup → "Inspect" to open DevTools

#### **Content Scripts (injected into web pages):**
- Navigate to a Canvas page
- Open DevTools (F12)
- Your content script runs on the page
- Console logs appear in page's DevTools

### 4. **Development Tips**

#### **Hot Reloading:**
```javascript
// Add to your background.js for auto-reload
chrome.management.getSelf((info) => {
  if (info.installType === 'development') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.reload(tabs[0].id);
    });
  }
});
```

#### **VS Code Extensions for Chrome Development:**
- **Chrome Extension Developer Tools** - snippets and templates
- **Live Server** - for testing HTML/CSS components separately
- **Thunder Client** - for testing API calls

### 5. **Debugging Different Parts**

#### **Popup Debugging:**
- Right-click extension icon → Inspect popup
- Full DevTools available (console, network, elements)

#### **Background Script Debugging:**
- Go to `chrome://extensions/`
- Find your extension → click "background page" or "service worker"
- Opens DevTools for background script

#### **Content Script Debugging:**
- Open any Canvas page
- F12 → Console tab
- Your content script logs appear here

### 6. **UI Preview Workflow**

While you can't preview in VS Code, you can:

#### **Component Development:**
```html
<!-- Create test-popup.html for styling -->
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Copy your popup.html content here -->
  <!-- Open this file directly in browser for CSS work -->
</body>
</html>
```

#### **Live Development Setup:**
1. **VS Code** - Edit files
2. **Chrome Extensions page** - Reload extension (click refresh icon)
3. **Test immediately** - Click extension icon to see changes

### 7. **Rapid Development Cycle**

```bash
# Typical workflow:
1. Edit files in VS Code
2. Ctrl+R in chrome://extensions/ (reload extension)
3. Click extension icon to test
4. F12 to debug
5. Repeat
```

### 8. **Advanced: Extension Reloader**

You can add an auto-reload script:

```javascript
// reload-extension.js (run in background)
if (process.env.NODE_ENV === 'development') {
  const ws = new WebSocket('ws://localhost:8080');
  ws.onmessage = () => chrome.runtime.reload();
}
```

## Best Practice Setup

1. **Keep Chrome DevTools open** while developing
2. **Use Live Server** for HTML/CSS iteration
3. **Test frequently** - reload extension after each change
4. **Console.log everything** during development
5. **Use Chrome's extension examples** as reference

The key is that Chrome becomes your "preview environment" - it's actually quite fast once you get used to the reload cycle!