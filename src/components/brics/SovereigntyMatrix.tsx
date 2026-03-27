'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COLORS as C } from '@/lib/brics-constants';

type CS='direct'|'indirect'|'transit'|'none'|'landlocked';
interface Member{code:string;name:string;nameZh:string;tier?:string}
interface PathNode{code:string;name:string;nameZh:string}
interface TransitEdge{from:string;to:string;cables:string[]}
interface Cell{from:string;to:string;status:CS;directCableCount:number;directCables:string[];transitPath?:string[];transitPathNames?:PathNode[];transitEdges?:TransitEdge[]}
interface Data{members:Member[];partners?:Member[];allCountries?:Member[];matrix:Cell[];summary:Record<string,number>;transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[]}

const SC:Record<CS,{bg:string;key:string;tipKey?:string}>={
  direct:{bg:'#22C55E',key:'matrix.direct'},
  indirect:{bg:'#F59E0B',key:'matrix.indirect',tipKey:'matrix.indirectTip'},
  transit:{bg:'#EF4444',key:'matrix.transit',tipKey:'matrix.transitTip'},
  none:{bg:'#6B7280',key:'matrix.none'},
  landlocked:{bg:'#374151',key:'matrix.landlocked'},
};

interface Props { onCellClick?:(from:string,to:string,cables:string[])=>void; }

