import React from 'react';
import { Card, CardHeader } from './Card';

export const CourseSelector = ({ courses, onSelectCourse }) => {
  return (
    <Card>
      <CardHeader 
        title="Select a Course"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 3H8C9.06087 3 10.0783 3.42143 10.8284 4.17157C11.5786 4.92172 12 5.93913 12 7V21C12 20.2044 11.6839 19.4413 11.1213 18.8787C10.5587 18.3161 9.79565 18 9 18H2V3Z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 3H16C14.9391 3 13.9217 3.42143 13.1716 4.17157C12.4214 4.92172 12 5.93913 12 7V21C12 20.2044 12.3161 19.4413 12.8787 18.8787C13.4413 18.3161 14.2044 18 15 18H22V3Z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }
      />
      
      <p className="text-sm text-gray-600 mb-4">Choose a course from your enrolled courses to chat with its materials.</p>
      
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {courses && courses.length > 0 ? (
          courses.map((course) => (
            <button
              key={course.id}
              onClick={() => onSelectCourse(course)}
              className="w-full text-left p-3 border-2 border-gray-900 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <p className="font-semibold text-gray-900">{course.name}</p>
              <p className="text-xs text-gray-500">ID: {course.id}</p>
              {course.actualPdfCount > 0 && (
                <p className="text-xs text-green-600 mt-1">📄 {course.actualPdfCount} documents</p>
              )}
            </button>
          ))
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No courses found. Visit a Canvas course page to get started.
          </p>
        )}
      </div>
    </Card>
  );
};
