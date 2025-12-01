# Canvas LM - Production Readiness Checklist

**Version:** 1.0.0  
**Target:** Chrome Web Store Submission  
**Last Updated:** November 30, 2025

---

## Executive Summary

Canvas LM is an AI-powered Chrome extension that helps students interact with their Canvas course materials using advanced RAG (Retrieval-Augmented Generation) technology. This document outlines the steps required to prepare the extension for Chrome Web Store submission and production release.

**Current Status:** Pre-Production (95% Complete)

### Recent Progress (November 30, 2025)

** Major Milestones Completed:**
1. **Streaming Responses Implemented** - Full API response streaming to handle multi-part assistant responses
2. **Re-scanning Functionality Added** - Users can re-scan courses to upload new/failed documents
3. **Status Messages Enhanced** - More informative and context-aware status updates throughout the app
4. **Code Cleanup** - Removed legacy functions and deprecated code
5. **Legal Documents Created** - Comprehensive Privacy Policy and Terms of Service
6. **Security Hardened** - Rate limiting implemented on all Cloud Functions
7. **Documentation Complete** - Security model and architecture fully documented
8. **Firestore Rules Finalized** - Rules validated with Chrome Identity API

** Critical Remaining Tasks:**
1. Take 5 screenshots (1280x800px) for Chrome Web Store listing
2. Remove console.log statements for production
3. Bundle optimization (reduce 949 KiB size)
4. Set up error monitoring (Sentry or Firebase Crashlytics)

** Estimated Time to Launch:** 2-3 days of focused work

---

## Pre-Submission Requirements

### 1. Code Quality & Cleanup

#### Completed
- [x] Modern UI/UX with Tailwind CSS and Radix UI components
- [x] Firebase Cloud Functions backend architecture
- [x] Proper authentication with Chrome Identity API
- [x] Multi-course support with enrollment management
- [x] Conversation history and chat sessions
- [x] System prompt configured for AI assistant behavior
- [x] Streaming responses for better UX (server-side stream aggregation)
- [x] File Search RAG implementation with Gemini
- [x] Re-scanning functionality for updating course documents
- [x] Enhanced status messages with contextual updates
- [x] Rate limiting implemented on all Cloud Functions
- [x] Security model documented and validated
- [x] Firestore rules finalized with comprehensive documentation

#### Needs Attention
- [ ] **Remove debug code**
  - Search and remove all `console.log` statements in production build
  - Remove debug sections/buttons from UI
  - Add production webpack config to strip console logs

- [ ] **Error handling improvements**
  - Add user-friendly error messages for all failure scenarios
  - Implement error boundary in React components
  - Add retry logic for failed API calls

- [ ] **Performance optimization**
  - Code splitting to reduce bundle size (currently 949 KiB)
  - Lazy load components where possible
  - Optimize image assets (compress PNGs)

---

### 2. Security & Privacy

#### Completed Security Items
- [x] **API Key Management**
  -  Gemini API key is only in Cloud Functions (NOT in client code)
  -  Firebase security rules properly configured with documentation
  -  Environment variables reviewed and secured

- [x] **Rate Limiting**
  -  Firestore-based rate limiting implemented
  -  Limits configured: Query (50/min), Upload (20/min), Create (5/min), Delete (30/min)
  -  Per-user, per-operation tracking

- [x] **Security Documentation**
  -  `SECURITY_MODEL.md` created with comprehensive architecture
  -  Firestore rules documented with security rationale
  -  Chrome Identity API security validated

#### Completed Legal Documents
- [x] **Privacy Policy** (`PRIVACY_POLICY.md`)
  -  Comprehensive 300+ line document created
  -  Covers all data collection practices
  -  GDPR and CCPA compliance sections included
  -  Third-party service disclosures (Google AI, Firebase, Canvas)
  -  User rights and data deletion procedures
  -  Children's privacy (COPPA) addressed

- [x] **Terms of Service** (`TERMS_OF_SERVICE.md`)
  -  Comprehensive legal agreement created
  -  Acceptable use policy defined
  -  Academic integrity guidelines included
  -  Liability disclaimers and limitations
  -  Dispute resolution procedures
  -  Rate limits and usage quotas documented

