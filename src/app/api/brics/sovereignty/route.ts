import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, normalizeBRICS, isBRICSCountry } from '@/lib/brics-constants';

export const revalidate = 3600;
type CS = 'direct'|'indirect'|'transit'|'none'|'landlocked';
const LL = new Set(['ET']);
const AF = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

export async function GET() {
  try {
    const raw = await prisma.cable.findMany({
      where: AF,
      select: { slug:true, name:true, landingStations: { select: { landingStation: { select: { countryCode:true } } } } },
    });
    const ccs = raw.map(c => ({
      slug: c.slug, name: c.name,
      countries: [...new Set(c.landingStations.map(cls => normalizeBRICS(cls.landingStation.countryCode ?? '')).filter(Boolean))],
    }));

    const adj: Record<string, Set<string>> = {};
    const dc: Record<string, Record<string, string[]>> = {};
    for (const cb of ccs) { const cc = cb.countries;
      for (let i=0;i<cc.length;i++) for (let j=i+1;j<cc.length;j++) {
        const [a,b] = [cc[i],cc[j]];
        (adj[a]??=new Set()).add(b); (adj[b]??=new Set()).add(a);
        ((dc[a]??={})[b]??=[]).push(cb.slug); ((dc[b]??={})[a]??=[]).push(cb.slug);
      }
    }
    function bfs(from:string,to:string,bo:boolean){
      if(!adj[from])return false;const v=new Set([from]),q=[from];
      while(q.length){const c=q.shift()!;for(const n of adj[c]??[]){if(n===to)return true;if(!v.has(n)&&(!bo||isBRICSCountry(n))){v.add(n);q.push(n);}}}return false;
    }
    const m=[...BRICS_MEMBERS];
    const mx:{from:string;to:string;status:CS;directCableCount:number;directCables:string[]}[]=[];
    for(let i=0;i<m.length;i++)for(let j=0;j<m.length;j++){
      if(i===j)continue;const[f,t]=[m[i],m[j]];
      if(LL.has(f)||LL.has(t)){mx.push({from:f,to:t,status:'landlocked',directCableCount:0,directCables:[]});continue;}
      const cbl=dc[f]?.[t]??[];
      const s:CS=cbl.length>0?'direct':bfs(f,t,true)?'indirect':bfs(f,t,false)?'transit':'none';
      mx.push({from:f,to:t,status:s,directCableCount:cbl.length,directCables:cbl.slice(0,10)});
    }
    const up:Record<CS,number>={direct:0,indirect:0,transit:0,none:0,landlocked:0};
    for(let i=0;i<m.length;i++)for(let j=i+1;j<m.length;j++){const c=mx.find(x=>x.from===m[i]&&x.to===m[j]);if(c)up[c.status]++;}
    return NextResponse.json({
      members:m.map(c=>({code:c,name:BRICS_COUNTRY_META[c]?.name??c,nameZh:BRICS_COUNTRY_META[c]?.nameZh??c})),
      matrix:mx, summary:{totalPairs:(m.length*(m.length-1))/2,...up},
    });
  } catch(e){console.error('[BRICS Sovereignty]',e);return NextResponse.json({error:'Failed'},{status:500});}
}
