const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    popup: './src/popup.js',
    background: './src/background.js',
    'content-script': './src/content-script.js',
    'firebase-config': './src/firebase-config.js',
    'firestore-helpers': './src/firestore-helpers.js',
    'gemini-file-search': './src/gemini-file-search.js',
    'gemini-file-search-cloud': './src/gemini-file-search-cloud.js',
    'gemini-cloud-functions': './src/gemini-cloud-functions.js',
    settings: './src/settings.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'popup.html', to: 'popup.html' },
        { from: 'settings.html', to: 'settings.html' },
        { from: 'styles.css', to: 'styles.css' },
        { from: 'smart-navigator.js', to: 'smart-navigator.js' },
        { from: 'state-management.js', to: 'state-management.js' },
        { from: 'stateful-page-scanner.js', to: 'stateful-page-scanner.js' }
      ]
    })
  ],
  resolve: {
    extensions: ['.js']
  }
};
