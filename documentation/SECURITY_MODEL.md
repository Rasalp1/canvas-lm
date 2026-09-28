# Canvs LM Security Model

## Authentication

The extension signs in to Firebase Authentication anonymously. Firebase issues
an ID token and UID; Firestore rules and callable functions use that verified
UID as the caller identity. The Chrome Identity profile is used only to check
that Chrome has a profile email and to display that email. A profile ID or
email sent in request data is never proof of identity.

Enable the **Anonymous** sign-in provider in Firebase Authentication before
deploying. Admins must be assigned by a trusted operator through the Firebase
Admin SDK or console. Never grant `isAdmin` or `tier` from the extension.

## Firestore

`firestore.rules` requires Firebase Authentication. User profiles, enrollments,
usage records, chat sessions, and chat messages are scoped to the authenticated
UID. The client cannot write admin fields, usage records, rate limits, or
Gemini store references on course documents.

Course metadata is readable to signed-in app users. Enrollment is intentionally
self-service by course ID, so users can share a course's materials without
connecting a Canvas account to Canvs LM. An enrollment is an app sharing choice,
not proof of Canvas membership. Users who enroll can read shared course
documents and use the shared Gemini store. Profiles, chats, and usage records
remain private to their Firebase UID.

Course IDs are the sharing key, not a secret. A signed-in user can discover
course metadata and enroll by ID. Course metadata updates are limited to scan
timestamps for any signed-in user and enrollment counts for enrolled users;
Gemini store references remain server-managed.

## Callable functions

Every callable function must reject requests without `request.auth.uid` and use
that UID for ownership, enrollment checks, quotas, and admin checks. Do not
authorize a caller based on `request.data.userId`. Gemini credentials remain
server-side in Cloud Functions environment configuration.

Rate limits are stored under `users/{uid}/rateLimits/{operation}` and are
written by the Admin SDK. They reduce abuse per Firebase UID; they do not stop
someone from creating multiple anonymous accounts. Set Cloud Billing budgets,
API quotas, and monitoring for production.

## Deployment requirements

1. Enable Firebase Anonymous Authentication.
2. Deploy the Firestore rules and Cloud Functions from this repository.
3. Set Gemini API restrictions and quotas in Google Cloud.
4. Assign the initial admin UID through a trusted administrative channel.
5. Review Firebase Auth, Firestore, Functions, and Gemini usage monitoring.

Rules and function source in this repository do not prove that the live Firebase
project has the same configuration. Verify the deployed configuration after
each release.