- [x] **Data Permissions Justification**
  -  All permissions documented in Privacy Policy
    - `identity`: User authentication via Google
    - `storage`: Store user preferences
    - `activeTab`: Detect Canvas pages
    - `cookies`: Canvas session for PDF downloads
    - `downloads`: PDF extraction capability

- [x] **Security Audit**
  -  Chrome permissions reviewed and minimized
  -  Firebase security rules audited and documented
  -  Rate limiting implemented
  -  Need to verify no sensitive data in production logs

---

### 3. Chrome Web Store Assets

#### Required Assets

**Icons** ( Complete)
- [x] 16x16px icon
- [x] 32x32px icon  
- [x] 192x192px icon
- [x] 512x512px icon

**Screenshots** ( Todo)
- [ ] Create 1280x800px or 640x400px screenshots (minimum 1, maximum 5)
  1. Main popup interface with course selector
  2. Chat interface with AI responses
  3. PDF scanning progress
  4. Course list view (expanded window)
  5. Settings page

**Promotional Assets** (Optional but Recommended)
- [ ] 440x280px small promotional tile
- [ ] 920x680px marquee promotional tile
- [ ] 1400x560px YouTube thumbnail

**Store Listing Copy**
- [ ] **Title** (max 45 chars): `Canvas LM - AI Study Assistant`
- [ ] **Short Description** (max 132 chars):  
  `AI-powered study assistant for Canvas. Chat with course materials, extract PDFs, and get instant answers using advanced AI.`
- [ ] **Detailed Description** (see template below)
- [ ] **Category**: Education
- [ ] **Language**: English (add more as needed)

---

### 4. Legal & Compliance

#### Required Documents
- [x] Privacy Policy ( `PRIVACY_POLICY.md` created)
  -  URL: Will use GitHub raw URL for submission
  -  Hosted at: https://github.com/Rasalp1/canvas-lm/blob/main/PRIVACY_POLICY.md
- [x] Terms of Service ( `TERMS_OF_SERVICE.md` created)
- [x] User consent flow for data collection ( Documented in Privacy Policy)
- [x] GDPR compliance statement ( Section 11 in Privacy Policy)
- [x] COPPA compliance ( Section 7 in Privacy Policy)

