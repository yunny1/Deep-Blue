// src/lib/countryCodeMap.ts
// 全量国家/地区名称 → ISO 3166-1 alpha-2 代码映射表
// 覆盖：标准英文名、常见别名、海外领地、历史名称、TeleGeography 特有写法
// 用于数据导入时精确识别国家代码，防止错误映射

export const COUNTRY_CODE_MAP: Record<string, string> = {

  // ── 亚太 ────────────────────────────────────────────────────────
  'China': 'CN', 'China (Mainland)': 'CN', 'Mainland China': 'CN',
  'People\'s Republic of China': 'CN', 'PRC': 'CN',
  'Hong Kong': 'HK', 'Hong Kong SAR': 'HK', 'Hong Kong, China': 'HK',
  'Hong Kong SAR, China': 'HK',
  'Macao': 'MO', 'Macau': 'MO', 'Macao SAR': 'MO', 'Macau SAR': 'MO',
  'Macao SAR, China': 'MO', 'Macau, China': 'MO',
  'Taiwan': 'TW', 'Taiwan, China': 'TW', 'Chinese Taipei': 'TW',
  'Republic of China': 'TW', 'ROC': 'TW',
  'Japan': 'JP',
  'South Korea': 'KR', 'Korea': 'KR', 'Korea, South': 'KR',
  'Republic of Korea': 'KR',
  'North Korea': 'KP', 'Korea, North': 'KP',
  'Singapore': 'SG',
  'Malaysia': 'MY',
  'Indonesia': 'ID',
  'Philippines': 'PH', 'The Philippines': 'PH',
  'Thailand': 'TH',
  'Vietnam': 'VN', 'Viet Nam': 'VN',
  'Myanmar': 'MM', 'Burma': 'MM',
  'Cambodia': 'KH', 'Kampuchea': 'KH',
  'Laos': 'LA', 'Lao PDR': 'LA', 'Lao People\'s Democratic Republic': 'LA',
  'Brunei': 'BN', 'Brunei Darussalam': 'BN',
  'Timor-Leste': 'TL', 'East Timor': 'TL',
  'Australia': 'AU',
  'New Zealand': 'NZ',
  'Papua New Guinea': 'PG', 'PNG': 'PG',
  'Fiji': 'FJ',
  'Solomon Islands': 'SB',
  'Vanuatu': 'VU',
  'Samoa': 'WS', 'Western Samoa': 'WS',
  'American Samoa': 'AS',
  'Tonga': 'TO',
  'Kiribati': 'KI',
  'Micronesia': 'FM', 'Federated States of Micronesia': 'FM', 'FSM': 'FM',
  'Marshall Islands': 'MH', 'Republic of the Marshall Islands': 'MH',
  'Palau': 'PW',
  'Nauru': 'NR',
  'Tuvalu': 'TV',
  'Cook Islands': 'CK',
  'Niue': 'NU',
  'Tokelau': 'TK',
  'Wallis and Futuna': 'WF',
  'French Polynesia': 'PF', 'Tahiti': 'PF',
  'New Caledonia': 'NC',
  'Guam': 'GU',
  'Northern Mariana Islands': 'MP', 'CNMI': 'MP',
  'Wake Island': 'UM',
  'Johnston Atoll': 'UM',
  'Midway Islands': 'UM', 'Midway': 'UM',
  'Pitcairn Islands': 'PN',
  'Norfolk Island': 'NF',
  'Christmas Island': 'CX',
  'Cocos Islands': 'CC', 'Cocos (Keeling) Islands': 'CC',

  // ── 南亚 ────────────────────────────────────────────────────────
  'India': 'IN',
  'Pakistan': 'PK',
  'Bangladesh': 'BD',
  'Sri Lanka': 'LK', 'Ceylon': 'LK',
  'Nepal': 'NP',
  'Bhutan': 'BT',
  'Maldives': 'MV', 'The Maldives': 'MV',
  'Afghanistan': 'AF',

  // ── 中亚 ────────────────────────────────────────────────────────
  'Kazakhstan': 'KZ',
  'Uzbekistan': 'UZ',
  'Turkmenistan': 'TM',
  'Kyrgyzstan': 'KG',
  'Tajikistan': 'TJ',

  // ── 中东 ────────────────────────────────────────────────────────
  'United Arab Emirates': 'AE', 'UAE': 'AE',
  'Saudi Arabia': 'SA', 'Kingdom of Saudi Arabia': 'SA',
  'Qatar': 'QA',
  'Kuwait': 'KW',
  'Bahrain': 'BH',
  'Oman': 'OM', 'Sultanate of Oman': 'OM',
  'Yemen': 'YE',
  'Iraq': 'IQ',
  'Iran': 'IR', 'Islamic Republic of Iran': 'IR',
  'Israel': 'IL',
  'Palestine': 'PS', 'Palestinian Territory': 'PS',
  'Jordan': 'JO',
  'Lebanon': 'LB',
  'Syria': 'SY', 'Syrian Arab Republic': 'SY',
  'Turkey': 'TR', 'Türkiye': 'TR',
  'Cyprus': 'CY',
  'Georgia': 'GE',
  'Armenia': 'AM',
  'Azerbaijan': 'AZ',

  // ── 유럽 ────────────────────────────────────────────────────────
  'United Kingdom': 'GB', 'UK': 'GB', 'Great Britain': 'GB',
  'England': 'GB', 'Scotland': 'GB', 'Wales': 'GB',
  'France': 'FR',
  'Germany': 'DE',
  'Italy': 'IT',
  'Spain': 'ES',
  'Portugal': 'PT',
  'Netherlands': 'NL', 'Holland': 'NL', 'The Netherlands': 'NL',
  'Belgium': 'BE',
  'Luxembourg': 'LU',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Ireland': 'IE', 'Republic of Ireland': 'IE',
  'Denmark': 'DK',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Finland': 'FI',
  'Iceland': 'IS',
  'Faroe Islands': 'FO',
  'Greenland': 'GL',
  'Greece': 'GR', 'Hellas': 'GR',
  'Malta': 'MT',
  'Monaco': 'MC',
  'San Marino': 'SM',
  'Vatican': 'VA', 'Vatican City': 'VA',
  'Liechtenstein': 'LI',
  'Andorra': 'AD',
  'Gibraltar': 'GI',
  'Poland': 'PL',
  'Czech Republic': 'CZ', 'Czechia': 'CZ',
  'Slovakia': 'SK',
  'Hungary': 'HU',
  'Romania': 'RO',
  'Bulgaria': 'BG',
  'Croatia': 'HR',
  'Slovenia': 'SI',
  'Serbia': 'RS',
  'Bosnia and Herzegovina': 'BA', 'Bosnia': 'BA',
  'Montenegro': 'ME',
  'North Macedonia': 'MK', 'Macedonia': 'MK',
  'Albania': 'AL',
  'Kosovo': 'XK',
  'Estonia': 'EE',
  'Latvia': 'LV',
  'Lithuania': 'LT',
  'Belarus': 'BY',
  'Ukraine': 'UA',
  'Moldova': 'MD', 'Republic of Moldova': 'MD',
  'Russia': 'RU', 'Russian Federation': 'RU',
  'Isle of Man': 'IM',
  'Jersey': 'JE',
  'Guernsey': 'GG',
  'Svalbard': 'SJ',

  // ── 아프리카 ─────────────────────────────────────────────────────
  'Egypt': 'EG',
  'Libya': 'LY',
  'Tunisia': 'TN',
  'Algeria': 'DZ',
  'Morocco': 'MA',
  'Western Sahara': 'EH',
  'Mauritania': 'MR',
  'Senegal': 'SN',
  'Gambia': 'GM', 'The Gambia': 'GM',
  'Guinea-Bissau': 'GW',
  'Guinea': 'GN',
  'Sierra Leone': 'SL',
  'Liberia': 'LR',
  "Côte d'Ivoire": 'CI', 'Ivory Coast': 'CI', "Cote d'Ivoire": 'CI',
  'Ghana': 'GH',
  'Togo': 'TG',
  'Benin': 'BJ',
  'Nigeria': 'NG',
  'Cameroon': 'CM',
  'Equatorial Guinea': 'GQ',
  'Gabon': 'GA',
  'Congo': 'CG', 'Republic of the Congo': 'CG', 'Congo, Rep.': 'CG',
  'Democratic Republic of Congo': 'CD', 'DR Congo': 'CD', 'Congo, Dem. Rep.': 'CD',
  'DRC': 'CD',
  'Central African Republic': 'CF',
  'Chad': 'TD',
  'Sudan': 'SD',
  'South Sudan': 'SS',
  'Ethiopia': 'ET',
  'Eritrea': 'ER',
  'Djibouti': 'DJ',
  'Somalia': 'SO',
  'Kenya': 'KE',
  'Uganda': 'UG',
  'Rwanda': 'RW',
  'Burundi': 'BI',
  'Tanzania': 'TZ', 'United Republic of Tanzania': 'TZ',
  'Mozambique': 'MZ',
  'Malawi': 'MW',
  'Zambia': 'ZM',
  'Zimbabwe': 'ZW',
  'Namibia': 'NA',
  'Botswana': 'BW',
  'South Africa': 'ZA',
  'Lesotho': 'LS',
  'Eswatini': 'SZ', 'Swaziland': 'SZ',
  'Angola': 'AO',
  'Sao Tome and Principe': 'ST', 'São Tomé and Príncipe': 'ST',
  'Cape Verde': 'CV', 'Cabo Verde': 'CV',
  'Comoros': 'KM',
  'Madagascar': 'MG',
  'Mauritius': 'MU',
  'Seychelles': 'SC',
  'Reunion': 'RE', 'Réunion': 'RE',
  'Mayotte': 'YT',
  'Saint Helena': 'SH', 'Saint Helena, Ascension and Tristan da Cunha': 'SH',
  'Ascension Island': 'AC', 'Ascension': 'AC',
  'Tristan da Cunha': 'TA',
  'Niger': 'NE',
  'Mali': 'ML',
  'Burkina Faso': 'BF',

  // ── 북미/카리브 ──────────────────────────────────────────────────
  'United States': 'US', 'USA': 'US', 'US': 'US', 'United States of America': 'US',
  'Canada': 'CA',
  'Mexico': 'MX',
  'Cuba': 'CU',
  'Jamaica': 'JM',
  'Haiti': 'HT',
  'Dominican Republic': 'DO',
  'Puerto Rico': 'PR',
  'US Virgin Islands': 'VI', 'United States Virgin Islands': 'VI',
  'British Virgin Islands': 'VG',
  'Anguilla': 'AI',
  'Antigua and Barbuda': 'AG', 'Antigua': 'AG',
  'Saint Kitts and Nevis': 'KN', 'St. Kitts and Nevis': 'KN',
  'Montserrat': 'MS',
  'Guadeloupe': 'GP',
  'Dominica': 'DM',
  'Martinique': 'MQ',
  'Saint Lucia': 'LC', 'St. Lucia': 'LC',
  'Barbados': 'BB',
  'Saint Vincent and the Grenadines': 'VC', 'St. Vincent': 'VC',
  'Grenada': 'GD',
  'Trinidad and Tobago': 'TT', 'Trinidad': 'TT',
  'Aruba': 'AW',
  'Curacao': 'CW', 'Curaçao': 'CW',
  'Bonaire': 'BQ',
  'Sint Maarten': 'SX',
  'Sint Eustatius': 'BQ',
  'Saba': 'BQ',
  'Turks and Caicos Islands': 'TC',
  'Cayman Islands': 'KY',
  'Bermuda': 'BM',
  'Bahamas': 'BS', 'The Bahamas': 'BS',
  'Belize': 'BZ',
  'Guatemala': 'GT',
  'Honduras': 'HN',
  'El Salvador': 'SV',
  'Nicaragua': 'NI',
  'Costa Rica': 'CR',
  'Panama': 'PA',
  'Saint Pierre and Miquelon': 'PM',

  // ── 중미/남미 ────────────────────────────────────────────────────
  'Colombia': 'CO',
  'Venezuela': 'VE',
  'Guyana': 'GY',
  'Suriname': 'SR',
  'French Guiana': 'GF',
  'Ecuador': 'EC',
  'Peru': 'PE',
  'Brazil': 'BR',
  'Bolivia': 'BO',
  'Paraguay': 'PY',
  'Uruguay': 'UY',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Falkland Islands': 'FK',

  // ── 대서양 섬 ────────────────────────────────────────────────────
  'Canary Islands': 'IC', 'Canarias': 'IC',
  'Azores': 'PT',
  'Madeira': 'PT',
  'Cape Verde Islands': 'CV',

  // ── TeleGeography 특수 표기 ───────────────────────────────────────
  // TeleGeography 데이터에서 실제로 나타나는 불규칙한 표기들
  'Korea (South)': 'KR',
  'Korea (North)': 'KP',
  'China, People\'s Rep.': 'CN',
  'Iran, Islamic Rep.': 'IR',
  'Tanzania, United Rep.': 'TZ',
  'Congo, Dem. Rep.': 'CD',
  'Congo, Rep.': 'CG',
  'Virgin Islands (US)': 'VI',
  'Virgin Islands (British)': 'VG',
  'St. Kitts-Nevis': 'KN',
  'St. Vincent & Grenadines': 'VC',
  'Trinidad & Tobago': 'TT',
  'Antigua & Barbuda': 'AG',
  'Bosnia & Herzegovina': 'BA',
  'Sao Tome & Principe': 'ST',
  'Saint Helena Is.': 'SH',
  'Wallis & Futuna': 'WF',
  'Netherlands Antilles': 'AN',
  'Cocos Island': 'CC',
  'Pitcairn Island': 'PN',
  'Heard Island': 'HM',
};

