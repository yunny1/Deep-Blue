'use client';
// src/components/admin/StationCoordsEditor.tsx
//
// 登陆站坐标编辑器
// 输入海缆 slug → 加载该缆所有登陆站 → 内联编辑经纬度 → 保存
//
// 使用场景：当路由生成结果不合理时，检查并修正登陆站坐标是第一步

import { useState, useCallback } from 'react';

interface Station {
  id: string;
  name: string;
  nameZh: string | null;
  city: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
}

// 每个登陆站的编辑状态
interface EditState {
  lat: string;
  lng: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

const GOLD   = '#D4AF37';
const CARD   = 'rgba(26,45,74,.5)';
const BORDER = 'rgba(255,255,255,.1)';

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER}`, borderRadius: 6,
  color: '#E2E8F0', fontSize: 12, padding: '6px 8px',
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'monospace',
};

export default function StationCoordsEditor() {
  const [slug,     setSlug]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [cableName, setCableName] = useState('');
  const [stations, setStations] = useState<Station[]>([]);
  const [edits,    setEdits]    = useState<Record<string, EditState>>({});
  const [error,    setError]    = useState<string | null>(null);

  // 加载海缆的所有登陆站
  const loadStations = useCallback(async () => {
    if (!slug.trim()) return;
    setLoading(true); setError(null); setStations([]); setEdits({});
    try {
      const res  = await fetch(`/api/admin/update-station-coords?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      setCableName(data.cableName);
      setStations(data.stations);

      // 初始化编辑状态：lat/lng 来自数据库当前值
      const initEdits: Record<string, EditState> = {};
      for (const s of data.stations as Station[]) {
        initEdits[s.id] = {
          lat: s.latitude  != null ? String(s.latitude)  : '',
          lng: s.longitude != null ? String(s.longitude) : '',
          saving: false, saved: false, error: null,
        };
      }
      setEdits(initEdits);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // 保存单个站点的坐标
  const saveStation = async (stationId: string) => {
    const edit = edits[stationId];
    if (!edit) return;

    const lat = parseFloat(edit.lat);
    const lng = parseFloat(edit.lng);
    if (isNaN(lat) || isNaN(lng)) {
      setEdits(prev => ({ ...prev, [stationId]: { ...edit, error: '请输入合法的数字坐标' } }));
      return;
    }

    setEdits(prev => ({ ...prev, [stationId]: { ...edit, saving: true, error: null } }));

    try {
      const res  = await fetch('/api/admin/update-station-coords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, latitude: lat, longitude: lng }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEdits(prev => ({ ...prev, [stationId]: { ...prev[stationId], saving: false, error: data.error } }));
        return;
      }

      setEdits(prev => ({ ...prev, [stationId]: { ...prev[stationId], saving: false, saved: true, error: null } }));
      // 3 秒后清除"已保存"状态
      setTimeout(() => {
        setEdits(prev => ({ ...prev, [stationId]: { ...prev[stationId], saved: false } }));
      }, 3000);
    } catch (e: unknown) {
      setEdits(prev => ({
        ...prev,
        [stationId]: { ...prev[stationId], saving: false, error: e instanceof Error ? e.message : '保存失败' },
      }));
    }
  };

  const updateEdit = (id: string, field: 'lat' | 'lng', value: string) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value, saved: false, error: null } }));
  };

  return (
    <div style={{ background: CARD, border: `1px solid rgba(255,255,255,.06)`,
      borderRadius: 14, backdropFilter: 'blur(12px)', padding: '20px 24px' }}>

      {/* 标题 */}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
        textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 6 }}>
        登陆站坐标编辑器
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 16, lineHeight: 1.6 }}>
        路由生成不准确时，通常是因为登陆站的经纬度坐标有误。在这里可以直接修正某条海缆的所有登陆站坐标。
        修改后重新点击"自动平滑路由"或重新保存拓扑，路线就会更新。
      </p>

      {/* Slug 搜索 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={slug}
          onChange={e => setSlug(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadStations()}
          placeholder="输入海缆 slug（如 myus）"
          style={{ ...inputStyle, flex: 1, fontSize: 13 }}
        />
        <button onClick={loadStations} disabled={loading || !slug.trim()}
          style={{
            padding: '6px 16px', borderRadius: 7, cursor: 'pointer',
            background: `${GOLD}15`, border: `1px solid ${GOLD}35`,
            color: GOLD, fontSize: 13, fontWeight: 500,
            opacity: loading || !slug.trim() ? 0.5 : 1,
          }}>
          {loading ? '加载中…' : '查询'}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: 'rgba(120,20,20,.2)', border: '1px solid rgba(248,113,113,.2)',
          color: '#f87171', fontSize: 12 }}>
          ✗ {error}
        </div>
      )}

      {/* 登陆站列表 */}
      {stations.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F0E6C8', marginBottom: 12 }}>
            {cableName}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginLeft: 8, fontWeight: 400 }}>
              {stations.length} 个登陆站
            </span>
          </div>

          {/* 列表头 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 80px',
            gap: 8, paddingBottom: 8, marginBottom: 6,
            borderBottom: '1px solid rgba(255,255,255,.06)',
            fontSize: 10, color: `${GOLD}70`, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '.06em' }}>
            <div>站点名称</div>
            <div>纬度 (lat)</div>
            <div>经度 (lng)</div>
            <div>操作</div>
          </div>

          {stations.map(s => {
            const edit = edits[s.id];
            if (!edit) return null;

            // 判断坐标是否被修改过
            const origLat = s.latitude  != null ? String(s.latitude)  : '';
            const origLng = s.longitude != null ? String(s.longitude) : '';
            const isDirty = edit.lat !== origLat || edit.lng !== origLng;

            return (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 120px 80px',
                gap: 8, marginBottom: 6, alignItems: 'center',
              }}>
                {/* 站名 */}
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>
                    {s.name}
                    {s.nameZh && <span style={{ color: 'rgba(255,255,255,.4)', marginLeft: 5 }}>({s.nameZh})</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 1 }}>
                    {[s.city, s.countryCode].filter(Boolean).join(', ')}
                  </div>
                  {!s.latitude && !s.longitude && (
                    <div style={{ fontSize: 10, color: '#f87171', marginTop: 1 }}>⚠ 无坐标</div>
                  )}
                </div>

                {/* 纬度输入 */}
                <input
                  value={edit.lat}
                  onChange={e => updateEdit(s.id, 'lat', e.target.value)}
                  placeholder="纬度"
                  style={{
                    ...inputStyle,
                    borderColor: isDirty ? `${GOLD}60` : BORDER,
                  }}
                />

                {/* 经度输入 */}
                <input
                  value={edit.lng}
                  onChange={e => updateEdit(s.id, 'lng', e.target.value)}
                  placeholder="经度"
                  style={{
                    ...inputStyle,
                    borderColor: isDirty ? `${GOLD}60` : BORDER,
                  }}
                />

                {/* 保存按钮 */}
                <div>
                  {edit.saved ? (
                    <span style={{ fontSize: 11, color: '#4ade80' }}>✓ 已保存</span>
                  ) : (
                    <button
                      onClick={() => saveStation(s.id)}
                      disabled={edit.saving || !isDirty}
                      style={{
                        width: '100%', padding: '5px 0', borderRadius: 6,
                        background: isDirty ? `${GOLD}18` : 'rgba(255,255,255,.04)',
                        border: `1px solid ${isDirty ? GOLD + '40' : 'rgba(255,255,255,.08)'}`,
                        color: isDirty ? GOLD : 'rgba(255,255,255,.3)',
                        fontSize: 11, cursor: isDirty ? 'pointer' : 'default',
                        fontWeight: 500,
                      }}>
                      {edit.saving ? '…' : '保存'}
                    </button>
                  )}
                  {edit.error && (
                    <div style={{ fontSize: 10, color: '#f87171', marginTop: 3 }}>{edit.error}</div>
                  )}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,.25)', lineHeight: 1.6 }}>
            💡 纬度范围 -90 到 90，经度范围 -180 到 180。
            修改后重新在上方触发路由生成或平滑，地图会自动更新。
            如需在地图上确认坐标，可在 Google Maps 右键点击对应位置复制坐标。
          </div>
        </>
      )}
    </div>
  );
}
