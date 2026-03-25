// src/lib/countryCodeMap.ts
// 全量国家/地区名称 → ISO 3166-1 alpha-2 代码映射表
// 覆盖：标准英文名、常见别名、海外领地、历史名称、TeleGeography 特有写法

export const COUNTRY_CODE_MAP: Record<string, string> = {

  // ── 亚太 ────────────────────────────────────────────────────────
  'China': 'CN', 'China (Mainland)': 'CN', 'Mainland China': 'CN',
  'People\'s Republic of China': 'CN', 'PRC': 'CN',
  'China, People\'s Rep.': 'CN',
  'Hong Kong': 'HK', 'Hong Kong SAR': 'HK', 'Hong Kong, China': 'HK',
  'Hong Kong SAR, China': 'HK',
  'Macao': 'MO', 'Macau': 'MO', 'Macao SAR': 'MO', 'Macau SAR': 'MO',
  'Macao SAR, China': 'MO', 'Macau, China': 'MO',
  'Taiwan': 'TW', 'Taiwan, China': 'TW', 'Chinese Taipei': 'TW',
  'Republic of China': 'TW', 'ROC': 'TW',
  'Japan': 'JP',
  'South Korea': 'KR', 'Korea': 'KR', 'Korea, South': 'KR',
  'Republic of Korea': 'KR', 'Korea (South)': 'KR',
  'North Korea': 'KP', 'Korea, North': 'KP', 'Korea (North)': 'KP',
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
  'Wallis and Futuna': 'WF', 'Wallis & Futuna': 'WF',
  'French Polynesia': 'PF', 'Tahiti': 'PF',
  'New Caledonia': 'NC',
  'Guam': 'GU',
  'Northern Mariana Islands': 'MP', 'CNMI': 'MP',
  'Wake Island': 'UM',
  'Johnston Atoll': 'UM',
  'Midway Islands': 'UM', 'Midway': 'UM',
  'Pitcairn Islands': 'PN', 'Pitcairn Island': 'PN',
  'Norfolk Island': 'NF',
  'Christmas Island': 'CX',
  'Cocos Islands': 'CC', 'Cocos (Keeling) Islands': 'CC', 'Cocos Island': 'CC',
  'Heard Island': 'HM',

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
  'Iran': 'IR', 'Islamic Republic of Iran': 'IR', 'Iran, Islamic Rep.': 'IR',
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

  // ── 欧洲 ────────────────────────────────────────────────────────
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
  'Bosnia and Herzegovina': 'BA', 'Bosnia': 'BA', 'Bosnia & Herzegovina': 'BA',
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
  'Azores': 'PT',
  'Madeira': 'PT',
  'Canary Islands': 'IC', 'Canarias': 'IC',

  // ── 非洲 ────────────────────────────────────────────────────────
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
  'Democratic Republic of Congo': 'CD', 'DR Congo': 'CD',
  'Congo, Dem. Rep.': 'CD', 'DRC': 'CD',
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
  'Tanzania, United Rep.': 'TZ',
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
  'Sao Tome & Principe': 'ST',
  'Cape Verde': 'CV', 'Cabo Verde': 'CV', 'Cape Verde Islands': 'CV',
  'Comoros': 'KM',
  'Madagascar': 'MG',
  'Mauritius': 'MU',
  'Seychelles': 'SC',
  'Reunion': 'RE', 'Réunion': 'RE',
  'Mayotte': 'YT',
  'Saint Helena': 'SH', 'Saint Helena Is.': 'SH',
  'Saint Helena, Ascension and Tristan da Cunha': 'SH',
  'Ascension Island': 'AC', 'Ascension': 'AC',
  'Tristan da Cunha': 'TA',
  'Niger': 'NE',
  'Mali': 'ML',
  'Burkina Faso': 'BF',

  // ── 北美/加勒比 ──────────────────────────────────────────────────
  'United States': 'US', 'USA': 'US', 'United States of America': 'US',
  'Canada': 'CA',
  'Mexico': 'MX',
  'Cuba': 'CU',
  'Jamaica': 'JM',
  'Haiti': 'HT',
  'Dominican Republic': 'DO',
  'Puerto Rico': 'PR',
  'US Virgin Islands': 'VI', 'United States Virgin Islands': 'VI',
  'Virgin Islands (U.S.)': 'VI',
  'U.S. Virgin Islands': 'VI',
  'USVI': 'VI',
  'Virgin Islands (U.K.)': 'VG',
  'British Virgin Islands (U.K.)': 'VG',
  'Virgin Islands (US)': 'VI',
  'British Virgin Islands': 'VG', 'Virgin Islands (British)': 'VG',
  'Anguilla': 'AI',
  'Antigua and Barbuda': 'AG', 'Antigua': 'AG', 'Antigua & Barbuda': 'AG',
  'Saint Kitts and Nevis': 'KN', 'St. Kitts and Nevis': 'KN',
  'St. Kitts-Nevis': 'KN',
  'Montserrat': 'MS',
  'Guadeloupe': 'GP',
  'Dominica': 'DM',
  'Martinique': 'MQ',
  'Saint Lucia': 'LC', 'St. Lucia': 'LC',
  'Barbados': 'BB',
  'Saint Vincent and the Grenadines': 'VC', 'St. Vincent': 'VC',
  'St. Vincent & Grenadines': 'VC',
  'Grenada': 'GD',
  'Trinidad and Tobago': 'TT', 'Trinidad': 'TT', 'Trinidad & Tobago': 'TT',
  'Aruba': 'AW',
  'Curacao': 'CW', 'Curaçao': 'CW',
  'Bonaire': 'BQ', 'Sint Eustatius': 'BQ', 'Saba': 'BQ',
  'Sint Maarten': 'SX',
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
  'Netherlands Antilles': 'AN',

  // ── 南美 ────────────────────────────────────────────────────────
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

  // ── 非标准国家名（带冠词、缩写、别名）───────────────────────────
  'the United States': 'US', 'the US': 'US', 'the USA': 'US',
  'the United States of America': 'US',
  'the United Kingdom': 'GB', 'the UK': 'GB',
  'the Netherlands': 'NL',
  'the Philippines': 'PH',
  'the Maldives': 'MV',
  'the Bahamas': 'BS',
  'the Gambia': 'GM',
  'the UAE': 'AE',
  'the DRC': 'CD',
  'Republic of China (Taiwan)': 'TW',

  // ── 常见城市/州/地区 → 国家映射 ─────────────────────────────────
  // 中东
  'Jeddah': 'SA', 'Riyadh': 'SA', 'Dammam': 'SA', 'Yanbu': 'SA',
  'Jebel Ali': 'AE', 'Fujairah': 'AE', 'Dubai': 'AE', 'Abu Dhabi': 'AE',
  'Muscat': 'OM', 'Salalah': 'OM',
  'Doha': 'QA',
  'Manama': 'BH',
  'Kuwait City': 'KW',

  // 东南亚
  'Sihanoukville': 'KH', 'Phnom Penh': 'KH',
  'Ho Chi Minh City': 'VN', 'Da Nang': 'VN', 'Vung Tau': 'VN', 'Quy Nhon': 'VN',
  'Changi': 'SG', 'Tuas': 'SG',
  'Kuantan': 'MY', 'Penang': 'MY', 'Mersing': 'MY', 'Kota Kinabalu': 'MY',
  'Kuala Lumpur': 'MY', 'Johor Bahru': 'MY', 'Cherating': 'MY',
  'Jakarta': 'ID', 'Surabaya': 'ID', 'Batam': 'ID', 'Manado': 'ID',
  'Dumai': 'ID', 'Jayapura': 'ID', 'Makassar': 'ID',
  'Manila': 'PH', 'Subic Bay': 'PH', 'Davao': 'PH', 'Cebu': 'PH',
  'Bangkok': 'TH', 'Pattaya': 'TH', 'Songkhla': 'TH', 'Satun': 'TH',
  'Sattahip': 'TH',
  'Yangon': 'MM', 'Myeik': 'MM',

  // 东亚
  'Tokyo': 'JP', 'Osaka': 'JP', 'Okinawa': 'JP', 'Chikura': 'JP',
  'Kitaibaraki': 'JP', 'Maruyama': 'JP', 'Shima': 'JP', 'Minamiboso': 'JP',
  'Busan': 'KR', 'Seoul': 'KR', 'Geoje': 'KR', 'Incheon': 'KR',
  'Keoje': 'KR', 'Taean': 'KR',

  // 南亚
  'Mumbai': 'IN', 'Chennai': 'IN', 'Cochin': 'IN', 'Kochi': 'IN',
  'Tuticorin': 'IN', 'Trivandrum': 'IN', 'Thoothukudi': 'IN',
  'Colombo': 'LK', 'Matara': 'LK', 'Mount Lavinia': 'LK',
  'Karachi': 'PK',
  'Dhaka': 'BD', 'Cox\'s Bazar': 'BD', 'Kuakata': 'BD',
  'Male': 'MV', 'Hulhumale': 'MV',

  // 欧洲
  'Marseille': 'FR', 'Brest': 'FR', 'Bordeaux': 'FR', 'Calais': 'FR',
  'Saint-Hilaire-de-Riez': 'FR', 'Penmarch': 'FR', 'La Seyne-sur-Mer': 'FR',
  'Barcelona': 'ES', 'Bilbao': 'ES', 'Conil': 'ES', 'Estepona': 'ES',
  'Lisbon': 'PT', 'Seixal': 'PT', 'Sesimbra': 'PT', 'Carcavelos': 'PT',
  'Genoa': 'IT', 'Palermo': 'IT', 'Catania': 'IT', 'Mazara del Vallo': 'IT',
  'Amsterdam': 'NL', 'Katwijk': 'NL', 'Beverwijk': 'NL',
  'Zeebrugge': 'BE', 'Ostend': 'BE',
  'Hamburg': 'DE', 'Rostock': 'DE', 'Sylt': 'DE', 'Norden': 'DE',
  'Bude': 'GB', 'Porthcurno': 'GB', 'Skewjack': 'GB', 'Highbridge': 'GB',
  'Lowestoft': 'GB', 'Whitesands Bay': 'GB', 'Southport': 'GB',
  'Oxwich Bay': 'GB', 'Blackpool': 'GB', 'Brighton': 'GB',
  'Blaabjerg': 'DK', 'Lyngby': 'DK', 'Gedser': 'DK',
  'Gothenburg': 'SE', 'Malmö': 'SE',
  'Oslo': 'NO', 'Kristiansand': 'NO', 'Stavanger': 'NO',
  'Helsinki': 'FI', 'Hanko': 'FI',
  'Tallinn': 'EE',
  'Riga': 'LV',
  'Klaipeda': 'LT',

  // 北美
  'California': 'US', 'Oregon': 'US', 'Virginia': 'US', 'New Jersey': 'US',
  'New York': 'US', 'Florida': 'US', 'Texas': 'US', 'Hawaii': 'US',
  'Long Island': 'US', 'Wall Township': 'US', 'Tuckerton': 'US',
  'Myrtle Beach': 'US', 'Virginia Beach': 'US', 'Miami': 'US',
  'Los Angeles': 'US', 'San Francisco': 'US', 'Seattle': 'US',
  'Hillsboro': 'US', 'Hermosa Beach': 'US', 'Manhattan Beach': 'US',
  'Atlantic City': 'US', 'Lynn': 'US', 'Manahawkin': 'US',
  'Halifax': 'CA', 'Vancouver': 'CA',
  'Cancun': 'MX', 'Tulum': 'MX', 'Mazatlan': 'MX', 'Tijuana': 'MX',

  // 南美
  'Fortaleza': 'BR', 'Rio de Janeiro': 'BR', 'Santos': 'BR',
  'Sao Paulo': 'BR', 'Recife': 'BR', 'Salvador': 'BR', 'Praia Grande': 'BR',
  'Barranquilla': 'CO', 'Cartagena': 'CO', 'Buenaventura': 'CO',
  'Valparaiso': 'CL', 'Arica': 'CL', 'Lurin': 'PE', 'Lima': 'PE',
  'Buenos Aires': 'AR', 'Las Toninas': 'AR',
  'Montevideo': 'UY',

  // 非洲
  'Mombasa': 'KE', 'Malindi': 'KE',
  'Dar es Salaam': 'TZ',
  'Maputo': 'MZ', 'Nacala': 'MZ',
  'Cape Town': 'ZA', 'Durban': 'ZA', 'Mtunzini': 'ZA', 'Yzerfontein': 'ZA',
  'Melkbosstrand': 'ZA',
  'Luanda': 'AO',
  'Lagos': 'NG', 'Apapa': 'NG', 'Lekki': 'NG',
  'Accra': 'GH', 'Tema': 'GH',
  'Abidjan': 'CI',
  'Dakar': 'SN',
  'Nouakchott': 'MR',
  'Casablanca': 'MA', 'Tangier': 'MA', 'Asilah': 'MA',
  'Alexandria': 'EG', 'Suez': 'EG', 'Abu Talat': 'EG', 'Zafarana': 'EG',
  'Tripoli': 'LY',
  'Tunis': 'TN', 'Bizerte': 'TN', 'Kelibia': 'TN',
  'Algiers': 'DZ', 'Annaba': 'DZ', 'Oran': 'DZ',
  'Djibouti City': 'DJ',
  'Mogadishu': 'SO',
  'Port Louis': 'MU',
  'Toamasina': 'MG', 'Antananarivo': 'MG',

  // 大洋洲
  'Sydney': 'AU', 'Perth': 'AU', 'Adelaide': 'AU', 'Darwin': 'AU',
  'Maroochydore': 'AU',
  'Auckland': 'NZ', 'Takapuna': 'NZ', 'Mangawhai': 'NZ',
  'Port Moresby': 'PG', 'Madang': 'PG',
  'Suva': 'FJ',
  'Apia': 'WS',
  'Nuku\'alofa': 'TO',
  'Noumea': 'NC',
  'Papeete': 'PF',
};

