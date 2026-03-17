// src/components/ui/Tooltip.tsx
// 轻量级悬停提示组件 — 鼠标悬停时显示解释文字
// 用于解释专业术语、计算方法等，帮助新用户理解界面

'use client';

import { useState, useRef } from 'react';

interface TooltipProps {
  content: string;          // 提示文字内容
  children: React.ReactNode; // 被包裹的元素
  position?: 'top' | 'bottom' | 'left' | 'right'; // 提示框出现的位置
  maxWidth?: number;         // 最大宽度
}

export default function Tooltip({
  content,
  children,
  position = 'top',
  maxWidth = 260,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const show = () => {
    // 延迟300ms后显示，避免鼠标快速划过时闪烁
    timeoutRef.current = setTimeout(() => setIsVisible(true), 300);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  // 根据位置计算提示框的CSS定位
  const positionStyles: Record<string, React.CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 },
  };

  return (
    <span
      onMouseEnter={show}
      onMouseLeave={hide}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'help' }}
    >
      {children}

      {isVisible && (
        <div style={{
          position: 'absolute',
          ...positionStyles[position],
          backgroundColor: 'rgba(13, 27, 42, 0.97)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(42, 157, 143, 0.25)',
          borderRadius: 8,
          padding: '10px 12px',
          maxWidth,
          width: 'max-content',
          zIndex: 9999,
          pointerEvents: 'none',
          animation: 'tooltipFadeIn 0.15s ease',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        }}>
          <div style={{
            fontSize: 11,
            color: '#D1D5DB',
            lineHeight: 1.6,
            whiteSpace: 'normal' as const,
          }}>
            {content}
          </div>
        </div>
      )}

      <style>{`@keyframes tooltipFadeIn { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </span>
  );
}
