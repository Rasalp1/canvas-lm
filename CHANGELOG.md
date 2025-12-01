# Changelog

All notable changes to Canvas LM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-12-01

### Added
- **Lecture Context Detection**: AI automatically detects which lecture, module, or week you're viewing in Canvas and uses this context to provide more relevant answers
- **Usage Limiting System**: Implemented fair usage limits (20 messages per 3-hour rolling window) for free tier users
- **User Tier System**: Three-tier user management system:
  - Free tier: 20 messages per 3 hours with all standard features
  - Premium tier: Unlimited messages with priority support (payment integration coming soon)
  - Admin tier: Full system access for instructors and administrators
- **Usage Tracking Display**: New UI component showing:
  - Current message count (e.g., "13 / 20")
  - Progress bar visualization
  - Countdown timer showing when next message becomes available
  - Admin/Premium badge for unlimited users
- **Database-Driven Tier Management**: User tiers stored in Firestore, no hardcoded admin lists
- **Usage Limiting Cloud Functions**:
  - `checkUsageLimit`: Validates user quota before sending messages
  - `recordMessageUsage`: Tracks message usage for free tier users
  - `getUsageDetails`: Retrieves detailed usage history
- **Comprehensive Documentation**:
  - `USAGE_LIMITS_AND_TIERS.md`: Complete guide to usage limiting and tier system
  - `QUICK_REFERENCE.md`: Fast lookup for common administrative tasks
  - `LECTURE_CONTEXT_IMPLEMENTATION.md`: Technical details of lecture context detection

### Changed
- Updated user database schema to include `tier` field and optional Stripe subscription fields
- Modified `queryCourseStore` Cloud Function to check usage limits before processing requests
- Enhanced system prompt injection to include lecture context when available
- Improved error handling for usage limit exceeded scenarios
- Updated Firestore security rules to protect user tier field from unauthorized modifications

### Security
- User tier field is read-only for regular users (only Cloud Functions and admins can modify)
- Usage limit bypass only available for verified premium/admin accounts
- Tier verification happens server-side in Cloud Functions

### Performance
- Usage limit checks add minimal latency (~50-100ms)
- Premium and admin users skip usage tracking entirely for better performance
- Rolling window calculation optimized with timestamp filtering

### Developer Experience
- Consolidated 5 documentation files (1,929 lines) into 2 comprehensive guides (880 lines)
- Removed duplicate information across documentation
- Added quick reference guide for common tasks
- Updated architecture diagrams with new features

## [1.0.0] - 2025-11-30

### Added
- Initial release of Canvas LM
- Chrome extension with React 19 UI
- Firebase Cloud Functions backend
- Gemini 2.5 Flash with File Search (RAG)
- Automatic PDF extraction from Canvas courses
- Multi-course support with course switching
- Conversation history with full chat sessions
- Streaming responses with typing animation
- Re-scanning functionality for course updates
- Shared course stores across enrolled users
- Chrome Identity API authentication
- Rate limiting on all Cloud Functions
- Comprehensive security model
- Privacy Policy and Terms of Service
- Modern UI with Tailwind CSS and Radix UI components

### Security
- Server-side API key storage (never exposed to client)
- Enrollment verification for course access
- Rate limiting to prevent abuse
- Encrypted data at rest and in transit
- Chrome Web Store security review compliant

### Documentation
- Architecture overview
- Firestore database architecture
- Cloud Functions setup guide
- Firebase setup guide
- Chrome extension development guide
- Production readiness checklist
- Security model documentation

## [Unreleased]

### Planned for 1.2.0
- Stripe payment integration for Premium tier subscriptions
- Customer portal for subscription management
- Support for PowerPoint and Word documents
- Flashcard generation from course materials
- Export chat history to PDF
- Dark mode
- Multi-language support

### Planned for 1.3.0
- Browser extensions for Firefox and Edge
- Integration with other LMS platforms (Blackboard, Moodle)
- Study notes feature
- Collaborative study sessions
- Mobile companion app

---

## Version History

- **1.1.0** (2025-12-01): Added lecture context detection, usage limiting, and user tier system
- **1.0.0** (2025-11-30): Initial release with RAG-powered AI study assistant

---

## Migration Guides

### Migrating from 1.0.0 to 1.1.0

**For End Users:**
- No action required - the extension will automatically update
- New users will be assigned "free" tier by default
- Existing users will default to "free" tier (40 messages per 3 hours)

**For Administrators:**
- Initialize usage limit configuration in Firestore:
  ```javascript
  // Create document: usageLimitConfig/default
  {
    maxMessagesPerWindow: 40,
    windowDurationHours: 3,
    enabled: true
  }
  ```
- Deploy updated Cloud Functions: `firebase deploy --only functions`
- Deploy updated security rules: `firebase deploy --only firestore:rules`
- To grant admin access, set `tier: "admin"` in user document
- See `QUICK_REFERENCE.md` for detailed setup instructions

**For Developers:**
- New Cloud Functions added: `checkUsageLimit`, `recordMessageUsage`, `getUsageDetails`
- New Firestore collections: `userUsageLimits`, `usageLimitConfig`
- User schema updated with `tier` field and optional Stripe fields
- New UI component: `UsageLimitDisplay.jsx`
- New React hook: `useUsageLimit.js`
- Integration in `popup-logic.js` for usage limit checks

**Database Schema Changes:**
```javascript
// users/{userId} - NEW FIELDS
{
  tier: "free" | "premium" | "admin",
  stripeCustomerId: string (optional),
  subscriptionId: string (optional),
  subscriptionStatus: string (optional),
  subscriptionStartDate: timestamp (optional)
}

// NEW COLLECTION: userUsageLimits/{userId}
{
  messages: [
    { timestamp, messageId, courseChatId }
  ],
  metadata: {
    totalMessagesAllTime: number,
    lastResetDate: timestamp
  }
}

// NEW COLLECTION: usageLimitConfig/default
{
  maxMessagesPerWindow: 40,
  windowDurationHours: 3,
  enabled: boolean
}
```

---

## Support

For questions, issues, or feature requests:
- **GitHub Issues**: https://github.com/Rasalp1/canvas-lm/issues
- **Email**: ralpsten.gdev@gmail.com
- **Documentation**: See `/documentation` folder

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
