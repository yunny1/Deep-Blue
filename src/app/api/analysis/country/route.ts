// src/app/api/analysis/country/route.ts
// v7: 排除已合并记录（mergedInto: null）
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const COUNTRY_ZH: Record<string, string> = {
  CN: '中国大陆', TW: '中国台湾', HK: '中国香港', MO: '中国澳门',
  US: '美国', GB: '英国', JP: '日本', SG: '新加坡', KR: '韩国',
  AU: '澳大利亚', IN: '印度', FR: '法国', DE: '德国', BR: '巴西',
  ID: '印度尼西亚', MY: '马来西亚', PH: '菲律宾', TH: '泰国', VN: '越南',
  PK: '巴基斯坦', BD: '孟加拉国', LK: '斯里兰卡', MV: '马尔代夫',
  EG: '埃及', ZA: '南非', NG: '尼日利亚', KE: '肯尼亚', DJ: '吉布提',
  SA: '沙特阿拉伯', AE: '阿联酋', QA: '卡塔尔', OM: '阿曼', YE: '也门',
  IT: '意大利', ES: '西班牙', PT: '葡萄牙', GR: '希腊', TR: '土耳其',
  NL: '荷兰', BE: '比利时', IE: '爱尔兰', DK: '丹麦', SE: '瑞典',
  NO: '挪威', FI: '芬兰', PL: '波兰', RO: '罗马尼亚', CY: '塞浦路斯',
  MT: '马耳他', CA: '加拿大', MX: '墨西哥', CL: '智利', AR: '阿根廷',
  CO: '哥伦比亚', PE: '秘鲁', GU: '关岛', NZ: '新西兰', FJ: '斐济',
  PG: '巴布亚新几内亚', MM: '缅甸', KH: '柬埔寨', MG: '马达加斯加',
  MZ: '莫桑比克', TZ: '坦桑尼亚', GH: '加纳', SN: '塞内加尔',
  IL: '以色列', JO: '约旦', KW: '科威特', BH: '巴林', MA: '摩洛哥',
  TN: '突尼斯', PR: '波多黎各', JM: '牙买加', PA: '巴拿马',
};

const REGION_LABEL: Record<string, string> = {
  CN: '中国大陆', HK: '中国香港', MO: '中国澳门', TW: '中国台湾',
};

// 强制国内线覆盖：cable slug → 视为国内线的国家代码组
const DOMESTIC_OVERRIDES: Record<string, string[]> = {
  'taiwan-strait-express-1': ['CN', 'TW', 'HK', 'MO'],
};

