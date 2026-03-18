// src/app/api/analysis/country/route.ts
// 国家海缆分析 API
// 特殊规则：code='CHINA' 时聚合查询中国大陆(CN)、香港(HK)、澳门(MO)、台湾(TW)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 大中华区聚合代码组
const CHINA_CODES = ['CN', 'HK', 'MO', 'TW'];

// 国家中文名称映射
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
  PG: '巴布亚新几内亚', TO: '汤加', WS: '萨摩亚', MM: '缅甸',
  KH: '柬埔寨', LA: '老挝', MG: '马达加斯加', MZ: '莫桑比克',
  TZ: '坦桑尼亚', GH: '加纳', SN: '塞内加尔', CM: '喀麦隆',
  IL: '以色列', JO: '约旦', IQ: '伊拉克', IR: '伊朗', KW: '科威特',
  BH: '巴林', MA: '摩洛哥', TN: '突尼斯', DZ: '阿尔及利亚', LY: '利比亚',
  PR: '波多黎各', JM: '牙买加', TT: '特立尼达和多巴哥', CU: '古巴',
  PA: '巴拿马', CR: '哥斯达黎加', EC: '厄瓜多尔', VE: '委内瑞拉',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.toUpperCase();

  if (!code) {
    return NextResponse.json({ error: 'Country code required' }, { status: 400 });
  }

  // 大中华区聚合：code='CHINA' 时合并 CN、HK、MO、TW
  const isChinaGroup = code === 'CHINA';
  const queryCodes = isChinaGroup ? CHINA_CODES : [code];

  // 国家/地区展示信息
  const countryDisplay = isChinaGroup
    ? { code: 'CHINA', nameEn: 'China (Mainland + HK + MO + TW)', nameZh: '中国（大陆+港+澳+台）' }
    : {
        code,
        nameEn: (await prisma.country.findUnique({ where: { code } }))?.nameEn || code,
        nameZh: COUNTRY_ZH[code] || code,
      };

  try {
    // 获取该国/地区所有登陆站（合并查询多个 code）
    const stations = await prisma.landingStation.findMany({
      where: { countryCode: { in: queryCodes } },
      include: {
        country: true,
        cables: {
          include: {
            cable: {
              include: {
                vendor: true,
                owners: { include: { company: true } },
                landingStations: {
                  include: {
                    landingStation: {
                      include: { country: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // 收集该国/地区的所有海缆（去重）
    const cableMap = new Map<string, any>();
    for (const station of stations) {
      for (const cls of station.cables) {
        if (!cableMap.has(cls.cable.id)) {
          cableMap.set(cls.cable.id, cls.cable);
        }
      }
    }

    const cables = Array.from(cableMap.values());

    // 海缆分类
    const international: any[] = [];
    const domestic: any[] = [];
    const branchIndicator: any[] = [];

    for (const cable of cables) {
      // 获取该海缆所有登陆国家代码
      const allCountryCodes = [
        ...new Set(cable.landingStations.map((cls: any) => cls.landingStation.countryCode))
      ] as string[];

      // 对于大中华区聚合：把 CN/HK/MO/TW 都视为"同一地区内部"
      // 国内线判断：所有登陆站的国家代码都在 queryCodes 范围内
      const isDomestic = allCountryCodes.every((c: string) => queryCodes.includes(c));

      // 该国/地区范围内的登陆站数量
      const stationsInScope = cable.landingStations.filter(
        (cls: any) => queryCodes.includes(cls.landingStation.countryCode)
      );

      // 支线判断：该地区只有 1 个登陆站，但海缆总登陆站数超过 4
      const isBranch = !isDomestic && stationsInScope.length === 1 && cable.landingStations.length > 4;

      if (isDomestic) {
        domestic.push(cable);
      } else if (isBranch) {
        branchIndicator.push(cable);
      } else {
        international.push(cable);
      }
    }

    return NextResponse.json({
      country: countryDisplay,
      summary: {
        totalCables: cables.length,
        internationalCables: international.length,
        domesticCables: domestic.length,
        branchCables: branchIndicator.length,
        totalStations: stations.length,
        // 大中华区时展示各地区细分
        breakdown: isChinaGroup ? {
          CN: stations.filter(s => s.countryCode === 'CN').length,
          HK: stations.filter(s => s.countryCode === 'HK').length,
          MO: stations.filter(s => s.countryCode === 'MO').length,
          TW: stations.filter(s => s.countryCode === 'TW').length,
        } : null,
      },
      cables: cables.map(c => {
        const allCodes = [...new Set(c.landingStations.map((cls: any) => cls.landingStation.countryCode))] as string[];
        const isDomestic = allCodes.every((cc: string) => queryCodes.includes(cc));
        const stationsInScope = c.landingStations.filter((cls: any) => queryCodes.includes(cls.landingStation.countryCode));
        const isBranch = !isDomestic && stationsInScope.length === 1 && c.landingStations.length > 4;

        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          status: c.status,
          lengthKm: c.lengthKm,
          rfsDate: c.rfsDate,
          designCapacityTbps: c.designCapacityTbps,
          fiberPairs: c.fiberPairs,
          vendor: c.vendor?.name || null,
          owners: c.owners.map((o: any) => o.company.name),
          ownerCount: c.owners.length,
          // 在该国/地区范围内的登陆站，大中华区时标注所属地区
          stationsInCountry: stationsInScope.map((cls: any) => ({
            id: cls.landingStation.id,
            name: cls.landingStation.name,
            countryCode: cls.landingStation.countryCode,
            // 大中华区时显示子地区标注
            regionLabel: isChinaGroup ? COUNTRY_ZH[cls.landingStation.countryCode] || cls.landingStation.countryCode : null,
            latitude: cls.landingStation.latitude,
            longitude: cls.landingStation.longitude,
          })),
          countries: allCodes,
          totalStations: c.landingStations.length,
          type: isDomestic ? 'domestic' : isBranch ? 'branch' : 'international',
        };
      }),
      stations: stations.map(s => ({
        id: s.id,
        name: s.name,
        countryCode: s.countryCode,
        // 大中华区时显示子地区中文名
        regionLabel: isChinaGroup ? (COUNTRY_ZH[s.countryCode] || s.countryCode) : null,
        latitude: s.latitude,
        longitude: s.longitude,
        cableCount: s.cables.length,
        cables: s.cables.map((cls: any) => ({ name: cls.cable.name, slug: cls.cable.slug })),
      })),
    });
  } catch (error) {
    console.error('[Country Analysis API]', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

// POST：获取所有有登陆站的国家列表（前端选择器用）
export async function POST() {
  try {
    const countries = await prisma.country.findMany({
      where: { landingStations: { some: {} } },
      include: { _count: { select: { landingStations: true } } },
      orderBy: { nameEn: 'asc' },
    });

    // 大中华区各地区的登陆站总数
    const chinaTotal = countries
      .filter(c => CHINA_CODES.includes(c.code))
      .reduce((sum, c) => sum + c._count.landingStations, 0);

    // 大中华区虚拟条目，排在列表最前面
    const chinaEntry = {
      code: 'CHINA',
      nameEn: 'China (Mainland + HK + MO + TW)',
      nameZh: '中国（大陆+港+澳+台）',
      stationCount: chinaTotal,
      isGroup: true, // 前端可以用这个标识来显示特殊样式
    };

    const result = [
      chinaEntry,
      ...countries.map(c => ({
        code: c.code,
        nameEn: c.nameEn,
        nameZh: COUNTRY_ZH[c.code] || c.nameEn,
        stationCount: c._count.landingStations,
        isGroup: false,
      })),
    ];

    return NextResponse.json({ countries: result });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch countries' }, { status: 500 });
  }
}
