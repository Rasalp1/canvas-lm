import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { LogIn, Sparkles } from 'lucide-react';

export const AuthSection = ({ isLoggedIn, userStats, onLogin }) => {
  if (isLoggedIn) {
    return (
      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Badge variant="success" className="font-semibold">
              <Sparkles className="w-3 h-3 mr-1" />
              Connected
            </Badge>
            <p className="text-sm text-slate-700 flex-1">
              {userStats || 'Loading your stats...'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-400/20 to-fuchsia-400/20 rounded-full blur-2xl" />
      <CardContent className="p-6 relative">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl shadow-lg shadow-violet-500/30">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          
          <h3 className="text-xl font-bold text-slate-900 mb-2">Welcome Back</h3>
          <p className="text-sm text-slate-600 mb-6">
            Sign in to unlock AI-powered learning assistance
          </p>
          
          <Button
            onClick={onLogin}
            variant="gradient"
            className="w-full"
            size="lg"
          >
            <LogIn className="w-5 h-5 mr-2" />
            Sign in with Google
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
