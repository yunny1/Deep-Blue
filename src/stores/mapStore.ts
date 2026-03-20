// src/stores/mapStore.ts
// 全局状态管理（Zustand）
// v2：新增搜索高亮状态（多缆同时高亮 + 悬停单缆高亮）

import { create } from 'zustand';

// 筛选状态
interface FilterStatuses {
  IN_SERVICE: boolean;
  UNDER_CONSTRUCTION: boolean;
  PLANNED: boolean;
  DECOMMISSIONED: boolean;
}

interface MapState {
  // 3D/2D 视图模式
  viewMode: '3d' | '2d';
  setViewMode: (mode: '3d' | '2d') => void;

  // 颜色编码模式
  colorMode: 'status' | 'vendor' | 'operator' | 'year';
  setColorMode: (mode: 'status' | 'vendor' | 'operator' | 'year') => void;

  // AI 推断层开关
  showAiInsights: boolean;
  toggleAiInsights: () => void;

  // 当前选中的海缆（点击后打开详情面板）
  selectedCableId: string | null;
  setSelectedCable: (id: string | null) => void;

  // 当前鼠标悬停的海缆（地图上悬停）
  hoveredCableId: string | null;
  setHoveredCable: (id: string | null) => void;

  // 飞行指令
  flyToSlug: string | null;
  flyToCounter: number;
  flyToCable: (slug: string) => void;
  clearFlyTo: () => void;

  // 筛选状态
  filterStatuses: FilterStatuses;
  setFilterStatuses: (statuses: FilterStatuses) => void;
  filterYearRange: [number, number];
  setFilterYearRange: (range: [number, number]) => void;

  // ── 搜索高亮状态（新增）──────────────────────────────────────
  // 搜索结果中所有海缆的 slug 列表（搜索时全部高亮显示）
  searchHighlightSlugs: string[];
  setSearchHighlights: (slugs: string[]) => void;
  clearSearchHighlights: () => void;

  // 搜索下拉中当前鼠标悬停的海缆 slug（单独高亮，优先级高于批量高亮）
  searchHoverSlug: string | null;
  setSearchHover: (slug: string | null) => void;
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
    selectedCableId: slug,
    // 点击后清空搜索高亮，只保留单条选中高亮
    searchHighlightSlugs: [],
    searchHoverSlug: null,
  })),
  clearFlyTo: () => set({ flyToSlug: null }),

  filterStatuses: { IN_SERVICE: true, UNDER_CONSTRUCTION: true, PLANNED: true, DECOMMISSIONED: false },
  setFilterStatuses: (statuses) => set({ filterStatuses: statuses }),
  filterYearRange: [1990, 2030],
  setFilterYearRange: (range) => set({ filterYearRange: range }),

  // 搜索高亮
  searchHighlightSlugs: [],
  setSearchHighlights: (slugs) => set({ searchHighlightSlugs: slugs }),
  clearSearchHighlights: () => set({ searchHighlightSlugs: [], searchHoverSlug: null }),

  searchHoverSlug: null,
  setSearchHover: (slug) => set({ searchHoverSlug: slug }),
}));
