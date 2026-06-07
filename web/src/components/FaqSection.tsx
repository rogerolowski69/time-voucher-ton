import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const faqs = [
  {
    question: 'Is this crypto speculation?',
    answer:
      'No. TIME is a prepaid hour, not an investment. I honor redemption; I do not promise price appreciation.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'Unredeemed vouchers can be refunded at my discretion within 14 days. Redeemed or transferred tokens are non-refundable.',
  },
  {
    question: 'Can I resell my hour?',
    answer: 'Yes — you can transfer TIME to another wallet. The recipient can redeem it the same way.',
  },
  {
    question: 'What if I lose access to my wallet?',
    answer:
      'Like cash or a gift card, lost wallet access means lost voucher. Back up your wallet seed phrase.',
  },
  {
    question: 'Do I need crypto experience?',
    answer: 'Only enough to install Tonkeeper and approve one purchase. Redemption is: send token + book a call.',
  },
];

export function FaqSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>FAQ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {faqs.map((faq) => (
          <Disclosure key={faq.question} as="div" className="rounded-lg border border-border">
            {({ open }) => (
              <>
                <DisclosureButton className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold">
                  {faq.question}
                  <span className={cn('text-muted-foreground transition-transform', open && 'rotate-45')}>+</span>
                </DisclosureButton>
                <DisclosurePanel className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                  {faq.answer}
                </DisclosurePanel>
              </>
            )}
          </Disclosure>
        ))}
      </CardContent>
    </Card>
  );
}
