import React from 'react';

export const Header = ({ user, onExpandWindow }) => {
  return (
    <div className="bg-white border-2 border-gray-900 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Canvas LM</h1>
        </div>
        
        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random`}
                alt="User"
                className="w-8 h-8 rounded-full border-2 border-gray-900"
              />
              <span className="text-sm font-semibold text-gray-900">{user.displayName}</span>
            </div>
          )}
          
          <button 
            onClick={onExpandWindow}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Open in new window"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3H21V9" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 21H3V15" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 3L14 10" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 21L10 14" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
