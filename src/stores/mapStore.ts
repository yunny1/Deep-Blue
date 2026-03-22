// src/stores/mapStore.ts
// 全局状态管理（Zustand）v3
// 新增：跨维度筛选 filterVendors / filterOperators

import { create } from 'zustand';

interface FilterStatuses {
  IN_SERVICE: boolean;
  UNDER_CONSTRUCTION: boolean;
  PLANNED: boolean;
  DECOMMISSIONED: boolean;
}

interface MapState {
  viewMode: '3d' | '2d';
  setViewMode: (mode: '3d' | '2d') => void;

  colorMode: 'status' | 'vendor' | 'operator' | 'year';
  setColorMode: (mode: 'status' | 'vendor' | 'operator' | 'year') => void;

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

  // 状态筛选（对象格式）
  filterStatuses: FilterStatuses;
  setFilterStatuses: (statuses: FilterStatuses) => void;

  // 年份范围
  filterYearRange: [number, number];
  setFilterYearRange: (range: [number, number]) => void;

  // 建造商筛选（空数组 = 全部显示）
  filterVendors: string[];
  setFilterVendors: (vendors: string[]) => void;

  // 运营商筛选（空数组 = 全部显示）
  filterOperators: string[];
  setFilterOperators: (operators: string[]) => void;

  // 搜索高亮
  searchHighlightSlugs: string[];
  setSearchHighlights: (slugs: string[]) => void;
  clearSearchHighlights: () => void;

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
    searchHighlightSlugs: [],
    searchHoverSlug: null,
  })),
  clearFlyTo: () => set({ flyToSlug: null }),

  filterStatuses: {
    IN_SERVICE: true,
    UNDER_CONSTRUCTION: true,
    PLANNED: true,
    DECOMMISSIONED: false,
  },
  setFilterStatuses: (statuses) => set({ filterStatuses: statuses }),

  filterYearRange: [1990, 2030],
  setFilterYearRange: (range) => set({ filterYearRange: range }),

  filterVendors: [],
  setFilterVendors: (vendors) => set({ filterVendors: vendors }),

  filterOperators: [],
  setFilterOperators: (operators) => set({ filterOperators: operators }),

  searchHighlightSlugs: [],
  setSearchHighlights: (slugs) => set({ searchHighlightSlugs: slugs }),
  clearSearchHighlights: () => set({ searchHighlightSlugs: [], searchHoverSlug: null }),

  searchHoverSlug: null,
  setSearchHover: (slug) => set({ searchHoverSlug: slug }),
}));
