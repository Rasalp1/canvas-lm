import React from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { BookOpen, Zap, Package, FileText, FolderOpen, Cloud, Sparkles } from 'lucide-react';

export const CourseInfo = ({ courseDetails, onScan, isScanning }) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-lg">Current Course</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {courseDetails && (
          <div 
            className="prose prose-sm max-w-none [&>*]:text-slate-700"
            dangerouslySetInnerHTML={{ __html: courseDetails }} 
          />
        )}
        
        <Separator />
        
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
              <Zap className="w-6 h-6 text-violet-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-slate-900 mb-1.5">Smart Navigation System</h4>
              <p className="text-xs text-slate-600 leading-relaxed mb-3">
                AI-powered course crawler that intelligently discovers and indexes ALL PDFs across your entire course structure.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <Badge variant="outline" className="justify-center py-2">
              <Package className="w-3 h-3 mr-1.5" />
              All modules
            </Badge>
            <Badge variant="outline" className="justify-center py-2">
              <FileText className="w-3 h-3 mr-1.5" />
              Pages & tasks
            </Badge>
            <Badge variant="outline" className="justify-center py-2">
              <FolderOpen className="w-3 h-3 mr-1.5" />
              File sections
            </Badge>
            <Badge variant="outline" className="justify-center py-2">
              <Cloud className="w-3 h-3 mr-1.5" />
              Cloud sync
            </Badge>
          </div>
        </div>
        
        <Button
          onClick={onScan}
          disabled={isScanning}
          variant="gradient"
          className="w-full"
          size="lg"
        >
          {isScanning ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Scanning Course...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Start Smart Scan
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
