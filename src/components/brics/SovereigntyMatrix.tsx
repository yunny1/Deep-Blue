'use client';
import { useEffect, useState, useCallback } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COLORS as C } from '@/lib/brics-constants';

type CS = 'direct' | 'indirect' | 'transit' | 'none' | 'landlocked';
interface Member { code: string; name: string; nameZh: string; }
interface Cell { from: string; to: string; status: CS; directCableCount: number; directCables: string[]; }
interface Data { members: Member[]; matrix: Cell[]; summary: Record<string, number>; }

const SC: Record<CS, { bg: string; key: string }> = {
  direct:     { bg: '#22C55E', key: 'matrix.direct' },
  indirect:   { bg: '#F59E0B', key: 'matrix.indirect' },
  transit:    { bg: '#EF4444', key: 'matrix.transit' },
  none:       { bg: '#6B7280', key: 'matrix.none' },
  landlocked: { bg: '#374151', key: 'matrix.landlocked' },
};

export default function SovereigntyMatrix() {
  const { tb, isZh } = useBRICS();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState<{ x: number; y: number; cell: Cell; fn: string; tn: string } | null>(null);
  const [hlRow, setHlRow] = useState<string | null>(null);
  const [hlCol, setHlCol] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brics/sovereignty').then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const getCell = useCallback((f: string, t: string) => data?.matrix.find(m => m.from === f && m.to === t), [data]);
  const getName = useCallback((code: string) => {
    const m = data?.members.find(x => x.code === code);
    return isZh ? (m?.nameZh ?? code) : (m?.name ?? code);
  }, [data, isZh]);

  if (loading || !data) return <div style={{ height:400, borderRadius:14, background:'rgba(26,45,74,0.4)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.3)', fontSize:14 }}>{loading ? (isZh ? '正在计算数字主权矩阵…' : 'Computing sovereignty matrix…') : ''}</div>;

  const { members, summary } = data;
  const cs = 48; const hw = 72;

  return (
    <div>
      <div style={{ overflowX:'auto', borderRadius:14, border:`1px solid ${C.gold}12`, background:'rgba(15,29,50,0.5)', padding:20 }}>
        <div style={{ display:'inline-block', minWidth:'fit-content' }}>
          {/* Col headers */}
          <div style={{ display:'flex', marginLeft:hw }}>
            {members.map(m => <div key={m.code} style={{ width:cs, textAlign:'center', fontSize:10, fontWeight:600, color: hlCol === m.code ? C.gold : 'rgba(255,255,255,0.4)', paddingBottom:8, transition:'color 0.15s' }}>{m.code}</div>)}
          </div>
          {/* Rows */}
          {members.map(rm => (
            <div key={rm.code} style={{ display:'flex', alignItems:'center' }}>
              <div style={{ width:hw, fontSize:10, fontWeight:600, color: hlRow === rm.code ? C.gold : 'rgba(255,255,255,0.4)', textAlign:'right', paddingRight:10, transition:'color 0.15s', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={isZh ? rm.nameZh : rm.name}>
                {isZh ? rm.nameZh : rm.name}
              </div>
              {members.map(cm => {
                const self = rm.code === cm.code;
                const cell = self ? null : getCell(rm.code, cm.code);
                const cfg = cell ? SC[cell.status] : null;
                const hl = hlRow === rm.code || hlCol === cm.code;
                return (
                  <div key={`${rm.code}-${cm.code}`} style={{ width:cs, height:cs, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:4, margin:1, cursor: self ? 'default' : 'pointer', background: self ? `${C.gold}06` : cfg ? `${cfg.bg}${hl ? '35' : '20'}` : 'transparent', transition:'background 0.15s', position:'relative' }}
                    onMouseEnter={e => { if (self || !cell) return; setHlRow(rm.code); setHlCol(cm.code);
                      const r = e.currentTarget.getBoundingClientRect();
                      setTip({ x: r.right, y: r.top, cell, fn: getName(rm.code), tn: getName(cm.code) }); }}
                    onMouseLeave={() => { setHlRow(null); setHlCol(null); setTip(null); }}>
                    {self ? <span style={{ fontSize:9, color:`${C.gold}25` }}>{rm.code}</span>
                     : cfg ? <>
                        <span style={{ width:10, height:10, borderRadius:'50%', background:cfg.bg, opacity:0.85 }} />
                        {cell && cell.directCableCount > 0 && <span style={{ position:'absolute', bottom:3, right:5, fontSize:8, color:'rgba(255,255,255,0.35)', fontFeatureSettings:'"tnum"' }}>{cell.directCableCount}</span>}
                      </> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:16, marginTop:16 }}>
        {(['direct','indirect','transit','none','landlocked'] as CS[]).map(s => (
          <div key={s} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:12, height:12, borderRadius:3, background:SC[s].bg, opacity:0.85 }} />
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{tb(SC[s].key)} — {summary[s] ?? 0} {tb('matrix.pairs')}</span>
          </div>
        ))}
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.25)', marginLeft:8 }}>{tb('matrix.total', { n: summary.totalPairs })}</span>
      </div>

      {/* Enhanced Tooltip */}
      {tip && <EnhancedTooltip tip={tip} tb={tb} />}
    </div>
  );
}

function EnhancedTooltip({ tip, tb }: { tip: { x: number; y: number; cell: Cell; fn: string; tn: string }; tb: (k: string, p?: Record<string, string | number>) => string }) {
  const { cell, fn, tn } = tip;
  const cfg = SC[cell.status];
  const riskMap: Record<CS, string> = { none: 'matrix.riskCritical', transit: 'matrix.riskHigh', indirect: 'matrix.riskMedium', direct: 'matrix.riskLow', landlocked: 'matrix.riskNa' };
  const recMap: Record<CS, string> = { none: 'matrix.recNone', transit: 'matrix.recTransit', indirect: 'matrix.recIndirect', direct: 'matrix.recDirect', landlocked: 'matrix.recLandlocked' };
  const riskColor: Record<CS, string> = { none: '#EF4444', transit: '#F59E0B', indirect: '#3B82F6', direct: '#22C55E', landlocked: '#6B7280' };

  // Position tooltip: prefer right side, fall back to left if near edge
  const left = tip.x + 16;
  const adjustedLeft = left + 300 > window.innerWidth ? tip.x - 316 : left;

  return (
    <div style={{ position:'fixed', left:adjustedLeft, top:Math.max(8, tip.y - 20), width:300, background:'rgba(10,18,36,0.97)', backdropFilter:'blur(16px)', border:`1px solid ${C.gold}30`, borderRadius:12, padding:0, zIndex:9999, pointerEvents:'none', boxShadow:`0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px ${C.gold}10`, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.gold}15`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'#F0E6C8' }}>{fn} → {tn}</span>
        <span style={{ fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:4, background:`${cfg.bg}20`, color:cfg.bg }}>{tb(cfg.key)}</span>
      </div>

      {/* Body */}
      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {/* Status detail */}
        {cell.status === 'direct' && cell.directCableCount > 0 && (
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>{tb('matrix.cables', { n: cell.directCableCount })}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {cell.directCables.slice(0, 5).map(s => (
                <span key={s} style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'rgba(34,197,94,0.1)', color:'#22C55E', border:'1px solid rgba(34,197,94,0.2)' }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {cell.status === 'transit' && (
          <div style={{ fontSize:11, color:'#F59E0B', background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)', borderRadius:6, padding:'8px 10px', lineHeight:1.6 }}>
            ⚠ {tb('matrix.transitWarn')}
          </div>
        )}
        {cell.status === 'none' && (
          <div style={{ fontSize:11, color:'#EF4444', background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:6, padding:'8px 10px', lineHeight:1.6 }}>
            🔴 {tb('matrix.noneWarn')}
          </div>
        )}

        {/* Risk */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{tb('matrix.risk')}</span>
          <span style={{ fontSize:11, fontWeight:600, color:riskColor[cell.status] }}>{tb(riskMap[cell.status])}</span>
        </div>

        {/* Recommendation */}
        <div style={{ borderTop:`1px solid ${C.gold}10`, paddingTop:10 }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{tb('matrix.rec')}</span>
          <div style={{ fontSize:12, color:'#D1D5DB', marginTop:4, lineHeight:1.5 }}>{tb(recMap[cell.status])}</div>
        </div>
      </div>
    </div>
  );
}
