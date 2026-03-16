// src/stores/mapStore.ts
// 全局状态管理（Zustand）
// 管理地图视图模式、颜色编码、选中状态、AI开关等

import { create } from 'zustand';

// 定义状态类型
interface MapState {
  // 3D/2D视图模式
  viewMode: '3d' | '2d';
  setViewMode: (mode: '3d' | '2d') => void;

  // 颜色编码模式：按状态/建造商/运营商/年代
  colorMode: 'status' | 'vendor' | 'operator' | 'year';
  setColorMode: (mode: 'status' | 'vendor' | 'operator' | 'year') => void;

  // AI推断层开关（事实/推断分离原则的核心实现）
  showAiInsights: boolean;
  toggleAiInsights: () => void;

  // 当前选中的海缆（点击后打开详情面板）
  selectedCableId: string | null;
  setSelectedCable: (id: string | null) => void;

  // 当前鼠标悬停的海缆（显示预览卡片）
  hoveredCableId: string | null;
  setHoveredCable: (id: string | null) => void;
}

// 创建store
export const useMapStore = create<MapState>((set) => ({
  viewMode: '3d',
  setViewMode: (mode) => set({ viewMode: mode }),

  colorMode: 'status',
  setColorMode: (mode) => set({ colorMode: mode }),

  showAiInsights: true,
  toggleAiInsights: () => set((state) => ({ showAiInsights: !state.showAiInsights })),

  selectedCableId: null,
  setSelectedCable: (id) => set({ selectedCableId: id }),

  hoveredCableId: null,
  setHoveredCable: (id) => set({ hoveredCableId: id }),
}));
