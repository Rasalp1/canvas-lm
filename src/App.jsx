import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AuthSection } from './components/AuthSection';
import { CourseDetection } from './components/CourseDetection';
import { CourseInfo } from './components/CourseInfo';
import { ChatSection } from './components/ChatSection';
import { CourseSelector } from './components/CourseSelector';
import { AllCoursesView } from './components/AllCoursesView';
import './styles.css';

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
        setIsChatLoading
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

  const handleLoadAllCourses = async () => {
    if (popupLogic) {
      return await popupLogic.loadAllCourses();
    }
    return [];
  };

  return (
    <div className="w-[420px] min-h-[500px] bg-white p-4">
      <Header user={user} onExpandWindow={handleExpandWindow} />
      
      <div className="space-y-4">
        <AuthSection 
          isLoggedIn={isLoggedIn}
          userStats={userStats}
          onLogin={handleLogin}
        />
        
        {showCourseSelector && (
          <CourseSelector 
            courses={courseList}
            onSelectCourse={handleSelectCourse}
          />
        )}
        
        {!showCourseInfo && !showCourseSelector && (
          <CourseDetection 
            status={status}
            onDetect={handleDetect}
          />
        )}
        
        {showCourseInfo && (
          <CourseInfo 
            courseDetails={courseDetails}
            onScan={handleScan}
            isScanning={isScanning}
          />
        )}
        
        {isLoggedIn && showCourseInfo && (
          <ChatSection 
            messages={chatMessages}
            inputValue={chatInput}
            onInputChange={setChatInput}
            onSend={handleChatSend}
            isLoading={isChatLoading}
          />
        )}
        
        {isLoggedIn && !isExtensionPage && (
          <AllCoursesView onLoadCourses={handleLoadAllCourses} />
        )}
      </div>
    </div>
  );
};
