import React from 'react';
import { X, Github, Mail, BookOpen } from 'lucide-react';
import { Button } from './ui/button';
import Aurora from './ui/aurora';

export const About = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden relative">
        {/* Aurora Background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <Aurora
            colorStops={['#5227FF', '#7cff67', '#5227FF']}
            amplitude={1.0}
            blend={0.5}
            speed={1.0}
          />
        </div>

        {/* Content */}
        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800">About Canvas LM</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-slate-600" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            {/* Description */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">What is Canvas LM?</h3>
              <p className="text-slate-600 leading-relaxed">
                Canvas LM is an AI-powered Chrome extension that enhances your Canvas learning experience. 
                It uses advanced RAG (Retrieval-Augmented Generation) technology to help you understand 
                course materials, answer questions, and navigate your courses more efficiently.
              </p>
            </div>

            {/* Features */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-3">Key Features</h3>
              <ul className="space-y-2 text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Smart course detection and automatic document scanning</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>AI-powered chat to answer questions about your course materials</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Document viewing for PDFs</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Beautiful, intuitive interface with course-specific colors</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Automatic authentication with Chrome Identification</span>
                </li>
              </ul>
            </div>

            {/* Version Info */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Version</h3>
              <p className="text-slate-600">Version 1.0.0</p>
            </div>

            {/* Links */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-3">Resources</h3>
              <div className="space-y-2">
                <a
                  href="https://github.com/Rasalp1/canvas-lm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <Github size={18} />
                  <span>GitHub Repository</span>
                </a>
                <a
                  href="https://github.com/Rasalp1/canvas-lm/blob/main/PRIVACY_POLICY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <BookOpen size={18} />
                  <span>Privacy Policy</span>
                </a>
                <a
                  href="https://github.com/Rasalp1/canvas-lm/blob/main/TERMS_OF_SERVICE.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <BookOpen size={18} />
                  <span>Terms of Service</span>
                </a>
              </div>
            </div>

            {/* Credits */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Developed by</h3>
              <p className="text-slate-600">Rasmus Alpsten</p>
              <p className="text-sm text-slate-500 mt-2">Original idea by</p>
              <p className="text-slate-600">Ossian Rabow</p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-200 flex justify-end">
            <Button onClick={onClose} className="px-6">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
