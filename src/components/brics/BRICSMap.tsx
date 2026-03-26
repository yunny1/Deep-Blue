'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_MEMBERS, BRICS_PARTNERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';

interface CableInfo { cat:string; name:string; status:string; lengthKm:number|null; vendor:string|null; owners:string[]; stations:{name:string;country:string|null;city:string|null}[]; fiberPairs:number|null; capacityTbps:number|null; rfsDate:string|null; }
interface Props { height?:string; selection?:{kind:string;from?:string;to?:string;cables?:string[]}; }

export default function BRICSMap({ height='560px', selection }:Props) {
  const{tb,isZh}=useBRICS();
  const cRef=useRef<HTMLDivElement>(null);
  const mRef=useRef<maplibregl.Map|null>(null);
  const cmRef=useRef<Record<string,CableInfo>>({});
  const[loading,setLoading]=useState(true);
  const[stats,setStats]=useState<{internal:number;domestic:number;related:number;other:number}|null>(null);
  const[hover,setHover]=useState<{x:number;y:number;info:CableInfo}|null>(null);
  const[legendTip,setLegendTip]=useState<{x:number;y:number;text:string}|null>(null);

  useEffect(()=>{
    if(!cRef.current) return;
    const map = new maplibregl.Map({ container:cRef.current, style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', center:[60,15], zoom:2.2, attributionControl:false, fadeDuration:0 });
    mRef.current = map;

    map.on('load', async()=>{
      try{
        const[ovRes,cablesRes]=await Promise.all([fetch('/api/brics/overview'),fetch('/api/cables?geo=true')]);
        const ovData=await ovRes.json();
        const cablesRaw=await cablesRes.json();
        const cables=Array.isArray(cablesRaw)?cablesRaw:cablesRaw.cables||[];
        const cableMap:Record<string,CableInfo>=ovData.cableMap||{};
        cmRef.current=cableMap;

        const intF:GeoJSON.Feature[]=[];const domF:GeoJSON.Feature[]=[];const relF:GeoJSON.Feature[]=[];const othF:GeoJSON.Feature[]=[];

        for(const cable of cables){
          const geom=cable.routeGeojson||cable.route_geojson;
          if(!geom?.coordinates||!geom.type)continue;
          const geometry:GeoJSON.Geometry=geom.type==='MultiLineString'?{type:'MultiLineString',coordinates:geom.coordinates}:{type:'LineString',coordinates:geom.coordinates};
          const f:GeoJSON.Feature={type:'Feature',properties:{slug:cable.slug,name:cable.name},geometry};
          const cat=cableMap[cable.slug]?.cat;
          if(cat==='internal')intF.push(f);else if(cat==='domestic')domF.push(f);else if(cat==='related')relF.push(f);else othF.push(f);
        }
        const ob=ovData.brics||{};
        setStats({internal:ob.internalCables||intF.length,domestic:ob.domesticCables||domF.length,related:ob.externalCables||relF.length,other:othF.length});

        // Layers: other → related → domestic → internal (top)
        map.addSource('c-oth',{type:'geojson',data:{type:'FeatureCollection',features:othF}});
        map.addLayer({id:'l-oth',type:'line',source:'c-oth',paint:{'line-color':'#2A2F3A','line-width':0.6,'line-opacity':0.15}});

        map.addSource('c-rel',{type:'geojson',data:{type:'FeatureCollection',features:relF}});
        map.addLayer({id:'l-rel',type:'line',source:'c-rel',paint:{'line-color':C.silver,'line-width':1,'line-opacity':0.4}});

        map.addSource('c-dom',{type:'geojson',data:{type:'FeatureCollection',features:domF}});
        map.addLayer({id:'l-dom-glow',type:'line',source:'c-dom',paint:{'line-color':C.domestic,'line-width':5,'line-opacity':0.1,'line-blur':3}});
        map.addLayer({id:'l-dom',type:'line',source:'c-dom',paint:{'line-color':C.domestic,'line-width':1.6,'line-opacity':0.75}});

        map.addSource('c-int',{type:'geojson',data:{type:'FeatureCollection',features:intF}});
        map.addLayer({id:'l-int-glow',type:'line',source:'c-int',paint:{'line-color':C.gold,'line-width':8,'line-opacity':0.15,'line-blur':4}});
        map.addLayer({id:'l-int',type:'line',source:'c-int',paint:{'line-color':C.gold,'line-width':2.2,'line-opacity':0.95}});

        // Labels
        const lf:GeoJSON.Feature[]=BRICS_MEMBERS.map(code=>{const m=BRICS_COUNTRY_META[code];return{type:'Feature',properties:{code,name:isZh?m?.nameZh:m?.name},geometry:{type:'Point',coordinates:m?.center??[0,0]}};});
        map.addSource('brics-labels',{type:'geojson',data:{type:'FeatureCollection',features:lf}});
        map.addLayer({id:'brics-dots',type:'circle',source:'brics-labels',paint:{'circle-radius':4,'circle-color':C.gold,'circle-opacity':0.7,'circle-stroke-color':C.goldDark,'circle-stroke-width':1}});
        map.addLayer({id:'brics-text',type:'symbol',source:'brics-labels',layout:{'text-field':['get','name'],'text-size':11,'text-offset':[0,1.4],'text-anchor':'top','text-font':['Open Sans Bold','Arial Unicode MS Bold']},paint:{'text-color':C.goldLight,'text-halo-color':C.navy,'text-halo-width':1.5}});

        // BRICS partner nation labels (silver dots)
        const partnerFeatures: GeoJSON.Feature[] = BRICS_PARTNERS.map(code => {
          const m = BRICS_COUNTRY_META[code];
          return { type: 'Feature', properties: { code, name: isZh ? m?.nameZh : m?.name }, geometry: { type: 'Point', coordinates: m?.center ?? [0, 0] } };
        });
        map.addSource('partner-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: partnerFeatures } });
        map.addLayer({ id: 'partner-dots', type: 'circle', source: 'partner-labels', paint: { 'circle-radius': 5, 'circle-color': '#60A5FA', 'circle-opacity': 0.9, 'circle-stroke-color': '#3B82F6', 'circle-stroke-width': 1.5 } });
        map.addLayer({ id: 'partner-text', type: 'symbol', source: 'partner-labels', layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#93C5FD', 'text-halo-color': C.navy, 'text-halo-width': 1.2 } });

        // Hover: highlight + detail panel
        // Add wide transparent hitbox layers for easier hover/click
        map.addLayer({id:'hit-int',type:'line',source:'c-int',paint:{'line-color':'transparent','line-width':14,'line-opacity':0}});
        map.addLayer({id:'hit-dom',type:'line',source:'c-dom',paint:{'line-color':'transparent','line-width':14,'line-opacity':0}});
        map.addLayer({id:'hit-rel',type:'line',source:'c-rel',paint:{'line-color':'transparent','line-width':14,'line-opacity':0}});

        const hoverLayers=['hit-int','hit-dom','hit-rel'];
        const visibleMap:Record<string,string>={'hit-int':'l-int','hit-dom':'l-dom','hit-rel':'l-rel'};
        for(const lid of hoverLayers){
          map.on('mouseenter',lid,e=>{map.getCanvas().style.cursor='pointer';
            const slug=e.features?.[0]?.properties?.slug;
            if(slug && cmRef.current[slug]){
              // Highlight
              const srcId=lid.replace('l-','c-');
              const vl=visibleMap[lid]||lid;map.setPaintProperty(vl,'line-width',vl.includes('int')?4:vl.includes('dom')?3:2.5);
              setHover({x:e.point.x,y:e.point.y,info:cmRef.current[slug]});
            }
          });
          map.on('mouseleave',lid,()=>{map.getCanvas().style.cursor='';
            const vl2=visibleMap[lid]||lid;map.setPaintProperty(vl2,'line-width',vl2.includes('int')?2.2:vl2.includes('dom')?1.6:1);
            setHover(null);
          });
          map.on('mousemove',lid,e=>{if(hover){setHover(prev=>prev?{...prev,x:e.point.x,y:e.point.y}:null);}
            const slug=e.features?.[0]?.properties?.slug;
            if(slug && cmRef.current[slug]) setHover({x:e.point.x,y:e.point.y,info:cmRef.current[slug]});
          });
        }
      }catch(err){console.error('[BRICSMap]',err);}finally{setLoading(false);}
    });
    return()=>{map.remove();mRef.current=null;};
  },[isZh]);

  const statusColors:Record<string,string>={IN_SERVICE:'#22C55E',UNDER_CONSTRUCTION:'#3B82F6',PLANNED:'#F59E0B',DECOMMISSIONED:'#6B7280'};

  // 矩阵联动：高亮选中的国家对海缆
  useEffect(()=>{
    const map=mRef.current;if(!map||!map.loaded())return;
    if(selection?.kind==='pair'&&selection.cables&&selection.cables.length>0){
      // 添加高亮层
      const slugs=new Set(selection.cables);
      const allSources=['c-int','c-dom','c-rel'];
      for(const src of allSources){
        const source=map.getSource(src);
        if(!source)continue;
        // 降低非选中海缆的透明度
      }
      // 用 filter 高亮特定海缆
      try{
        ['l-int','l-dom','l-rel'].forEach(lid=>{
          if(map.getLayer(lid)){map.setPaintProperty(lid,'line-opacity',0.15);}
        });
        ['l-int-glow','l-dom-glow'].forEach(lid=>{
          if(map.getLayer(lid)){map.setPaintProperty(lid,'line-opacity',0.03);}
        });
        // 添加高亮层
        if(map.getSource('c-highlight')){map.removeLayer('l-highlight-glow');map.removeLayer('l-highlight');map.removeSource('c-highlight');}
        // 从所有源中收集匹配的 features
        const features:GeoJSON.Feature[]=[];
        for(const src of allSources){
          const source=map.getSource(src) as any;
          if(!source?._data?.features)continue;
          source._data.features.forEach((f:any)=>{if(slugs.has(f.properties?.slug))features.push(f);});
        }
        if(features.length>0){
          map.addSource('c-highlight',{type:'geojson',data:{type:'FeatureCollection',features}});
          map.addLayer({id:'l-highlight-glow',type:'line',source:'c-highlight',paint:{'line-color':'#FFD700','line-width':10,'line-opacity':0.3,'line-blur':4}});
          map.addLayer({id:'l-highlight',type:'line',source:'c-highlight',paint:{'line-color':'#FFD700','line-width':3,'line-opacity':1}});
        }
      }catch(e){console.warn('[BRICSMap] highlight error',e);}
    }else{
      // 恢复正常状态
      const map2=mRef.current;if(!map2||!map2.loaded())return;
      try{
        ['l-int'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.95);});
        ['l-dom'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.75);});
        ['l-rel'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.4);});
        ['l-int-glow'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.15);});
        ['l-dom-glow'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.1);});
        if(map2.getSource('c-highlight')){map2.removeLayer('l-highlight-glow');map2.removeLayer('l-highlight');map2.removeSource('c-highlight');}
      }catch(e){}
    }
  },[selection]);

  return(
    <div style={{position:'relative',borderRadius:14,overflow:'hidden'}}>
      <div ref={cRef} style={{width:'100%',height,borderRadius:14,border:`1px solid ${C.gold}12`}} />

      {loading&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(10,22,40,.8)',borderRadius:14,zIndex:10}}><span style={{color:C.goldLight,fontSize:14}}>{tb('map.loading')}</span></div>}

      {/* Legend with tooltips */}
      {stats&&<div style={{position:'absolute',bottom:12,right:12,background:'rgba(10,22,40,.9)',backdropFilter:'blur(8px)',borderRadius:8,padding:'10px 14px',fontSize:11,color:'rgba(255,255,255,.5)',display:'flex',flexDirection:'column',gap:5,border:`1px solid ${C.gold}12`,zIndex:5}}>
        {[
          {color:C.gold,label:tb('map.internal'),n:stats.internal,glow:true,tip:tb('map.internalTip')},
          {color:C.domestic,label:tb('map.domestic'),n:stats.domestic,glow:true,tip:tb('map.domesticTip')},
          {color:C.silver,label:tb('map.related'),n:stats.related,glow:false,tip:tb('map.relatedTip')},
          {color:'#2A2F3A',label:tb('map.other'),n:stats.other,glow:false,tip:tb('map.otherTip')},
          {color:C.silver,label:isZh?'● 伙伴国标注':'● Partner Labels',n:10,glow:false,tip:isZh?'10个金砖伙伴国的地理位置银色标注':'Silver labels showing 10 BRICS partner nation locations'},
        ].map(({color,label,n,glow,tip})=>(
          <div key={label} style={{display:'flex',alignItems:'center',gap:6,cursor:'help',position:'relative'}}
            onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setLegendTip({x:r.left-8,y:r.top,text:tip});}}
            onMouseLeave={()=>setLegendTip(null)}>
            <span style={{width:18,height:3,background:color,borderRadius:1,boxShadow:glow?`0 0 6px ${color}44`:'none'}} />
            {label} ({n})
          </div>
        ))}
      </div>}

      {/* Legend tooltip */}
      {legendTip&&<div style={{position:'fixed',right:window.innerWidth-legendTip.x+8,top:legendTip.y-4,maxWidth:260,background:'rgba(10,18,36,.97)',border:`1px solid ${C.gold}30`,borderRadius:8,padding:'8px 12px',fontSize:11,color:'#D1D5DB',lineHeight:1.6,zIndex:9999,pointerEvents:'none',boxShadow:'0 4px 20px rgba(0,0,0,.5)'}}>{legendTip.text}</div>}

      {/* Hover detail panel */}
      {hover&&<div style={{position:'absolute',left:Math.min(hover.x+16,(cRef.current?.clientWidth??800)-320),top:Math.max(hover.y-120,8),width:300,background:'rgba(10,18,36,.97)',backdropFilter:'blur(16px)',border:`1px solid ${C.gold}25`,borderRadius:10,padding:0,zIndex:20,pointerEvents:'none',boxShadow:`0 8px 32px rgba(0,0,0,.6)`,overflow:'hidden'}}>
        <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.gold}12`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,fontWeight:700,color:'#F0E6C8',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{hover.info.name}</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:statusColors[hover.info.status]||'#6B7280'}} />
            <span style={{fontSize:10,color:statusColors[hover.info.status]||'#6B7280',fontWeight:600}}>{tb('hover.'+hover.info.status)}</span>
          </span>
        </div>
        <div style={{padding:'10px 14px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:11}}>
          {hover.info.lengthKm&&<div><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.length')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.lengthKm.toLocaleString()} km</div></div>}
          {hover.info.rfsDate&&<div><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.rfs')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.rfsDate}</div></div>}
          {hover.info.fiberPairs&&<div><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.fiber')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.fiberPairs}</div></div>}
          {hover.info.capacityTbps&&<div><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.capacity')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.capacityTbps} Tbps</div></div>}
          {hover.info.vendor&&<div style={{gridColumn:'1/3'}}><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.vendor')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.vendor}</div></div>}
          {hover.info.owners.length>0&&<div style={{gridColumn:'1/3'}}><div style={{color:'rgba(255,255,255,.4)',fontSize:10,marginBottom:2}}>Operators</div><div style={{display:'flex',flexWrap:'wrap',gap:3}}>{hover.info.owners.slice(0,5).map(o=><span key={o} style={{fontSize:10,padding:'1px 5px',borderRadius:3,background:'rgba(42,157,143,.1)',color:'#2A9D8F',border:'1px solid rgba(42,157,143,.2)'}}>{o}</span>)}</div></div>}
        </div>
        {hover.info.stations.length>0&&<div style={{padding:'8px 14px',borderTop:`1px solid ${C.gold}10`,maxHeight:100,overflowY:'auto'}}>
          <div style={{color:'rgba(255,255,255,.4)',fontSize:10,marginBottom:4}}>{tb('hover.stations')} ({hover.info.stations.length})</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:3}}>{hover.info.stations.slice(0,8).map((s,i)=><span key={i} style={{fontSize:10,padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,.04)',color:'rgba(255,255,255,.5)'}}>{s.name} <span style={{color:'rgba(255,255,255,.25)'}}>{s.country}</span></span>)}{hover.info.stations.length>8&&<span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>+{hover.info.stations.length-8}</span>}</div>
        </div>}
      </div>}

      <style>{`.brics-popup .maplibregl-popup-content{background:rgba(15,29,50,.95);border:1px solid ${C.gold}25;border-radius:6px;padding:6px 10px;box-shadow:0 4px 16px rgba(0,0,0,.4)} .brics-popup .maplibregl-popup-tip{border-top-color:rgba(15,29,50,.95)}`}</style>
    </div>
  );
}
