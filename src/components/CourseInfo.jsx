import React from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { BookOpen, Zap, Package, FileText, FolderOpen, Cloud, Sparkles, ArrowLeft } from 'lucide-react';

export const CourseInfo = ({ courseDetails, onScan, isScanning, hasDocuments, onBack, showBackButton }) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {showBackButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-9 w-9 p-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
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
        
        {!hasDocuments && (
          <>
            <Separator />
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-sky-100 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Zap className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-bold text-slate-900 mb-1.5">Smart Navigation System</h4>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    AI-powered course crawler that intelligently discovers ALL PDFs across your entire course structure.
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <Badge variant="outline" className="justify-center py-1.5 text-slate-500 border-slate-300">
                  <Package className="w-3 h-3 mr-1" />
                  <span className="text-xs">All modules</span>
                </Badge>
                <Badge variant="outline" className="justify-center py-1.5 text-slate-500 border-slate-300">
                  <FileText className="w-3 h-3 mr-1" />
                  <span className="text-xs">Pages & tasks</span>
                </Badge>
                <Badge variant="outline" className="justify-center py-1.5 text-slate-500 border-slate-300">
                  <FolderOpen className="w-3 h-3 mr-1" />
                  <span className="text-xs">File sections</span>
                </Badge>
                <Badge variant="outline" className="justify-center py-1.5 text-slate-500 border-slate-300">
                  <Cloud className="w-3 h-3 mr-1" />
                  <span className="text-xs">Cloud sync</span>
                </Badge>
              </div>
            </div>
            
            <Button
              onClick={onScan}
              disabled={isScanning}
              className="w-full relative overflow-hidden before:absolute before:inset-0 before:rounded-lg before:p-[2px] before:bg-gradient-to-r before:from-blue-500 before:via-cyan-500 before:to-blue-500 before:bg-[length:200%_100%] before:animate-[shimmer_2s_linear_infinite] before:-z-10 before:blur-sm"
              size="lg"
            >
              <span className="relative z-10 flex items-center justify-center w-full h-full">
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
              </span>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