/**
 * 根据国家名称获取 ISO 代码
 * 先精确匹配，再不区分大小写匹配，再部分匹配
 * @param name 国家名称（来自 TeleGeography 数据）
 * @returns ISO 3166-1 alpha-2 代码，找不到时返回 'XX'
 */
export function getCountryCode(name: string | null | undefined): string {
  if (!name) return 'XX';
  const trimmed = name.trim();

  // 1. 精确匹配
  if (COUNTRY_CODE_MAP[trimmed]) return COUNTRY_CODE_MAP[trimmed];

  // 2. 不区分大小写精确匹配
  const lower = trimmed.toLowerCase();
  for (const [key, code] of Object.entries(COUNTRY_CODE_MAP)) {
    if (key.toLowerCase() === lower) return code;
  }

  // 3. 去掉括号内容后匹配（如 "Monaco (principality)" → "Monaco"）
  const withoutParens = trimmed.replace(/\s*\([^)]*\)/g, '').trim();
  if (withoutParens !== trimmed && COUNTRY_CODE_MAP[withoutParens]) {
    return COUNTRY_CODE_MAP[withoutParens];
  }

  // 4. 检查名称是否以已知国家名开头（处理 "France (overseas)" 这类情况）
  for (const [key, code] of Object.entries(COUNTRY_CODE_MAP)) {
    if (trimmed.startsWith(key + ' ') || trimmed.startsWith(key + ',')) {
      return code;
    }
  }

  // 找不到时返回 'XX'，在日志里标记出来方便人工排查
  console.warn(`[countryCodeMap] Unknown country: "${trimmed}"`);
  return 'XX';
}

