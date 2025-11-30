// settings.js - Settings page functionality for Canvas RAG Assistant

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const toggleVisibilityBtn = document.getElementById('toggle-visibility');
  const saveBtn = document.getElementById('save-btn');
  const clearBtn = document.getElementById('clear-btn');
  const successMessage = document.getElementById('success-message');
  const errorMessage = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  const connectionStatus = document.getElementById('connection-status');
  const apiKeyPreview = document.getElementById('api-key-preview');

  // Load existing API key
  await loadAPIKey();

  // Toggle password visibility
  toggleVisibilityBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleVisibilityBtn.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      toggleVisibilityBtn.textContent = '👁️';
    }
  });

  // Save API key
  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showError('Please enter an API key');
      return;
    }

    // Basic validation - Gemini API keys start with "AIza"
    if (!apiKey.startsWith('AIza')) {
      showError('Invalid API key format. Gemini API keys start with "AIza"');
      return;
    }

    try {
      // Save to Chrome storage
      await chrome.storage.sync.set({ geminiApiKey: apiKey });
      
      // Update UI
      showSuccess();
      updateConnectionStatus(true);
      updatePreview(apiKey);
      
      console.log('✅ API key saved successfully');
    } catch (error) {
      console.error('Failed to save API key:', error);
      showError(`Failed to save: ${error.message}`);
    }
  });

  // Clear API key
  clearBtn.addEventListener('click', async () => {
    try {
      await chrome.storage.sync.remove('geminiApiKey');
      apiKeyInput.value = '';
      updateConnectionStatus(false);
      hidePreview();
      showSuccess('API key removed successfully');
      
      console.log('✅ API key cleared');
    } catch (error) {
      console.error('Failed to clear API key:', error);
      showError(`Failed to clear: ${error.message}`);
    }
  });

  // Input validation
  apiKeyInput.addEventListener('input', () => {
    hideMessages();
  });

  // Load existing API key from storage
  async function loadAPIKey() {
    try {
      const result = await chrome.storage.sync.get(['geminiApiKey']);
      
      if (result.geminiApiKey) {
        apiKeyInput.value = result.geminiApiKey;
        updateConnectionStatus(true);
        updatePreview(result.geminiApiKey);
      } else {
        updateConnectionStatus(false);
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
      updateConnectionStatus(false);
    }
  }

  // Update connection status indicator
  function updateConnectionStatus(isConnected) {
    if (isConnected) {
      connectionStatus.textContent = 'Connected';
      connectionStatus.className = 'status connected';
    } else {
      connectionStatus.textContent = 'Not Configured';
      connectionStatus.className = 'status disconnected';
    }
  }

  // Update API key preview
  function updatePreview(apiKey) {
    if (apiKey && apiKey.length > 8) {
      const masked = apiKey.substring(0, 8) + '•'.repeat(apiKey.length - 12) + apiKey.substring(apiKey.length - 4);
      apiKeyPreview.textContent = `Current: ${masked}`;
      apiKeyPreview.style.display = 'block';
    } else {
      hidePreview();
    }
  }

  // Hide preview
  function hidePreview() {
    apiKeyPreview.style.display = 'none';
  }

  // Show success message
  function showSuccess(message = 'API key saved successfully!') {
    successMessage.textContent = `✅ ${message}`;
    successMessage.classList.add('show');
    errorMessage.classList.remove('show');
    
    setTimeout(() => {
      successMessage.classList.remove('show');
    }, 3000);
  }

  // Show error message
  function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.add('show');
    successMessage.classList.remove('show');
  }

  // Hide all messages
  function hideMessages() {
    successMessage.classList.remove('show');
    errorMessage.classList.remove('show');
  }
});