async function getCountryData(codes: string[]) {
  const stations = await prisma.landingStation.findMany({
    where: { countryCode: { in: codes } },
    include: {
      country: true,
      cables: {
        // v7: 只包含未被合并的海缆
        where: {
          cable: { mergedInto: null },
        },
        include: {
          cable: {
            include: {
              vendor: true,
              owners: { include: { company: true } },
              landingStations: {
                include: { landingStation: { include: { country: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const cableMap = new Map<string, any>();
  for (const station of stations) {
    for (const cls of station.cables) {
      if (!cableMap.has(cls.cable.id)) cableMap.set(cls.cable.id, cls.cable);
    }
  }

  const cables = Array.from(cableMap.values());
  const international: any[] = [], domestic: any[] = [], branch: any[] = [];
  const isGroup = codes.length > 1;

  for (const cable of cables) {
    const allCodes: string[] = [...new Set<string>(cable.landingStations.map((cls: any) => cls.landingStation.countryCode as string))];
    const localStations = cable.landingStations.filter((cls: any) => codes.includes(cls.landingStation.countryCode));

    // 检查强制覆盖
    const override = DOMESTIC_OVERRIDES[cable.slug];
    if (override) {
      const isOverrideDomestic = allCodes.every((c: string) => override.includes(c));
      if (isOverrideDomestic) { domestic.push(cable); continue; }
    }

    const isDomestic = allCodes.every((c: string) => codes.includes(c));
    const isBranch = !isDomestic && localStations.length === 1 && cable.landingStations.length > 4;

    if (isDomestic) domestic.push(cable);
    else if (isBranch) branch.push(cable);
    else international.push(cable);
  }

  return {
    stations,
    cables: cables.map(c => {
      const localStations = c.landingStations
        .filter((cls: any) => codes.includes(cls.landingStation.countryCode))
        .map((cls: any) => ({
          id: cls.landingStation.id,
          name: cls.landingStation.name,
          nameZh: cls.landingStation.nameZh || null,
          countryCode: cls.landingStation.countryCode,
          regionLabel: isGroup ? (REGION_LABEL[cls.landingStation.countryCode] || null) : null,
          latitude: cls.landingStation.latitude,
          longitude: cls.landingStation.longitude,
        }));

      const allCodes: string[] = [...new Set<string>(c.landingStations.map((cls: any) => cls.landingStation.countryCode as string))];

      // 重新判断类型（含 override）
      const override = DOMESTIC_OVERRIDES[c.slug];
      let type: 'international' | 'domestic' | 'branch';
      if (override && allCodes.every((cc: string) => override.includes(cc))) {
        type = 'domestic';
      } else {
        const isDomestic = allCodes.every((cc: string) => codes.includes(cc));
        const isBranch = !isDomestic && localStations.length === 1 && c.landingStations.length > 4;
        type = isDomestic ? 'domestic' : isBranch ? 'branch' : 'international';
      }

      return {
        id: c.id, name: c.name, slug: c.slug, status: c.status,
        lengthKm: c.lengthKm, rfsDate: c.rfsDate,
        designCapacityTbps: c.designCapacityTbps, fiberPairs: c.fiberPairs,
        vendor: c.vendor?.name || null,
        owners: c.owners.map((o: any) => o.company.name),
        ownerCount: c.owners.length,
        stationsInCountry: localStations,
        countries: allCodes,
        totalStations: c.landingStations.length,
        type,
      };
    }),
    stationsFormatted: stations.map(s => ({
      id: s.id, name: s.name, nameZh: (s as any).nameZh || null,
      countryCode: s.countryCode,
      regionLabel: isGroup ? (REGION_LABEL[s.countryCode] || null) : null,
      latitude: s.latitude, longitude: s.longitude,
      cableCount: s.cables.length,
      cables: s.cables.map((cls: any) => ({ name: cls.cable.name, slug: cls.cable.slug })),
    })),
    summary: {
      totalCables: cables.length,
      internationalCables: international.length,
      domesticCables: domestic.length,
      branchCables: branch.length,
      totalStations: stations.length,
    },
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.toUpperCase();
  if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

  try {
    let queryCodes: string[], displayNameZh: string, displayNameEn: string, responseCode: string;
    let isGroup = false, breakdown: Record<string, number> | null = null;

    if (code === 'CN') {
      queryCodes = ['CN', 'HK', 'MO']; isGroup = true;
      displayNameZh = '中国（大陆+港+澳）'; displayNameEn = 'China (Mainland + HK + MO)'; responseCode = 'CN';
    } else if (code === 'CN_WITH_TW') {
      queryCodes = ['CN', 'HK', 'MO', 'TW']; isGroup = true;
      displayNameZh = '中国（大陆+港+澳+台）'; displayNameEn = 'China (Mainland + HK + MO + TW)'; responseCode = 'CN_WITH_TW';
    } else {
      queryCodes = [code];
      const country = await prisma.country.findUnique({ where: { code } });
      displayNameZh = COUNTRY_ZH[code] || country?.nameEn || code;
      displayNameEn = country?.nameEn || code; responseCode = code;
    }

    const { stations, cables, stationsFormatted, summary } = await getCountryData(queryCodes);

    if (isGroup) {
      breakdown = {};
      for (const qc of queryCodes) breakdown[qc] = stations.filter(s => s.countryCode === qc).length;
    }

    return NextResponse.json({
      country: { code: responseCode, nameEn: displayNameEn, nameZh: displayNameZh },
      summary: { ...summary, breakdown: breakdown ?? null },
      cables, stations: stationsFormatted,
    });
  } catch (error) {
    console.error('[Country Analysis]', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const countries = await prisma.country.findMany({
      where: { landingStations: { some: {} } },
      include: { _count: { select: { landingStations: true } } },
      orderBy: { nameEn: 'asc' },
    });
    return NextResponse.json({
      countries: countries.map(c => ({
        code: c.code, nameEn: c.nameEn,
        nameZh: COUNTRY_ZH[c.code] || c.nameEn,
        stationCount: c._count.landingStations, isGroup: false,
      })),
    });
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
