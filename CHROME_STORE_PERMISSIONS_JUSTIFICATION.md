Chrome Web Store - Permissions Justification

Extension Name: Canvs LM
Version: 1.1.0
Developer: Rasmus Alpsten

This document provides detailed justifications for all permissions requested by Canvs LM Chrome Extension, as required by Chrome Web Store's privacy practices requirements.

================================================================================

Single Purpose Statement

Canvs LM helps students study by letting them chat with an AI about their Canvas course materials.

Detailed Explanation: Canvs LM is an AI-powered study assistant for Canvas Learning Management System that helps students understand course materials by enabling them to chat with an AI assistant that has access to their course PDFs and documents.

================================================================================

Permission Justifications

1. activeTab

Purpose: Access the currently active Canvas course page to detect which course the student is viewing.

Justification:
- Required to automatically detect when a user is viewing a Canvas course page
- Enables context-aware features by identifying the current course ID from the URL
- Allows the extension to scan the current page for downloadable PDFs and course materials
- Only accesses the tab when the user actively interacts with the extension popup
- Does not access tabs in the background or tabs unrelated to Canvas

User Benefit: Provides seamless course detection without requiring manual course selection.

--------------------------------------------------------------------------------

2. scripting

Purpose: Inject content scripts into Canvas pages to extract course information and PDF links.

Justification:
- Required to scan Canvas course pages for PDF documents and course materials
- Enables the "Scan for PDFs" feature that automatically finds downloadable course content
- Injects code only into Canvas domain pages (*.instructure.com, canvas.education.lu.se, etc.)
- Script injection happens only when user explicitly clicks "Scan for PDFs" button
- No remote code is executed; all scripts are bundled with the extension

User Benefit: Automates the process of finding and downloading course PDFs, saving students time.

--------------------------------------------------------------------------------

3. storage

Purpose: Store user preferences, course enrollments, and cached course information locally.

Justification:
- Saves user settings (e.g., preferred course colors, UI preferences)
- Caches course enrollment information to improve performance
- Stores temporary session data for the AI assistant
- All data stored is user-specific and remains on their device
- No sensitive data is stored; only course IDs and user preferences

User Benefit: Provides a faster, personalized experience with persistent settings across browser sessions.

--------------------------------------------------------------------------------

4. tabs

Purpose: Query open tabs to detect Canvas pages and manage PDF downloads.

Justification:
- Required to identify which tabs contain Canvas course pages
- Enables the extension to open PDF downloads in new tabs when requested by the user
- Used to check if user has Canvas pages open for better context awareness
- Does not read tab content without permission
- Only queries tabs; does not modify tab behavior without user action

User Benefit: Improves user experience by automatically detecting Canvas context and managing document downloads.

--------------------------------------------------------------------------------

5. identity

Purpose: Authenticate users with Google Sign-In for Firebase.

Justification:
- Required for secure user authentication via Chrome's Identity API
- Enables users to sign in with their Google account
- Provides OAuth2 tokens for Firebase Authentication
- No credentials are stored by the extension
- Authentication is required to access personalized course data and AI assistant features

User Benefit: Secure, passwordless authentication using existing Google account.

--------------------------------------------------------------------------------

6. identity.email

Purpose: Retrieve user's email address for account identification and management.

Justification:
- Required to uniquely identify users in the Firebase database
- Email is used as the primary identifier for user profiles
- Enables account-specific features like course enrollments and chat history
- Email is stored securely in Firebase Firestore
- Necessary for account recovery and support requests

User Benefit: Provides personalized experience and enables account management features.

--------------------------------------------------------------------------------

7. downloads

Purpose: Download PDF files from Canvas courses when user scans for course materials.

Justification:
- Required to automatically download PDFs found during course scanning
- Downloads occur only when user explicitly clicks "Scan for PDFs"
- PDFs are uploaded to Google Cloud for AI processing
- Downloads are temporary and managed by the extension
- Enables core functionality of extracting course materials for AI assistant

User Benefit: Automates PDF extraction from Canvas, eliminating manual download and upload steps.

--------------------------------------------------------------------------------

8. cookies

Purpose: Access Canvas session cookies to authenticate PDF download requests.

