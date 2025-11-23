import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AuthSection } from './components/AuthSection';
import { CourseDetection } from './components/CourseDetection';
import { CourseInfo } from './components/CourseInfo';
import { ChatSection } from './components/ChatSection';
import { CourseSelector } from './components/CourseSelector';
import { AllCoursesView } from './components/AllCoursesView';
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
        setCurrentCourseDocCount
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
  };

  const handleRemoveEnrollment = async (courseId) => {
    if (popupLogic) {
      await popupLogic.removeEnrollment(courseId);
    }
  };

  const handleBackToCourseSelector = () => {
    if (popupLogic) {
      popupLogic.backToCourseSelector();
    }
  };

  const handleLoadAllCourses = async () => {
    if (popupLogic) {
      return await popupLogic.loadAllCourses();
    }
    return [];
  };

  return (
    <>
      <style>{CSS_VARS}</style>
      <div className={isExtensionPage ? "w-screen min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 relative overflow-y-auto" : "w-[420px] min-h-[600px] bg-gradient-to-br from-slate-50 via-white to-slate-50 relative overflow-hidden"}>
        {/* Animated background gradient orbs - Arcade style */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-200/40 to-sky-200/40 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-blue-200/40 to-cyan-200/40 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className={isExtensionPage ? "relative z-10 p-8 max-w-7xl mx-auto" : "relative z-10 p-6"}>
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
                />
              </div>
            )}
            
            {isLoggedIn && showCourseInfo && (
              <div className="animate-fade-in">
                <ChatSection 
                  messages={chatMessages}
                  inputValue={chatInput}
                  onInputChange={setChatInput}
                  onSend={handleChatSend}
                  isLoading={isChatLoading}
                />
              </div>
            )}
            
            {isLoggedIn && isExtensionPage && (
              <div className="animate-fade-in">
                <AllCoursesView onLoadCourses={handleLoadAllCourses} isStandalone={true} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
