import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { Maximize2, Layers } from 'lucide-react';

export const Header = ({ user, onExpandWindow }) => {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-11 h-11 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-violet-500/30">
            <Layers className="w-6 h-6" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            Canvas LM
          </h1>
          <p className="text-xs text-slate-500 font-medium">AI-Powered Learning Assistant</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {user && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full border border-slate-200">
            <Avatar className="w-7 h-7">
              <AvatarImage src={user.photoURL} alt={user.displayName} />
              <AvatarFallback className="text-xs">
                {user.displayName?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold text-slate-700 max-w-[80px] truncate">
              {user.displayName?.split(' ')[0]}
            </span>
          </div>
        )}
        
        <Button
          onClick={onExpandWindow}
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full hover:bg-slate-100"
          title="Open in new window"
        >
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
