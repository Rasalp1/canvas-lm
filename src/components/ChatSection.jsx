import React from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { MessageCircle, Send, Bot, User } from 'lucide-react';

export const ChatSection = ({ 
  messages, 
  inputValue, 
  onInputChange, 
  onSend, 
  isLoading 
}) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-fuchsia-500 to-pink-500 rounded-xl flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-lg">AI Assistant</CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <ScrollArea className="h-[320px] pr-4">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-2xl flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-violet-600" />
                </div>
                <p className="text-sm text-slate-600 font-medium mb-1">Ready to help!</p>
                <p className="text-xs text-slate-500">Ask me anything about your course materials</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div 
                  key={idx}
                  className={`flex gap-2 animate-fade-in ${
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
                      : 'bg-gradient-to-br from-slate-600 to-slate-700'
                  }`}>
                    {msg.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div 
                    className={`flex-1 p-3 rounded-2xl shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-br from-violet-100 to-fuchsia-100 text-slate-800' 
                        : 'bg-white border border-slate-200 text-slate-700'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))
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
