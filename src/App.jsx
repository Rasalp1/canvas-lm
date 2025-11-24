import React, { useState, useEffect } from 'react';
import { Settings, ChevronDown } from 'lucide-react';
import { Header } from './components/Header';
import { CoursePDFDrawer } from './components/CoursePDFDrawer';
import { AuthSection } from './components/AuthSection';
import { CourseDetection } from './components/CourseDetection';
import { CourseInfo } from './components/CourseInfo';
import { ChatSection } from './components/ChatSection';
import { CourseSelector } from './components/CourseSelector';
import { AllCoursesView } from './components/AllCoursesView';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './components/ui/dialog';
import { Button } from './components/ui/button';
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
  const [userStats, setUserStats] = useState('');
  const [status, setStatus] = useState('Checking current page...');
  const [courseDetails, setCourseDetails] = useState(null);
  const [showCourseInfo, setShowCourseInfo] = useState(false);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [courseList, setCourseList] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
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
        setUserStats,
        setStatus,
        setCourseDetails,
        setShowCourseInfo,
        setShowCourseSelector,
        setCourseList,
        setIsScanning,
        setChatMessages,
        setIsChatLoading,
        setCurrentCourseDocCount,
        setEnrollmentStatus
      });
      popupLogic.initialize();
    }
  }, [popupLogic]);

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
      popupLogic.handleScan();
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
        <div className="w-screen h-screen bg-slate-50 flex overflow-hidden">
          {/* Left Sidebar - Course List */}
          <div className={`bg-slate-100 border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out rounded-r-3xl ${
            sidebarCollapsed ? 'w-16' : 'w-80'
          }`}>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center gap-3 transition-opacity duration-200">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-blue-500 to-sky-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <span className="text-xl font-bold text-white">C</span>
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
                  courseList.map((course) => (
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
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-sky-500 rounded-lg flex items-center justify-center flex-shrink-0 text-xs">
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
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
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
                  ))
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

            {/* Settings Button */}
            {!sidebarCollapsed && (
              <div className="p-2 border-t border-slate-200 relative">
                {settingsOpen && (
                  <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg py-2">
                    {/* Empty dropdown menu - placeholder for future settings */}
                    <div className="px-4 py-2 text-sm text-slate-500 text-center">
                      Settings coming soon
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="w-full flex items-center gap-2 px-7 py-4 text-sm text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Settings size={16} className="text-slate-600" />
                  <span>Settings</span>
                </button>
              </div>
            )}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col bg-white">
            {showCourseInfo && currentCourseDocCount > 0 && enrollmentStatus.isEnrolled ? (
              /* Chat Interface */
              <>
                <ChatSection 
                  messages={chatMessages}
                  inputValue={chatInput}
                  onInputChange={setChatInput}
                  onSend={handleChatSend}
                  isLoading={isChatLoading}
                  isFullScreen={true}
                  user={user}
                />
              </>
            ) : showCourseInfo ? (
              /* Course Info - Need to Scan */
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="max-w-2xl w-full">
                  <CourseInfo 
                    courseDetails={courseDetails}
                    onScan={handleScan}
                    isScanning={isScanning}
                    hasDocuments={currentCourseDocCount > 0}
                    onBack={handleBackToCourseSelector}
                    showBackButton={false}
                    enrollmentStatus={enrollmentStatus}
                    onEnroll={handleEnroll}
                    isLoggedIn={isLoggedIn}
                  />
                </div>
              </div>
            ) : (
              /* Welcome Screen */
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-sky-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <span className="text-4xl">💬</span>
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-3">Welcome to Canvas LM</h2>
                  <p className="text-slate-600">
                    Select a course from the sidebar to start chatting with your course materials
                  </p>
                  
                  {/* DB Overview Card - Commented out for now */}
                  {/* <div className="mt-12">
                    <AllCoursesView onLoadCourses={handleLoadAllCourses} isStandalone={true} />
                  </div> */}
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

  // Popup layout (original)
  return (
    <>
      <style>{CSS_VARS}</style>
      <div className="w-[550px] min-h-[600px] bg-gradient-to-br from-slate-50 via-white to-slate-50 relative overflow-hidden">
        {/* Animated background gradient orbs - Arcade style */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-200/40 to-sky-200/40 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-blue-200/40 to-cyan-200/40 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className="relative z-10 p-6">
          <Header user={user} onExpandWindow={handleExpandWindow} isExtensionPage={isExtensionPage} />
          
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
                  hasDocuments={currentCourseDocCount > 0}
                  onBack={handleBackToCourseSelector}
                  showBackButton={isExtensionPage && showCourseSelector === false}
                  enrollmentStatus={enrollmentStatus}
                  onEnroll={handleEnroll}
                  isLoggedIn={isLoggedIn}
                />
              </div>
            )}
            
            {isLoggedIn && showCourseInfo && enrollmentStatus.isEnrolled && (
              <div className="animate-fade-in">
                <ChatSection 
                  messages={chatMessages}
                  inputValue={chatInput}
                  onInputChange={setChatInput}
                  onSend={handleChatSend}
                  isLoading={isChatLoading}
                  user={user}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
