import React from 'react';
import { Card, CardHeader } from './Card';

export const ChatSection = ({ 
  messages, 
  inputValue, 
  onInputChange, 
  onSend, 
  isLoading 
}) => {
  return (
    <Card>
      <CardHeader 
        title="AI Assistant"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }
      />
      
      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">Start a conversation about your course materials</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div 
              key={idx}
              className={`p-3 rounded-lg ${
                msg.role === 'user' 
                  ? 'bg-purple-100 ml-8' 
                  : 'bg-gray-200 mr-8'
              }`}
            >
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))
        )}
      </div>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder="Ask about your course materials..."
          className="flex-1 px-4 py-2 border-2 border-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          disabled={isLoading}
        />
        <button
          onClick={onSend}
          disabled={isLoading || !inputValue.trim()}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            isLoading || !inputValue.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" strokeLinecap="round" strokeLinejoin="round"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </Card>
  );
};
