import React, { useEffect, useRef } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { MessageCircle, Send, Bot, User } from 'lucide-react';
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
    // Check if line starts with * (bullet point) or numbered list
    const isBullet = line.trim().startsWith('* ');
    const isNumbered = /^\d+\./.test(line.trim());
    let content = isBullet ? line.trim().substring(2) : line;
    
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
    if (isBullet) {
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
  isFullScreen = false
}) => {
  if (isFullScreen) {
    // Full-screen layout for extended page
    return (
      <div className="flex-1 flex flex-col h-full">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-8 py-8">
            <div className="space-y-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-sky-100 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
                    <Bot className="w-10 h-10 text-blue-600" />
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
                    <div className={`flex gap-3 max-w-[80%] ${
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    }`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-sky-500'
                          : 'bg-gradient-to-br from-slate-600 to-slate-700'
                      }`}>
                        {msg.role === 'user' ? (
                          <User className="w-4 h-4 text-white" />
                        ) : (
                          <Bot className="w-4 h-4 text-white" />
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
                  <div className="flex gap-3 max-w-[80%]">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-slate-600 to-slate-700">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="p-4 rounded-2xl shadow-sm bg-white border border-slate-200">
                      <div className="flex items-center gap-3">
                        <l-trefoil
                          size="28"
                          stroke="3.5"
                          stroke-length="0.15"
                          bg-opacity="0.1"
                          speed="1.4"
                          color="#7c3aed"
                        />
                        <span className="text-sm text-slate-500">Thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Input Area - Fixed at Bottom */}
        <div className="border-t border-slate-200 bg-white p-4">
          <div className="w-full px-4">
            <div className="flex gap-3">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
                placeholder="Ask about your course..."
                disabled={isLoading}
                className="flex-1 h-12 text-base"
              />
              <Button
                onClick={onSend}
                disabled={isLoading || !inputValue.trim()}
                size="lg"
                variant={isLoading || !inputValue.trim() ? "secondary" : "gradient"}
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
        <ScrollArea className="h-[320px] pr-4">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-sky-100 rounded-2xl flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-blue-600" />
                </div>
                <p className="text-sm text-slate-600 font-medium mb-1">Ready to help!</p>
                <p className="text-xs text-slate-500">Ask me anything about your course materials</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div 
                  key={idx}
                  className={`flex gap-2 animate-fade-in ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div className={`flex gap-2 max-w-[80%] ${
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-500 to-sky-500'
                        : 'bg-gradient-to-br from-slate-600 to-slate-700'
                    }`}>
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 text-white" />
                      ) : (
                        <Bot className="w-4 h-4 text-white" />
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
              <div className="flex gap-2 animate-fade-in justify-start">
                <div className="flex gap-2 max-w-[80%]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-slate-600 to-slate-700">
                    <Bot className="w-4 h-4 text-white" />
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
                      <span className="text-sm text-slate-500">Thinking...</span>
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
            variant={isLoading || !inputValue.trim() ? "secondary" : "gradient"}
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
