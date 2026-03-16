// src/stores/mapStore.ts
// 全局状态管理（Zustand）
// 管理地图视图模式、颜色编码、选中状态、AI开关、飞行指令等

import { create } from 'zustand';

interface MapState {
  // 3D/2D视图模式
  viewMode: '3d' | '2d';
  setViewMode: (mode: '3d' | '2d') => void;

  // 颜色编码模式
  colorMode: 'status' | 'vendor' | 'operator' | 'year';
  setColorMode: (mode: 'status' | 'vendor' | 'operator' | 'year') => void;

  // AI推断层开关（事实/推断分离原则）
  showAiInsights: boolean;
  toggleAiInsights: () => void;

  // 当前选中的海缆（点击后打开详情面板）
  selectedCableId: string | null;
  setSelectedCable: (id: string | null) => void;

  // 当前鼠标悬停的海缆
  hoveredCableId: string | null;
  setHoveredCable: (id: string | null) => void;

  // 飞行指令：当用户从搜索结果中点击一条海缆时，
  // 地球会飞行到该海缆的位置并高亮显示
  // 每次设置一个新的slug，地球组件会监听这个变化并执行飞行动画
  flyToSlug: string | null;
  flyToCounter: number; // 每次+1，确保重复点击同一条海缆也能触发飞行
  flyToCable: (slug: string) => void;
  clearFlyTo: () => void;
}

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

  flyToSlug: null,
  flyToCounter: 0,
  flyToCable: (slug) => set((state) => ({
    flyToSlug: slug,
    flyToCounter: state.flyToCounter + 1,
    selectedCableId: slug, // 同时打开详情面板
  })),
  clearFlyTo: () => set({ flyToSlug: null }),
}));
