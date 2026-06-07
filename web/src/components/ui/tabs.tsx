import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import type { ComponentProps, ReactNode } from 'preact';

import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps extends Omit<ComponentProps<'div'>, 'onChange'> {
  items: TabItem[];
  selectedIndex?: number;
  onChange?: (index: number) => void;
}

export function Tabs({ items, selectedIndex, onChange, className, ...props }: TabsProps) {
  return (
    <TabGroup selectedIndex={selectedIndex} onChange={onChange} className={cn('space-y-4', className)} {...props}>
      <TabList className="inline-flex rounded-lg border border-border bg-secondary/50 p-1">
        {items.map((item) => (
          <Tab
            key={item.id}
            className={({ selected }) =>
              cn(
                'rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {item.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {items.map((item) => (
          <TabPanel key={item.id}>{item.content}</TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
