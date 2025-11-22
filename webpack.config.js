const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    popup: './src/popup-entry.jsx',
    background: './src/background.js',
    'content-script': './src/content-script.js',
    settings: './src/settings.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
      inject: 'body',
      scriptLoading: 'blocking'
    }),
    new HtmlWebpackPlugin({
      template: './settings.html',
      filename: 'settings.html',
      chunks: ['settings'],
      inject: 'body',
      scriptLoading: 'blocking'
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'smart-navigator.js', to: 'smart-navigator.js' },
        { from: 'state-management.js', to: 'state-management.js' },
        { from: 'stateful-page-scanner.js', to: 'stateful-page-scanner.js' }
      ]
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx']
  }
};
