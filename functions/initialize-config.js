// One-time callable function to initialize usage limit config
const {onCall} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

exports.initializeUsageLimitConfig = onCall(async (request) => {
  const db = admin.firestore();
  
  try {
    const configDoc = await db.collection('usageLimitConfig').doc('default').get();
    
    if (configDoc.exists) {
      return {
        success: true,
        message: 'Config already exists',
        config: configDoc.data()
      };
    }
    
    await db.collection('usageLimitConfig').doc('default').set({
      maxMessagesPerWindow: 40,
      windowDurationHours: 3,
      enabled: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'system'
    });
    
    return {
      success: true,
      message: 'Usage limit configuration initialized successfully',
      config: {
        maxMessagesPerWindow: 40,
        windowDurationHours: 3,
        enabled: true
      }
    };
  } catch (error) {
    console.error('Error initializing config:', error);
    throw new Error('Failed to initialize config: ' + error.message);
  }
});
