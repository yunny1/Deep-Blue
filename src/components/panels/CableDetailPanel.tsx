// src/components/panels/CableDetailPanel.tsx
// 海缆详情面板 — 带悬停解释提示
'use client';
import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { getTooltip } from '@/lib/tooltips';
import Tooltip from '@/components/ui/Tooltip';
import RiskScoreCard from '@/components/panels/RiskScoreCard';

interface CableDetail { id: string; name: string; slug: string; status: string; rfsDate: string | null; lengthKm: number | null; designCapacityTbps: number | null; fiberPairs: number | null; technology: string | null; investmentAmountUsd: number | null; estimatedLifespan: number | null; notes: string | null; vendor: { name: string } | null; owners: Array<{ company: { name: string } }>; landingStations: Array<{ landingStation: { name: string; countryCode: string; latitude: number; longitude: number; country: { nameEn: string } | null } }>; }
interface NewsItem { title: string; link: string; pubDate: string; description: string; source: string; eventCategory: string; }

const STATUS_MAP: Record<string, { color: string; labelKey: string }> = { IN_SERVICE: { color: '#06D6A0', labelKey: 'color.inService' }, UNDER_CONSTRUCTION: { color: '#E9C46A', labelKey: 'color.underConstruction' }, PLANNED: { color: '#3B82F6', labelKey: 'color.planned' }, DECOMMISSIONED: { color: '#6B7280', labelKey: 'color.decommissioned' } };
const EVENT_COLORS: Record<string, string> = { EQUIPMENT_FAULT: '#EF4444', NATURAL_DISASTER: '#F97316', POLITICAL: '#EC4899', CONSTRUCTION: '#3B82F6', REPAIR: '#10B981', GENERAL: '#6B7280' };
const EVENT_LABELS: Record<string, string> = { EQUIPMENT_FAULT: 'Fault', NATURAL_DISASTER: 'Hazard', POLITICAL: 'Security', CONSTRUCTION: 'Construction', REPAIR: 'Repair', GENERAL: 'News' };

