// src/components/panels/CableDetailPanel.tsx
// 海缆详情面板 - 点击海缆后从右侧滑入
// 包含概览、登陆站、事件等信息

'use client';

import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';

interface CableDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  rfsDate: string | null;
  lengthKm: number | null;
  designCapacityTbps: number | null;
  fiberPairs: number | null;
  technology: string | null;
  investmentAmountUsd: number | null;
  estimatedLifespan: number | null;
  notes: string | null;
  landingStations: Array<{
    landingStation: {
      name: string;
      countryCode: string;
      latitude: number;
      longitude: number;
    };
  }>;
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  IN_SERVICE:         { color: '#06D6A0', label: 'In Service' },
  UNDER_CONSTRUCTION: { color: '#E9C46A', label: 'Under Construction' },
  PLANNED:            { color: '#3B82F6', label: 'Planned' },
  DECOMMISSIONED:     { color: '#6B7280', label: 'Decommissioned' },
};

// 计算服役年限
function getServiceYears(rfsDate: string | null): string {
  if (!rfsDate) return 'N/A';
  const rfs = new Date(rfsDate);
  const now = new Date();
  const years = Math.floor((now.getTime() - rfs.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (years < 0) return `RFS in ${Math.abs(years)}y`;
  return `${years} years`;
}

export default function CableDetailPanel() {
  const { selectedCableId, setSelectedCable } = useMapStore();
  const [cable, setCable] = useState<CableDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'stations' | 'events'>('overview');

  // 当选中海缆变化时，获取详情数据
  useEffect(() => {
    if (!selectedCableId) {
      setCable(null);
      return;
    }

    setLoading(true);
    fetch(`/api/cables/${selectedCableId}`)
      .then(res => res.json())
      .then(data => {
        setCable(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedCableId]);

  // 面板没有选中海缆时不显示
  if (!selectedCableId) return null;

  const statusInfo = STATUS_MAP[cable?.status || 'IN_SERVICE'] || STATUS_MAP.IN_SERVICE;

  return (
    <>
      {/* 半透明遮罩层（点击关闭面板） */}
      <div
        onClick={() => setSelectedCable(null)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          zIndex: 90,
        }}
      />

      {/* 右侧滑入面板 */}
      <div style={{
        position: 'fixed', top: 56, right: 0, bottom: 0, width: 420,
        backgroundColor: 'rgba(13, 27, 42, 0.97)',
        backdropFilter: 'blur(16px)',
        borderLeft: '1px solid rgba(42, 157, 143, 0.2)',
        zIndex: 100,
        overflowY: 'auto',
        animation: 'slideIn 0.25s ease-out',
      }}>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        {/* 加载状态 */}
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
            Loading cable data...
          </div>
        )}

        {/* 海缆详情内容 */}
        {cable && !loading && (
          <>
            {/* 头部：名称和关闭按钮 */}
            <div style={{
              padding: '20px 20px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#EDF2F7', margin: 0 }}>
                    {cable.name}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      backgroundColor: statusInfo.color,
                      boxShadow: `0 0 6px ${statusInfo.color}`,
                    }} />
                    <span style={{ fontSize: 13, color: statusInfo.color, fontWeight: 500 }}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCable(null)}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: 'none',
                    color: '#9CA3AF', fontSize: 18, cursor: 'pointer',
                    width: 32, height: 32, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Tab 切换栏 */}
            <div style={{
              display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)',
              padding: '0 20px',
            }}>
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'stations', label: `Stations (${cable.landingStations?.length || 0})` },
                { key: 'events', label: 'Events' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  style={{
                    padding: '12px 16px', fontSize: 13, fontWeight: 500,
                    color: activeTab === tab.key ? '#2A9D8F' : '#6B7280',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: activeTab === tab.key ? '2px solid #2A9D8F' : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 内容 */}
            <div style={{ padding: 20 }}>
              {/* ═══ Overview Tab ═══ */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 属性网格 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {cable.lengthKm && (
                      <InfoCard label="Length" value={`${cable.lengthKm.toLocaleString()} km`} />
                    )}
                    {cable.rfsDate && (
                      <InfoCard label="RFS Date" value={new Date(cable.rfsDate).getFullYear().toString()} />
                    )}
                    {cable.rfsDate && (
                      <InfoCard label="Service Years" value={getServiceYears(cable.rfsDate)} />
                    )}
                    {cable.designCapacityTbps && (
                      <InfoCard label="Capacity" value={`${cable.designCapacityTbps} Tbps`} />
                    )}
                    {cable.fiberPairs && (
                      <InfoCard label="Fiber Pairs" value={String(cable.fiberPairs)} />
                    )}
                    {cable.technology && (
                      <InfoCard label="Technology" value={cable.technology} />
                    )}
                  </div>

                  {/* 服役寿命进度条 */}
                  {cable.rfsDate && cable.estimatedLifespan && (
                    <div style={{
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      borderRadius: 8, padding: 14,
                    }}>
                      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
                        Estimated Lifespan ({cable.estimatedLifespan} years)
                      </div>
                      <div style={{
                        width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.06)',
                        borderRadius: 3, overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(100, Math.max(0,
                            ((new Date().getFullYear() - new Date(cable.rfsDate).getFullYear()) / cable.estimatedLifespan) * 100
                          ))}%`,
                          height: '100%',
                          backgroundColor: '#2A9D8F',
                          borderRadius: 3,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  )}

                  {/* 投资金额（如果有） */}
                  {cable.investmentAmountUsd && (
                    <div style={{
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      borderRadius: 8, padding: 14,
                    }}>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>Investment</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#E9C46A', marginTop: 4 }}>
                        ${(cable.investmentAmountUsd / 1e6).toFixed(0)}M USD
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ Stations Tab ═══ */}
              {activeTab === 'stations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cable.landingStations && cable.landingStations.length > 0 ? (
                    cable.landingStations.map((ls, i) => (
                      <div key={i} style={{
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        borderRadius: 8, padding: '10px 14px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>
                            {ls.landingStation.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                            {ls.landingStation.countryCode}
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: '#4B5563' }}>
                          {ls.landingStation.latitude.toFixed(2)}, {ls.landingStation.longitude.toFixed(2)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', padding: 20 }}>
                      No landing station data available
                    </div>
                  )}
                </div>
              )}

              {/* ═══ Events Tab (placeholder) ═══ */}
              {activeTab === 'events' && (
                <div style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 24, marginBottom: 12 }}>📡</div>
                  <div>Event tracking coming in Phase 2</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    Historical faults, repairs, and news will appear here
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

// 小卡片组件（用于显示单个属性）
function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      backgroundColor: 'rgba(255,255,255,0.03)',
      borderRadius: 8, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 11, color: '#6B7280' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#EDF2F7', marginTop: 2 }}>{value}</div>
    </div>
  );
}
