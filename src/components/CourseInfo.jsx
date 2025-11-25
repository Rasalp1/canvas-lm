import React from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { BookOpen, Zap, Package, FileText, FolderOpen, Cloud, Sparkles, ArrowLeft, UserPlus, AlertCircle } from 'lucide-react';

export const CourseInfo = ({ courseDetails, onScan, isScanning, scanProgress, scanTimeLeft, hasDocuments, onBack, showBackButton, enrollmentStatus, onEnroll, isLoggedIn }) => {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
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
        
        {/* Show enrollment/scan options if logged in and not enrolled */}
        {isLoggedIn && !enrollmentStatus.isEnrolled && !enrollmentStatus.checking && (
          <>
            <Separator />
            
            {/* Show different content based on enrollment status */}
            {enrollmentStatus.courseExists ? (
              // Course exists but user not enrolled
              <>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200/60">
                    <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-amber-900 mb-1">Already in Database</p>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        This course has been scanned by another student. Click below to join and access all course materials.
                      </p>
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={onEnroll}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
                  size="lg"
                >
                  <UserPlus className="w-5 h-5 mr-2" />
                  I'm Taking This Course
                </Button>
              </>
            ) : (
              // Course doesn't exist in DB
              <>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-200/60">
                    <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-blue-900 mb-1">New Course</p>
                      <p className="text-xs text-blue-700 leading-relaxed">
                        This course has not yet been added to the Canvas LM database and needs to be scanned.
                      </p>
                    </div>
                  </div>
                  
                  {/* <div className="flex items-start gap-3">
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
                  </div> */}
                </div>
                
                {isScanning ? (
                  /* Scanning Progress */
                  <div className="space-y-4">
                    {/* Warning Banner */}
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-red-50 to-orange-50 rounded-xl border-2 border-red-200 shadow-sm">
                      <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-bold text-red-900 tracking-tight">DO NOT CLOSE THIS WINDOW</p>
                        <p className="text-xs text-red-700 mt-0.5">Scan will continue in background but results may be lost</p>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 font-medium">Scanning course materials...</span>
                        <span className="text-slate-500 tabular-nums">{formatTime(scanTimeLeft)} left</span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500 ease-out relative overflow-hidden"
                          style={{ width: `${scanProgress}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_linear_infinite]"></div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 text-center mt-1">
                        {scanProgress < 30 ? 'Discovering course structure...' : 
                         scanProgress < 60 ? 'Scanning modules and pages...' :
                         scanProgress < 90 ? 'Processing documents...' : 
                         'Almost done...'}
                      </p>
                    </div>
                    
                    {/* Scanning Button (disabled state) */}
                    <Button
                      disabled={true}
                      className="w-full bg-gradient-to-r from-slate-400 to-slate-500 cursor-not-allowed"
                      size="lg"
                    >
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Scanning in Progress...
                    </Button>
                  </div>
                ) : (
                  /* Start Scan Button */
                  <Button
                    onClick={onScan}
                    className="w-full relative overflow-hidden before:absolute before:inset-0 before:rounded-lg before:p-[2px] before:bg-gradient-to-r before:from-blue-500 before:via-cyan-500 before:to-blue-500 before:bg-[length:200%_100%] before:animate-[shimmer_2s_linear_infinite] before:-z-10 before:blur-sm"
                    size="lg"
                  >
                    <span className="relative z-10 flex items-center justify-center w-full h-full">
                      <Sparkles className="w-5 h-5 mr-2 text-white" />
                      <span className="text-white">Start Course Scan</span>
                    </span>
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
