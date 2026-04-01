'use client';
import { useTranslation } from '@/lib/i18n';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function BRICSNavButton() {
  const { locale } = useTranslation();
  const pathname = usePathname();
  const isActive = pathname?.startsWith('/brics');
  const zh = locale === 'zh';
  return (
    <a href="/brics" style={{
      display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6,
      border:`1px solid ${isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)'}`,
      backgroundColor: isActive ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
      color: isActive ? '#D4AF37' : '#9CA3AF',
      cursor:'pointer', transition:'all 0.2s', fontSize:11, fontWeight:500,
      textDecoration:'none', flexShrink:0, whiteSpace:'nowrap',
    }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor='rgba(212,175,55,0.3)'; e.currentTarget.style.backgroundColor='rgba(212,175,55,0.08)'; e.currentTarget.style.color='#D4AF37'; } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; e.currentTarget.style.backgroundColor='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#9CA3AF'; } }}>
      <Link href="/sovereign-network">自主权网络</Link>
      <span style={{ display:'flex', gap:1, borderRadius:2, overflow:'hidden', flexShrink:0 }}>
        {['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'].map(c => <span key={c} style={{ width:2.5, height:9, backgroundColor:c, opacity: isActive ? 0.9 : 0.55, transition:'opacity 0.2s' }} />)}
      </span>
      {zh ? '战略分析' : 'Strategic'}
    </a>
  );
}