/**
 * 验证一个 countryCode 是否合理（防止脏数据）
 * 特别检查几个容易被误用的代码：
 *   MO = 澳门（不是 Monaco！Monaco = MC）
 *   MS = 蒙特塞拉特（不是 Mississippi！）
 *   CN = 中国大陆（不是其他中文地区）
 */
export function validateCountryCode(code: string, stationName: string): string {
  // 站名明确包含这些关键词时，强制纠正
  const name = stationName.toLowerCase();

  if (code === 'MO' && !name.includes('macao') && !name.includes('macau') &&
      !name.includes('澳门') && !name.includes('taipa') && !name.includes('cotai')) {
    // MO 应该只用于澳门，其他情况可能是误映射
    if (name.includes('montserrat')) return 'MS';
    if (name.includes('monaco')) return 'MC';
    if (name.includes('moldova')) return 'MD';
    if (name.includes('morocco')) return 'MA';
  }

  if (code === 'CN' && !name.includes('china') && !name.includes('chinese') &&
      !name.includes('中国') && !name.includes('shanghai') && !name.includes('beijing') &&
      !name.includes('guangzhou') && !name.includes('shenzhen') && !name.includes('qingdao') &&
      !name.includes('xiamen') && !name.includes('tianjin') && !name.includes('dalian') &&
      !name.includes('fuzhou') && !name.includes('ningbo') && !name.includes('wenzhou') &&
      !name.includes('haikou') && !name.includes('sanya') && !name.includes('shantou')) {
    if (name.includes('monaco')) return 'MC';
  }

  return code;
}
