import * as React from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

const Sheet = ({ open, onOpenChange, children }) => {
  return (
    <>
      {open && (
        <div 
          className="fixed inset-0 z-50 bg-black/20"
          onClick={() => onOpenChange(false)}
        />
      )}
      {children}
    </>
  )
}

const SheetContent = React.forwardRef(
  ({ className, children, side = "right", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "fixed z-50 gap-4 bg-white p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" && "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" && "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
SheetContent.displayName = "SheetContent"

const SheetHeader = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetTitle = ({ className, ...props }) => (
  <h2
    className={cn("text-lg font-semibold text-slate-900", className)}
    {...props}
  />
)
SheetTitle.displayName = "SheetTitle"

const SheetDescription = ({ className, ...props }) => (
  <p
    className={cn("text-sm text-slate-500", className)}
    {...props}
  />
)
SheetDescription.displayName = "SheetDescription"

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription }
