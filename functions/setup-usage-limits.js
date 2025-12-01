// Setup script to initialize usage limiting configuration in Firestore
// Run this once from Firebase Console or using the Firebase Admin SDK

const admin = require('firebase-admin');

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function initializeUsageLimitConfig() {
  try {
    await db.collection('usageLimitConfig').doc('default').set({
      maxMessagesPerWindow: 40,
      windowDurationHours: 3,
      enabled: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'system'
    });
    
    console.log('✅ Usage limit configuration initialized successfully');
    console.log('Configuration:');
    console.log('  - Max messages per window: 40');
    console.log('  - Window duration: 3 hours');
    console.log('  - Status: Enabled');
  } catch (error) {
    console.error('❌ Error initializing usage limit config:', error);
  }
}

// Run the initialization
initializeUsageLimitConfig()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
