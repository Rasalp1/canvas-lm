import React from 'react';
import { Card, CardHeader } from './Card';

export const CourseDetection = ({ status, onDetect }) => {
  return (
    <Card>
      <CardHeader 
        title="Course Detection"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16V12M12 8H12.01" strokeLinecap="round"/>
          </svg>
        }
        action={
          <button 
            onClick={onDetect}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            title="Re-detect Canvas Course"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        }
      />
      
      <p className="text-sm text-gray-700 mb-3">{status}</p>
      
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16V12M12 8H12.01" strokeLinecap="round"/>
        </svg>
        <small className="text-xs text-gray-700">
          <strong>Tip:</strong> Navigate to a Canvas course page (e.g., canvas.education.lu.se/courses/12345) for this extension to work.
        </small>
      </div>
    </Card>
  );
};
