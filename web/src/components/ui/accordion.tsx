import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import type { ComponentProps, ReactNode } from 'preact';

import { cn } from '@/lib/utils';

export interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
}

interface AccordionProps extends ComponentProps<'div'> {
  items: AccordionItem[];
}

export function Accordion({ items, className, ...props }: AccordionProps) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {items.map((item) => (
        <Disclosure key={item.id} as="div" className="rounded-lg border border-border bg-card/40">
          {({ open }) => (
            <>
              <DisclosureButton className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-secondary/40">
                {item.title}
                <span
                  className={cn(
                    'ml-3 text-lg leading-none text-muted-foreground transition-transform',
                    open && 'rotate-45',
                  )}
                  aria-hidden
                >
                  +
                </span>
              </DisclosureButton>
              <DisclosurePanel className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                {item.content}
              </DisclosurePanel>
            </>
          )}
        </Disclosure>
      ))}
    </div>
  );
}
