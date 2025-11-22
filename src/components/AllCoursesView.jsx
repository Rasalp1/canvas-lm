import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { Database, ChevronDown, ChevronUp, FileText, Users, Clock } from 'lucide-react';

export const AllCoursesView = ({ onLoadCourses }) => {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLoadCourses = async () => {
    setIsLoading(true);
    const allCourses = await onLoadCourses();
    setCourses(allCourses);
    setIsLoading(false);
    setIsExpanded(true);
  };

  if (!isExpanded) {
    return (
      <Button
        onClick={handleLoadCourses}
        disabled={isLoading}
        variant="outline"
        className="w-full justify-between h-auto py-3"
      >
        <span className="flex items-center gap-2 text-sm">
          <Database className="w-4 h-4" />
          {isLoading ? 'Loading database...' : 'View all courses in database'}
        </span>
        <ChevronDown className="w-4 h-4" />
      </Button>
    );
  }

  const totalDocs = courses.reduce((sum, c) => sum + c.documentCount, 0);
  const totalUsers = courses.reduce((sum, c) => sum + (c.totalEnrollments || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <CardTitle className="text-lg">Database Overview</CardTitle>
          </div>
          <Button
            onClick={() => setIsExpanded(false)}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-xl p-3 border border-violet-200/60">
            <p className="text-xs text-slate-600 mb-1">Courses</p>
            <p className="text-2xl font-bold text-slate-900">{courses.length}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-3 border border-emerald-200/60">
            <p className="text-xs text-slate-600 mb-1">Documents</p>
            <p className="text-2xl font-bold text-slate-900">{totalDocs}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-3 border border-blue-200/60">
            <p className="text-xs text-slate-600 mb-1">Users</p>
            <p className="text-2xl font-bold text-slate-900">{totalUsers}</p>
          </div>
        </div>

        <Separator />
        
        <ScrollArea className="h-[240px]">
          <div className="space-y-2 pr-4">
            {courses.length > 0 ? (
              courses.map((course) => (
                <div
                  key={course.id}
                  className="p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm mb-1 line-clamp-2">
                        {course.name}
                      </p>
                      <p className="text-xs text-slate-500 mb-2">ID: {course.id}</p>
                      {course.canvasInstance && (
                        <p className="text-xs text-slate-500 mb-2">{course.canvasInstance}</p>
                      )}
                      {course.lastScannedAt && (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          {new Date(course.lastScannedAt.seconds * 1000).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Badge variant="success" className="text-xs whitespace-nowrap">
                        <FileText className="w-3 h-3 mr-1" />
                        {course.documentCount}
                      </Badge>
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        <Users className="w-3 h-3 mr-1" />
                        {course.totalEnrollments || 0}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Database className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 font-medium">No courses yet</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