function getServiceYears(rfsDate: string | null): string {
  if (!rfsDate) return 'N/A';
  const years = Math.floor((Date.now() - new Date(rfsDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years < 0 ? `${Math.abs(years)}` : `${years}`;
}

export default function CableDetailPanel() {
  const { selectedCableId, setSelectedCable } = useMapStore();
  const [cable, setCable] = useState<CableDetail | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'stations' | 'events'>('overview');
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (!selectedCableId) { setCable(null); setNews([]); return; }
    setLoading(true); setActiveTab('overview');
    fetch(`/api/cables/${selectedCableId}`).then(r => r.json()).then(d => { setCable(d); setLoading(false); }).catch(() => setLoading(false));
  }, [selectedCableId]);

  useEffect(() => {
    if (activeTab !== 'events' || !selectedCableId) return;
    setNewsLoading(true);
    fetch(`/api/news?cable=${selectedCableId}&limit=20`).then(r => r.json()).then(d => { setNews(d.news || []); setNewsLoading(false); }).catch(() => setNewsLoading(false));
  }, [activeTab, selectedCableId]);

  if (!selectedCableId) return null;
  const statusInfo = STATUS_MAP[cable?.status || 'IN_SERVICE'] || STATUS_MAP.IN_SERVICE;

  return (
    <>
      <div onClick={() => setSelectedCable(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.2)', zIndex: 90 }} />
      <div style={{ position: 'fixed', top: 56, right: 0, bottom: 0, width: 420, backgroundColor: 'rgba(13, 27, 42, 0.97)', backdropFilter: 'blur(16px)', borderLeft: '1px solid rgba(42, 157, 143, 0.2)', zIndex: 100, overflowY: 'auto', animation: 'slideIn 0.25s ease-out' }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
        {loading && <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>{t('nav.loading')}</div>}
        {cable && !loading && (
          <>
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#EDF2F7', margin: 0 }}>{cable.name}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusInfo.color, boxShadow: `0 0 6px ${statusInfo.color}` }} />
                    <span style={{ fontSize: 13, color: statusInfo.color, fontWeight: 500 }}>{t(statusInfo.labelKey)}</span>
                    {cable.vendor && <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 8 }}>{t('detail.builtBy')} {cable.vendor.name}</span>}
                  </div>
                </div>
                <button onClick={() => setSelectedCable(null)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9CA3AF', fontSize: 18, cursor: 'pointer', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
              {cable.owners && cable.owners.length > 0 && <div style={{ marginTop: 10, fontSize: 11, color: '#6B7280' }}>{t('detail.owners')} {cable.owners.map(o => o.company.name).join(', ')}</div>}
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 20px' }}>
              {[{ key: 'overview', label: t('detail.overview') }, { key: 'stations', label: `${t('detail.stations')} (${cable.landingStations?.length || 0})` }, { key: 'events', label: t('detail.events') }].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: activeTab === tab.key ? '#2A9D8F' : '#6B7280', background: 'none', border: 'none', cursor: 'pointer', borderBottom: activeTab === tab.key ? '2px solid #2A9D8F' : '2px solid transparent', transition: 'all 0.2s' }}>{tab.label}</button>
              ))}
            </div>

            <div style={{ padding: 20 }}>
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {cable.lengthKm && <InfoCardWithTip label={t('detail.length')} value={`${cable.lengthKm.toLocaleString()} km`} tooltip={getTooltip('cableLength', locale)} />}
                    {cable.rfsDate && <InfoCardWithTip label={t('detail.rfsDate')} value={new Date(cable.rfsDate).getFullYear().toString()} tooltip={getTooltip('cableRFS', locale)} />}
                    {cable.rfsDate && <InfoCardWithTip label={t('detail.serviceYears')} value={`${getServiceYears(cable.rfsDate)} ${t('detail.years')}`} tooltip={getTooltip('cableServiceYears', locale)} />}
                    {cable.designCapacityTbps && <InfoCardWithTip label={t('detail.capacity')} value={`${cable.designCapacityTbps} Tbps`} tooltip={getTooltip('cableCapacity', locale)} />}
                    {cable.fiberPairs && <InfoCardWithTip label={t('detail.fiberPairs')} value={String(cable.fiberPairs)} tooltip={getTooltip('cableFiberPairs', locale)} />}
                    {cable.technology && <InfoCardWithTip label={t('detail.technology')} value={cable.technology} tooltip="" />}
                  </div>
                  {cable.rfsDate && cable.estimatedLifespan && (
                    <Tooltip content={getTooltip('cableLifespan', locale)} position="bottom" maxWidth={280}>
                      <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, cursor: 'help', width: '100%' }}>
                        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>{t('detail.lifespan')} ({cable.estimatedLifespan} {t('detail.years')}) ⓘ</div>
                        <div style={{ width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.max(0, ((new Date().getFullYear() - new Date(cable.rfsDate).getFullYear()) / cable.estimatedLifespan) * 100))}%`, height: '100%', backgroundColor: '#2A9D8F', borderRadius: 3, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    </Tooltip>
                  )}
                  {cable.notes && <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 }}>{cable.notes}</div>}
                  <RiskScoreCard cableSlug={cable.slug} />
                </div>
              )}

              {activeTab === 'stations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cable.landingStations && cable.landingStations.length > 0 ? cable.landingStations.map((ls, i) => (
                    <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{ls.landingStation.name}</div>
                        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{ls.landingStation.country?.nameEn || ls.landingStation.countryCode}</div>
                      </div>
                      <div style={{ fontSize: 10, color: '#4B5563', textAlign: 'right' }}>{ls.landingStation.latitude.toFixed(2)}, {ls.landingStation.longitude.toFixed(2)}</div>
                    </div>
                  )) : <div style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', padding: 20 }}>{t('detail.noStations')}</div>}
                </div>
              )}

              {activeTab === 'events' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {newsLoading ? <div style={{ textAlign: 'center', padding: 30, color: '#6B7280', fontSize: 13 }}>{t('detail.fetchingNews')}</div>
                  : news.length > 0 ? (
                    <>
                      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{t('detail.relatedArticles', { count: news.length })}</div>
                      {news.map((item, i) => (
                        <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', textDecoration: 'none', display: 'block', transition: 'background-color 0.15s', borderLeft: `3px solid ${EVENT_COLORS[item.eventCategory] || '#6B7280'}` }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.08)')} onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)')}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, backgroundColor: `${EVENT_COLORS[item.eventCategory] || '#6B7280'}20`, color: EVENT_COLORS[item.eventCategory] || '#6B7280' }}>{EVENT_LABELS[item.eventCategory] || 'News'}</span>
                            <span style={{ fontSize: 10, color: '#4B5563' }}>{new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500, lineHeight: 1.4 }}>{item.title}</div>
                          {item.description && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6, lineHeight: 1.5 }}>{item.description.slice(0, 150)}...</div>}
                          <div style={{ fontSize: 10, color: '#4B5563', marginTop: 6 }}>{t('common.source')}: {item.source}</div>
                        </a>
                      ))}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 30 }}>
                      <div style={{ fontSize: 24, marginBottom: 10 }}>📰</div>
                      <div style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500 }}>{t('detail.noNews')}</div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6, lineHeight: 1.5 }}>{t('detail.noNewsDesc', { name: cable.name })}</div>
                    </div>
                  )}
                  <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 6, backgroundColor: 'rgba(42, 157, 143, 0.06)', border: '1px solid rgba(42, 157, 143, 0.1)', fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>{t('detail.newsSource')}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// 带悬停提示的信息卡片
function InfoCardWithTip({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  if (tooltip) {
    return (
      <Tooltip content={tooltip} position="bottom" maxWidth={280}>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', cursor: 'help', width: '100%' }}>
          <div style={{ fontSize: 11, color: '#6B7280' }}>{label} ⓘ</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#EDF2F7', marginTop: 2 }}>{value}</div>
        </div>
      </Tooltip>
    );
  }
  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: '#6B7280' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#EDF2F7', marginTop: 2 }}>{value}</div>
    </div>
  );
}
