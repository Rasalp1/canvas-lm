const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    popup: './src/popup-entry.jsx',
    background: './src/background.js',
    'content-script': './src/content-script/content-script.js',
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
      template: './public/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
      inject: 'body',
      scriptLoading: 'blocking'
    }),
    new HtmlWebpackPlugin({
      template: './public/settings.html',
      filename: 'settings.html',
      chunks: ['settings'],
      inject: 'body',
      scriptLoading: 'blocking'
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public/manifest.json', to: 'manifest.json' },
        { from: 'public/favicon-16x16.png', to: 'favicon-16x16.png' },
        { from: 'public/favicon-32x32.png', to: 'favicon-32x32.png' },
        { from: 'public/android-chrome-192x192.png', to: 'android-chrome-192x192.png' },
        { from: 'public/android-chrome-512x512.png', to: 'android-chrome-512x512.png' },
        { from: 'public/apple-touch-icon.png', to: 'apple-touch-icon.png' },
        { from: 'public/Canvas LM Logo.png', to: 'Canvas LM Logo.png' }
      ]
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false, // Keep console.* for debugging (set to true before final release)
            drop_debugger: true
          },
          format: {
            comments: false
          }
        },
        extractComments: false
      })
    ]
  }
};
