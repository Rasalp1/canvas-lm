// Import Firebase from npm
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';

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

// Initialize Firebase (Firestore only for storing PDFs and data)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Make available globally for popup.js
window.firebaseDb = db;
window.firebaseModules = {
  doc,
  setDoc,
  getDoc,
  Timestamp
};