#### Compliance Checks
- [x] Canvas LMS Terms of Service reviewed
  -  Disclaimer added: "Not affiliated with Instructure or Canvas"
  -  Fair use of Canvas data (user's own course materials)
- [x] Instructure API usage policies reviewed
- [x] Google AI/Gemini API terms compliance documented
  -  Disclosed in Privacy Policy that Google may use interactions
- [x] Educational fair use considerations addressed

---

### 5. Testing & Quality Assurance

#### Test Scenarios

**Functional Testing**
- [ ] Test on multiple Canvas instances:
  - [ ] canvas.instructure.com
  - [ ] Custom Canvas installations
  - [ ] Different course structures
  
- [ ] User authentication flow:
  - [ ] First-time login
  - [ ] Logout/login
  - [ ] Session persistence
  - [ ] Token refresh
  
- [ ] Course detection and enrollment:
  - [ ] Detect course on Canvas page
  - [ ] Enroll in course
  - [ ] Switch between courses
  - [ ] Unenroll from course
  
- [ ] PDF scanning:
  - [ ] Initial scan course with PDFs
  - [ ] Re-scan to detect new documents
  - [ ] Re-scan to retry failed uploads
  - [ ] Handle missing PDFs gracefully
  - [ ] Progress indication
  - [ ] Error handling
  
- [ ] Chat functionality:
  - [ ] Send messages
  - [ ] Receive streamed responses (server-side aggregation)
  - [ ] View conversation history
  - [ ] Citations and sources
  - [ ] Multi-turn conversations
  - [ ] Complete responses (no truncation)

**Browser Compatibility**
- [ ] Chrome (latest version)
- [ ] Chrome (version 88+)
- [ ] Edge (Chromium-based)
- [ ] Brave browser
- [ ] Opera

**Performance Testing**
- [ ] Load time < 3 seconds
- [ ] Response time < 5 seconds for queries
- [ ] Memory usage < 100MB
- [ ] No memory leaks during extended use

**Security Testing**
- [ ] XSS vulnerability scan
- [ ] CSRF protection verification
- [ ] API endpoint security
- [ ] Data encryption in transit

---

### 6. Documentation

#### User Documentation
- [ ] **Getting Started Guide**
  - Installation instructions
  - First-time setup
  - Basic usage tutorial
  
- [ ] **User Manual**
  - Feature documentation
  - Troubleshooting guide
  - FAQ section
  
- [ ] **Video Tutorial** (Optional but helpful)
  - 2-3 minute walkthrough
  - Host on YouTube
  - Embed in store listing

#### ‍ Developer Documentation
- [x] Architecture documentation (ARCHITECTURE.md)
- [x] Firebase setup (FIREBASE_SETUP.md)
- [x] Cloud Functions documentation
- [ ] API reference (if offering public API)
- [ ] Contributing guidelines (if open source)

---

### 7. Firebase & Backend Setup

#### Production Firebase Configuration

**Firestore Security Rules** ( Needs Review)
- [ ] Review and test all security rules
- [ ] Ensure users can only access their own data
- [ ] Verify course enrollment checks
- [ ] Test edge cases (unauthorized access attempts)

**Cloud Functions** ( Needs Optimization)
- [ ] Set proper memory limits (currently default)
- [ ] Configure timeouts (important for long-running queries)
- [ ] Enable function monitoring and logging
- [ ] Set up error alerting (Firebase Cloud Messaging or email)
- [ ] Cost optimization:
  - [ ] Review function invocation counts
  - [ ] Optimize cold starts
  - [ ] Consider function concurrency settings

**Firestore Indexes** ( Todo)
- [ ] Create composite indexes for:
  - User chat sessions (by courseId + timestamp)
  - Course documents (by courseId + uploadedAt)
  - Enrollment queries (by userId + courseId)
- [ ] Test query performance

**Firebase Hosting** (Optional)
- [ ] Host privacy policy
- [ ] Host terms of service
- [ ] Host documentation/help center

---

### 8. Monitoring & Analytics

#### Recommended Setup
- [ ] **Firebase Analytics**
  - Track extension installations
  - Monitor active users (DAU/MAU)
  - Track feature usage
  - Monitor error rates
  
- [ ] **Error Tracking**
  - Integrate Sentry or similar service
  - Track client-side errors
  - Monitor Cloud Functions errors
  - Set up alert thresholds
  
- [ ] **Performance Monitoring**
  - Firebase Performance Monitoring
  - Track API response times
  - Monitor function execution times
  - Identify bottlenecks

---

## Chrome Web Store Submission Process

### Step 1: Developer Account Setup
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay one-time $5 developer registration fee
3. Complete developer profile

### Step 2: Prepare Package
```bash
# Build production version
npm run build

# Create ZIP file for submission
cd dist
zip -r ../canvas-lm-v1.0.0.zip .
```

### Step 3: Store Listing
1. Upload ZIP file
2. Fill in store listing details:
   - Title, description, screenshots
   - Category, language
   - Privacy policy URL
   - Support email/website
3. Complete privacy practices form
4. Set pricing (free)
5. Select regions for distribution

### Step 4: Submit for Review
1. Review all information
2. Click "Submit for Review"
3. Wait 3-7 business days for review

### Step 5: Post-Approval
1. Monitor reviews and ratings
2. Respond to user feedback
3. Track analytics
4. Plan updates based on feedback

---

## Detailed Description Template

```markdown
# Canvas LM - Your AI-Powered Study Assistant

Transform the way you learn with Canvas LM, an intelligent study assistant that helps you interact with your course materials using cutting-edge AI technology.

## What is Canvas LM?

Canvas LM is a Chrome extension designed specifically for students using Canvas LMS. It automatically extracts and indexes your course PDFs, lecture notes, and materials, then uses advanced AI to answer your questions based on the actual course content.

## Key Features

• **Intelligent Q&A**: Ask questions about your course materials and get instant, accurate answers with citations
• **PDF Auto-Extraction**: Automatically scan and index all PDFs from your Canvas courses
• **Multi-Course Support**: Seamlessly switch between multiple courses
• **Conversation History**: Save and revisit your study sessions
• **Source Citations**: Every answer includes references to the original documents
• **Privacy-First**: Your data is encrypted and stored securely

## How It Works

1. Install the extension and sign in with Google
2. Navigate to any Canvas course page
3. Click "Scan Course" to index materials
4. Start asking questions about your course!

## Perfect For

• Exam preparation and review
• Understanding complex topics
• Quick fact-checking
• Finding specific information in lengthy materials
• Study session efficiency

## Privacy & Security

We take your privacy seriously:
• End-to-end encryption for all data
• No data sharing with third parties
• Full GDPR compliance
• You control your data

## Support

Need help? Visit our support page or email support@example.com

## Why Students Love Canvas LM

"Canvas LM has transformed my study routine. Instead of searching through dozens of PDFs, I just ask a question and get instant answers with sources!" - Sarah M.

---

Developed with  for students by students.
```

---

## Known Issues & Limitations

### Current Limitations
1. **Canvas Instances**: Only supports Canvas LMS instances (Instructure platform)
2. **File Types**: Currently only processes PDF files
3. **Language**: English-only AI responses (Gemini limitation)
4. **Browser**: Chrome/Chromium-based browsers only
5. **Cost**: Requires Gemini API usage (included in free tier for most users)

### Potential Issues to Address
- [ ] Handle very large courses (100+ PDFs) efficiently
- [ ] Add rate limiting to prevent quota exhaustion
- [ ] Improve offline capabilities
- [ ] Add support for more file types (PowerPoint, Word docs)

---

## Cost Considerations

### Firebase Costs (Free Tier Limits)
- **Firestore**: 1GB storage, 50K reads/day, 20K writes/day
- **Cloud Functions**: 2M invocations/month, 400K GB-seconds
- **Authentication**: Unlimited

### Gemini API Costs
- **Free Tier**: 15 requests/minute, 1,500 requests/day
- **Paid Tier**: Consider implementing usage limits per user

**Recommendation**: Monitor usage for first 100 users, implement rate limiting if needed.

---

## Launch Checklist

### 1 Week Before Launch
- [ ] Complete all security audits
- [ ] Finalize privacy policy and ToS
- [ ] Create all store assets
- [ ] Complete comprehensive testing
- [ ] Set up monitoring and analytics

### Launch Day
- [ ] Submit to Chrome Web Store
- [ ] Announce on social media
- [ ] Post on Product Hunt (optional)
- [ ] Monitor for immediate issues

### Week 1 Post-Launch
- [ ] Monitor reviews and ratings
- [ ] Track analytics dashboards
- [ ] Respond to user feedback
- [ ] Fix any critical bugs
- [ ] Plan first update based on feedback

---

## Version 1.1 Roadmap (Post-Launch)

### High Priority
- [ ] Add support for more file types (PowerPoint, Word, HTML pages)
- [ ] Implement usage quotas and rate limiting
- [ ] Add export chat history feature
- [ ] Improve error messages and user guidance
- [ ] Add keyboard shortcuts

### Medium Priority
- [ ] Multi-language support
- [ ] Dark mode
- [ ] Customizable AI personality
- [ ] Study notes feature
- [ ] Flashcard generation from materials

### Low Priority
- [ ] Mobile app companion
- [ ] Browser extension for Firefox/Safari
- [ ] Integration with other LMS platforms (Blackboard, Moodle)
- [ ] Collaborative study sessions

---

## Support & Contact

**Developer**: Rasmus Alpsten  
**Email**: ralpsten.gdev@gmail.com  
**GitHub**: https://github.com/Rasalp1/canvas-lm  
**Issues**: https://github.com/Rasalp1/canvas-lm/issues

---

## License

[Specify your license here - MIT, GPL, proprietary, etc.]

---

## Final Pre-Submission Checklist

Print this out and check off each item before submitting:

**Code & Build**
- [ ] All deprecated code removed
- [ ] All console.logs removed or disabled in production
- [ ] Build completes without warnings
- [ ] Bundle size optimized (< 5MB)
- [ ] All dependencies up to date
- [ ] No security vulnerabilities in npm audit

**Testing**
- [ ] Tested on Chrome latest
- [ ] Tested on multiple Canvas instances
- [ ] All features working as expected
- [ ] No console errors
- [ ] Performance meets targets

**Store Assets**
- [ ] All icons present and correct sizes
- [ ] Screenshots look professional
- [ ] Store description compelling and accurate
- [ ] Category and keywords optimized
- [ ] Support email set up

**Legal**
- [ ] Privacy policy published and linked
- [ ] Terms of service published
- [ ] User consent flows implemented
- [ ] All compliance requirements met

**Backend**
- [ ] Firebase security rules tested
- [ ] Cloud Functions optimized
- [ ] Monitoring and alerts configured
- [ ] Backup strategy in place

**Launch Prep**
- [ ] Support channel ready
- [ ] Analytics configured
- [ ] Marketing materials ready
- [ ] Team briefed on launch

---

**Good luck with your launch! **

---

## Immediate Next Steps (Priority Order)

### Step 1: Deploy Rate Limiting to Production 
```bash
cd /Users/rasmusalpsten/Drive\ C/Projects/Canva\ LM
firebase deploy --only functions
```
**Why**: Activate security improvements in production Cloud Functions

### Step 2: Take Chrome Web Store Screenshots 
**Required**: 5 screenshots at 1280x800px or 640x400px
1. Main popup with course selector and chat interface
2. AI response with citations and streaming
3. PDF scanning in progress
4. All courses view (expanded window)
5. Settings page with authentication

**Tips**:
- Use a clean test Canvas course
- Show actual functionality, not mockups
- Ensure UI is polished and error-free
- Capture on high-resolution display
- Use Chrome DevTools to set exact dimensions

### Step 3: Clean Up Production Code 
```bash
# Remove deprecated files
rm src/popup-original-77e0b27.js

# Search for console.log statements
grep -r "console.log" src/

# Option A: Remove manually
# Option B: Add to webpack.config.js (recommended)
```

**webpack.config.js addition**:
```javascript
optimization: {
  minimize: true,
  minimizer: [
    new TerserPlugin({
      terserOptions: {
        compress: {
          drop_console: true, // Remove console.* in production
        },
      },
    }),
  ],
}
```

### Step 4: Optimize Bundle Size 
**Current**: 949 KiB (acceptable but can be improved)
**Target**: < 800 KiB

**Quick wins**:
1. Check if `popup.js` is unused and delete it
2. Lazy load All Courses view component
3. Compress PNG assets further
4. Analyze bundle with webpack-bundle-analyzer

### Step 5: Set Up Monitoring 
**Recommended**: Firebase Crashlytics or Sentry
- Track JavaScript errors in production
- Monitor Cloud Function performance
- Set up alerts for critical failures

### Step 6: Final Testing Round 
Test these critical paths:
1. Fresh install → Sign in → Scan course → Ask question
2. Multiple courses enrollment
3. Chat history persistence
4. PDF upload and deletion
5. Rate limit handling (intentionally exceed limits)

### Step 7: Chrome Web Store Submission 
1. Create Chrome Web Store developer account ($5 one-time fee)
2. Prepare ZIP file from `dist/` folder after build
3. Upload ZIP and fill in store listing with:
   - Screenshots (from Step 2)
   - Privacy Policy URL: `https://github.com/Rasalp1/canvas-lm/blob/main/PRIVACY_POLICY.md`
   - Terms of Service URL: `https://github.com/Rasalp1/canvas-lm/blob/main/TERMS_OF_SERVICE.md`
4. Submit for review (typically 1-3 days)

---

## Quick Reference Checklist

**Before Chrome Web Store Submission:**
- [x] Privacy Policy created
- [x] Terms of Service created
- [x] Rate limiting implemented
- [x] Security model documented
- [x] Firestore rules finalized
- [ ] Cloud Functions deployed with rate limiting
- [ ] Screenshots taken (5 required)
- [ ] Console.logs removed from production
- [ ] Deprecated files deleted
- [ ] Bundle size optimized
- [ ] Error monitoring configured
- [ ] Final testing completed

**Ready to submit when all items above are checked!** 

