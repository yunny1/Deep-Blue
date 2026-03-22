// src/components/panels/CableDetailPanel.tsx
'use client';
import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { getTooltip } from '@/lib/tooltips';
import Tooltip from '@/components/ui/Tooltip';
import { SkeletonDetailPanel, SkeletonNewsList } from '@/components/ui/Skeleton';
import RiskScoreCard from '@/components/panels/RiskScoreCard';

interface LandingStation {
  name: string;
  nameZh?: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  country: { nameEn: string; nameZh?: string | null } | null;
}

interface CableDetail {
  id: string; name: string; slug: string; status: string;
  rfsDate: string | null; lengthKm: number | null;
  designCapacityTbps: number | null; fiberPairs: number | null;
  technology: string | null; investmentAmountUsd: number | null;
  estimatedLifespan: number | null; notes: string | null;
  vendor: { name: string } | null;
  owners: Array<{ company: { name: string } }>;
  landingStations: Array<{ landingStation: LandingStation }>;
}

interface NewsItem {
  title: string; link: string; pubDate: string;
  description: string; source: string; eventCategory: string;
}

const STATUS_MAP: Record<string, { color: string; labelKey: string }> = {
  IN_SERVICE:         { color: '#06D6A0', labelKey: 'color.inService' },
  UNDER_CONSTRUCTION: { color: '#E9C46A', labelKey: 'color.underConstruction' },
  PLANNED:            { color: '#3B82F6', labelKey: 'color.planned' },
  DECOMMISSIONED:     { color: '#D97706', labelKey: 'color.decommissioned' },
};
const EVENT_COLORS: Record<string, string> = {
  EQUIPMENT_FAULT: '#EF4444', NATURAL_DISASTER: '#F97316', POLITICAL: '#EC4899',
  CONSTRUCTION: '#3B82F6', REPAIR: '#10B981', GENERAL: '#6B7280',
};
const EVENT_LABELS: Record<string, string> = {
  EQUIPMENT_FAULT: 'Fault', NATURAL_DISASTER: 'Hazard', POLITICAL: 'Security',
  CONSTRUCTION: 'Construction', REPAIR: 'Repair', GENERAL: 'News',
};