export default function SovereigntyMatrix({onCellClick}:Props){
  const{tb,isZh}=useBRICS();
  const[data,setData]=useState<Data|null>(null);
  const[loading,setLoading]=useState(true);
  const[tip,setTip]=useState<{x:number;y:number;cell:Cell;fn:string;tn:string}|null>(null);
  const[hlRow,setHlRow]=useState<string|null>(null);
  const[hlCol,setHlCol]=useState<string|null>(null);
  const[showMethod,setShowMethod]=useState(false);
  const[showAll,setShowAll]=useState(false); // false=仅成员国 true=全部21国

  useEffect(()=>{fetch('/api/brics/sovereignty').then(r=>r.json()).then(setData).catch(console.error).finally(()=>setLoading(false));},[]);

  const getCell=useCallback((f:string,t:string)=>data?.matrix.find(m=>m.from===f&&m.to===t),[data]);
  const getName=useCallback((code:string)=>{const all=[...(data?.members||[]),...(data?.partners||[]),...(data?.allCountries||[])];const m=all.find(x=>x.code===code);return isZh?(m?.nameZh??code):(m?.name??code);},[data,isZh]);

  if(loading||!data)return<div style={{height:400,borderRadius:14,background:'rgba(26,45,74,.4)',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.3)',fontSize:14}}>{loading?(isZh?'正在计算数字主权矩阵…':'Computing sovereignty matrix…'):''}</div>;

  const{members,summary}=data;
  const partners=data.partners||[];
  const displayMembers=showAll?[...members,...partners]:members;
  const cs=showAll?36:46;const hw=showAll?70:80;

  return(
    <div>
      {/* 控制栏 */}
      <div className="no-print" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        {/* 成员/全部切换 */}
        <div style={{display:'flex',gap:2,background:'rgba(255,255,255,.03)',borderRadius:8,padding:3,border:`1px solid ${C.gold}15`}}>
          <button onClick={()=>setShowAll(false)} style={{padding:'5px 14px',fontSize:11,fontWeight:600,borderRadius:6,border:'none',cursor:'pointer',transition:'all .2s',background:!showAll?`${C.gold}25`:'transparent',color:!showAll?C.gold:'rgba(255,255,255,.4)'}}>
            {isZh?'仅成员国 (11)':'Members Only (11)'}
          </button>
          <button onClick={()=>setShowAll(true)} style={{padding:'5px 14px',fontSize:11,fontWeight:600,borderRadius:6,border:'none',cursor:'pointer',transition:'all .2s',background:showAll?`${C.gold}25`:'transparent',color:showAll?C.gold:'rgba(255,255,255,.4)'}}>
            {isZh?'全部 (21)':'All (21)'}
          </button>
        </div>
        <div style={{display:'flex',gap:8}}>
          {onCellClick&&<span style={{fontSize:10,color:'rgba(255,255,255,.25)',alignSelf:'center'}}>{isZh?'点击方块 → 地图高亮':'Click cell → map highlight'}</span>}
          <button onClick={()=>setShowMethod(!showMethod)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:`1px solid ${C.gold}25`,background:showMethod?`${C.gold}15`:'rgba(255,255,255,.03)',color:showMethod?C.gold:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:11,fontWeight:600,transition:'all .2s'}}>
            <span style={{fontSize:13}}>{showMethod?'\u25B2':'\u2139'}</span> {tb('method.title')}
          </button>
        </div>
      </div>

      {showMethod&&(
        <div style={{marginBottom:16,padding:20,borderRadius:12,border:`1px solid ${C.gold}15`,background:'rgba(15,29,50,.6)',display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{tb('method.title')}</div>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.scope')}</p>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.update')}</p>
          <div style={{borderTop:`1px solid ${C.gold}10`,paddingTop:10,marginTop:4}}>
            <div style={{fontSize:11,fontWeight:600,color:`${C.gold}80`,marginBottom:4}}>{tb('method.disclaimer')}</div>
            <p style={{fontSize:11,color:'rgba(255,255,255,.3)',lineHeight:1.6,margin:0}}>{tb('method.disclaimerText')}</p>
          </div>
        </div>
      )}

      {/* 矩阵 */}
      <div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${C.gold}12`,background:'rgba(15,29,50,.5)',padding:20}}>
        <div style={{display:'inline-block',minWidth:'fit-content'}}>
          <div style={{display:'flex',marginLeft:hw,height:showAll?65:75,marginBottom:4}}>
            {displayMembers.map(m=>(
              <div key={`col-${m.code}`} style={{width:cs,position:'relative',height:'100%'}}>
                <span style={{position:'absolute',bottom:0,left:'70%',fontSize:showAll?8:10,fontWeight:600,whiteSpace:'nowrap',color:hlCol===m.code?C.gold:m.tier==='partner'?'rgba(255,255,255,.3)':'rgba(255,255,255,.45)',transition:'color .15s',transform:'rotate(-50deg)',transformOrigin:'bottom left'}}>
                  {isZh?m.nameZh:m.name}
                </span>
              </div>
            ))}
          </div>

          {displayMembers.map(rm=>(
            <div key={rm.code} style={{display:'flex',alignItems:'center'}}>
              <div style={{width:hw,fontSize:showAll?8:10,fontWeight:600,color:hlRow===rm.code?C.gold:rm.tier==='partner'?'rgba(255,255,255,.3)':'rgba(255,255,255,.4)',textAlign:'right',paddingRight:showAll?6:10,transition:'color .15s',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={isZh?rm.nameZh:rm.name}>
                {isZh?rm.nameZh:rm.name}
              </div>
              {displayMembers.map(cm=>{
                const self=rm.code===cm.code;
                const cell=self?null:getCell(rm.code,cm.code);
                const cfg=cell?SC[cell.status]:null;
                const hl=hlRow===rm.code||hlCol===cm.code;
                return(
                  <div key={`${rm.code}-${cm.code}`} style={{width:cs,height:cs,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:showAll?3:4,margin:showAll?0.5:1,cursor:self?'default':'pointer',background:self?`${C.gold}06`:cfg?`${cfg.bg}${hl?'35':'20'}`:'transparent',transition:'background .15s',position:'relative'}}
                    onMouseEnter={e=>{if(self||!cell)return;setHlRow(rm.code);setHlCol(cm.code);
                      const r=e.currentTarget.getBoundingClientRect();
                      setTip({x:r.right,y:r.top,cell,fn:getName(rm.code),tn:getName(cm.code)});}}
                    onMouseLeave={()=>{setHlRow(null);setHlCol(null);setTip(null);}}
                    onClick={()=>{if(!self&&cell&&onCellClick){onCellClick(rm.code,cm.code,cell.directCables);}}}>
                    {self?<span style={{fontSize:showAll?7:9,color:`${C.gold}25`}}>{isZh?(rm.nameZh||'').slice(0,1):rm.code}</span>
                    :cfg?<>
                      <span style={{width:showAll?7:10,height:showAll?7:10,borderRadius:'50%',background:cfg.bg,opacity:.85}} />
                      {!showAll&&cell&&cell.directCableCount>0&&<span style={{position:'absolute',bottom:3,right:5,fontSize:8,color:'rgba(255,255,255,.35)',fontFeatureSettings:'"tnum"'}}>{cell.directCableCount}</span>}
                    </>:null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div style={{display:'flex',flexWrap:'wrap',gap:16,marginTop:16}}>
        {(['direct','indirect','transit','none','landlocked'] as CS[]).map(s=>(
          <LI key={s} status={s} label={`${tb(SC[s].key)} — ${summary[s]??0} ${tb('matrix.pairs')}`} tipText={SC[s].tipKey?tb(SC[s].tipKey!):undefined} />
        ))}
        <span style={{fontSize:12,color:'rgba(255,255,255,.25)',marginLeft:8}}>{tb('matrix.total',{n:summary.totalPairs})}</span>
      </div>

      {tip&&<ET tip={tip} tb={tb} isZh={isZh} />}
    </div>
  );
}

function LI({status,label,tipText}:{status:CS;label:string;tipText?:string}){
  const ref=useRef<HTMLDivElement>(null);const[show,setShow]=useState(false);const[pos,setPos]=useState({x:0,y:0});
  return(<>
    <div ref={ref} style={{display:'flex',alignItems:'center',gap:6,cursor:tipText?'help':'default'}}
      onMouseEnter={()=>{if(!tipText||!ref.current)return;const r=ref.current.getBoundingClientRect();setPos({x:r.right+10,y:r.top+r.height/2});setShow(true);}}
      onMouseLeave={()=>setShow(false)}>
      <span style={{width:12,height:12,borderRadius:3,background:SC[status].bg,opacity:.85}} /><span style={{fontSize:12,color:'rgba(255,255,255,.5)'}}>{label}</span>
    </div>
    {show&&tipText&&<div style={{position:'fixed',left:pos.x,top:pos.y,transform:'translateY(-50%)',maxWidth:280,background:'rgba(10,18,36,.97)',border:`1px solid ${C.gold}30`,borderRadius:8,padding:'8px 12px',fontSize:11,color:'#D1D5DB',lineHeight:1.6,zIndex:9999,pointerEvents:'none',boxShadow:'0 4px 20px rgba(0,0,0,.5)',whiteSpace:'normal'}}>{tipText}</div>}
  </>);
}

function ET({tip,tb,isZh}:{tip:{x:number;y:number;cell:Cell;fn:string;tn:string};tb:(k:string,p?:Record<string,string|number>)=>string;isZh:boolean}){
  const{cell,fn,tn}=tip;const cfg=SC[cell.status];
  const rm:Record<CS,string>={none:'matrix.riskCritical',transit:'matrix.riskHigh',indirect:'matrix.riskMedium',direct:'matrix.riskLow',landlocked:'matrix.riskNa'};
  const rc:Record<CS,string>={none:'matrix.recNone',transit:'matrix.recTransit',indirect:'matrix.recIndirect',direct:'matrix.recDirect',landlocked:'matrix.recLandlocked'};
  const clr:Record<CS,string>={none:'#EF4444',transit:'#F59E0B',indirect:'#3B82F6',direct:'#22C55E',landlocked:'#6B7280'};
  const left=tip.x+16;const adj=left+340>(typeof window!=='undefined'?window.innerWidth:1200)?tip.x-356:left;

  /* 构建海缆路由描述 */
  const edges=cell.transitEdges||[];
  const names=cell.transitPathNames||[];

  return(
    <div style={{position:'fixed',left:adj,top:Math.max(8,tip.y-20),width:340,background:'rgba(10,18,36,.97)',backdropFilter:'blur(16px)',border:`1px solid ${C.gold}30`,borderRadius:12,padding:0,zIndex:9999,pointerEvents:'none',boxShadow:'0 12px 40px rgba(0,0,0,.6)',overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.gold}15`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{fn} → {tn}</span>
        <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:4,background:`${cfg.bg}20`,color:cfg.bg}}>{tb(cfg.key)}</span>
      </div>
      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        {/* 直连: 显示海缆列表 */}
        {cell.status==='direct'&&cell.directCableCount>0&&(
          <div>
            <div style={{fontSize:11,color:'rgba(255,255,255,.5)',marginBottom:4}}>{tb('matrix.cables',{n:cell.directCableCount})}</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {cell.directCables.slice(0,5).map(s=><span key={s} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'rgba(34,197,94,.1)',color:'#22C55E',border:'1px solid rgba(34,197,94,.2)'}}>{s}</span>)}
            </div>
          </div>
        )}

        {/* 金砖中转(indirect) / 非金砖中转(transit): 显示逐跳海缆路由 */}
        {(cell.status==='indirect'||cell.status==='transit')&&edges.length>0&&(
          <div style={{background:cell.status==='indirect'?'rgba(245,158,11,.05)':'rgba(239,68,68,.05)',border:`1px solid ${cell.status==='indirect'?'rgba(245,158,11,.12)':'rgba(239,68,68,.12)'}`,borderRadius:8,padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
            <div style={{fontSize:9,fontWeight:700,color:cell.status==='indirect'?'#F59E0B80':'#EF444480',textTransform:'uppercase',letterSpacing:'.04em'}}>
              {isZh?(cell.status==='indirect'?'🔗 经由金砖国家中转':'⚠ 经由非金砖国家中转'):(cell.status==='indirect'?'🔗 Via BRICS nations':'⚠ Via non-BRICS nations')}
            </div>
            {edges.map((e,i)=>{
              const fromName=names.find(n=>n.code===e.from);
              const toName=names.find(n=>n.code===e.to);
              const fn2=isZh?(fromName?.nameZh||e.from):(fromName?.name||e.from);
              const tn2=isZh?(toName?.nameZh||e.to):(toName?.name||e.to);
              const isBricsNode=names.find(n=>n.code===e.to);
              const isNonBrics=cell.status==='transit'&&i<edges.length-1&&!(['BR','RU','IN','CN','ZA','SA','IR','EG','AE','ET','ID','BY','BO','KZ','TH','CU','UG','MY','UZ','NG','VN'].includes(e.to));
              return(
                <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                  <span style={{color:'rgba(255,255,255,.6)',fontWeight:600,flexShrink:0}}>{fn2}</span>
                  <span style={{fontSize:9,color:'rgba(255,255,255,.2)'}}>→</span>
                  <div style={{flex:1,display:'flex',flexWrap:'wrap',gap:2}}>
                    {e.cables.slice(0,2).map(cab=>(
                      <span key={cab} style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:isNonBrics?'rgba(239,68,68,.1)':'rgba(212,175,55,.08)',color:isNonBrics?'#EF4444':'#D4AF37',border:`1px solid ${isNonBrics?'rgba(239,68,68,.15)':'rgba(212,175,55,.12)'}`}}>{cab}</span>
                    ))}
                  </div>
                  <span style={{fontSize:9,color:'rgba(255,255,255,.2)'}}>→</span>
                  <span style={{color:isNonBrics?'#EF4444':'rgba(255,255,255,.6)',fontWeight:isNonBrics?700:600,flexShrink:0}}>{tn2}{isNonBrics?' ⚠':''}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 金砖中转旧文字提示 — 仅在没有 edges 时回退 */}
        {cell.status==='indirect'&&edges.length===0&&names.length>0&&(
          <div style={{fontSize:11,color:'#F59E0B',background:'rgba(245,158,11,.06)',border:'1px solid rgba(245,158,11,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>
            🔗 {isZh?'中转路径：':'Transit path: '}{names.map(n=>isZh?n.nameZh:n.name).join(' → ')}
          </div>
        )}

        {/* 非金砖中转警告 */}
        {cell.status==='transit'&&<div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>⚠ {tb('matrix.transitWarn')}</div>}

        {/* 无连接 */}
        {cell.status==='none'&&<div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>🔴 {tb('matrix.noneWarn')}</div>}

        {/* 风险等级 */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.risk')}</span>
          <span style={{fontSize:11,fontWeight:600,color:clr[cell.status]}}>{tb(rm[cell.status])}</span>
        </div>

        {/* 建议 */}
        <div style={{borderTop:`1px solid ${C.gold}10`,paddingTop:10}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.rec')}</span>
          <div style={{fontSize:12,color:'#D1D5DB',marginTop:4,lineHeight:1.5}}>{tb(rc[cell.status])}</div>
        </div>
      </div>
    </div>
  );
