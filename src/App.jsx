import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown, Info } from 'lucide-react';
import { Header } from './components/Header';
import { CoursePDFDrawer } from './components/CoursePDFDrawer';
import { AuthSection } from './components/AuthSection';
import { CourseDetection } from './components/CourseDetection';
import { CourseInfo } from './components/CourseInfo';
import { ChatSection } from './components/ChatSection';
import { CourseSelector } from './components/CourseSelector';
import { AllCoursesView } from './components/AllCoursesView';
import { About } from './components/About';
import { UsageLimitDisplay } from './components/UsageLimitDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog';
import { Button } from './components/ui/button';
import { getCourseColor } from './lib/course-colors';
import Aurora from './components/ui/aurora';
import RotatingText from './components/ui/rotating-text';
import './styles.css';

const CSS_VARS = `
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.75rem;
  }
`;

export const App = ({ 
  popupLogic 
}) => {
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userStats, setUserStats] = useState('');
  const [status, setStatus] = useState('Checking current page...');
  const [courseDetails, setCourseDetails] = useState(null);
  const [showCourseInfo, setShowCourseInfo] = useState(false);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [courseList, setCourseList] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTimeLeft, setScanTimeLeft] = useState(0);
  const [scanStartTime, setScanStartTime] = useState(null);
  const [estimatedScanTime, setEstimatedScanTime] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isExtensionPage, setIsExtensionPage] = useState(false);
  const [currentCourseDocCount, setCurrentCourseDocCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, course: null });
  const [enrollmentStatus, setEnrollmentStatus] = useState({ courseExists: false, isEnrolled: false, checking: true });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCourse, setDrawerCourse] = useState(null);
  const [drawerDocuments, setDrawerDocuments] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [newDocumentsFound, setNewDocumentsFound] = useState(0);
  const [showAbout, setShowAbout] = useState(false);
  const [currentPagePDF, setCurrentPagePDF] = useState(null);
  const [contextEnabled, setContextEnabled] = useState(true);
  const [usageStatus, setUsageStatus] = useState({ allowed: true, remaining: 20, resetTime: null, loading: true });

  // Auto-clear new documents notification after 10 seconds
  useEffect(() => {
    if (newDocumentsFound > 0) {
      const timer = setTimeout(() => {
        setNewDocumentsFound(0);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [newDocumentsFound]);

  // Scan progress timer
  useEffect(() => {
    if (!isScanning || !scanStartTime || !estimatedScanTime) {
      return;
    }
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - scanStartTime;
      const estimatedTotal = estimatedScanTime * 1000; // Convert seconds to milliseconds
      const progress = Math.min((elapsed / estimatedTotal) * 100, 95); // Cap at 95% until complete
      const timeLeft = Math.max(0, Math.ceil((estimatedTotal - elapsed) / 1000));
      
      setScanProgress(progress);
      setScanTimeLeft(timeLeft);
    }, 500);
    
    return () => clearInterval(interval);
  }, [isScanning, scanStartTime, estimatedScanTime]);

  useEffect(() => {
    // Check if we're on an extension page
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab && tab.url.startsWith('chrome-extension://')) {
        setIsExtensionPage(true);
      }
    });
    
    // Initialize and pass state setters to popup logic
    if (popupLogic) {
      popupLogic.setUICallbacks({
        setUser,
        setIsLoggedIn,
        setAuthLoading,
        setUserStats,
        setStatus,
        setCourseDetails,
        setShowCourseInfo,
        setShowCourseSelector,
        setCourseList,
        setIsScanning,
        setScanProgress,
        setScanTimeLeft,
        setScanStartTime,
        setEstimatedScanTime,
        setChatMessages,
        setIsChatLoading,
        setCurrentCourseDocCount,
        setEnrollmentStatus,
        setNewDocumentsFound,
        setCurrentPagePDF,
        setContextEnabled,
        setUsageStatus
      });
      popupLogic.initialize();
    }
  }, [popupLogic]);

  // Check usage limit periodically when logged in
  useEffect(() => {
    if (!isLoggedIn || !popupLogic) {
      return;
    }

    const checkUsage = async () => {
      try {
        if (popupLogic.fileSearchManager) {
          const status = await popupLogic.fileSearchManager.checkUsageLimit();
          setUsageStatus({ ...status, loading: false });
        } else {
          setUsageStatus({ allowed: true, remaining: 20, resetTime: null, loading: false });
        }
      } catch (error) {
        console.error('[UsageLimit] Error checking usage:', error);
        setUsageStatus({ allowed: true, remaining: 20, resetTime: null, loading: false });
      }
    };

    // Check immediately
    checkUsage();

    // Check every 30 seconds
    const interval = setInterval(checkUsage, 30000);

    return () => clearInterval(interval);
  }, [isLoggedIn, popupLogic]);

  const handleLogin = () => {
    if (popupLogic) {
      popupLogic.handleLogin();
    }
  };

  const handleDetect = () => {
    if (popupLogic) {
      popupLogic.handleDetect();
    }
  };

  const handleScan = () => {
    if (popupLogic) {
      // Don't set start time here - it will be set when PDF count is known
      setScanProgress(0);
      setScanTimeLeft(0);
      setEstimatedScanTime(null);
      // Pass true if documents exist (re-scan), false otherwise
      const isRescan = currentCourseDocCount > 0;
      popupLogic.handleScan(isRescan);
    }
  };

  const handleChatSend = () => {
    if (popupLogic && chatInput.trim()) {
      popupLogic.handleChatSend(chatInput);
      setChatInput('');
    }
  };

  const handleExpandWindow = () => {
    if (popupLogic) {
      popupLogic.handleExpandWindow();
    }
  };

  const handleSelectCourse = (course) => {
    if (popupLogic) {
      popupLogic.selectCourse(course);
    }
    // Close drawer when selecting a course for main view
    setDrawerOpen(false);
  };

  const handleContextToggle = (enabled) => {
    setContextEnabled(enabled);
    if (popupLogic) {
      popupLogic.setContextEnabled(enabled);
    }
  };

  const handleRemoveEnrollment = (course) => {
    setConfirmDialog({ open: true, course });
  };

  const handleConfirmRemove = async () => {
    if (confirmDialog.course && popupLogic) {
      await popupLogic.removeEnrollment(confirmDialog.course.id);
    }
    setConfirmDialog({ open: false, course: null });
  };

  const handleBackToCourseSelector = () => {
    if (popupLogic) {
      popupLogic.backToCourseSelector();
    }
  };

  const handleEnroll = () => {
    if (popupLogic) {
      popupLogic.enrollInCurrentCourse();
    }
  };

  const handleLoadAllCourses = async () => {
    if (popupLogic) {
      return await popupLogic.loadAllCourses();
    }
    return [];
  };

  const handleToggleDrawer = async (course, event) => {
    if (event) {
      event.stopPropagation();
    }
    
    // If clicking the same course, just toggle
    if (drawerCourse?.id === course.id && drawerOpen) {
      setDrawerOpen(false);
      return;
    }
    
    // New course selected, fetch documents
    setDrawerCourse(course);
    setDrawerLoading(true);
    setDrawerOpen(true);
    
    if (popupLogic) {
      const docs = await popupLogic.getCourseDocumentsForDrawer(course.id);
      setDrawerDocuments(docs);
    }
    
    setDrawerLoading(false);
  };

  // Extended page layout (ChatGPT-like)
  if (isExtensionPage && isLoggedIn) {
    return (
      <>
        <style>{CSS_VARS}</style>
        
        {/* About Modal - rendered outside main container to avoid overflow issues */}
        {showAbout && <About onClose={() => setShowAbout(false)} />}
        
        <div className="w-screen h-screen bg-slate-50 flex overflow-hidden relative">
          {/* Aurora Background - only show on welcome screen */}
          {!showCourseInfo && (
            <div className="absolute inset-0 z-0">
              <Aurora 
                colorStops={['#3bd161ff', '#68e9fdff', '#3B82F6']}
                amplitude={0.6}
                blend={0.8}
                speed={0.5}
              />
            </div>
          )}
          
          {/* White Background - show when course is selected */}
          {showCourseInfo && (
            <div className="absolute inset-0 z-0 bg-white" />
          )}
          
          {/* Left Sidebar - Course List */}
          <div className={`bg-slate-100 border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out rounded-r-3xl relative z-10 ${
            sidebarCollapsed ? 'w-16' : 'w-80'
          }`}>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center gap-3 transition-opacity duration-200">
                  <div className="w-10 h-10 flex items-center justify-center">
                    <img 
                      src={chrome.runtime.getURL('Canvas LM Logo.png')}
                      alt="Canvas LM" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-slate-900">Canvas LM</h1>
                    <p className="text-xs text-slate-500">{user?.email}</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <span className="text-slate-600">{sidebarCollapsed ? '→' : '←'}</span>
              </button>
            </div>

            {/* Course List */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {courseList && courseList.length > 0 ? (
                  courseList.map((course) => {
                    const courseColor = getCourseColor(course.enrollment);
                    return (
                    <div key={course.id}>
                      <button
                        onClick={() => handleSelectCourse(course)}
                        className={`w-full text-left p-3 transition-all hover:bg-slate-200 group relative ${
                          showCourseInfo && courseDetails?.includes(course.id) 
                            ? 'bg-slate-200 rounded-t-lg' 
                            : 'rounded-lg'
                        }`}
                        title={sidebarCollapsed ? course.name : ''}
                      >
                        {sidebarCollapsed ? (
                          <div className="flex justify-center">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: courseColor.hex }}
                            ></div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <div 
                                className={`w-8 h-8 bg-gradient-to-br ${courseColor.gradient} rounded-lg flex items-center justify-center flex-shrink-0 text-xs`}
                              >
                                📚
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-slate-900 leading-tight">{course.name}</p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveEnrollment(course);
                              }}
                              className="absolute top-1/2 -translate-y-1/2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
                            >
                              <span className="text-red-600 text-lg">×</span>
                            </button>
                          </>
                        )}
                      </button>
                      {!sidebarCollapsed && showCourseInfo && courseDetails?.includes(course.id) && (
                        <>
                          {drawerOpen && drawerCourse?.id === course.id && (
                            <CoursePDFDrawer
                              open={true}
                              documents={drawerDocuments}
                              isLoading={drawerLoading}
                            />
                          )}
                          <button
                            onClick={(e) => handleToggleDrawer(course, e)}
                            className={`w-full flex justify-center py-2 transition-all rounded-b-lg ${
                              drawerOpen && drawerCourse?.id === course.id 
                                ? 'bg-slate-100 hover:bg-slate-150' 
                                : 'bg-slate-200 hover:bg-slate-300'
                            }`}
                            title="View course documents"
                          >
                            <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform ${
                              drawerOpen && drawerCourse?.id === course.id ? 'rotate-180' : ''
                            }`} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                  })
                ) : (
                  !sidebarCollapsed && (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      <p>No courses yet</p>
                      <p className="text-xs mt-1">Visit a Canvas course to get started</p>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Usage Limit Display in Sidebar */}
            {!sidebarCollapsed && isLoggedIn && (
              <div className="px-3 py-2">
                <UsageLimitDisplay usageStatus={usageStatus} />
              </div>
            )}

            {/* Settings Button */}
            {!sidebarCollapsed && (
              <div className="p-2 border-t border-slate-200 relative">
                {settingsOpen && (
                  <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg py-1 overflow-hidden">
                    <button
                      onClick={() => {
                        setShowAbout(true);
                        setSettingsOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors text-left"
                    >
                      <Info size={16} className="text-slate-600" />
                      <span>About</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="w-full flex items-center justify-between px-7 py-4 text-sm text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings size={16} className="text-slate-600" />
                    <span>Settings</span>
                  </div>
                  {!usageStatus.loading && (
                    <div>
                      {(usageStatus.isAdmin || usageStatus.tier === 'admin') ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 border border-amber-200">
                          Admin
                        </span>
                      ) : usageStatus.tier === 'premium' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700 border border-purple-200">
                          Premium
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
                          Free
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative z-10">
            {showCourseInfo && currentCourseDocCount > 0 && enrollmentStatus.isEnrolled ? (
              /* Chat Interface */
              <div className="flex-1 flex flex-col min-h-0">
                <ChatSection 
                  messages={chatMessages}
                  inputValue={chatInput}
                  onInputChange={setChatInput}
                  onSend={handleChatSend}
                  isLoading={isChatLoading}
                  isFullScreen={true}
                  user={user}
                  currentPagePDF={null}
                />
              </div>
            ) : showCourseInfo ? (
              /* Course Info - Need to Scan */
              <div className="flex-1 flex items-center justify-center p-8 bg-white">
                <div className="max-w-2xl w-full">
                  <CourseInfo 
                    courseDetails={courseDetails}
                    onScan={handleScan}
                    isScanning={isScanning}
                    scanProgress={scanProgress}
                    scanTimeLeft={scanTimeLeft}
                    scanStatus={status}
                    hasDocuments={currentCourseDocCount > 0}
                    onBack={handleBackToCourseSelector}
                    showBackButton={false}
                    enrollmentStatus={enrollmentStatus}
                    onEnroll={handleEnroll}
                    isLoggedIn={isLoggedIn}
                    newDocumentsFound={newDocumentsFound}
                  />
                </div>
              </div>
            ) : (
              /* Welcome Screen */
              <div className="flex-1 flex items-center justify-center p-8 relative">
                <div className="text-center relative z-20">
                  <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6">
                    <img 
                      src={chrome.runtime.getURL('Canvas LM Logo.png')}
                      alt="Canvas LM Logo" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-3 flex flex-wrap items-center justify-center gap-2">
                    <span>Welcome to</span>
                    <RotatingText 
                      texts={[
                        'Canvas LM',
                        'your course expert',
                        'your digital study buddy'
                      ]}
                      rotationInterval={3000}
                      mainClassName="bg-blue-600 text-white px-4 py-2 rounded-2xl inline-flex overflow-hidden"
                    />
                  </h2>
                  <p className="text-slate-600">
                    Select a course from the sidebar to start chatting with your course materials
                  </p>
                  
                  {/* DB Overview Card - Commented out for now */}
                  {/* <div className="mt-12">
                    <AllCoursesView onLoadCourses={handleLoadAllCourses} isStandalone={true} />
                  </div> */}
                </div>
                
                {/* Made by credit */}
                <div className="absolute bottom-4 right-4 text-xs text-slate-400 z-20">
                  Made by Rasmus Alpsten
                </div>
              </div>
            )}
          </div>

          {/* Confirmation Dialog */}
          <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ open, course: null })}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove Course?</DialogTitle>
                <DialogDescription>
                  This will remove "{confirmDialog.course?.name}" from your list and delete all your chat history with this course. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDialog({ open: false, course: null })}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmRemove}
                >
                  Remove Course
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </>
    );
  }

  // Show loading skeleton while auth is being checked
  if (authLoading) {
    // Extended mode skeleton
    if (isExtensionPage) {
      return (
        <>
          <style>{CSS_VARS}</style>
          <div className="w-screen h-screen bg-slate-50 flex overflow-hidden">
            {/* Sidebar skeleton */}
            <div className="w-80 bg-slate-100 border-r border-slate-200 flex flex-col">
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-200 rounded-lg animate-pulse" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded w-24 mb-1 animate-pulse" />
                    <div className="h-3 bg-slate-200 rounded w-32 animate-pulse" />
                  </div>
                </div>
              </div>
              <div className="flex-1 p-3 space-y-2">
                <div className="h-16 bg-slate-200 rounded-lg animate-pulse" />
                <div className="h-16 bg-slate-200 rounded-lg animate-pulse" />
                <div className="h-16 bg-slate-200 rounded-lg animate-pulse" />
              </div>
            </div>
            
            {/* Main content skeleton */}
            <div className="flex-1 flex items-center justify-center">
              <div className="max-w-2xl w-full px-8">
                <div className="h-8 bg-slate-200 rounded w-3/4 mb-4 animate-pulse" />
                <div className="h-4 bg-slate-200 rounded w-full mb-2 animate-pulse" />
                <div className="h-4 bg-slate-200 rounded w-5/6 animate-pulse" />
              </div>
            </div>
          </div>
        </>
      );
    }
    
    // Popup mode skeleton
    return (
      <>
        <style>{CSS_VARS}</style>
        <div className="w-[550px] min-h-[600px] bg-gradient-to-br from-slate-50 via-white to-slate-50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-200/40 to-sky-200/40 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-blue-200/40 to-cyan-200/40 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          
          <div className="relative z-10 p-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-slate-200 rounded-2xl animate-pulse" />
                <div>
                  <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mb-1" />
                  <div className="h-3 w-40 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-slate-200 rounded-full animate-pulse" />
                <div className="w-9 h-9 bg-slate-200 rounded-full animate-pulse" />
              </div>
            </div>
            
            {/* Content skeleton */}
            <div className="space-y-4 mt-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-3 animate-pulse" />
                <div className="h-3 bg-slate-200 rounded w-full mb-2 animate-pulse" />
                <div className="h-3 bg-slate-200 rounded w-5/6 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Popup layout (original)
  return (
    <>
      <style>{CSS_VARS}</style>
      <div className="w-[550px] min-h-[600px] bg-gradient-to-br from-slate-50 via-white to-slate-50 relative overflow-hidden">
        {/* Animated background gradient orbs - Arcade style */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-200/40 to-sky-200/40 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-blue-200/40 to-cyan-200/40 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className="relative z-10 p-6">
          <Header user={user} onExpandWindow={handleExpandWindow} isExtensionPage={isExtensionPage} usageStatus={usageStatus} />
          
          <div className="space-y-4 mt-6">
            <AuthSection 
              isLoggedIn={isLoggedIn}
              userStats={userStats}
              onLogin={handleLogin}
            />
            
            {showCourseSelector && (
              <div className="animate-fade-in">
                <CourseSelector 
                  courses={courseList}
                  onSelectCourse={handleSelectCourse}
                  onRemoveEnrollment={handleRemoveEnrollment}
                  isExtensionPage={isExtensionPage}
                />
              </div>
            )}
            
            {!showCourseInfo && !showCourseSelector && (
              <div className="animate-fade-in">
                <CourseDetection 
                  status={status}
                  onDetect={handleDetect}
                />
              </div>
            )}
            
            {showCourseInfo && (
              <div className="animate-fade-in">
                <CourseInfo 
                  courseDetails={courseDetails}
                  onScan={handleScan}
                  isScanning={isScanning}
                  scanProgress={scanProgress}
                  scanTimeLeft={scanTimeLeft}
                  scanStatus={status}
                  hasDocuments={currentCourseDocCount > 0}
                  onBack={handleBackToCourseSelector}
                  showBackButton={isExtensionPage && showCourseSelector === false}
                  enrollmentStatus={enrollmentStatus}
                  onEnroll={handleEnroll}
                  isLoggedIn={isLoggedIn}
                  newDocumentsFound={newDocumentsFound}
                />
              </div>
            )}
            
            {/* Usage Limit Display - Only show when limit is reached */}
            {isLoggedIn && usageStatus.remaining === 0 && !usageStatus.loading && (
              <div className="animate-fade-in mb-4">
                <UsageLimitDisplay usageStatus={usageStatus} />
              </div>
            )}

            {/* Only show chat if user is enrolled AND has scanned documents */}
            {isLoggedIn && showCourseInfo && enrollmentStatus.isEnrolled && currentCourseDocCount > 0 && (
              <div className="animate-fade-in">
                <ChatSection 
                  messages={chatMessages}
                  inputValue={chatInput}
                  onInputChange={setChatInput}
                  onSend={handleChatSend}
                  isLoading={isChatLoading}
                  user={user}
                  currentPagePDF={currentPagePDF}
                  onContextToggle={handleContextToggle}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
