import React, { useState } from 'react';
import { Card, CardHeader } from './Card';

export const AllCoursesView = ({ onLoadCourses }) => {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLoadCourses = async () => {
    setIsLoading(true);
    const allCourses = await onLoadCourses();
    setCourses(allCourses);
    setIsLoading(false);
    setIsExpanded(true);
  };

  if (!isExpanded) {
    return (
      <Card className="!p-4">
        <button
          onClick={handleLoadCourses}
          disabled={isLoading}
          className="w-full flex items-center justify-between text-left text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isLoading ? 'Loading...' : 'View all courses & documents in database'}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <CardHeader 
          title="All Courses in Database"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <button
          onClick={() => setIsExpanded(false)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="18 15 12 9 6 15" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {courses.length > 0 ? (
          courses.map((course) => (
            <div
              key={course.id}
              className="p-3 bg-white border border-gray-300 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">{course.name}</p>
                  <p className="text-xs text-gray-500 mt-1">ID: {course.id}</p>
                  {course.canvasInstance && (
                    <p className="text-xs text-gray-500">{course.canvasInstance}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-green-600">
                    📄 {course.documentCount} docs
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    👥 {course.totalEnrollments || 0} users
                  </p>
                </div>
              </div>
              
              {course.lastScannedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Last scan: {new Date(course.lastScannedAt.seconds * 1000).toLocaleDateString()}
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No courses in database yet
          </p>
        )}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          Total: {courses.length} courses • {courses.reduce((sum, c) => sum + c.documentCount, 0)} documents
        </p>
      </div>
    </Card>
  );
};