function getServiceYears(rfsDate: string | null): string {
  if (!rfsDate) return 'N/A';
  const years = Math.floor((Date.now() - new Date(rfsDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years < 0 ? `${Math.abs(years)}` : `${years}`;
}

function InfoCardWithTip({ label, value, tooltip, delay }: { label: string; value: string; tooltip: string; delay: number }) {
  const inner = (
    <div style={{
      backgroundColor: 'var(--bg-raised)', borderRadius: 'var(--radius-md)',
      padding: '10px 14px', cursor: tooltip ? 'help' : 'default', width: '100%',
      animation: `fadeInUp 0.25s ease ${delay * 0.05}s both`, transition: 'background-color 0.15s',
    }}
      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
      onMouseOut={e => (e.currentTarget.style.backgroundColor = 'var(--bg-raised)')}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label} {tooltip ? 'ⓘ' : ''}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  );
  return tooltip ? <Tooltip content={tooltip} position="bottom" maxWidth={280}>{inner}</Tooltip> : inner;
}

export default function CableDetailPanel() {
  const { selectedCableId, setSelectedCable } = useMapStore();
  const [cable, setCable] = useState<CableDetail | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'stations' | 'events'>('overview');
  const [isClosing, setIsClosing] = useState(false);
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  useEffect(() => {
    if (!selectedCableId) { setCable(null); setNews([]); setIsClosing(false); return; }
    setLoading(true); setActiveTab('overview'); setIsClosing(false);
    fetch(`/api/cables/${selectedCableId}`)
      .then(r => r.json()).then(d => { setCable(d); setLoading(false); }).catch(() => setLoading(false));
  }, [selectedCableId]);

  useEffect(() => {
    if (activeTab !== 'events' || !selectedCableId) return;
    setNewsLoading(true);
    fetch(`/api/news?cable=${selectedCableId}&limit=20`)
      .then(r => r.json()).then(d => { setNews(d.news || []); setNewsLoading(false); }).catch(() => setNewsLoading(false));
  }, [activeTab, selectedCableId]);

  const handleClose = () => { setIsClosing(true); setTimeout(() => setSelectedCable(null), 250); };

  if (!selectedCableId) return null;
  const statusInfo = STATUS_MAP[cable?.status || 'IN_SERVICE'] || STATUS_MAP.IN_SERVICE;

  return (
    <>
      <div onClick={handleClose} style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)', zIndex: 90,
        animation: isClosing ? 'fadeOut 0.25s ease forwards' : 'fadeIn 0.2s ease',
      }} />

      <div style={{
        position: 'fixed', top: 56, right: 0, bottom: 0, width: 420,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        backgroundColor: 'rgba(10, 17, 34, 0.98)', backdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--border-default)', zIndex: 100, overflowY: 'auto',
        animation: isClosing
          ? 'slideOutRight 0.25s ease forwards'
          : 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <style>{`
          @keyframes fadeOut { from { opacity:1; } to { opacity:0; } }
          @keyframes slideOutRight { from { transform:translateX(0); opacity:1; } to { transform:translateX(100%); opacity:0; } }
        `}</style>

        {loading && <SkeletonDetailPanel />}

        {cable && !loading && (
          <>
            {/* 头部 */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border-subtle)', animation: 'fadeInUp 0.3s ease 0.1s both' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{cable.name}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusInfo.color, boxShadow: `0 0 6px ${statusInfo.color}` }} />
                    <span style={{ fontSize: 13, color: statusInfo.color, fontWeight: 500 }}>{t(statusInfo.labelKey)}</span>
                    {cable.vendor && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                        {t('detail.builtBy')} {cable.vendor.name}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={handleClose} style={{
                  background: 'var(--bg-raised)', border: 'none', color: 'var(--text-tertiary)',
                  fontSize: 16, cursor: 'pointer', width: 32, height: 32, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'var(--bg-raised)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                >✕</button>
              </div>
              {cable.owners && cable.owners.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('detail.owners')} {cable.owners.map(o => o.company.name).join(', ')}
                </div>
              )}
            </div>

            {/* Tab 栏 */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', padding: '0 20px', animation: 'fadeIn 0.3s ease 0.15s both' }}>
              {[
                { key: 'overview',  label: t('detail.overview') },
                { key: 'stations',  label: `${t('detail.stations')} (${cable.landingStations?.length || 0})` },
                { key: 'events',    label: t('detail.events') },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{
                  padding: '12px 16px', fontSize: 13, fontWeight: 500,
                  color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeTab === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  transition: 'all 0.2s',
                }}>{tab.label}</button>
              ))}
            </div>

            {/* Tab 内容 */}
            <div style={{ padding: 20, animation: 'fadeInUp 0.2s ease' }} key={activeTab}>

              {/* Overview */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {cable.lengthKm && <InfoCardWithTip label={t('detail.length')} value={`${cable.lengthKm.toLocaleString()} km`} tooltip={getTooltip('cableLength', locale)} delay={0} />}
                    {cable.rfsDate && <InfoCardWithTip label={t('detail.rfsDate')} value={new Date(cable.rfsDate).getFullYear().toString()} tooltip={getTooltip('cableRFS', locale)} delay={1} />}
                    {cable.rfsDate && <InfoCardWithTip label={t('detail.serviceYears')} value={`${getServiceYears(cable.rfsDate)} ${t('detail.years')}`} tooltip={getTooltip('cableServiceYears', locale)} delay={2} />}
                    {cable.designCapacityTbps && <InfoCardWithTip label={t('detail.capacity')} value={`${cable.designCapacityTbps} Tbps`} tooltip={getTooltip('cableCapacity', locale)} delay={3} />}
                    {cable.fiberPairs && <InfoCardWithTip label={t('detail.fiberPairs')} value={String(cable.fiberPairs)} tooltip={getTooltip('cableFiberPairs', locale)} delay={4} />}
                    {cable.technology && <InfoCardWithTip label={t('detail.technology')} value={cable.technology} tooltip="" delay={5} />}
                  </div>
                  {cable.rfsDate && cable.estimatedLifespan && (
                    <Tooltip content={getTooltip('cableLifespan', locale)} position="bottom" maxWidth={280}>
                      <div style={{ backgroundColor: 'var(--bg-raised)', borderRadius: 'var(--radius-md)', padding: 14, cursor: 'help', width: '100%', animation: 'fadeInUp 0.3s ease 0.3s both' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                          {t('detail.lifespan')} ({cable.estimatedLifespan} {t('detail.years')}) ⓘ
                        </div>
                        <div style={{ width: '100%', height: 6, backgroundColor: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(100, Math.max(0, ((new Date().getFullYear() - new Date(cable.rfsDate).getFullYear()) / cable.estimatedLifespan) * 100))}%`,
                            height: '100%', backgroundColor: 'var(--accent-primary)', borderRadius: 3,
                            transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                          }} />
                        </div>
                      </div>
                    </Tooltip>
                  )}
                  {cable.notes && (
                    <div style={{ backgroundColor: 'var(--bg-raised)', borderRadius: 'var(--radius-md)', padding: 14, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, animation: 'fadeInUp 0.3s ease 0.35s both' }}>
                      {cable.notes}
                    </div>
                  )}
                  <RiskScoreCard cableSlug={cable.slug} />
                </div>
              )}

              {/* Stations — 中文页面优先显示 nameZh */}
              {activeTab === 'stations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cable.landingStations && cable.landingStations.length > 0 ? (
                    cable.landingStations.map((ls, i) => {
                      const station  = ls.landingStation;
                      // 中文页面：优先 nameZh，没有则显示英文名并标注
                      const dispName = zh
                        ? (station.nameZh || station.name)
                        : station.name;
                      // 国家名
                      const dispCountry = zh
                        ? (station.country?.nameZh || station.country?.nameEn || station.countryCode)
                        : (station.country?.nameEn || station.countryCode);
                      // 无中文名时在英文名后加灰色角标
                      const noZh = zh && !station.nameZh;

                      return (
                        <div key={i} style={{
                          backgroundColor: 'var(--bg-raised)', borderRadius: 'var(--radius-md)',
                          padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', animation: `fadeInUp 0.2s ease ${i * 0.03}s both`,
                          transition: 'background-color 0.15s',
                        }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = 'var(--bg-raised)')}
                        >
                          <div>
                            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {dispName}
                              {noZh && (
                                <span style={{ fontSize: 9, color: 'var(--text-muted)', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 4px' }}>EN</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{dispCountry}</div>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', fontFamily: 'monospace' }}>
                            {station.latitude != null && station.longitude != null
                              ? `${station.latitude.toFixed(2)}, ${station.longitude.toFixed(2)}`
                              : '—'}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                      {t('detail.noStations')}
                    </div>
                  )}
                </div>
              )}

              {/* Events */}
              {activeTab === 'events' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {newsLoading ? <SkeletonNewsList /> : news.length > 0 ? (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        {t('detail.relatedArticles', { count: news.length })}
                      </div>
                      {news.map((item, i) => (
                        <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{
                          backgroundColor: 'var(--bg-raised)', borderRadius: 'var(--radius-md)',
                          padding: '12px 14px', textDecoration: 'none', display: 'block',
                          transition: 'all 0.15s',
                          borderLeft: `3px solid ${EVENT_COLORS[item.eventCategory] || '#6B7280'}`,
                          animation: `fadeInUp 0.2s ease ${i * 0.05}s both`,
                        }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = 'var(--bg-raised)')}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, backgroundColor: `${EVENT_COLORS[item.eventCategory] || '#6B7280'}20`, color: EVENT_COLORS[item.eventCategory] || '#6B7280' }}>
                              {EVENT_LABELS[item.eventCategory] || 'News'}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {new Date(item.pubDate).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>{item.title}</div>
                          {item.description && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                              {item.description.slice(0, 150)}...
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                            {t('common.source')}: {item.source}
                          </div>
                        </a>
                      ))}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 30, animation: 'fadeIn 0.3s ease' }}>
                      <div style={{ fontSize: 24, marginBottom: 10 }}>📰</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{t('detail.noNews')}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                        {t('detail.noNewsDesc', { name: cable.name })}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(42, 157, 143, 0.04)', border: '1px solid var(--border-accent)', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('detail.newsSource')}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
