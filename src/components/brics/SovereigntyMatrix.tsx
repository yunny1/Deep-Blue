'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COLORS as C } from '@/lib/brics-constants';

type CS = 'direct'|'indirect'|'transit'|'none'|'landlocked';
interface Member { code:string; name:string; nameZh:string; }
interface PathNode { code:string; name:string; nameZh:string; }
interface Cell { from:string; to:string; status:CS; directCableCount:number; directCables:string[]; transitPath?:string[]; transitPathNames?:PathNode[]; }
interface Data { members:Member[]; matrix:Cell[]; summary:Record<string,number>; transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[]; }

const SC:Record<CS,{bg:string;key:string;tipKey?:string}>={
  direct:{bg:'#22C55E',key:'matrix.direct'},
  indirect:{bg:'#F59E0B',key:'matrix.indirect',tipKey:'matrix.indirectTip'},
  transit:{bg:'#EF4444',key:'matrix.transit',tipKey:'matrix.transitTip'},
  none:{bg:'#6B7280',key:'matrix.none'},
  landlocked:{bg:'#374151',key:'matrix.landlocked'},
};

export default function SovereigntyMatrix(){
  const{tb,isZh}=useBRICS();
  const[data,setData]=useState<Data|null>(null);
  const[loading,setLoading]=useState(true);
  const[tip,setTip]=useState<{x:number;y:number;cell:Cell;fn:string;tn:string}|null>(null);
  const[hlRow,setHlRow]=useState<string|null>(null);
  const[hlCol,setHlCol]=useState<string|null>(null);
  const[showMethod,setShowMethod]=useState(false);

  useEffect(()=>{fetch('/api/brics/sovereignty').then(r=>r.json()).then(setData).catch(console.error).finally(()=>setLoading(false));},[]);

  const getCell=useCallback((f:string,t:string)=>data?.matrix.find(m=>m.from===f&&m.to===t),[data]);
  const getName=useCallback((code:string)=>{const m=data?.members.find(x=>x.code===code);return isZh?(m?.nameZh??code):(m?.name??code);},[data,isZh]);

  if(loading||!data)return<div style={{height:400,borderRadius:14,background:'rgba(26,45,74,.4)',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.3)',fontSize:14}}>{loading?(isZh?'正在计算数字主权矩阵…':'Computing sovereignty matrix…'):''}</div>;

  const{members,summary}=data;
  const cs=46;const hw=80;

  return(
    <div>
      {/* 方法学按钮 */}
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <button onClick={()=>setShowMethod(!showMethod)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:`1px solid ${C.gold}25`,background:showMethod?`${C.gold}15`:'rgba(255,255,255,.03)',color:showMethod?C.gold:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:11,fontWeight:600,transition:'all .2s'}}>
          <span style={{fontSize:13}}>{showMethod?'\u25B2':'\u2139'}</span> {tb('method.title')}
        </button>
      </div>

      {showMethod&&(
        <div style={{marginBottom:16,padding:20,borderRadius:12,border:`1px solid ${C.gold}15`,background:'rgba(15,29,50,.6)',display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{tb('method.title')}</div>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.scope')}</p>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.classify')}</p>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.matrix')}</p>
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
          {/* 列头：旋转50°，左端对齐到单元格左边缘 */}
          <div style={{display:'flex',marginLeft:hw,height:75,marginBottom:4}}>
            {members.map(m=>(
              <div key={`col-${m.code}`} style={{width:cs,position:'relative',height:'100%'}}>
                <span style={{
                  position:'absolute',
                  bottom:0,
                  left:'50%',marginLeft:'-2px',
                  fontSize:10,fontWeight:600,whiteSpace:'nowrap',
                  color:hlCol===m.code?C.gold:'rgba(255,255,255,.45)',
                  transition:'color .15s',
                  transform:'rotate(-50deg)',
                  transformOrigin:'bottom left',
                }}>
                  {isZh?m.nameZh:m.name}
                </span>
              </div>
            ))}
          </div>

          {members.map(rm=>(
            <div key={rm.code} style={{display:'flex',alignItems:'center'}}>
              <div style={{width:hw,fontSize:10,fontWeight:600,color:hlRow===rm.code?C.gold:'rgba(255,255,255,.4)',textAlign:'right',paddingRight:10,transition:'color .15s',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={isZh?rm.nameZh:rm.name}>
                {isZh?rm.nameZh:rm.name}
              </div>
              {members.map(cm=>{
                const self=rm.code===cm.code;
                const cell=self?null:getCell(rm.code,cm.code);
                const cfg=cell?SC[cell.status]:null;
                const hl=hlRow===rm.code||hlCol===cm.code;
                return(
                  <div key={`${rm.code}-${cm.code}`} style={{width:cs,height:cs,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,margin:1,cursor:self?'default':'pointer',background:self?`${C.gold}06`:cfg?`${cfg.bg}${hl?'35':'20'}`:'transparent',transition:'background .15s',position:'relative'}}
                    onMouseEnter={e=>{if(self||!cell)return;setHlRow(rm.code);setHlCol(cm.code);
                      const r=e.currentTarget.getBoundingClientRect();
                      setTip({x:r.right,y:r.top,cell,fn:getName(rm.code),tn:getName(cm.code)});}}
                    onMouseLeave={()=>{setHlRow(null);setHlCol(null);setTip(null);}}>
                    {self?<span style={{fontSize:9,color:`${C.gold}25`}}>{isZh?rm.nameZh.slice(0,1):rm.code}</span>
                    :cfg?<>
                      <span style={{width:10,height:10,borderRadius:'50%',background:cfg.bg,opacity:.85}} />
                      {cell&&cell.directCableCount>0&&<span style={{position:'absolute',bottom:3,right:5,fontSize:8,color:'rgba(255,255,255,.35)',fontFeatureSettings:'"tnum"'}}>{cell.directCableCount}</span>}
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
  const ref=useRef<HTMLDivElement>(null);
  const[show,setShow]=useState(false);
  const[pos,setPos]=useState({x:0,y:0});
  return(<>
    <div ref={ref} style={{display:'flex',alignItems:'center',gap:6,cursor:tipText?'help':'default'}}
      onMouseEnter={()=>{if(!tipText||!ref.current)return;const r=ref.current.getBoundingClientRect();setPos({x:r.right+10,y:r.top+r.height/2});setShow(true);}}
      onMouseLeave={()=>setShow(false)}>
      <span style={{width:12,height:12,borderRadius:3,background:SC[status].bg,opacity:.85}} />
      <span style={{fontSize:12,color:'rgba(255,255,255,.5)'}}>{label}</span>
    </div>
    {show&&tipText&&<div style={{position:'fixed',left:pos.x,top:pos.y,transform:'translateY(-50%)',maxWidth:280,background:'rgba(10,18,36,.97)',border:`1px solid ${C.gold}30`,borderRadius:8,padding:'8px 12px',fontSize:11,color:'#D1D5DB',lineHeight:1.6,zIndex:9999,pointerEvents:'none',boxShadow:'0 4px 20px rgba(0,0,0,.5)',whiteSpace:'normal'}}>{tipText}</div>}
  </>);
}

function ET({tip,tb,isZh}:{tip:{x:number;y:number;cell:Cell;fn:string;tn:string};tb:(k:string,p?:Record<string,string|number>)=>string;isZh:boolean}){
  const{cell,fn,tn}=tip;
  const cfg=SC[cell.status];
  const riskMap:Record<CS,string>={none:'matrix.riskCritical',transit:'matrix.riskHigh',indirect:'matrix.riskMedium',direct:'matrix.riskLow',landlocked:'matrix.riskNa'};
  const recMap:Record<CS,string>={none:'matrix.recNone',transit:'matrix.recTransit',indirect:'matrix.recIndirect',direct:'matrix.recDirect',landlocked:'matrix.recLandlocked'};
  const riskColor:Record<CS,string>={none:'#EF4444',transit:'#F59E0B',indirect:'#3B82F6',direct:'#22C55E',landlocked:'#6B7280'};
  const left=tip.x+16;
  const adj=left+320>(typeof window!=='undefined'?window.innerWidth:1200)?tip.x-336:left;

  const pathStr=cell.transitPathNames
    ?cell.transitPathNames.map(n=>isZh?n.nameZh:n.name).join(' → ')
    :cell.transitPath?.join(' → ');

  return(
    <div style={{position:'fixed',left:adj,top:Math.max(8,tip.y-20),width:320,background:'rgba(10,18,36,.97)',backdropFilter:'blur(16px)',border:`1px solid ${C.gold}30`,borderRadius:12,padding:0,zIndex:9999,pointerEvents:'none',boxShadow:'0 12px 40px rgba(0,0,0,.6)',overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.gold}15`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{fn} → {tn}</span>
        <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:4,background:`${cfg.bg}20`,color:cfg.bg}}>{tb(cfg.key)}</span>
      </div>
      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        {cell.status==='direct'&&cell.directCableCount>0&&(
          <div>
            <div style={{fontSize:11,color:'rgba(255,255,255,.5)',marginBottom:4}}>{tb('matrix.cables',{n:cell.directCableCount})}</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {cell.directCables.slice(0,5).map(s=><span key={s} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'rgba(34,197,94,.1)',color:'#22C55E',border:'1px solid rgba(34,197,94,.2)'}}>{s}</span>)}
            </div>
          </div>
        )}
        {cell.status==='indirect'&&pathStr&&(
          <div style={{fontSize:11,color:'#F59E0B',background:'rgba(245,158,11,.06)',border:'1px solid rgba(245,158,11,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>
            🔗 {isZh?'中转路径：':'Transit path: '}{pathStr}
          </div>
        )}
        {cell.status==='transit'&&(
          <>
            <div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>⚠ {tb('matrix.transitWarn')}</div>
            {pathStr&&<div style={{fontSize:10,color:'rgba(255,255,255,.4)',lineHeight:1.5}}>{isZh?'路径：':'Path: '}{pathStr}</div>}
          </>
        )}
        {cell.status==='none'&&<div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>🔴 {tb('matrix.noneWarn')}</div>}

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.risk')}</span>
          <span style={{fontSize:11,fontWeight:600,color:riskColor[cell.status]}}>{tb(riskMap[cell.status])}</span>
        </div>
        <div style={{borderTop:`1px solid ${C.gold}10`,paddingTop:10}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.rec')}</span>
          <div style={{fontSize:12,color:'#D1D5DB',marginTop:4,lineHeight:1.5}}>{tb(recMap[cell.status])}</div>
        </div>
      </div>
    </div>
  );
}
