// src/components/ui/Skeleton.tsx
// 骨架屏组件 — 数据加载时显示灰色占位块，代替空白或简单的Loading文字
// 提供多种预设形状：行、卡片、圆形、面板

'use client';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 4, style }: SkeletonProps) {
  return (
    <div style={{
      width, height, borderRadius,
      background: 'linear-gradient(90deg, #0E1A2E 25%, #152238 50%, #0E1A2E 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease infinite',
      ...style,
    }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

// 骨架屏预设：统计卡片
export function SkeletonStatCards() {
  return (
    <div style={{ display: 'flex', gap: 24, padding: '0 24px' }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ textAlign: 'center' }}>
          <Skeleton width={40} height={22} borderRadius={4} style={{ margin: '0 auto' }} />
          <Skeleton width={50} height={10} borderRadius={3} style={{ margin: '6px auto 0' }} />
        </div>
      ))}
    </div>
  );
}

// 骨架屏预设：详情面板内容
export function SkeletonDetailPanel() {
  return (
    <div style={{ padding: 20 }}>
      {/* 标题 */}
      <Skeleton width="70%" height={20} borderRadius={4} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Skeleton width={10} height={10} borderRadius={10} />
        <Skeleton width={80} height={12} borderRadius={3} />
      </div>
      <Skeleton width="90%" height={11} borderRadius={3} style={{ marginTop: 12 }} />

      {/* Tab栏 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 20, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Skeleton width={60} height={14} borderRadius={3} />
        <Skeleton width={80} height={14} borderRadius={3} />
        <Skeleton width={50} height={14} borderRadius={3} />
      </div>

      {/* 属性卡片网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '10px 14px' }}>
            <Skeleton width={50} height={10} borderRadius={3} />
            <Skeleton width={70} height={18} borderRadius={3} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>

      {/* 进度条 */}
      <div style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 14 }}>
        <Skeleton width={120} height={10} borderRadius={3} />
        <Skeleton width="100%" height={6} borderRadius={3} style={{ marginTop: 8 }} />
      </div>
    </div>
  );
}

// 骨架屏预设：地震面板
export function SkeletonEarthquakeList() {
  return (
    <div style={{ padding: '8px 14px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Skeleton width={40} height={14} borderRadius={3} />
            <Skeleton width={60} height={10} borderRadius={3} />
          </div>
          <Skeleton width="80%" height={10} borderRadius={3} />
        </div>
      ))}
    </div>
  );
}

// 骨架屏预设：新闻列表
export function SkeletonNewsList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 14, borderLeft: '3px solid #152238' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Skeleton width={50} height={14} borderRadius={3} />
            <Skeleton width={70} height={10} borderRadius={3} />
          </div>
          <Skeleton width="95%" height={13} borderRadius={3} />
          <Skeleton width="70%" height={10} borderRadius={3} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

// 骨架屏预设：AI分析面板
export function SkeletonAiPanel() {
  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 12 }}>
        <Skeleton width={60} height={10} borderRadius={3} />
        <Skeleton width={60} height={10} borderRadius={3} />
        <Skeleton width={60} height={10} borderRadius={3} />
      </div>
      {[1, 2].map(i => (
        <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <Skeleton width={40} height={14} borderRadius={3} />
            <Skeleton width={60} height={14} borderRadius={3} />
          </div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
            {[1, 2, 3, 4, 5].map(j => <Skeleton key={j} width="20%" height={3} borderRadius={2} />)}
          </div>
          <Skeleton width="90%" height={12} borderRadius={3} />
          <Skeleton width="60%" height={12} borderRadius={3} style={{ marginTop: 4 }} />
        </div>
      ))}
    </div>
  );
}
