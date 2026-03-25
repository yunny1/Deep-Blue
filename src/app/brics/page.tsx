import type { Metadata } from 'next';
import { I18nProvider } from '@/lib/i18n';
import BRICSDashboard from '@/components/brics/BRICSDashboard';
export const metadata: Metadata = {
  title: 'BRICS Strategic Dashboard — Deep Blue',
  description: 'Submarine cable infrastructure analysis across BRICS nations.',
};
export default function BRICSPage() {
  return <I18nProvider><BRICSDashboard /></I18nProvider>;
}
