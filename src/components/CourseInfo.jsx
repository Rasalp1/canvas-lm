import React from 'react';
import { Card, CardHeader } from './Card';

export const CourseInfo = ({ courseDetails, onScan, isScanning }) => {
  return (
    <Card>
      <CardHeader 
        title="Current Course"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 3H8C9.06087 3 10.0783 3.42143 10.8284 4.17157C11.5786 4.92172 12 5.93913 12 7V21C12 20.2044 11.6839 19.4413 11.1213 18.8787C10.5587 18.3161 9.79565 18 9 18H2V3Z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 3H16C14.9391 3 13.9217 3.42143 13.1716 4.17157C12.4214 4.92172 12 5.93913 12 7V21C12 20.2044 12.3161 19.4413 12.8787 18.8787C13.4413 18.3161 14.2044 18 15 18H22V3Z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }
      />
      
      {courseDetails && (
        <div dangerouslySetInnerHTML={{ __html: courseDetails }} />
      )}
      
      <div className="mt-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8C20.9996 7.64927 20.9071 7.30481 20.7315 7.00116C20.556 6.69751 20.3037 6.44536 20 6.27L13 2.27C12.696 2.09446 12.3511 2.00205 12 2.00205C11.6489 2.00205 11.304 2.09446 11 2.27L4 6.27C3.69626 6.44536 3.44398 6.69751 3.26846 7.00116C3.09294 7.30481 3.00036 7.64927 3 8V16C3.00036 16.3507 3.09294 16.6952 3.26846 16.9988C3.44398 17.3025 3.69626 17.5546 4 17.73L11 21.73C11.304 21.9055 11.6489 21.998 12 21.998C12.3511 21.998 12.696 21.9055 13 21.73L20 17.73C20.3037 17.5546 20.556 17.3025 20.7315 16.9988C20.9071 16.6952 20.9996 16.3507 21 16Z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-base font-semibold text-gray-900 mb-1">Smart Navigation System</h4>
            <p className="text-sm text-gray-600 mb-3">
              Intelligently navigates through your entire course structure to discover and save ALL PDFs to your knowledge base!
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">Expands all modules</span>
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">Visits pages & assignments</span>
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">Explores file sections</span>
              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">Cloud database</span>
            </div>
          </div>
        </div>
        
        <button
          onClick={onScan}
          disabled={isScanning}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
            isScanning 
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
          }`}
        >
          {isScanning ? 'Scanning...' : '🚀 Start Smart Scan'}
        </button>
      </div>
    </Card>
  );
};
