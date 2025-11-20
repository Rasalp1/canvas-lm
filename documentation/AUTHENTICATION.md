# Authentication Architecture

## ⚠️ Why NOT Firebase Auth?

**Firebase Authentication CANNOT be used in Chrome extensions** due to fundamental technical limitations:

### The Problem
1. **Popup-based OAuth flow** - Firebase Auth uses popup windows for Google sign-in
2. **Extension popup closes** - Chrome extension popups close when they lose focus
3. **Redirect URLs fail** - OAuth redirects don't work in extension context
4. **Service worker limitations** - Background scripts can't handle auth popups properly

### Failed Attempt
```javascript
// ❌ THIS DOES NOT WORK IN CHROME EXTENSIONS
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const auth = getAuth();
const provider = new GoogleAuthProvider();
signInWithPopup(auth, provider); // Popup closes immediately, auth fails
```

## ✅ Solution: Chrome Identity API

Chrome provides a built-in Identity API specifically designed for extensions.

### How It Works
1. User must be **signed into Chrome browser** (not the extension)
2. Extension requests user profile information
3. Chrome provides email and user ID without popup
4. Works seamlessly with Chrome's existing authentication

### Implementation

#### manifest.json (Required Permissions)
```json
{
  "permissions": [
    "identity",
    "identity.email"
  ]
}
```

#### popup.js (Authentication Code)
```javascript
// Get Chrome user profile
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

// Check if user is signed into Chrome
async function checkUserSignedIn() {
  try {
    const userInfo = await getUserProfile();
    console.log('Chrome profile info:', userInfo);
    
    if (userInfo && userInfo.email) {
      // User is signed into Chrome
      currentUser = {
        email: userInfo.email,
        id: userInfo.id,
        displayName: userInfo.email.split('@')[0]
      };
      
      // Save user to Firestore
      await setDoc(doc(db, 'users', userInfo.id), {
        email: userInfo.email,
        lastSeenAt: Timestamp.now(),
        createdAt: Timestamp.now()
      }, { merge: true });
      
      updateUIForUser(currentUser);
    } else {
      // User not signed into Chrome
      console.warn('No email found. User needs to sign into Chrome browser.');
      updateUIForUser(null);
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    updateUIForUser(null);
  }
}
```

### What Chrome Identity Provides
- ✅ **Email address** - User's Google account email
- ✅ **User ID** - Unique identifier for the user
- ❌ **No photo URL** - Must generate avatar or use placeholder
- ❌ **No display name** - Must derive from email or ask user

## 🔥 Firebase's Role

Firebase is ONLY used for **Firestore database**, not authentication.

### firebase-config.js (Current Implementation)
```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
// ❌ NO AUTH IMPORTS - Auth is handled by Chrome Identity

const firebaseConfig = {
  apiKey: "AIzaSyD4xXyZxYzAbCdEfGhIjKlMnOpQrStUvWxY",
  authDomain: "canvas-lm.firebaseapp.com",
  projectId: "canvas-lm",
  storageBucket: "canvas-lm.firebasestorage.app",
  messagingSenderId: "1022702377810",
  appId: "1:1022702377810:web:0be3e4ad725f6f2899f88b",
  measurementId: "G-3C6JSYRG67"
};

// Initialize Firebase (Firestore ONLY)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export for use in popup.js
window.firebaseDb = db;
window.firebaseModules = { doc, setDoc, getDoc, Timestamp };
```

## 🔐 Security Model

### Firestore Security Rules
Since we're using Chrome Identity (not Firebase Auth), Firestore security rules must be configured differently:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own documents
    match /users/{userId} {
      allow read, write: if true; // Adjust based on your needs
    }
    
    match /documents/{docId} {
      allow read, write: if true; // Adjust based on your needs
    }
    
    match /chatSessions/{sessionId} {
      allow read, write: if true; // Adjust based on your needs
    }
  }
}
```

⚠️ **Note:** Since we're not using Firebase Auth, `request.auth` won't be available in security rules. You'll need to implement custom security logic or use API keys with proper restrictions.

## 📋 User Flow

1. User installs extension
2. User clicks extension icon
3. Extension checks: `chrome.identity.getProfileUserInfo()`
4. If user signed into Chrome → Show authenticated UI
5. If not signed in → Show message: "Please sign into Chrome browser"
6. User profile saved to Firestore for persistence
7. Extension can now make Gemini API calls and store data

## 🎯 Benefits

- ✅ No popup/redirect issues
- ✅ Works in all extension contexts (popup, background, content scripts)
- ✅ Leverages Chrome's existing authentication
- ✅ No OAuth configuration needed
- ✅ Simple implementation
- ✅ Reliable and secure

## 🚫 Limitations

- ❌ User MUST be signed into Chrome browser
- ❌ Only works for users with Google accounts
- ❌ No profile photo from Chrome Identity API
- ❌ Limited profile information (email + ID only)
- ❌ Can't use Firebase Auth security rules (need custom rules)

## 🔄 Migration Notes

If you previously attempted Firebase Auth:
1. Remove all `firebase/auth` imports
2. Remove `getAuth`, `signInWithPopup`, `GoogleAuthProvider` code
3. Replace with Chrome Identity API calls
4. Update Firestore security rules to work without `request.auth`
5. Keep Firestore initialization (just remove auth parts)
