'use client';
import { useEffect, useState } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import SovereigntyMatrix from './SovereigntyMatrix';
import BRICSMap from './BRICSMap';

const FLAGS = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];

interface Overview {
  global: { totalCables: number; totalStations: number };
  brics: { relatedCables: number; internalCables: number; memberInternalCables: number; stations: number; sovereigntyIndex: number;
    statusBreakdown: { active: number; underConstruction: number; planned: number }; memberCableCounts: Record<string, number> };
}

interface SovData {
  matrix: { from: string; to: string; status: string; directCableCount: number; directCables: string[] }[];
  summary: { direct: number; indirect: number; transit: number; none: number; landlocked: number; totalPairs: number };
}

function AnimNum({ n, suffix }: { n: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => { let start = 0; const dur = 1200; const t0 = Date.now();
    const tick = () => { const p = Math.min((Date.now() - t0) / dur, 1); const ease = 1 - Math.pow(1 - p, 3);
      setV(Math.round(start + (n - start) * ease)); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [n]);
  return <>{v.toLocaleString()}{suffix || ''}</>;
}

export default function BRICSDashboard() {
  const { tb, isZh } = useBRICS();
  const [ov, setOv] = useState<Overview | null>(null);
  const [sov, setSov] = useState<SovData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/brics/overview').then(r => r.json()),
      fetch('/api/brics/sovereignty').then(r => r.json()),
    ]).then(([o, s]) => { setOv(o); setSov(s); }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const gapPairs = sov?.matrix
    .filter(m => m.from < m.to && (m.status === 'none' || m.status === 'transit'))
    .sort((a, b) => (a.status === 'none' ? 0 : 1) - (b.status === 'none' ? 0 : 1))
    .slice(0, 12) ?? [];

  const cPct = ov ? ((ov.brics.relatedCables / ov.global.totalCables) * 100).toFixed(1) : '0';
  const sPct = ov ? ((ov.brics.stations / ov.global.totalStations) * 100).toFixed(1) : '0';

  return (
    <div style={{ minHeight: '100vh', background: C.navy, color: '#E8E0D0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        .brics-page { font-family: 'DM Sans', system-ui, sans-serif; }
        .brics-page h1, .brics-page h2 { font-family: 'Playfair Display', serif; }
        .brics-page *::-webkit-scrollbar { width: 6px; height: 6px; }
        .brics-page *::-webkit-scrollbar-track { background: ${C.navy}; }
        .brics-page *::-webkit-scrollbar-thumb { background: ${C.gold}30; border-radius: 3px; }
        .brics-page *::-webkit-scrollbar-thumb:hover { background: ${C.gold}60; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 20px ${C.gold}15; } 50% { box-shadow: 0 0 40px ${C.gold}25; } }
        .brics-section { animation: fadeUp 0.6s ease both; }
        .brics-card { background: rgba(26,45,74,0.5); border: 1px solid ${C.gold}15; border-radius: 14px; backdrop-filter: blur(12px); transition: all 0.25s; }
        .brics-card:hover { border-color: ${C.gold}35; box-shadow: 0 0 24px ${C.gold}10; }
      `}</style>

      <div className="brics-page">
        {/* ── 五色条纹 ── */}
        <div style={{ display:'flex', height: 4 }}>
          {FLAGS.map(c => <div key={c} style={{ flex:1, background:c }} />)}
        </div>

        {/* ── Hero ── */}
        <section className="brics-section" style={{ padding:'48px 32px 32px', maxWidth:1400, margin:'0 auto' }}>
          <a href="/" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', background:`${C.gold}10`, border:`1px solid ${C.gold}25`, borderRadius:20, textDecoration:'none', marginBottom:20 }}>
            <span style={{ fontSize:11, color:'#9CA3AF' }}>← {isZh ? '返回首页' : 'Back to Home'}</span>
          </a>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px', background:`${C.gold}08`, border:`1px solid ${C.gold}20`, borderRadius:20, marginBottom:16, marginLeft:12 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:C.gold }} />
            <span style={{ fontSize:12, fontWeight:600, letterSpacing:'0.06em', color:C.gold, textTransform:'uppercase' }}>{tb('badge')}</span>
          </div>
          <h1 style={{ fontSize:'clamp(30px,4.5vw,48px)', fontWeight:800, lineHeight:1.12, margin:'0 0 14px', color:'#F0E6C8', letterSpacing:'-0.02em' }}>
            {tb('title').split(' ').map((w, i) => i === 0 ?
              <span key={i} style={{ background:`linear-gradient(135deg,${C.gold},${C.goldLight})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{w} </span>
              : <span key={i}>{w} </span>
            )}
          </h1>
          <p style={{ fontSize:15, color:'rgba(255,255,255,0.4)', maxWidth:750, lineHeight:1.7, margin:0 }}>{tb('subtitle')}</p>
        </section>

        {/* ── 统计卡片 ── */}
        <section className="brics-section" style={{ padding:'0 32px 40px', maxWidth:1400, margin:'0 auto', animationDelay:'0.1s' }}>
          <SectionHead title={tb('stats.title')} />
          {ov ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:14 }}>
              <StatCard label={tb('stats.cables')} value={ov.brics.relatedCables} sub={tb('stats.globalPct', { pct: cPct, n: ov.global.totalCables })} progress={parseFloat(cPct)} color={C.gold} />
              <StatCard label={tb('stats.stations')} value={ov.brics.stations} sub={tb('stats.stationPct', { pct: sPct, n: ov.global.totalStations })} progress={parseFloat(sPct)} color={C.gold} />
              <StatCard label={tb('stats.internal')} value={ov.brics.internalCables} sub={tb('stats.internalDesc', { n: ov.brics.memberInternalCables })} color={C.goldLight} />
              <StatCard label={tb('stats.sovereignty')} value={ov.brics.sovereigntyIndex} sub={tb('stats.sovDesc')} progress={ov.brics.sovereigntyIndex}
                color={ov.brics.sovereigntyIndex >= 50 ? '#22C55E' : ov.brics.sovereigntyIndex >= 25 ? '#F59E0B' : '#EF4444'} />
              <StatCard label={tb('stats.active')} value={ov.brics.statusBreakdown.active} color="#22C55E" />
              <StatCard label={tb('stats.building')} value={ov.brics.statusBreakdown.underConstruction} color="#3B82F6" />
            </div>
          ) : <LoadingBlock h={160} />}
        </section>

        {/* ── 地图 ── */}
        <section className="brics-section" style={{ padding:'0 32px 40px', maxWidth:1400, margin:'0 auto', animationDelay:'0.2s' }}>
          <SectionHead title={tb('map.title')} />
          <BRICSMap height="560px" />
        </section>

        {/* ── 数字主权矩阵 ── */}
        <section className="brics-section" style={{ padding:'0 32px 40px', maxWidth:1400, margin:'0 auto', animationDelay:'0.3s' }}>
          <SectionHead title={tb('matrix.title')} sub={tb('matrix.subtitle')} />
          <SovereigntyMatrix />
        </section>

        {/* ── 战略缺口分析 ── */}
        <section className="brics-section" style={{ padding:'0 32px 48px', maxWidth:1400, margin:'0 auto', animationDelay:'0.4s' }}>
          <SectionHead title={tb('gap.title')} sub={tb('gap.subtitle')} />
          {gapPairs.length > 0 ? (
            <div className="brics-card" style={{ overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${C.gold}15` }}>
                      {[tb('gap.priority'), tb('gap.pair'), tb('gap.status'), tb('gap.action')].map(h =>
                        <th key={h} style={{ padding:'14px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:`${C.gold}90`, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {gapPairs.map((g, i) => {
                      const isNone = g.status === 'none';
                      const fMeta = BRICS_COUNTRY_META[g.from];
                      const tMeta = BRICS_COUNTRY_META[g.to];
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)', transition:'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = `${C.gold}06`}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding:'12px 16px' }}>
                            <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4,
                              background: isNone ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                              color: isNone ? '#EF4444' : '#F59E0B' }}>
                              {isNone ? tb('gap.high') : tb('gap.medium')}
                            </span>
                          </td>
                          <td style={{ padding:'12px 16px', color:'#F0E6C8', fontWeight:500 }}>
                            {isZh ? fMeta?.nameZh : fMeta?.name} → {isZh ? tMeta?.nameZh : tMeta?.name}
                          </td>
                          <td style={{ padding:'12px 16px' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                              <span style={{ width:8, height:8, borderRadius:'50%', background: isNone ? '#EF4444' : '#F59E0B' }} />
                              <span style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>
                                {isNone ? tb('matrix.none') : tb('matrix.transit')}
                              </span>
                            </span>
                          </td>
                          <td style={{ padding:'12px 16px', color:'rgba(255,255,255,0.5)', fontSize:12 }}>
                            {isNone ? tb('gap.buildDirect') : tb('gap.addRedundancy')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : loading ? <LoadingBlock h={200} /> : null}
        </section>

        {/* ── 页脚 ── */}
        <footer style={{ padding:'20px 32px', borderTop:`1px solid ${C.gold}10`, maxWidth:1400, margin:'0 auto', display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,0.2)' }}>
          <span>{tb('footer.source')}</span>
          <span>{tb('footer.update')}</span>
        </footer>
      </div>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom:20 }}>
      <h2 style={{ fontSize:22, fontWeight:700, color:'#F0E6C8', margin:'0 0 4px' }}>{title}</h2>
      {sub && <p style={{ fontSize:13, color:'rgba(255,255,255,0.3)', margin:0, lineHeight:1.6 }}>{sub}</p>}
    </div>
  );
}

function StatCard({ label, value, sub, progress, color }: { label: string; value: number; sub?: string; progress?: number; color: string }) {
  return (
    <div className="brics-card" style={{ padding:22, display:'flex', flexDirection:'column', gap:6 }}>
      <span style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:`${C.gold}80` }}>{label}</span>
      <span style={{ fontSize:34, fontWeight:700, color:'#F0E6C8', lineHeight:1.1, fontFeatureSettings:'"tnum"' }}><AnimNum n={value} /></span>
      {sub && <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>{sub}</span>}
      {progress !== undefined && (
        <div style={{ marginTop:4, height:4, borderRadius:2, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
          <div style={{ width:`${Math.min(100, progress)}%`, height:'100%', borderRadius:2, background:`linear-gradient(90deg,${color},${color}88)`, transition:'width 1s cubic-bezier(0.22,1,0.36,1)' }} />
        </div>
      )}
    </div>
  );
}

function LoadingBlock({ h }: { h: number }) {
  return <div style={{ height: h, borderRadius:14, background:'rgba(26,45,74,0.4)', animation:'pulse 1.5s ease-in-out infinite' }} />;
}
