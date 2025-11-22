import React from 'react';

export const Card = ({ children, className = '' }) => {
  return (
    <div className={`bg-gray-100 border-2 border-gray-900 rounded-xl p-6 ${className}`}>
      {children}
    </div>
  );
};

export const CardHeader = ({ title, icon, action }) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
        {icon && <span className="text-purple-500">{icon}</span>}
        {title}
      </h3>
      {action}
    </div>
  );
};
