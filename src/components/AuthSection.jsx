import React from 'react';

export const AuthSection = ({ isLoggedIn, userStats, onLogin }) => {
  if (isLoggedIn) {
    return (
      <div className="bg-gray-100 border-2 border-gray-900 rounded-xl p-6">
        <div className="text-center">
          <p className="text-sm text-gray-600">{userStats || 'Loading your stats...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 border-2 border-gray-900 rounded-xl p-6">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100 rounded-full">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="url(#gradient1)" strokeWidth="2"/>
            <path d="M12 6V12L16 14" stroke="url(#gradient1)" strokeWidth="2" strokeLinecap="round"/>
            <defs>
              <linearGradient id="gradient1" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0%" stopColor="#8B5CF6"/>
                <stop offset="100%" stopColor="#EC4899"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        
        <h3 className="text-xl font-bold text-gray-900 mb-2">Welcome Back</h3>
        <p className="text-sm text-gray-600 mb-6">
          Sign in to access your course materials and AI assistant
        </p>
        
        <button
          onClick={onLogin}
          className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 17L15 12L10 7" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15 12H3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  );
};
