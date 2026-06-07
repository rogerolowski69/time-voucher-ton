import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'preact';
import { cn } from '@/lib/utils';

const alertVariants = cva('rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-card text-foreground',
      info: 'border-border bg-secondary/60 text-foreground',
      success: 'border-accent/40 bg-accent/10 text-accent',
      warning: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
      error: 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

export interface AlertProps extends ComponentProps<'div'>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="status" className={cn(alertVariants({ variant }), className)} {...props} />;
}
