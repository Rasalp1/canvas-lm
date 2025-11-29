import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/dropdown-menu';
import { BookOpen, Zap, Package, FileText, FolderOpen, Cloud, Sparkles, ArrowLeft, UserPlus, AlertCircle, RefreshCw, MoreVertical } from 'lucide-react';

export const CourseInfo = ({ courseDetails, onScan, isScanning, scanProgress, scanTimeLeft, scanStatus, hasDocuments, onBack, showBackButton, enrollmentStatus, onEnroll, isLoggedIn, newDocumentsFound }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
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
          
          {/* Rescan dropdown - only show if enrolled and has documents */}
          {isLoggedIn && enrollmentStatus.isEnrolled && hasDocuments && !isScanning && (
            <DropdownMenu>
              <DropdownMenuTrigger onClick={() => setDropdownOpen(!dropdownOpen)}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-slate-100"
                  title="Course options"
                >
                  <MoreVertical className="h-4 w-4 text-slate-600" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent open={dropdownOpen} onClose={() => setDropdownOpen(false)}>
                <DropdownMenuItem onClick={() => { setDropdownOpen(false); onScan(); }}>
                  <RefreshCw className="h-4 w-4" />
                  <span>Re-scan Course</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {courseDetails && (
          <div 
            className="prose prose-sm max-w-none [&>*]:text-slate-700"
            dangerouslySetInnerHTML={{ __html: courseDetails }} 
          />
        )}
        
        {/* New Documents Found Banner */}
        {newDocumentsFound > 0 && (
          <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 shadow-sm">
            <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-green-900 tracking-tight">New Documents Added!</p>
              <p className="text-xs text-green-700 mt-0.5">
                Found {newDocumentsFound} new document{newDocumentsFound !== 1 ? 's' : ''} - available to all users
              </p>
            </div>
          </div>
        )}
        
        {/* Show scan button ONLY for enrolled users who haven't scanned yet OR show scanning progress */}
        {isLoggedIn && !enrollmentStatus.checking && (
          <>
            {enrollmentStatus.isEnrolled ? (
              /* User IS enrolled */
              <>
                {isScanning ? (
                  /* Scanning Progress */
                  <>
                    <Separator />
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
                          <span className="text-slate-500 tabular-nums">
                            {scanTimeLeft === 0 ? 'Calculating time estimate...' : `${formatTime(scanTimeLeft)} left`}
                          </span>
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
                          {scanStatus || 'Processing...'}
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
                  </>
                ) : !hasDocuments ? (
                  /* Initial Scan Button for Enrolled Users (only if no documents yet) */
                  <>
                    <Separator />
                    
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-200/60">
                        <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <AlertCircle className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-blue-900 mb-1">Ready to Scan</p>
                          <p className="text-xs text-blue-700 leading-relaxed">
                            This course hasn't been scanned yet. Click below to scan and index all course materials.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      onClick={onScan}
                      className="w-full relative overflow-hidden before:absolute before:inset-0 before:rounded-lg before:p-[2px] before:bg-gradient-to-r before:from-blue-500 before:via-cyan-500 before:to-blue-500 before:bg-[length:200%_100%] before:animate-[shimmer_2s_linear_infinite] before:-z-10 before:blur-sm"
                      size="lg"
                    >
                      <span className="relative z-10 flex items-center justify-center w-full h-full">
                        <Sparkles className="w-5 h-5 mr-2 text-white" />
                        <span className="text-white">Scan Course</span>
                      </span>
                    </Button>
                  </>
                ) : null}
              </>
            ) : (
              /* User NOT enrolled - show same enrollment screen regardless of course existence */
              <>
                <Separator />
                
                <Button
                  onClick={onEnroll}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
                  size="lg"
                >
                  <UserPlus className="w-5 h-5 mr-2" />
                  I'm taking this course
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
