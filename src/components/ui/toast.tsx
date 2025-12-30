import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cn } from '../../lib/utils';
import { AlertCircle, CheckCircle2, Info, X, Loader2 } from 'lucide-react';

const ToastProvider = ToastPrimitive.Provider;

export type ToastMessage = {
  title: string;
  description: string;
  variant: ToastVariant;
};

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-3 left-3 z-[100] flex max-h-screen w-auto flex-col gap-2 md:max-w-[320px]',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

type ToastVariant = 'neutral' | 'success' | 'error';

interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  variant?: ToastVariant;
  swipeDirection?: 'right' | 'left' | 'up' | 'down';
}

const toastVariants: Record<
  ToastVariant,
  { icon: React.ReactNode; borderColor: string; iconColor: string }
> = {
  neutral: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    borderColor: 'border-l-amber-500',
    iconColor: 'text-amber-500',
  },
  success: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    borderColor: 'border-l-emerald-500',
    iconColor: 'text-emerald-500',
  },
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    borderColor: 'border-l-red-500',
    iconColor: 'text-red-500',
  },
};

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ className, variant = 'neutral', ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    duration={3000}
    className={cn(
      'group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-lg border-l-2 px-4 py-3',
      'bg-[var(--surface-elevated)] border border-[var(--border-subtle)]',
      'shadow-lg shadow-black/20',
      'animate-in data-[state=closed]:animate-out',
      toastVariants[variant].borderColor,
      className,
    )}
    {...props}
  >
    <div className={cn('flex-shrink-0', toastVariants[variant].iconColor)}>
      {toastVariants[variant].icon}
    </div>
    <div className="flex-1 min-w-0">{props.children}</div>
    <ToastPrimitive.Close
      className={cn(
        'flex-shrink-0 rounded-md p-1',
        'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
        'hover:bg-[var(--surface-overlay)]',
        'opacity-0 transition-all group-hover:opacity-100',
        'focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]',
      )}
    >
      <X className="h-3.5 w-3.5" />
    </ToastPrimitive.Close>
  </ToastPrimitive.Root>
));
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      'text-xs font-medium',
      'text-[var(--accent)] hover:text-[var(--accent-light)]',
      'transition-colors',
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitive.Action.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn(
      'text-sm font-medium text-[var(--text-primary)] leading-tight',
      className,
    )}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn(
      'text-xs text-[var(--text-secondary)] leading-relaxed',
      className,
    )}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

export type { ToastProps, ToastVariant };
export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastAction,
  ToastTitle,
  ToastDescription,
};
