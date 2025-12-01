import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { MessageCircle, Send } from 'lucide-react';
import { trefoil } from 'ldrs';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

// Register the Trefoil loader
if (typeof window !== 'undefined') {
  trefoil.register();
}

// Parse and render text with LaTeX, bold, and bullets
const formatAIResponse = (text) => {
  if (!text) return text;
  
  const lines = text.split('\n');
  
  return lines.map((line, lineIndex) => {
    // Check if line starts with ### (heading), * (bullet point) or numbered list
    const isHeading = line.trim().startsWith('### ');
    const isBullet = line.trim().startsWith('* ');
    const isNumbered = /^\d+\./.test(line.trim());
    let content = isBullet ? line.trim().substring(2) : isHeading ? line.trim().substring(4) : line;
    
    // Process the content for LaTeX and bold
    const processContent = (text) => {
      const parts = [];
      let currentIndex = 0;
      let partIndex = 0;
      
      // Combined regex to match both inline LaTeX $...$ and bold **...**
      const combinedRegex = /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\*\*[^\*]+?\*\*)/g;
      let match;
      
      while ((match = combinedRegex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > currentIndex) {
          parts.push(
            <span key={`text-${lineIndex}-${partIndex++}`}>
              {text.substring(currentIndex, match.index)}
            </span>
          );
        }
        
        const matchedText = match[1];
        
        // Check if it's LaTeX (block or inline)
        if (matchedText.startsWith('$$') && matchedText.endsWith('$$')) {
          // Block math
          const latex = matchedText.slice(2, -2).trim();
          parts.push(
            <BlockMath key={`block-math-${lineIndex}-${partIndex++}`} math={latex} />
          );
        } else if (matchedText.startsWith('$') && matchedText.endsWith('$')) {
          // Inline math
          const latex = matchedText.slice(1, -1);
          parts.push(
            <InlineMath key={`inline-math-${lineIndex}-${partIndex++}`} math={latex} />
          );
        } else if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
          // Bold text
          const boldText = matchedText.slice(2, -2);
          parts.push(
            <strong key={`bold-${lineIndex}-${partIndex++}`} className="font-bold">
              {boldText}
            </strong>
          );
        }
        
        currentIndex = match.index + matchedText.length;
      }
      
      // Add remaining text
      if (currentIndex < text.length) {
        parts.push(
          <span key={`text-${lineIndex}-${partIndex++}`}>
            {text.substring(currentIndex)}
          </span>
        );
      }
      
      return parts.length > 0 ? parts : text;
    };
    
    // Render based on line type
    if (isHeading) {
      return (
        <h3 key={lineIndex} className="text-lg font-bold text-slate-900 mt-4 mb-2">
          {processContent(content)}
        </h3>
      );
    } else if (isBullet) {
      return (
        <div key={lineIndex} className="flex gap-2 ml-2">
          <span className="text-slate-600 flex-shrink-0">•</span>
          <div className="flex-1">{processContent(content)}</div>
        </div>
      );
    } else if (isNumbered) {
      return (
        <div key={lineIndex} className="ml-2">
          {processContent(line)}
        </div>
      );
    } else if (line.trim()) {
      return (
        <div key={lineIndex}>{processContent(line)}</div>
      );
    } else {
      return <br key={lineIndex} />;
    }
  });
};

