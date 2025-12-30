import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50 text-shadow',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--accent)] text-[var(--surface-base)] hover:bg-[var(--accent-light)] hover:shadow-[0_0_20px_var(--accent-glow)] hover:scale-[1.02] active:scale-[0.98]',
        destructive:
          'bg-[var(--status-error)]/20 text-[var(--status-error)] border border-[var(--status-error)]/30 hover:bg-[var(--status-error)]/30 hover:scale-[1.02] active:scale-[0.98]',
        outline:
          'border border-[var(--border-default)] bg-transparent hover:bg-[var(--surface-content)] hover:border-[var(--border-hover)] hover:scale-[1.02] active:scale-[0.98]',
        secondary:
          'bg-[var(--surface-content)] text-[var(--text-primary)] border border-[var(--border-whisper)] hover:bg-[var(--surface-elevated)] hover:border-[var(--border-hover)] hover:scale-[1.02] active:scale-[0.98]',
        ghost:
          'text-[var(--text-secondary)] hover:bg-[var(--surface-content)] hover:text-[var(--text-primary)] hover:scale-[1.02] active:scale-[0.98]',
        link: 'text-[var(--accent)] underline-offset-4 hover:underline hover:text-[var(--accent-light)]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
