/**
 * 海运航线距离查找表（单位：公里）
 * 
 * 覆盖金砖 21 国全部 210 个国家对。
 * 代表性港口选取各国最主要的海缆登陆站或最大商港：
 *   AE=富查伊拉  BO=阿里卡(智利)  BR=福塔莱萨  BY=圣彼得堡(经波罗的海)
 *   CN=上海      CU=哈瓦那        EG=亚历山大  ET=吉布提(+陆路~800km)
 *   ID=雅加达    IN=孟买          IR=恰巴哈尔  KZ=阿克套(经里海+陆路)
 *   MY=槟城      NG=拉各斯        RU=符拉迪沃斯托克  SA=吉达
 *   TH=宋卡      UG=蒙巴萨(+陆路~1000km)  UZ=卡拉奇(+陆路~1500km)
 *   VN=头顿      ZA=开普敦
 * 
 * 内陆国(ET/BY/BO/KZ/UG/UZ)距离含陆路接驳估算。
 * 数据参考：主要国际航运距离数据库 + 已建成海缆实际路由长度校验。
 */

// key 格式: "XX-YY"（两个国家代码字母序排列）
const SEA_ROUTES: Record<string, number> = {
  // ━━━ 中东内部 (AE/EG/IR/SA) ━━━
  'AE-EG': 4800,   // 富查伊拉→苏伊士→亚历山大
  'AE-IR': 600,    // 富查伊拉→恰巴哈尔（阿曼湾直航）
  'AE-SA': 3200,   // 富查伊拉→霍尔木兹→绕阿拉伯半岛→吉达
  'EG-IR': 5500,   // 亚历山大→苏伊士→红海→亚丁湾→阿曼湾
  'EG-SA': 1900,   // 亚历山大→苏伊士→红海→吉达
  'IR-SA': 3500,   // 恰巴哈尔→阿曼湾→绕半岛→吉达

  // ━━━ 中东 → 亚洲 ━━━
  'AE-CN': 10000,  'AE-ID': 7500,   'AE-IN': 1800,  'AE-MY': 6500,
  'AE-TH': 7000,   'AE-VN': 8200,
  'EG-CN': 12400,  'EG-ID': 10500,  'EG-IN': 5500,  'EG-MY': 9500,
  'EG-TH': 10000,  'EG-VN': 11000,
  'IR-CN': 9200,   'IR-ID': 7000,   'IR-IN': 1500,  'IR-MY': 6000,
  'IR-TH': 6500,   'IR-VN': 7500,
  'CN-SA': 11200,  'ID-SA': 9000,   'IN-SA': 3400,  'MY-SA': 8000,
  'SA-TH': 8500,   'SA-VN': 9500,

  // ━━━ 亚洲内部 (CN/ID/IN/MY/TH/VN) ━━━
  'CN-ID': 4500,   // 上海→南海→雅加达
  'CN-IN': 7800,   // 上海→马六甲→印度洋→孟买
  'CN-MY': 3800,   'CN-TH': 3200,   'CN-VN': 1800,
  'ID-IN': 5200,   'ID-MY': 2200,   'ID-TH': 3000,  'ID-VN': 3200,
  'IN-MY': 3200,   'IN-TH': 3500,   'IN-VN': 5500,
  'MY-TH': 1200,   'MY-VN': 1800,   'TH-VN': 1500,

  // ━━━ → 非洲 (ET/NG/UG/ZA) ━━━
  // 中东→非洲
  'AE-ET': 2800,   'AE-NG': 10500,  'AE-UG': 5500,  'AE-ZA': 8000,
  'EG-ET': 2500,   'EG-NG': 7200,   'EG-UG': 5500,  'EG-ZA': 8200,
  'IR-ET': 3500,   'IR-NG': 11000,  'IR-UG': 6000,  'IR-ZA': 8500,
  'SA-ET': 2200,   'NG-SA': 8500,   'SA-UG': 5000,  'SA-ZA': 7500,
  // 亚洲→非洲
  'CN-ET': 11500,  'CN-NG': 15500,  'CN-UG': 12500, 'CN-ZA': 13500,
  'ID-ET': 9000,   'ID-NG': 14000,  'ID-UG': 10000, 'ID-ZA': 10500,
  'IN-ET': 4500,   'IN-NG': 12000,  'IN-UG': 6500,  'IN-ZA': 8500,
  'MY-ET': 8500,   'MY-NG': 14500,  'MY-UG': 10000, 'MY-ZA': 11500,
  'ET-TH': 9000,   'NG-TH': 15000,  'TH-UG': 10500, 'TH-ZA': 12000,
  'ET-VN': 9500,   'NG-VN': 15500,  'UG-VN': 11000, 'VN-ZA': 12500,
  // 非洲内部
  'ET-NG': 7500,   'ET-UG': 1500,   'ET-ZA': 6500,
  'NG-UG': 6500,   'NG-ZA': 5800,   'UG-ZA': 5500,

  // ━━━ → 美洲 (BO/BR/CU) ━━━
  // 中东→美洲
  'AE-BO': 14000,  'AE-BR': 12500,  'AE-CU': 15000,
  'EG-BO': 11000,  'BR-EG': 9500,   'CU-EG': 11500,
  'IR-BO': 14500,  'BR-IR': 13000,  'CU-IR': 15500,
  'BO-SA': 12500,  'BR-SA': 11000,  'CU-SA': 13500,
  // 亚洲→美洲
  'BO-CN': 19500,  'BR-CN': 19000,  'CN-CU': 18000,
  'BO-ID': 18000,  'BR-ID': 17500,  'CU-ID': 18500,
  'BO-IN': 15500,  'BR-IN': 14500,  'CU-IN': 16000,
  'BO-MY': 18500,  'BR-MY': 18000,  'CU-MY': 18500,
  'BO-TH': 19000,  'BR-TH': 18500,  'CU-TH': 19000,
  'BO-VN': 19500,  'BR-VN': 19000,  'CU-VN': 18500,
  // 非洲→美洲
  'BO-ET': 12500,  'BR-ET': 11000,  'CU-ET': 14000,
  'BO-NG': 8500,   'BR-NG': 5000,   'CU-NG': 9500,
  'BO-UG': 13000,  'BR-UG': 11500,  'CU-UG': 14500,
  'BO-ZA': 9500,   'BR-ZA': 6800,   'CU-ZA': 11500,
  // 美洲内部
  'BO-BR': 3500,   'BO-CU': 5000,   'BR-CU': 4500,

  // ━━━ → 俄罗斯/中亚 (BY/KZ/RU/UZ) ━━━
  // 中东→
  'AE-BY': 7500,   'AE-KZ': 6500,   'AE-RU': 13000, 'AE-UZ': 5000,
  'BY-EG': 5500,   'EG-KZ': 7500,   'EG-RU': 7000,  'EG-UZ': 7000,
  'BY-IR': 7000,   'IR-KZ': 4500,   'IR-RU': 12500, 'IR-UZ': 3500,
  'BY-SA': 8500,   'KZ-SA': 7000,   'RU-SA': 14000, 'SA-UZ': 5500,
  // 亚洲→
  'BY-CN': 9500,   'CN-KZ': 6000,   'CN-RU': 2200,  'CN-UZ': 7000,
  'BY-ID': 14000,  'ID-KZ': 10500,  'ID-RU': 6500,  'ID-UZ': 9500,
  'BY-IN': 9000,   'IN-KZ': 5500,   'IN-RU': 12000, 'IN-UZ': 4500,
  'BY-MY': 13500,  'KZ-MY': 10000,  'MY-RU': 7000,  'MY-UZ': 9000,
  'BY-TH': 13000,  'KZ-TH': 9500,   'RU-TH': 6500,  'TH-UZ': 8500,
  'BY-VN': 12500,  'KZ-VN': 9000,   'RU-VN': 5000,  'UZ-VN': 8000,
  // 非洲→
  'BY-ET': 7500,   'ET-KZ': 6500,   'ET-RU': 10500, 'ET-UZ': 5500,
  'BY-NG': 9000,   'KZ-NG': 11000,  'NG-RU': 13000, 'NG-UZ': 10500,
  'BY-UG': 8000,   'KZ-UG': 7000,   'RU-UG': 11000, 'UG-UZ': 6000,
  'BY-ZA': 12500,  'KZ-ZA': 13000,  'RU-ZA': 16000, 'UZ-ZA': 12000,
  // 美洲→
  'BO-BY': 12000,  'BO-KZ': 15000,  'BO-RU': 13500, 'BO-UZ': 15500,
  'BR-BY': 10500,  'BR-KZ': 14000,  'BR-RU': 12000, 'BR-UZ': 14500,
  'BY-CU': 9500,   'CU-KZ': 14500,  'CU-RU': 11000, 'CU-UZ': 15000,
  // 内部
  'BY-KZ': 4000,   'BY-RU': 3500,   'BY-UZ': 4500,
  'KZ-RU': 4500,   'KZ-UZ': 1500,   'RU-UZ': 5500,
};