/**
 * 根据国家名称获取 ISO 代码
 * 四层匹配：精确 → 不区分大小写 → 去括号 → 前缀匹配
 */
export function getCountryCode(name: string | null | undefined): string {
  if (!name) return 'XX';
  const trimmed = name.trim();

  // 1. 精确匹配
  if (COUNTRY_CODE_MAP[trimmed]) return COUNTRY_CODE_MAP[trimmed];

  // 2. 不区分大小写
  const lower = trimmed.toLowerCase();
  for (const [key, code] of Object.entries(COUNTRY_CODE_MAP)) {
    if (key.toLowerCase() === lower) return code;
  }

  // 3. 去掉括号内容后匹配（如 "Monaco (principality)" → "Monaco"）
  const withoutParens = trimmed.replace(/\s*\([^)]*\)/g, '').trim();
  if (withoutParens !== trimmed && COUNTRY_CODE_MAP[withoutParens]) {
    return COUNTRY_CODE_MAP[withoutParens];
  }

  // 4. 前缀匹配（处理 "France (overseas)" 这类）
  for (const [key, code] of Object.entries(COUNTRY_CODE_MAP)) {
    if (trimmed.startsWith(key + ' ') || trimmed.startsWith(key + ',')) {
      return code;
    }
  }

  console.warn(`[countryCodeMap] Unknown country: "${trimmed}"`);
  return 'XX';
}

