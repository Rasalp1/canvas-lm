import * as React from "react"

const Dialog = ({ open, onOpenChange, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="fixed inset-0 backdrop-blur-md"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-50">
        {children}
      </div>
    </div>
  );
};

const DialogContent = React.forwardRef(({ className = "", children, ...props }, ref) => (
  <div
    ref={ref}
    className={`bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 ${className}`}
    onClick={(e) => e.stopPropagation()}
    {...props}
  >
    {children}
  </div>
));
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className = "", children, ...props }) => (
  <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className}`} {...props}>
    {children}
  </div>
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className = "", children, ...props }) => (
  <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 ${className}`} {...props}>
    {children}
  </div>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef(({ className = "", children, ...props }, ref) => (
  <h3
    ref={ref}
    className={`text-lg font-semibold leading-none tracking-tight ${className}`}
    {...props}
  >
    {children}
  </h3>
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef(({ className = "", children, ...props }, ref) => (
  <p
    ref={ref}
    className={`text-sm text-slate-500 ${className}`}
    {...props}
  >
    {children}
  </p>
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
