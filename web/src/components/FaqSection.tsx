import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion } from '@/components/ui/accordion';

const faqs = [
  {
    id: 'speculation',
    title: 'Is this crypto speculation?',
    content:
      'No. TIME is a prepaid hour, not an investment. I honor redemption; I do not promise price appreciation.',
  },
  {
    id: 'refund',
    title: 'Can I get a refund?',
    content:
      'Unredeemed vouchers can be refunded at my discretion within 14 days. Redeemed or transferred tokens are non-refundable.',
  },
  {
    id: 'resell',
    title: 'Can I resell my hour?',
    content: 'Yes — you can transfer TIME to another wallet. The recipient can redeem it the same way.',
  },
  {
    id: 'lost-wallet',
    title: 'What if I lose access to my wallet?',
    content:
      'Like cash or a gift card, lost wallet access means lost voucher. Back up your wallet seed phrase.',
  },
  {
    id: 'experience',
    title: 'Do I need crypto experience?',
    content: 'Only enough to install Tonkeeper and approve one purchase. Redemption is: send token + book a call.',
  },
];

export function FaqSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>FAQ</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion items={faqs} />
      </CardContent>
    </Card>
  );
}
