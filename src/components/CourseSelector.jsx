import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { BookOpen, FileText, GraduationCap, X } from 'lucide-react';

export const CourseSelector = ({ courses, onSelectCourse, onRemoveEnrollment, isExtensionPage }) => {
  const [confirmDialog, setConfirmDialog] = useState({ open: false, course: null });

  const handleRemoveClick = (e, course) => {
    e.stopPropagation();
    setConfirmDialog({ open: true, course });
  };

  const handleConfirmRemove = async () => {
    if (confirmDialog.course && onRemoveEnrollment) {
      await onRemoveEnrollment(confirmDialog.course.id);
    }
    setConfirmDialog({ open: false, course: null });
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <CardTitle className="text-lg">Your courses</CardTitle>
        </div>
        <CardDescription>
          Choose one of your courses to start chatting with it
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[320px]">
          <div className="space-y-2 pr-4">
            {courses && courses.length > 0 ? (
              courses.map((course) => (
                <div key={course.id} className="relative group/item">
                  <Button
                    onClick={() => onSelectCourse(course)}
                    variant="outline"
                    className="w-full h-auto p-4 justify-start hover:border-blue-500 hover:bg-blue-50 transition-all group"
                  >
                    <div className="flex items-start gap-3 w-full text-left">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-sky-100 group-hover:from-blue-200 group-hover:to-sky-200 rounded-lg flex items-center justify-center flex-shrink-0 transition-all">
                        <BookOpen className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm mb-1 line-clamp-2">
                          {course.name}
                        </p>
                        <p className="text-xs text-slate-900">
                          ID: {course.id}
                          {course.actualPdfCount > 0 && (
                            <>
                              {" | "}
                              <FileText className="w-3 h-3 inline-block -mt-0.5 mr-0.5" />
                              {course.actualPdfCount} PDFs
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </Button>
                  {isExtensionPage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleRemoveClick(e, course)}
                      className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
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
    </Card>
  );
};