/**
 * 验证 countryCode 是否与站名匹配，防止误映射
 * 重点保护：MO（澳门）和 CN（中国大陆）不被非中华区地名占用
 */
export function validateCountryCode(code: string, stationName: string): string {
  const name = stationName.toLowerCase();

  if (code === 'MO') {
    const macauKeywords = ['macao', 'macau', '澳门', 'taipa', 'cotai', 'coloane'];
    const isMacau = macauKeywords.some(k => name.includes(k));
    if (!isMacau) {
      if (name.includes('montserrat')) return 'MS';
      if (name.includes('monaco'))     return 'MC';
      if (name.includes('moldova'))    return 'MD';
      if (name.includes('morocco'))    return 'MA';
      if (name.includes('marshall'))   return 'MH';
      if (name.includes('micronesia')) return 'FM';
    }
  }

  if (code === 'CN') {
    const chinaKeywords = [
      'china', 'chinese', '中国', 'shanghai', 'beijing', 'guangzhou',
      'shenzhen', 'qingdao', 'xiamen', 'tianjin', 'dalian', 'fuzhou',
      'ningbo', 'wenzhou', 'haikou', 'sanya', 'shantou', 'zhoushan',
      'yangjiang', 'zhanjiang', 'chengmai', 'nantong', 'chongming',
      'nansha', 'weihai', 'qinhuangdao',
    ];
    const isChina = chinaKeywords.some(k => name.includes(k));
    if (!isChina) {
      if (name.includes('monaco')) return 'MC';
    }
  }

  return code;
}
