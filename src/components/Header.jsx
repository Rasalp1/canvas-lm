import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Maximize2 } from 'lucide-react';

export const Header = ({ user, onExpandWindow, isExtensionPage }) => {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="relative">
          <img 
            src={chrome.runtime.getURL('Canvas LM Logo.png')}
            alt="Canvas LM Logo" 
            className="w-11 h-11 rounded-2xl"
          />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
            Canvas LM
          </h1>
          <p className="text-xs text-slate-500 font-medium">AI-Powered Learning Assistant</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {user && (
          <Avatar className="w-9 h-9 ring-2 ring-slate-200">
            <AvatarImage src={user.photoURL} alt={user.displayName} />
            <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-sky-500 text-white">
              {user.displayName?.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        )}
        
        {!isExtensionPage && (
          <Button
            onClick={onExpandWindow}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full hover:bg-slate-100"
            title="Open in new window"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
};