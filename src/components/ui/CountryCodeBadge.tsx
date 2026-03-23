// src/components/ui/CountryCodeBadge.tsx
// 国家代码徽章 — PC hover / 手机 tap 显示全称
'use client';
import { useState, useRef, useEffect } from 'react';

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
  RU: '俄罗斯', IR: '伊朗', IQ: '伊拉克', LB: '黎巴嫩', CU: '古巴',
  NC: '新喀里多尼亚', PF: '法属波利尼西亚', TO: '汤加', WS: '萨摩亚',
  VU: '瓦努阿图', SB: '所罗门群岛', MH: '马绍尔群岛', PW: '帕劳',
  FM: '密克罗尼西亚', KI: '基里巴斯', NR: '瑙鲁', TV: '图瓦卢',
  SC: '塞舌尔', MU: '毛里求斯', RE: '留尼汪', YT: '马约特',
  SO: '索马里', ET: '埃塞俄比亚', ER: '厄立特里亚', SD: '苏丹',
  UG: '乌干达', RW: '卢旺达',
  AO: '安哥拉', CM: '喀麦隆', CI: '科特迪瓦', SL: '塞拉利昂',
  LR: '利比里亚', GN: '几内亚', GM: '冈比亚', CV: '佛得角',
  ST: '圣多美和普林西比', GQ: '赤道几内亚', GA: '加蓬', CG: '刚果',
  CD: '刚果民主共和国', TG: '多哥', BJ: '贝宁', BF: '布基纳法索',
};

const COUNTRY_EN: Record<string, string> = {
  CN: 'China Mainland', TW: 'Taiwan', HK: 'Hong Kong', MO: 'Macao',
  US: 'United States', GB: 'United Kingdom', JP: 'Japan', SG: 'Singapore',
  KR: 'South Korea', AU: 'Australia', IN: 'India', FR: 'France',
  DE: 'Germany', BR: 'Brazil', ID: 'Indonesia', MY: 'Malaysia',
  PH: 'Philippines', TH: 'Thailand', VN: 'Vietnam', PK: 'Pakistan',
  BD: 'Bangladesh', LK: 'Sri Lanka', MV: 'Maldives', EG: 'Egypt',
  ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya', DJ: 'Djibouti',
  SA: 'Saudi Arabia', AE: 'UAE', QA: 'Qatar', OM: 'Oman', YE: 'Yemen',
  IT: 'Italy', ES: 'Spain', PT: 'Portugal', GR: 'Greece', TR: 'Turkey',
  NL: 'Netherlands', BE: 'Belgium', IE: 'Ireland', DK: 'Denmark',
  SE: 'Sweden', NO: 'Norway', FI: 'Finland', PL: 'Poland', RO: 'Romania',
  CY: 'Cyprus', MT: 'Malta', CA: 'Canada', MX: 'Mexico', CL: 'Chile',
  AR: 'Argentina', CO: 'Colombia', PE: 'Peru', GU: 'Guam', NZ: 'New Zealand',
  FJ: 'Fiji', PG: 'Papua New Guinea', MM: 'Myanmar', KH: 'Cambodia',
  MG: 'Madagascar', MZ: 'Mozambique', TZ: 'Tanzania', GH: 'Ghana',
  SN: 'Senegal', IL: 'Israel', JO: 'Jordan', KW: 'Kuwait', BH: 'Bahrain',
  MA: 'Morocco', TN: 'Tunisia', PR: 'Puerto Rico', JM: 'Jamaica', PA: 'Panama',
  RU: 'Russia', IR: 'Iran', NC: 'New Caledonia', TO: 'Tonga', WS: 'Samoa',
};

interface Props {
  code: string;
  zh?: boolean;
  style?: React.CSSProperties;
}

export default function CountryCodeBadge({ code, zh = false, style }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  const fullName = zh
    ? (COUNTRY_ZH[code] || COUNTRY_EN[code] || code)
    : (COUNTRY_EN[code] || code);

  if (!fullName || fullName === code) {
    return <span style={style}>{code}</span>;
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (isMobile) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setVisible(true);
  };
  const handleMouseLeave = () => { if (!isMobile) setVisible(false); };
  const handleClick = (e: React.MouseEvent) => {
    if (!isMobile) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setVisible(v => !v);
  };

  // 点击其他地方关闭
  useEffect(() => {
    if (!visible || !isMobile) return;
    const close = () => setVisible(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [visible, isMobile]);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{
          cursor: 'help',
          borderBottom: '1px dashed rgba(255,255,255,0.3)',
          ...style,
        }}
      >
        {code}
      </span>
      {visible && (
        <div style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y - 8,
          transform: 'translate(-50%, -100%)',
          backgroundColor: 'rgba(8,16,32,0.97)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(42,157,143,0.3)',
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 12,
          color: '#EDF2F7',
          whiteSpace: 'nowrap',
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {fullName}
          <div style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid rgba(42,157,143,0.3)',
          }} />
        </div>
      )}
    </>
  );
}