Justification:
- Required to download PDFs from Canvas on behalf of the authenticated user
- Canvas requires valid session cookies to authorize PDF downloads
- Cookies are accessed only during PDF scanning operations
- Cookies are used temporarily and never stored permanently
- Cookies are never shared with third parties
- Limited to Canvas domains only (*.instructure.com, canvas.education.lu.se, etc.)

User Benefit: Enables seamless PDF downloads without requiring users to manually download and re-upload files.

================================================================================

Host Permissions Justification

What are Host Permissions: Host permissions are matching patterns specified in the "host_permissions" and "content_scripts" fields of the extension's manifest. They define which websites the extension can access.

Canvas Domains

Hosts:
- *://*.instructure.com/*
- *://canvas.education.lu.se/*
- *://*.canvas.com/*
- *://*.canvaslms.com/*

Purpose: Access Canvas Learning Management System pages to extract course information and PDFs.

Justification:
- Required to detect course pages and scan for course materials
- Content scripts need to run on Canvas domains to extract course data
- Enables automatic course detection when viewing Canvas pages
- Limited to Canvas-related domains only
- These are the standard domains used by Canvas LMS installations worldwide
- Extension does not function without access to Canvas pages
- No access to non-Canvas websites

--------------------------------------------------------------------------------

Google/Firebase APIs

Hosts:
- https://*.googleapis.com/*
- https://*.firebaseapp.com/*
- https://*.cloudfunctions.net/*

Purpose: Communicate with Firebase backend services and Google AI API.

Justification:
- Required for user authentication via Firebase Auth
- Enables data storage in Firebase Firestore
- Allows AI processing through Google Gemini API via Cloud Functions
- All communication is encrypted via HTTPS
- Necessary for core AI assistant functionality

================================================================================

Remote Code Declaration

Status: No remote code is used.

Explanation:
- All JavaScript code is bundled with the extension package
- No external scripts are loaded at runtime
- All API calls are data requests, not code execution
- Content scripts are statically defined in manifest.json
- Extension uses only code included in the Chrome Web Store submission

================================================================================

Data Usage Certification

Data Collection

We collect:
- Google account email and profile information (for authentication)
- Canvas course IDs and names (for course management)
- PDF documents uploaded by users (for AI processing)
- Chat conversation history (for continuity)
- Usage statistics (for improvement)

Data Usage

- Primary Use: Provide AI-powered study assistance for Canvas courses
- Storage: All data stored securely in Google Cloud (Firebase) in EU region
- Sharing: Data shared only with Google AI (Gemini) for processing user questions
- Retention: Data retained until user requests deletion
- Sales: We do NOT sell user data to third parties

Compliance

- Privacy Policy: https://github.com/Rasalp1/canvas-lm/blob/main/PRIVACY_POLICY.md
- Terms of Service: https://github.com/Rasalp1/canvas-lm/blob/main/TERMS_OF_SERVICE.md
- GDPR Compliant: Data stored in EU, user rights respected
- CCPA Compliant: No data sales, deletion rights honored

User Control

Users can:
- Delete their account and all associated data
- Export their conversation history
- Unenroll from courses
- Clear chat history at any time
- Revoke extension permissions through Chrome settings

================================================================================

Security Measures

1. Encryption: All data transmission uses HTTPS/TLS
2. Authentication: Secure OAuth2 via Chrome Identity API
3. Access Control: Firestore security rules restrict data access
4. Rate Limiting: Cloud Functions implement rate limiting to prevent abuse
5. No API Keys in Extension: All sensitive keys stored server-side only
6. Minimal Permissions: Only request permissions essential for core functionality

================================================================================

User Privacy Protection

1. Transparency: Clear privacy policy explaining all data usage
2. Consent: Users must sign in and explicitly grant permissions
3. Minimal Collection: Only collect data necessary for core features
4. No Tracking: No analytics or tracking beyond essential functionality
5. User Control: Users can delete data at any time
6. No Ads: Extension contains no advertisements or third-party trackers

================================================================================

Contact Information

Developer Email: ralpsten.gdev@gmail.com
GitHub Repository: https://github.com/Rasalp1/canvas-lm
Support: https://github.com/Rasalp1/canvas-lm/issues

For privacy concerns or data deletion requests, contact: ralpsten.gdev@gmail.com

================================================================================

Last Updated: December 3, 2025

Declaration: I certify that this extension complies with the Chrome Web Store Developer Program Policies and that all information provided is accurate and complete.
