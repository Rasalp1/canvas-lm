// Quick script to initialize usage limit configuration
// Run this once in the browser console when extension is open

import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-config.js';

const functions = getFunctions(firebaseApp, 'europe-north1');

async function initializeConfig() {
  try {
    // Get userId from Chrome Identity
    const userInfo = await chrome.identity.getProfileUserInfo({ accountStatus: chrome.identity.AccountStatus.ANY });
    
    if (!userInfo.id) {
      console.error('❌ Not logged in');
      return;
    }
    
    console.log('🔧 Initializing usage limit configuration...');
    const initConfig = httpsCallable(functions, 'initializeUsageLimitConfig');
    const result = await initConfig({ userId: userInfo.id });
    
    console.log('✅ Success:', result.data.message);
    console.log('📊 Config:', result.data.config);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Export for manual calling
window.initializeUsageConfig = initializeConfig;

// Auto-run
initializeConfig();