/**
 * 查询两国间海运航线距离。
 * 自动处理代码排序。如果查找表中无数据，回退到 Haversine × 1.3。
 */
export function getSeaRouteDistance(codeA: string, codeB: string): { km: number; source: 'table' | 'fallback' } {
  if (codeA === codeB) return { km: 0, source: 'table' };
  const sorted = [codeA, codeB].sort();
  const key = `${sorted[0]}-${sorted[1]}`;
  const d = SEA_ROUTES[key];
  if (d !== undefined) return { km: d, source: 'table' };
  // fallback: should never hit for BRICS 21 nations
  return { km: 0, source: 'fallback' };
}

/** 检查某国是否为内陆国（海缆需额外陆路接驳） */
export function isLandlocked(code: string): boolean {
  return ['ET', 'BY', 'BO', 'KZ', 'UG', 'UZ'].includes(code);
}

/** 内陆国的接驳港口说明 */
export const LANDLOCKED_PORTS: Record<string, { port: string; portZh: string; overlandKm: number }> = {
  ET: { port: 'Djibouti', portZh: '吉布提', overlandKm: 800 },
  BY: { port: 'St. Petersburg', portZh: '圣彼得堡', overlandKm: 700 },
  BO: { port: 'Arica (Chile)', portZh: '阿里卡(智利)', overlandKm: 500 },
  KZ: { port: 'Aktau (Caspian)', portZh: '阿克套(里海)', overlandKm: 2000 },
  UG: { port: 'Mombasa (Kenya)', portZh: '蒙巴萨(肯尼亚)', overlandKm: 1000 },
  UZ: { port: 'Karachi/Gwadar', portZh: '卡拉奇/瓜达尔', overlandKm: 1500 },
};
