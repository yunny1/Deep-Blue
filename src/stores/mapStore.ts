// src/stores/mapStore.ts
// 全局状态管理（Zustand）
// 新增：filterStatuses 和 filterYearRange，供 FilterPanel 写入、地图组件读取

import { create } from 'zustand';

interface MapState {
  viewMode: '3d' | '2d';
  setViewMode: (mode: '3d' | '2d') => void;

  colorMode: 'status' | 'vendor' | 'operator' | 'year';
  setColorMode: (mode: 'status' | 'vendor' | 'operator' | 'year') => void;

  // ─── 筛选状态（FilterPanel 写入，地图组件读取）───────────────
  filterStatuses: string[];
  setFilterStatuses: (statuses: string[]) => void;

  filterYearRange: [number, number];
  setFilterYearRange: (range: [number, number]) => void;
  // ────────────────────────────────────────────────────────────

  showAiInsights: boolean;
  toggleAiInsights: () => void;

  selectedCableId: string | null;
  setSelectedCable: (id: string | null) => void;

  hoveredCableId: string | null;
  setHoveredCable: (id: string | null) => void;

  flyToSlug: string | null;
  flyToCounter: number;
  flyToCable: (slug: string) => void;
  clearFlyTo: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  viewMode: '3d',
  setViewMode: (mode) => set({ viewMode: mode }),

  colorMode: 'status',
  setColorMode: (mode) => set({ colorMode: mode }),

  // 默认全部显示
  filterStatuses: ['IN_SERVICE', 'UNDER_CONSTRUCTION', 'PLANNED', 'DECOMMISSIONED'],
  setFilterStatuses: (statuses) => set({ filterStatuses: statuses }),

  filterYearRange: [1990, 2030],
  setFilterYearRange: (range) => set({ filterYearRange: range }),

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
    selectedCableId: slug,
  })),
  clearFlyTo: () => set({ flyToSlug: null }),
}));
