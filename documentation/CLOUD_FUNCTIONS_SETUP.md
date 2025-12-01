# Firebase Cloud Functions Setup Guide

## Overview
Your Chrome extension now uses Firebase Cloud Functions to securely proxy Gemini API requests. Your API key stays safe on the server and is never exposed to users.

## Prerequisites
- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase project: `canvas-lm` (already configured)
- Gemini API key from https://aistudio.google.com/app/apikey

---

## Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

Login to Firebase:
```bash
firebase login
```

---

## Step 2: Initialize Firebase Functions

From your project root:

```bash
# Initialize Firebase (if not already done)
firebase init

# Select:
# - Functions (use arrow keys to select)
# - Use existing project: canvas-lm
# - JavaScript
# - Do you want to use ESLint? No
# - Install dependencies? Yes
```

**Important:** This should detect the existing `functions/` directory.

---

## Step 3: Install Cloud Functions Dependencies

```bash
cd functions
npm install
cd ..
```

---

## Step 4: Set Your Gemini API Key

Create a `.env` file in the `functions/` directory:

```bash
cd functions
cp .env.example .env
```

Then edit `.env` and add your actual Gemini API key:

```bash
GEMINI_API_KEY=AIza...your-actual-key-here
```

**Important:** The `.env` file is already in `.gitignore` so your key won't be committed to Git.

---

## Step 5: Test Locally (Optional)

Start the Firebase emulator:

```bash
firebase emulators:start --only functions
```

This runs your functions locally at:
- `http://localhost:5001/canvas-lm/us-central1/uploadPDF`
- `http://localhost:5001/canvas-lm/us-central1/chatWithContext`

---

## Step 6: Deploy to Firebase

Deploy all functions:

```bash
firebase deploy --only functions
```

This will output URLs like:
```
  functions[uploadPDF(us-central1)] https://us-central1-canvas-lm.cloudfunctions.net/uploadPDF
  functions[chatWithContext(us-central1)] https://us-central1-canvas-lm.cloudfunctions.net/chatWithContext
```

**Important:** These URLs are automatically handled by the Firebase SDK in your extension - you don't need to configure them!

---

## Step 7: Update Extension Code

### Remove Old Settings Page (Optional)

Since users no longer need to provide API keys, you can:

1. Remove the API key input from `settings.html`
2. Or keep it for other settings in the future

### Use the New Client

Replace `GeminiRAGManager` with `GeminiCloudClient` in your code:

**Before:**
```javascript
import { GeminiRAGManager } from './gemini-rag.js';
const gemini = new GeminiRAGManager(apiKey);
```

**After:**
```javascript
import GeminiCloudClient from './gemini-cloud-functions.js';
const gemini = new GeminiCloudClient(window.firebaseApp);
```

The API is exactly the same:
```javascript
// Upload PDF
const file = await gemini.uploadPDF(pdfBlob, 'lecture-1.pdf');

// Chat with context
const answer = await gemini.chatWithContext(
  "What is covered in chapter 3?",
  [fileUri1, fileUri2]
);
```

---

## Step 8: Rebuild and Test

```bash
npm run build
```

Then load the extension in Chrome and test!

---

## Security Benefits

 **API Key Never Exposed** - Users can't extract it from extension code  
 **Rate Limiting** - Add limits in Cloud Functions if needed  
 **Usage Tracking** - Monitor requests via Firebase Console  
 **Easy Updates** - Change API key without updating extension  

---

## Monitoring

View logs and usage:
```bash
firebase functions:log
```

Or in Firebase Console:
- https://console.firebase.google.com/project/canvas-lm/functions

---

## Pricing

Firebase Cloud Functions:
- **Free Tier:** 2 million invocations/month
- After that: $0.40 per million invocations

Gemini API:
- Check current pricing at https://ai.google.dev/pricing

---

## Troubleshooting

### Functions not deploying?
```bash
# Check Firebase project
firebase projects:list

# Use correct project
firebase use canvas-lm
```

### API key not working?
```bash
# Check if .env file exists
ls functions/.env

# Verify the key is set correctly
cat functions/.env

# Make sure you deployed after adding the key
firebase deploy --only functions
```

### Extension can't call functions?
- Check `manifest.json` includes `https://*.cloudfunctions.net/*`
- Verify Firebase config in `firebase-config.js` is correct
- Check browser console for CORS errors

---

## Available Cloud Functions

| Function | Purpose |
|----------|---------|
| `uploadPDF` | Upload PDF to Gemini File API |
| `chatWithContext` | Ask questions with file context |
| `listFiles` | List all uploaded files |
| `deleteFile` | Delete a file from Gemini |
| `getFile` | Get file metadata |

---

## You're Done!

Your extension now uses secure server-side API calls. Users can use it without providing their own API key!
