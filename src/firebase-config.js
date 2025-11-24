// Import Firebase from npm
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD4xXyZxYzAbCdEfGhIjKlMnOpQrStUvWxY",
  authDomain: "canvas-lm.firebaseapp.com",
  projectId: "canvas-lm",
  storageBucket: "canvas-lm.firebasestorage.app",
  messagingSenderId: "1022702377810",
  appId: "1:1022702377810:web:0be3e4ad725f6f2899f88b",
  measurementId: "G-3C6JSYRG67"
};

// Initialize Firebase (Firestore only - authentication uses Chrome Identity API)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app, 'europe-north1');

// Make available globally
window.firebaseApp = app;
window.firebaseDb = db;
window.firebaseFunctions = functions;
window.firebaseModules = {
  // Basic operations
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  
  // Query operations
  collection,
  query,
  where,
  orderBy,
  
  // Utilities
  Timestamp
};

console.log('✅ Firebase initialized (Firestore only)');