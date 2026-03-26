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

    // BFS returning path
    function bfsPath(from:string,to:string,bricsOnly:boolean): string[]|null {
      if(!adj[from])return null;
      const vis=new Set([from]);const q:string[][]=[[from]];
      while(q.length){const path=q.shift()!;const cur=path[path.length-1];
        for(const nb of adj[cur]??[]){
          if(nb===to)return[...path,nb];
          if(!vis.has(nb)&&(!bricsOnly||isBRICSCountry(nb))){vis.add(nb);q.push([...path,nb]);}
        }
      }
      return null;
    }

    const m=[...BRICS_MEMBERS];
    const mx:{from:string;to:string;status:CS;directCableCount:number;directCables:string[];transitPath?:string[]}[]=[];
    
    // Transit node counter: how many BRICS pairs depend on each country as transit
    const transitNodeCount: Record<string, number> = {};
    
    for(let i=0;i<m.length;i++)for(let j=0;j<m.length;j++){
      if(i===j)continue;const[f,t]=[m[i],m[j]];
      if(LL.has(f)||LL.has(t)){mx.push({from:f,to:t,status:'landlocked',directCableCount:0,directCables:[]});continue;}
      const cbl=dc[f]?.[t]??[];
      let status:CS;let transitPath:string[]|undefined;
      if(cbl.length>0){status='direct';}
      else{
        const bricsPath=bfsPath(f,t,true);
        if(bricsPath){status='indirect';transitPath=bricsPath;
          // Count intermediate nodes as transit nodes
          for(let k=1;k<bricsPath.length-1;k++){transitNodeCount[bricsPath[k]]=(transitNodeCount[bricsPath[k]]||0)+1;}
        }else{
          const anyPath=bfsPath(f,t,false);
          if(anyPath){status='transit';transitPath=anyPath;
            for(let k=1;k<anyPath.length-1;k++){transitNodeCount[anyPath[k]]=(transitNodeCount[anyPath[k]]||0)+1;}
          }else{status='none';}
        }
      }
      mx.push({from:f,to:t,status,directCableCount:cbl.length,directCables:cbl.slice(0,10),transitPath});
    }

    const up:Record<CS,number>={direct:0,indirect:0,transit:0,none:0,landlocked:0};
    for(let i=0;i<m.length;i++)for(let j=i+1;j<m.length;j++){const c=mx.find(x=>x.from===m[i]&&x.to===m[j]);if(c)up[c.status]++;}

    // Top transit nodes sorted by dependency count
    const transitNodes = Object.entries(transitNodeCount)
      .map(([code, count]) => ({ code, name: BRICS_COUNTRY_META[code]?.name ?? code, nameZh: BRICS_COUNTRY_META[code]?.nameZh ?? code, count, isBRICS: isBRICSCountry(code) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return NextResponse.json({
      members:m.map(c=>({code:c,name:BRICS_COUNTRY_META[c]?.name??c,nameZh:BRICS_COUNTRY_META[c]?.nameZh??c})),
      matrix:mx,
      summary:{totalPairs:(m.length*(m.length-1))/2,...up},
      transitNodes,
    });
  } catch(e){console.error('[BRICS Sovereignty]',e);return NextResponse.json({error:'Failed'},{status:500});}
}
