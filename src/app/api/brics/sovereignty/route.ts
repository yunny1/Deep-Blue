import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_PARTNERS, BRICS_ALL, BRICS_COUNTRY_META, normalizeBRICS, isBRICSCountry } from '@/lib/brics-constants';

export const dynamic = 'force-dynamic';
type CS = 'direct'|'indirect'|'transit'|'none'|'landlocked';
// 内陆国：无海岸线的金砖国家
const LANDLOCKED = new Set(['ET','BY','BO','KZ','UZ','UG']);
const AF = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED','RETIRED','DECOMMISSIONED'] as string[] } };

async function buildNameMap(): Promise<Record<string, { name: string; nameZh: string }>> {
  const map: Record<string, { name: string; nameZh: string }> = {};
  for (const [code, meta] of Object.entries(BRICS_COUNTRY_META)) {
    map[code] = { name: meta.name, nameZh: meta.nameZh };
  }
  const countries = await prisma.country.findMany({ select: { code: true, nameEn: true, nameZh: true } });
  for (const c of countries) {
    if (!map[c.code]) map[c.code] = { name: c.nameEn, nameZh: c.nameZh || c.nameEn };
  }
  return map;
}

export async function GET() {
  try {
    const [raw, nameMap] = await Promise.all([
      prisma.cable.findMany({
        where: AF,
        select: { slug:true, name:true, landingStations: { select: { landingStation: { select: { countryCode:true } } } } },
      }),
      buildNameMap(),
    ]);

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

    type BfsResult = { path: string[]; edges: { from: string; to: string; cables: string[] }[] } | null;
    function bfsPath(from:string,to:string,bricsOnly:boolean): BfsResult {
      if(!adj[from])return null;
      const vis=new Set([from]);
      const q:{path:string[];edges:{from:string;to:string;cables:string[]}[]}[]=[{path:[from],edges:[]}];
      while(q.length){
        const{path,edges}=q.shift()!;
        const cur=path[path.length-1];
        for(const nb of adj[cur]??[]){
          const hopCables=(dc[cur]?.[nb]??[]).slice(0,3);
          if(nb===to)return{path:[...path,nb],edges:[...edges,{from:cur,to:nb,cables:hopCables}]};
          if(!vis.has(nb)&&(!bricsOnly||isBRICSCountry(nb))){
            vis.add(nb);
            q.push({path:[...path,nb],edges:[...edges,{from:cur,to:nb,cables:hopCables}]});
          }
        }
      }
      return null;
    }

    // 分析所有金砖国家（成员+伙伴）
    const allCodes = [...BRICS_ALL];
    const mx:{from:string;to:string;status:CS;directCableCount:number;directCables:string[];transitPath?:string[];transitPathNames?:{code:string;name:string;nameZh:string}[];transitEdges?:{from:string;to:string;cables:string[]}[];transitCables?:string[];tier:'member'|'partner'}[]=[];
    const transitNodeCount: Record<string, number> = {};

    for(let i=0;i<allCodes.length;i++)for(let j=0;j<allCodes.length;j++){
      if(i===j)continue;
      const[f,t]=[allCodes[i],allCodes[j]];
      if(LANDLOCKED.has(f)||LANDLOCKED.has(t)){
        mx.push({from:f,to:t,status:'landlocked',directCableCount:0,directCables:[],tier:BRICS_MEMBERS.includes(f as any)?'member':'partner'});
        continue;
      }
      const cbl=dc[f]?.[t]??[];
      let status:CS;let transitPath:string[]|undefined;let transitEdges:{from:string;to:string;cables:string[]}[]|undefined;let transitCables:string[]=[];
      if(cbl.length>0){status='direct';transitCables=cbl.slice(0,10);}
      else{
        const bricsResult=bfsPath(f,t,true);
        if(bricsResult){status='indirect';transitPath=bricsResult.path;transitEdges=bricsResult.edges;
          // 直接从dc查每跳海缆
          const _pc:string[]=[];for(let k=0;k<bricsResult.path.length-1;k++){const _a=bricsResult.path[k],_b=bricsResult.path[k+1];if(dc[_a]?.[_b])_pc.push(...dc[_a][_b]);else if(dc[_b]?.[_a])_pc.push(...dc[_b][_a]);}
          transitCables=[...new Set(_pc)].slice(0,10);
          for(let k=1;k<bricsResult.path.length-1;k++){transitNodeCount[bricsResult.path[k]]=(transitNodeCount[bricsResult.path[k]]||0)+1;}
        }else{
          const anyResult=bfsPath(f,t,false);
          if(anyResult){status='transit';transitPath=anyResult.path;transitEdges=anyResult.edges;
            // 直接从dc查每跳海缆
            const _pc2:string[]=[];for(let k=0;k<anyResult.path.length-1;k++){const _a=anyResult.path[k],_b=anyResult.path[k+1];
            if(f==='RU'&&t==='IN')console.log('[DEBUG RU→IN]',_a,'→',_b,'dc[a][b]:',dc[_a]?.[_b]?.slice(0,3),'dc[b][a]:',dc[_b]?.[_a]?.slice(0,3));
            if(dc[_a]?.[_b])_pc2.push(...dc[_a][_b]);else if(dc[_b]?.[_a])_pc2.push(...dc[_b][_a]);}
            if(f==='RU'&&t==='IN')console.log('[DEBUG RU→IN] _pc2:',_pc2);
            transitCables=[...new Set(_pc2)].slice(0,10);
            for(let k=1;k<anyResult.path.length-1;k++){transitNodeCount[anyResult.path[k]]=(transitNodeCount[anyResult.path[k]]||0)+1;}
          }else{status='none';}
        }
      }
      const transitPathNames=transitPath?.map(code=>({code,name:nameMap[code]?.name??code,nameZh:nameMap[code]?.nameZh??code}));
      if(f==='RU'&&t==='IN')console.log('[DEBUG RU→IN FINAL] transitCables:',transitCables,'status:',status);
      mx.push({from:f,to:t,status,directCableCount:cbl.length,directCables:cbl.slice(0,10),transitPath,transitPathNames,transitEdges,transitCables,tier:BRICS_MEMBERS.includes(f as any)?'member':'partner'});
    }

    // Summary: 只算成员国之间的（11×10/2=55对）
    const memberSet=new Set<string>(BRICS_MEMBERS);
    const up:Record<CS,number>={direct:0,indirect:0,transit:0,none:0,landlocked:0};
    for(let i=0;i<BRICS_MEMBERS.length;i++)for(let j=i+1;j<BRICS_MEMBERS.length;j++){
      const c=mx.find(x=>x.from===BRICS_MEMBERS[i]&&x.to===BRICS_MEMBERS[j]);
      if(c)up[c.status]++;
    }

    const transitNodes=Object.entries(transitNodeCount)
      .map(([code,count])=>({code,name:nameMap[code]?.name??code,nameZh:nameMap[code]?.nameZh??code,count,isBRICS:isBRICSCountry(code)}))
      .sort((a,b)=>b.count-a.count)
      .slice(0,20);

    // 返回成员+伙伴所有国家的信息
    const allMembers=allCodes.map(c=>({
      code:c,
      name:nameMap[c]?.name??BRICS_COUNTRY_META[c]?.name??c,
      nameZh:nameMap[c]?.nameZh??BRICS_COUNTRY_META[c]?.nameZh??c,
      tier:(BRICS_MEMBERS as readonly string[]).includes(c)?'member':'partner' as 'member'|'partner',
    }));

        // 构建国家对→海缆映射（前端用于路径高亮）
    const cablePairs: Record<string, string[]> = {};
    for (const [a, bs] of Object.entries(dc)) {
      for (const [b, slugs] of Object.entries(bs)) {
        const key = [a, b].sort().join('-');
        if (!cablePairs[key]) cablePairs[key] = [...new Set(slugs)].slice(0, 5);
      }
    }

    return NextResponse.json({
      members:allMembers.filter(m=>m.tier==='member'),
      partners:allMembers.filter(m=>m.tier==='partner'),
      allCountries:allMembers,
      matrix:mx,
      summary:{totalPairs:(BRICS_MEMBERS.length*(BRICS_MEMBERS.length-1))/2,...up},
      transitNodes,
      cablePairs,
    });
  } catch(e){console.error('[BRICS Sovereignty]',e);

    return NextResponse.json({error:'Failed'},{status:500});}
}
