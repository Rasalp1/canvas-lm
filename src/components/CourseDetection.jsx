import React from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RefreshCw, Info, Compass } from 'lucide-react';

export const CourseDetection = ({ status, onDetect }) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <CardTitle className="text-lg">Course Detection</CardTitle>
          </div>
          <Button
            onClick={onDetect}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            title="Re-detect Canvas Course"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-700 font-medium">{status}</p>
        </div>
        
        <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-200/60">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-blue-700 leading-relaxed">
              Navigate to a Canvas course page (e.g., <code className="px-1 py-0.5 bg-white/60 rounded">canvas.edu/courses/12345</code>) for this extension to work.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
