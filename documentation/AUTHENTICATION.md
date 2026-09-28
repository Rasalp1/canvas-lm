# Authentication

The extension uses Firebase Anonymous Authentication to obtain an identity that
Firestore and Cloud Functions can verify. The Chrome Identity API supplies a
profile email for the extension UI; its profile ID and email are not used as
authorization credentials.

## Setup

1. In Firebase Console, open **Authentication → Sign-in method**.
2. Enable the **Anonymous** provider.
3. Deploy `firestore.rules` and the Cloud Functions in this repository.
4. Create the initial admin user document with Firebase Admin SDK or another
   trusted administrative channel. Set `isAdmin: true` there; client rules
   reject role changes.

The app signs in with `signInAnonymously()` after it finds a Chrome profile
email. Firebase persists the generated UID in the browser profile. The UID is
used for user documents, enrollments, private chats, usage limits, and callable
function authorization.

## Data and authorization

- Never authorize requests using a `userId` supplied in request data. Callable
  functions derive the caller UID from `request.auth.uid`.
- Firestore user and chat records are readable only by their owning UID.
- Course metadata is readable to signed-in app users. A user can self-enroll
  using a course ID, after which shared course materials and the shared Gemini
  store are available to them. This is the app's cross-user sharing model; it
  does not verify Canvas enrollment or require users to connect a Canvas
  account to Canvs LM.
- User profiles, enrollment records, chats, and usage records remain scoped to
  the authenticated Firebase UID.
- Gemini API credentials belong in Cloud Functions environment configuration,
  never in the extension bundle.

Existing data keyed by the former Chrome profile ID will not automatically
appear under a Firebase UID. Plan and verify a trusted migration before
deploying these changes to users with existing data. Do not create a migration
that trusts a client-supplied email or Chrome profile ID as proof of ownership.
