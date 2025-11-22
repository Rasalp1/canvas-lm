import React from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { BookOpen, FileText, GraduationCap } from 'lucide-react';

export const CourseSelector = ({ courses, onSelectCourse }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-lg">Select a Course</CardTitle>
        </div>
        <CardDescription>
          Choose a course to access its materials and start chatting with the AI assistant.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[320px]">
          <div className="space-y-2 pr-4">
            {courses && courses.length > 0 ? (
              courses.map((course) => (
                <Button
                  key={course.id}
                  onClick={() => onSelectCourse(course)}
                  variant="outline"
                  className="w-full h-auto p-4 justify-start hover:border-violet-500 hover:bg-violet-50 transition-all group"
                >
                  <div className="flex items-start gap-3 w-full text-left">
                    <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-fuchsia-100 group-hover:from-violet-200 group-hover:to-fuchsia-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-all">
                      <BookOpen className="w-5 h-5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm mb-1 line-clamp-2">
                        {course.name}
                      </p>
                      <p className="text-xs text-slate-500 mb-2">ID: {course.id}</p>
                      {course.actualPdfCount > 0 && (
                        <Badge variant="success" className="text-xs">
                          <FileText className="w-3 h-3 mr-1" />
                          {course.actualPdfCount} documents
                        </Badge>
                      )}
                    </div>
                  </div>
                </Button>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <GraduationCap className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 font-medium mb-1">No courses found</p>
                <p className="text-xs text-slate-500">
                  Visit a Canvas course page to get started
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
