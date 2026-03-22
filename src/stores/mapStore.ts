// src/stores/mapStore.ts
// v4：新增 earthquakeHighlight 状态

import { create } from 'zustand';

interface FilterStatuses {
  IN_SERVICE: boolean;
  UNDER_CONSTRUCTION: boolean;
  PLANNED: boolean;
  DECOMMISSIONED: boolean;
}

export interface EarthquakeHighlight {
  lat: number;
  lng: number;
  magnitude: number;
  place: string;
  affectedCables: Array<{ cableSlug: string; cableName: string; distanceKm: number; riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' }>;
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

  filterStatuses: FilterStatuses;
  setFilterStatuses: (statuses: FilterStatuses) => void;

  filterYearRange: [number, number];
  setFilterYearRange: (range: [number, number]) => void;

  filterVendors: string[];
  setFilterVendors: (vendors: string[]) => void;

  filterOperators: string[];
  setFilterOperators: (operators: string[]) => void;

  searchHighlightSlugs: string[];
  setSearchHighlights: (slugs: string[]) => void;
  clearSearchHighlights: () => void;

  searchHoverSlug: string | null;
  setSearchHover: (slug: string | null) => void;

  // 地震高亮：震中扩散圆 + 受影响海缆染色
  earthquakeHighlight: EarthquakeHighlight | null;
  setEarthquakeHighlight: (highlight: EarthquakeHighlight | null) => void;
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
    earthquakeHighlight: null, // 飞向海缆时清除地震高亮
  })),
  clearFlyTo: () => set({ flyToSlug: null }),

  filterStatuses: { IN_SERVICE: true, UNDER_CONSTRUCTION: true, PLANNED: true, DECOMMISSIONED: false },
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

  earthquakeHighlight: null,
  setEarthquakeHighlight: (highlight) => set({
    earthquakeHighlight: highlight,
    // 设置地震高亮时清除其他高亮
    searchHighlightSlugs: [],
    searchHoverSlug: null,
  }),
}));
