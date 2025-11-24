import React from 'react';
import { ScrollArea } from './ui/scroll-area';
import { FileText, Loader2 } from 'lucide-react';

export const CoursePDFDrawer = ({ 
  open, 
  documents, 
  isLoading 
}) => {
  if (!open) return null;

  return (
    <div className="overflow-hidden transition-all duration-300 ease-in-out bg-slate-50 rounded-lg mx-1 mb-1 border border-slate-300">
      <div className="p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {documents.map((doc, index) => (
              <div
                key={doc.id || index}
                className="p-2.5 bg-white hover:bg-slate-50 rounded-md border border-slate-200 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-900 font-medium break-words leading-tight">
                      {doc.fileName || doc.title || 'Untitled Document'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-xs text-slate-600 font-medium mb-1">No documents yet</p>
            <p className="text-xs text-slate-500">
              Scan this course to add documents
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};
