/**
 * src/lib/country-labels.ts
 * 
 * Deep Blue — 自定义国家与大洋标注数据
 * 
 * 设计原则：
 * - 只含国家级标注，不含城市/省份，避免信息过载
 * - importance 1 = 大国/关键节点（缩小时显示）
 * - importance 2 = 中等规模国家（zoom ≥ 3 时显示）
 * - importance 3 = 小国/岛国（zoom ≥ 4 时显示）
 * - type 'ocean' 用深蓝色，type 'country' 用浅灰蓝色
 * - 坐标为国家陆地视觉中心，非行政首都
 * - 大中华区按后端政策处理，前端只显示 CN
 */

export interface CountryLabel {
  code: string;
  name_en: string;
  name_zh: string;
  lng: number;
  lat: number;
  importance: 1 | 2 | 3;
  type: 'country' | 'ocean';
}

export const COUNTRY_LABELS: CountryLabel[] = [

  // ─── 五大洋（优先显示，深蓝色）─────────────────────────────────────

  {
    code: 'PACIFIC', name_en: 'Pacific Ocean', name_zh: '太平洋',
    lng: -160, lat: 5, importance: 1, type: 'ocean',
  },
  {
    code: 'ATLANTIC', name_en: 'Atlantic Ocean', name_zh: '大西洋',
    lng: -30, lat: 10, importance: 1, type: 'ocean',
  },
  {
    code: 'INDIAN', name_en: 'Indian Ocean', name_zh: '印度洋',
    lng: 75, lat: -20, importance: 1, type: 'ocean',
  },
  {
    code: 'ARCTIC', name_en: 'Arctic Ocean', name_zh: '北冰洋',
    lng: 0, lat: 85, importance: 2, type: 'ocean',
  },
  {
    code: 'SOUTHERN', name_en: 'Southern Ocean', name_zh: '南冰洋',
    lng: 0, lat: -65, importance: 2, type: 'ocean',
  },

  // ─── Importance 1：全球主要大国 / 海缆战略节点 ───────────────────────

  {
    code: 'CN', name_en: 'China', name_zh: '中国',
    lng: 104.0, lat: 36.0, importance: 1, type: 'country',
  },
  {
    code: 'US', name_en: 'United States', name_zh: '美国',
    lng: -98.0, lat: 39.0, importance: 1, type: 'country',
  },
  {
    code: 'RU', name_en: 'Russia', name_zh: '俄罗斯',
    lng: 100.0, lat: 62.0, importance: 1, type: 'country',
  },
  {
    code: 'IN', name_en: 'India', name_zh: '印度',
    lng: 79.0, lat: 22.0, importance: 1, type: 'country',
  },
  {
    code: 'BR', name_en: 'Brazil', name_zh: '巴西',
    lng: -52.0, lat: -12.0, importance: 1, type: 'country',
  },
  {
    code: 'AU', name_en: 'Australia', name_zh: '澳大利亚',
    lng: 134.0, lat: -26.0, importance: 1, type: 'country',
  },
  {
    code: 'CA', name_en: 'Canada', name_zh: '加拿大',
    lng: -96.0, lat: 57.0, importance: 1, type: 'country',
  },
  {
    code: 'ID', name_en: 'Indonesia', name_zh: '印度尼西亚',
    lng: 118.0, lat: -2.0, importance: 1, type: 'country',
  },
  {
    code: 'SA', name_en: 'Saudi Arabia', name_zh: '沙特阿拉伯',
    lng: 45.0, lat: 25.0, importance: 1, type: 'country',
  },
  {
    code: 'NG', name_en: 'Nigeria', name_zh: '尼日利亚',
    lng: 8.0, lat: 9.0, importance: 1, type: 'country',
  },
  {
    code: 'ZA', name_en: 'South Africa', name_zh: '南非',
    lng: 25.0, lat: -29.0, importance: 1, type: 'country',
  },
  {
    code: 'GB', name_en: 'United Kingdom', name_zh: '英国',
    lng: -2.5, lat: 54.0, importance: 1, type: 'country',
  },
  {
    code: 'FR', name_en: 'France', name_zh: '法国',
    lng: 2.5, lat: 46.5, importance: 1, type: 'country',
  },
  {
    code: 'DE', name_en: 'Germany', name_zh: '德国',
    lng: 10.5, lat: 51.5, importance: 1, type: 'country',
  },
  {
    code: 'JP', name_en: 'Japan', name_zh: '日本',
    lng: 138.0, lat: 36.5, importance: 1, type: 'country',
  },
  {
    code: 'MX', name_en: 'Mexico', name_zh: '墨西哥',
    lng: -102.0, lat: 24.0, importance: 1, type: 'country',
  },
  {
    code: 'AR', name_en: 'Argentina', name_zh: '阿根廷',
    lng: -65.0, lat: -36.0, importance: 1, type: 'country',
  },
  {
    code: 'EG', name_en: 'Egypt', name_zh: '埃及',
    lng: 30.0, lat: 27.0, importance: 1, type: 'country',
  },
  {
    code: 'AE', name_en: 'UAE', name_zh: '阿联酋',
    lng: 54.0, lat: 24.0, importance: 1, type: 'country',
  },

  // ─── Importance 2：中等大国 / 海缆重要登陆点 ─────────────────────────

  {
    code: 'KR', name_en: 'South Korea', name_zh: '韩国',
    lng: 128.0, lat: 36.5, importance: 2, type: 'country',
  },
  {
    code: 'IT', name_en: 'Italy', name_zh: '意大利',
    lng: 12.5, lat: 42.5, importance: 2, type: 'country',
  },
  {
    code: 'ES', name_en: 'Spain', name_zh: '西班牙',
    lng: -4.0, lat: 40.0, importance: 2, type: 'country',
  },
  {
    code: 'TR', name_en: 'Turkey', name_zh: '土耳其',
    lng: 35.5, lat: 39.0, importance: 2, type: 'country',
  },
  {
    code: 'IR', name_en: 'Iran', name_zh: '伊朗',
    lng: 53.0, lat: 33.0, importance: 2, type: 'country',
  },
  {
    code: 'MY', name_en: 'Malaysia', name_zh: '马来西亚',
    lng: 110.0, lat: 4.0, importance: 2, type: 'country',
  },
  {
    code: 'SG', name_en: 'Singapore', name_zh: '新加坡',
    lng: 103.8, lat: 1.4, importance: 2, type: 'country',
  },
  {
    code: 'TH', name_en: 'Thailand', name_zh: '泰国',
    lng: 101.0, lat: 15.0, importance: 2, type: 'country',
  },
  {
    code: 'PH', name_en: 'Philippines', name_zh: '菲律宾',
    lng: 122.0, lat: 12.0, importance: 2, type: 'country',
  },
  {
    code: 'VN', name_en: 'Vietnam', name_zh: '越南',
    lng: 107.0, lat: 16.5, importance: 2, type: 'country',
  },
  {
    code: 'BD', name_en: 'Bangladesh', name_zh: '孟加拉国',
    lng: 90.0, lat: 24.0, importance: 2, type: 'country',
  },
  {
    code: 'PK', name_en: 'Pakistan', name_zh: '巴基斯坦',
    lng: 68.0, lat: 30.0, importance: 2, type: 'country',
  },
  {
    code: 'ET', name_en: 'Ethiopia', name_zh: '埃塞俄比亚',
    lng: 40.0, lat: 9.0, importance: 2, type: 'country',
  },
  {
    code: 'KE', name_en: 'Kenya', name_zh: '肯尼亚',
    lng: 37.5, lat: 0.5, importance: 2, type: 'country',
  },
  {
    code: 'TZ', name_en: 'Tanzania', name_zh: '坦桑尼亚',
    lng: 35.0, lat: -6.0, importance: 2, type: 'country',
  },
  {
    code: 'MZ', name_en: 'Mozambique', name_zh: '莫桑比克',
    lng: 35.0, lat: -18.0, importance: 2, type: 'country',
  },
  {
    code: 'AO', name_en: 'Angola', name_zh: '安哥拉',
    lng: 18.0, lat: -12.0, importance: 2, type: 'country',
  },
  {
    code: 'GH', name_en: 'Ghana', name_zh: '加纳',
    lng: -1.5, lat: 8.0, importance: 2, type: 'country',
  },
  {
    code: 'SN', name_en: 'Senegal', name_zh: '塞内加尔',
    lng: -14.5, lat: 14.5, importance: 2, type: 'country',
  },
  {
    code: 'MA', name_en: 'Morocco', name_zh: '摩洛哥',
    lng: -6.0, lat: 32.0, importance: 2, type: 'country',
  },
  {
    code: 'DZ', name_en: 'Algeria', name_zh: '阿尔及利亚',
    lng: 3.0, lat: 28.5, importance: 2, type: 'country',
  },
  {
    code: 'LY', name_en: 'Libya', name_zh: '利比亚',
    lng: 17.0, lat: 27.0, importance: 2, type: 'country',
  },
  {
    code: 'YE', name_en: 'Yemen', name_zh: '也门',
    lng: 47.5, lat: 16.0, importance: 2, type: 'country',
  },
  {
    code: 'OM', name_en: 'Oman', name_zh: '阿曼',
    lng: 57.0, lat: 22.0, importance: 2, type: 'country',
  },
  {
    code: 'QA', name_en: 'Qatar', name_zh: '卡塔尔',
    lng: 51.2, lat: 25.3, importance: 2, type: 'country',
  },
  {
    code: 'IQ', name_en: 'Iraq', name_zh: '伊拉克',
    lng: 44.0, lat: 33.0, importance: 2, type: 'country',
  },
  {
    code: 'IL', name_en: 'Israel', name_zh: '以色列',
    lng: 35.0, lat: 31.5, importance: 2, type: 'country',
  },
  {
    code: 'PT', name_en: 'Portugal', name_zh: '葡萄牙',
    lng: -8.0, lat: 39.5, importance: 2, type: 'country',
  },
  {
    code: 'NL', name_en: 'Netherlands', name_zh: '荷兰',
    lng: 5.3, lat: 52.3, importance: 2, type: 'country',
  },
  {
    code: 'NO', name_en: 'Norway', name_zh: '挪威',
    lng: 10.0, lat: 65.0, importance: 2, type: 'country',
  },
  {
    code: 'SE', name_en: 'Sweden', name_zh: '瑞典',
    lng: 18.0, lat: 62.0, importance: 2, type: 'country',
  },
  {
    code: 'PL', name_en: 'Poland', name_zh: '波兰',
    lng: 20.0, lat: 52.0, importance: 2, type: 'country',
  },
  {
    code: 'UA', name_en: 'Ukraine', name_zh: '乌克兰',
    lng: 32.0, lat: 49.0, importance: 2, type: 'country',
  },
  {
    code: 'KZ', name_en: 'Kazakhstan', name_zh: '哈萨克斯坦',
    lng: 67.0, lat: 48.0, importance: 2, type: 'country',
  },
  {
    code: 'NZ', name_en: 'New Zealand', name_zh: '新西兰',
    lng: 172.0, lat: -42.0, importance: 2, type: 'country',
  },
  {
    code: 'CL', name_en: 'Chile', name_zh: '智利',
    lng: -71.0, lat: -35.0, importance: 2, type: 'country',
  },
  {
    code: 'CO', name_en: 'Colombia', name_zh: '哥伦比亚',
    lng: -73.0, lat: 4.5, importance: 2, type: 'country',
  },
  {
    code: 'PE', name_en: 'Peru', name_zh: '秘鲁',
    lng: -76.0, lat: -10.0, importance: 2, type: 'country',
  },
  {
    code: 'VE', name_en: 'Venezuela', name_zh: '委内瑞拉',
    lng: -66.0, lat: 8.0, importance: 2, type: 'country',
  },
  {
    code: 'CU', name_en: 'Cuba', name_zh: '古巴',
    lng: -79.5, lat: 22.0, importance: 2, type: 'country',
  },
  {
    code: 'MM', name_en: 'Myanmar', name_zh: '缅甸',
    lng: 96.0, lat: 19.0, importance: 2, type: 'country',
  },
  {
    code: 'LK', name_en: 'Sri Lanka', name_zh: '斯里兰卡',
    lng: 80.7, lat: 7.9, importance: 2, type: 'country',
  },
  {
    code: 'MG', name_en: 'Madagascar', name_zh: '马达加斯加',
    lng: 47.0, lat: -20.0, importance: 2, type: 'country',
  },
  {
    code: 'GR', name_en: 'Greece', name_zh: '希腊',
    lng: 22.0, lat: 39.5, importance: 2, type: 'country',
  },
  {
    code: 'BY', name_en: 'Belarus', name_zh: '白俄罗斯',
    lng: 28.0, lat: 53.5, importance: 2, type: 'country',
  },
  {
    code: 'UZ', name_en: 'Uzbekistan', name_zh: '乌兹别克斯坦',
    lng: 63.0, lat: 41.5, importance: 2, type: 'country',
  },
  {
    code: 'CI', name_en: "Côte d'Ivoire", name_zh: '科特迪瓦',
    lng: -6.0, lat: 7.5, importance: 2, type: 'country',
  },
  {
    code: 'CM', name_en: 'Cameroon', name_zh: '喀麦隆',
    lng: 12.5, lat: 5.5, importance: 2, type: 'country',
  },
  {
    code: 'CD', name_en: 'DR Congo', name_zh: '刚果（金）',
    lng: 24.0, lat: -4.0, importance: 2, type: 'country',
  },

  // ─── Importance 3：小国 / 岛国 / 海缆关键中转点 ──────────────────────

  {
    code: 'DJ', name_en: 'Djibouti', name_zh: '吉布提',
    lng: 43.0, lat: 11.8, importance: 3, type: 'country',
  },
  {
    code: 'SO', name_en: 'Somalia', name_zh: '索马里',
    lng: 46.0, lat: 6.0, importance: 3, type: 'country',
  },
  {
    code: 'ER', name_en: 'Eritrea', name_zh: '厄立特里亚',
    lng: 38.5, lat: 15.5, importance: 3, type: 'country',
  },
  {
    code: 'MV', name_en: 'Maldives', name_zh: '马尔代夫',
    lng: 73.5, lat: 3.5, importance: 3, type: 'country',
  },
  {
    code: 'SC', name_en: 'Seychelles', name_zh: '塞舌尔',
    lng: 55.5, lat: -4.7, importance: 3, type: 'country',
  },
  {
    code: 'MU', name_en: 'Mauritius', name_zh: '毛里求斯',
    lng: 57.6, lat: -20.3, importance: 3, type: 'country',
  },
  {
    code: 'CV', name_en: 'Cape Verde', name_zh: '佛得角',
    lng: -24.0, lat: 16.0, importance: 3, type: 'country',
  },
  {
    code: 'GU', name_en: 'Guam', name_zh: '关岛',
    lng: 144.8, lat: 13.5, importance: 3, type: 'country',
  },
  {
    code: 'PW', name_en: 'Palau', name_zh: '帕劳',
    lng: 134.5, lat: 7.5, importance: 3, type: 'country',
  },
  {
    code: 'PG', name_en: 'Papua New Guinea', name_zh: '巴布亚新几内亚',
    lng: 145.0, lat: -6.5, importance: 3, type: 'country',
  },
  {
    code: 'FJ', name_en: 'Fiji', name_zh: '斐济',
    lng: 178.0, lat: -18.0, importance: 3, type: 'country',
  },
  {
    code: 'SB', name_en: 'Solomon Islands', name_zh: '所罗门群岛',
    lng: 160.0, lat: -9.5, importance: 3, type: 'country',
  },
  {
    code: 'VU', name_en: 'Vanuatu', name_zh: '瓦努阿图',
    lng: 167.0, lat: -16.0, importance: 3, type: 'country',
  },
  {
    code: 'WS', name_en: 'Samoa', name_zh: '萨摩亚',
    lng: -172.5, lat: -13.5, importance: 3, type: 'country',
  },
  {
    code: 'TO', name_en: 'Tonga', name_zh: '汤加',
    lng: -175.0, lat: -20.0, importance: 3, type: 'country',
  },
  {
    code: 'KI', name_en: 'Kiribati', name_zh: '基里巴斯',
    lng: -157.0, lat: 1.5, importance: 3, type: 'country',
  },
  {
    code: 'TV', name_en: 'Tuvalu', name_zh: '图瓦卢',
    lng: 179.0, lat: -8.0, importance: 3, type: 'country',
  },
  {
    code: 'JM', name_en: 'Jamaica', name_zh: '牙买加',
    lng: -77.5, lat: 18.2, importance: 3, type: 'country',
  },
  {
    code: 'TT', name_en: 'Trinidad & Tobago', name_zh: '特立尼达和多巴哥',
    lng: -61.0, lat: 10.7, importance: 3, type: 'country',
  },
  {
    code: 'HT', name_en: 'Haiti', name_zh: '海地',
    lng: -73.0, lat: 19.0, importance: 3, type: 'country',
  },
  {
    code: 'DO', name_en: 'Dominican Rep.', name_zh: '多米尼加',
    lng: -70.5, lat: 19.0, importance: 3, type: 'country',
  },
  {
    code: 'PA', name_en: 'Panama', name_zh: '巴拿马',
    lng: -80.0, lat: 9.0, importance: 3, type: 'country',
  },
  {
    code: 'CR', name_en: 'Costa Rica', name_zh: '哥斯达黎加',
    lng: -84.0, lat: 10.0, importance: 3, type: 'country',
  },
  {
    code: 'EC', name_en: 'Ecuador', name_zh: '厄瓜多尔',
    lng: -78.5, lat: -2.0, importance: 3, type: 'country',
  },
  {
    code: 'CY', name_en: 'Cyprus', name_zh: '塞浦路斯',
    lng: 33.0, lat: 35.2, importance: 3, type: 'country',
  },
  {
    code: 'MT', name_en: 'Malta', name_zh: '马耳他',
    lng: 14.4, lat: 35.9, importance: 3, type: 'country',
  },
  {
    code: 'LB', name_en: 'Lebanon', name_zh: '黎巴嫩',
    lng: 35.8, lat: 33.9, importance: 3, type: 'country',
  },
  {
    code: 'LR', name_en: 'Liberia', name_zh: '利比里亚',
    lng: -9.5, lat: 6.5, importance: 3, type: 'country',
  },
  {
    code: 'SL', name_en: 'Sierra Leone', name_zh: '塞拉利昂',
    lng: -11.5, lat: 8.5, importance: 3, type: 'country',
  },
  {
    code: 'GN', name_en: 'Guinea', name_zh: '几内亚',
    lng: -12.0, lat: 11.0, importance: 3, type: 'country',
  },
  {
    code: 'GA', name_en: 'Gabon', name_zh: '加蓬',
    lng: 11.7, lat: -1.0, importance: 3, type: 'country',
  },
  {
    code: 'ST', name_en: 'São Tomé', name_zh: '圣多美',
    lng: 6.6, lat: 0.2, importance: 3, type: 'country',
  },
  {
    code: 'UG', name_en: 'Uganda', name_zh: '乌干达',
    lng: 32.0, lat: 1.5, importance: 3, type: 'country',
  },
  {
    code: 'BO', name_en: 'Bolivia', name_zh: '玻利维亚',
    lng: -65.0, lat: -17.0, importance: 3, type: 'country',
  },
  {
    code: 'KH', name_en: 'Cambodia', name_zh: '柬埔寨',
    lng: 105.0, lat: 12.5, importance: 3, type: 'country',
  },
  {
    code: 'TL', name_en: 'Timor-Leste', name_zh: '东帝汶',
    lng: 125.8, lat: -8.9, importance: 3, type: 'country',
  },
  {
    code: 'BH', name_en: 'Bahrain', name_zh: '巴林',
    lng: 50.6, lat: 26.0, importance: 3, type: 'country',
  },
  {
    code: 'KW', name_en: 'Kuwait', name_zh: '科威特',
    lng: 47.7, lat: 29.3, importance: 3, type: 'country',
  },
  {
    code: 'JO', name_en: 'Jordan', name_zh: '约旦',
    lng: 36.5, lat: 31.0, importance: 3, type: 'country',
  },
  {
    code: 'TN', name_en: 'Tunisia', name_zh: '突尼斯',
    lng: 9.5, lat: 34.0, importance: 3, type: 'country',
  },
  {
    code: 'MR', name_en: 'Mauritania', name_zh: '毛里塔尼亚',
    lng: -11.0, lat: 20.0, importance: 3, type: 'country',
  },
  {
    code: 'BJ', name_en: 'Benin', name_zh: '贝宁',
    lng: 2.3, lat: 9.5, importance: 3, type: 'country',
  },
  {
    code: 'TG', name_en: 'Togo', name_zh: '多哥',
    lng: 1.1, lat: 8.5, importance: 3, type: 'country',
  },
  {
    code: 'FM', name_en: 'Micronesia', name_zh: '密克罗尼西亚',
    lng: 158.0, lat: 6.9, importance: 3, type: 'country',
  },
  {
    code: 'MH', name_en: 'Marshall Islands', name_zh: '马绍尔群岛',
    lng: 168.0, lat: 9.0, importance: 3, type: 'country',
  },
];

/**
 * 按语言返回标注文字。
 * locale 从 localStorage.getItem('deep-blue-locale') 获取，默认英文。
 */
export function getLabelText(label: CountryLabel, locale: string | null): string {
  return locale === 'zh' ? label.name_zh : label.name_en;
}

/**
 * 将标注数组转为 GeoJSON FeatureCollection，供 MapLibre GL JS 使用。
 * @param locale - 'zh' 或 'en'
 */
export function toGeoJSON(locale: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: COUNTRY_LABELS.map((label) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [label.lng, label.lat],
      },
      properties: {
        name: getLabelText(label, locale),
        importance: label.importance,
        labelType: label.type, // 'country' | 'ocean'
      },
    })),
  };
}