export const ChatSection = ({ 
  messages, 
  inputValue, 
  onInputChange, 
  onSend, 
  isLoading,
  isFullScreen = false,
  user,
  currentPagePDF = null,
  onContextToggle = null
}) => {
  const scrollContainerRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const [contextEnabled, setContextEnabled] = useState(true);

  // Notify parent when context toggle changes
  useEffect(() => {
    if (onContextToggle && currentPagePDF) {
      onContextToggle(contextEnabled);
    }
  }, [contextEnabled, currentPagePDF, onContextToggle]);

  // Debug logging
  useEffect(() => {
    if (currentPagePDF) {
      console.log('📄 ChatSection received currentPagePDF:', currentPagePDF);
      console.log('🎯 Context enabled:', contextEnabled);
    }
  }, [currentPagePDF, contextEnabled]);

  // Auto-scroll to bottom when messages change or when loading
  useEffect(() => {
    // For fullscreen view
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
    // For popup view with ScrollArea
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [messages, isLoading]);

  if (isFullScreen) {
    // Full-screen layout for extended page
    return (
      <div className="flex-1 flex flex-col h-full min-h-0">
        {/* Messages Area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
          <div className="w-full px-8 py-8">
            {/* Context Indicator */}
            {currentPagePDF && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4 flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      📄 Viewing Context
                    </p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">
                      Active
                    </span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1 truncate">
                    {currentPagePDF.fileName}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Questions will prioritize this document
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6">
                    <img src={chrome.runtime.getURL('Canvas LM Logo.png')} alt="Canvas LM" className="w-20 h-20 rounded-3xl" />
                  </div>
                  <p className="text-lg text-slate-700 font-medium mb-2">Ready to help!</p>
                  <p className="text-sm text-slate-500">Ask me anything about your course materials</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div 
                    key={idx}
                    className={`flex gap-3 animate-fade-in ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div className={`flex gap-3 max-w-[80%] items-start ${
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    }`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-sky-500 text-white font-semibold text-sm'
                          : ''
                      }`}>
                        {msg.role === 'user' ? (
                          user?.displayName?.charAt(0).toUpperCase() || 'U'
                        ) : (
                          <img src={chrome.runtime.getURL('Canvas LM Logo.png')} alt="Canvas LM" className="w-8 h-8 rounded-xl" />
                        )}
                      </div>
                      <div 
                        className={`p-4 rounded-2xl shadow-sm ${
                          msg.role === 'user' 
                            ? 'bg-gradient-to-br from-blue-100 to-sky-100 text-slate-800' 
                            : 'bg-white border border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="text-sm leading-relaxed space-y-1">
                          {msg.role === 'user' 
                            ? msg.content 
                            : formatAIResponse(msg.content)
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex gap-3 animate-fade-in justify-start">
                  <div className="flex gap-3 max-w-[80%] items-start">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0">
                      <img src={chrome.runtime.getURL('Canvas LM Logo.png')} alt="Canvas LM" className="w-8 h-8 rounded-xl" />
                    </div>
                    <div className="p-4 rounded-2xl shadow-sm bg-white border border-slate-200">
                      <div className="flex items-center gap-3">
                        <l-trefoil
                          size="28"
                          stroke="3.5"
                          stroke-length="0.15"
                          bg-opacity="0.1"
                          speed="1.4"
                          color="#3b82f6"
                        />
                        <span className="text-sm text-slate-500">Searching course...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Input Area - Fixed at Bottom */}
        <div className="bg-white">
          <div className="w-full px-8 py-4">
            <div className="flex gap-3">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
                placeholder="Ask me about your course..."
                disabled={isLoading}
                className="flex-1 h-12 text-base border-slate-600"
              />
              <Button
                onClick={onSend}
                disabled={isLoading || !inputValue.trim()}
                size="icon"
                variant="gradient"
                className="flex-shrink-0 w-12 h-12"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Card layout for popup
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-sky-500 rounded-xl flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-lg">Chat with the course</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Context Indicator for Popup */}
        {currentPagePDF && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-3 flex items-center gap-2">
            <div className="flex-shrink-0">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium text-blue-900">
                  Lecture detected
                </p>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-blue-600 truncate flex-1">
                  Focus this lecture when answering
                </p>
                <button
                  onClick={() => setContextEnabled(!contextEnabled)}
                  className={`flex-shrink-0 relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                    contextEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle context"
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      contextEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}
        <ScrollArea ref={scrollAreaRef} className="h-[320px] pr-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4">
                  <img src={chrome.runtime.getURL('Canvas LM Logo.png')} alt="Canvas LM" className="w-16 h-16 rounded-2xl" />
                </div>
                <p className="text-sm text-slate-600 font-medium mb-1">Ready to help!</p>
                <p className="text-xs text-slate-500">Ask me anything about your course materials</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div 
                  key={idx}
                  className={`flex flex-col animate-fade-in ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex flex-col gap-1.5 max-w-[95%]">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-500 to-sky-500 self-end text-white font-semibold text-xs'
                        : 'self-start'
                    }`}>
                      {msg.role === 'user' ? (
                        user?.displayName?.charAt(0).toUpperCase() || 'U'
                      ) : (
                        <img src={chrome.runtime.getURL('Canvas LM Logo.png')} alt="Canvas LM" className="w-7 h-7 rounded-lg" />
                      )}
                    </div>
                    <div 
                      className={`p-3 rounded-2xl shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-gradient-to-br from-blue-100 to-sky-100 text-slate-800' 
                          : 'bg-white border border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="text-sm leading-relaxed space-y-1">
                        {msg.role === 'user' 
                          ? msg.content 
                          : formatAIResponse(msg.content)
                        }
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex flex-col animate-fade-in items-start">
                <div className="flex flex-col gap-1.5 max-w-[95%]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 self-start">
                    <img src={chrome.runtime.getURL('Canvas LM Logo.png')} alt="Canvas LM" className="w-7 h-7 rounded-lg" />
                  </div>
                  <div className="p-3 rounded-2xl shadow-sm bg-white border border-slate-200">
                    <div className="flex items-center gap-3">
                      <l-trefoil
                        size="28"
                        stroke="3.5"
                        stroke-length="0.15"
                        bg-opacity="0.1"
                        speed="1.4"
                        color="#3b82f6"
                      />
                      <span className="text-sm text-slate-500">Searching course...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="flex gap-2 pt-2">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
            placeholder="Ask about your course..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={onSend}
            disabled={isLoading || !inputValue.trim()}
            size="icon"
            variant="gradient"
            className="flex-shrink-0"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};