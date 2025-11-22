import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Import the existing popup logic
import { PopupLogic } from './popup-logic';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  
  if (root) {
    // Create popup logic instance
    const popupLogic = new PopupLogic();
    
    // Render React app
    const reactRoot = ReactDOM.createRoot(root);
    reactRoot.render(
      <React.StrictMode>
        <App popupLogic={popupLogic} />
      </React.StrictMode>
    );
  }
});
