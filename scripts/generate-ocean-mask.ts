/**
 * generate-ocean-mask.ts
 * 
 * 一次性脚本：从 Natural Earth 下载全球陆地多边形，
 * 光栅化为 1° 分辨率的海洋/陆地网格，输出为 TypeScript 常量文件。
 * 
 * 网格规格：
 * - 分辨率：1° × 1°（每个格子约 111km × 111km at equator）
 * - 尺寸：360 列 × 180 行 = 64,800 个格子
 * - 编码：每个格子 1 bit（0=海洋，1=陆地），打包为 hex 字符串
 * - 坐标：row 0 = 90°N，row 179 = 89°S；col 0 = 180°W，col 359 = 179°E
 * 
 * 特殊处理：
 * - 苏伊士运河、巴拿马运河、马六甲海峡等关键水道手动标记为海洋
 * - 海岸线附近的格子偏向标记为海洋（海缆铺设在近海）
 * 
 * 用法：npx tsx scripts/generate-ocean-mask.ts
 * 输出：src/lib/ocean-mask.ts
 * 
 * 依赖：无外部依赖，只用 Node.js 内置模块 + fetch
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 1. 配置
// ============================================================

const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';
const RESOLUTION = 0.25;  // degrees per cell
const GRID_COLS = Math.round(360 / RESOLUTION);   // 1440
const GRID_ROWS = Math.round(180 / RESOLUTION);   // 720
const OUTPUT_PATH = path.resolve(__dirname, '../src/lib/ocean-mask.ts');

// ============================================================
// 2. 点-在-多边形检测（Ray Casting Algorithm）
// ============================================================

/** 判断点 (px, py) 是否在多边形 ring 内部 */
function pointInPolygon(px: number, py: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** 判断点是否在 GeoJSON Polygon 或 MultiPolygon 内 */
function pointInFeature(lon: number, lat: number, geometry: any): boolean {
  if (geometry.type === 'Polygon') {
    // 外环检测，忽略内环（岛中湖等，对海缆路由不重要）
    return pointInPolygon(lon, lat, geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (pointInPolygon(lon, lat, poly[0])) return true;
    }
  }
  return false;
}

// ============================================================
// 3. 关键水道（手动标记为海洋）
// ============================================================
// 格式：[lat, lon] — 这些格子即使被多边形覆盖也强制标记为海洋

const FORCED_OCEAN: [number, number][] = [
  // 苏伊士运河 (精细覆盖)
  [30.5, 32.3], [30.2, 32.4], [30.0, 32.5], [29.8, 32.6], [29.6, 32.6],
  [31.0, 32.0], [31.2, 32.0], [30.8, 32.2], [30.5, 32.5], [30.0, 32.3],
  [29.9, 32.5], [29.5, 32.7], [29.3, 32.8],
  // 巴拿马运河
  [9.2, -79.8], [9.1, -79.6], [9.0, -79.5], [9.3, -79.9], [8.9, -79.4],
  // 马六甲海峡 (精细覆盖)
  [1.3, 103.5], [1.5, 103.8], [1.8, 103.0], [2.0, 102.5], [2.5, 102.0],
  [3.0, 101.0], [3.5, 100.5], [4.0, 100.0], [4.5, 99.5], [5.0, 99.0],
  [5.5, 98.5], [6.0, 98.0], [1.2, 104.0], [1.0, 104.5],
  // 新加坡海峡
  [1.2, 103.8], [1.1, 104.0], [1.0, 104.2], [1.0, 104.5], [1.0, 105.0],
  // 霍尔木兹海峡
  [26.5, 56.0], [26.5, 56.5], [26.0, 56.5], [26.2, 56.2],
  // 曼德海峡
  [12.5, 43.5], [12.8, 43.3], [12.2, 43.8], [12.0, 43.5],
  // 托雷斯海峡
  [-10.0, 142.0], [-10.0, 142.5], [-10.2, 142.2], [-10.5, 142.5],
  // 巴斯海峡
  [-39.0, 146.0], [-39.0, 147.0], [-39.0, 148.0], [-38.5, 146.5],
  // 台湾海峡
  [24.0, 119.5], [24.5, 119.5], [25.0, 119.5], [24.0, 120.0], [25.0, 120.0],
  [23.5, 119.5], [23.5, 120.0],
  // 英吉利海峡
  [50.5, 0.0], [50.5, 0.5], [50.5, 1.0], [50.0, 0.0], [50.0, -0.5],
  [51.0, 1.5],
  // 直布罗陀海峡
  [36.0, -5.5], [35.8, -5.5], [36.0, -5.0], [35.5, -5.5],
  // 龙目海峡 / 巽他海峡
  [-8.2, 115.5], [-8.5, 115.5], [-6.0, 105.5], [-6.2, 105.8],
  // 朝鲜海峡 / 对马海峡
  [34.0, 129.5], [34.5, 129.5], [34.0, 130.0],
  // 卡特加特海峡
  [57.0, 11.0], [57.5, 11.5], [56.5, 11.0], [56.0, 12.0],
  // 莫桑比克海峡
  [-12.0, 44.0], [-13.0, 45.0], [-15.0, 43.0], [-16.0, 42.0],
  // 红海（沿中线加密）
  [28.0, 34.0], [27.0, 34.5], [26.0, 35.0], [25.0, 36.0],
  [24.0, 36.5], [23.0, 37.0], [22.0, 37.5], [21.0, 38.0],
  [20.0, 38.5], [19.0, 39.5], [18.0, 40.0], [17.0, 40.5],
  [16.0, 41.0], [15.0, 41.5], [14.0, 42.0], [13.0, 43.0],
];

// ============================================================
// 4. 海岸线膨胀（向海洋方向扩展可通行区域）
// ============================================================

/**
 * 对网格做一次形态学膨胀：将陆地边缘的海洋格子保留为海洋
 * 但将被陆地包围的格子标记为陆地（填充内陆湖泊等）
 * 
 * 这里我们做反向操作：对海洋做一次膨胀，
 * 即任何与海洋相邻的陆地格子，如果周围有 >= 3 个海洋格子，就标记为海洋
 * 这模拟了海岸线附近的可通行区域
 */
function dilateOcean(grid: Uint8Array, cols: number, rows: number): Uint8Array {
  const result = new Uint8Array(grid);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const idx = r * cols + c;
      if (grid[idx] === 1) { // 陆地格子
        // 数周围 8 个格子中有几个是海洋
        let oceanCount = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (grid[(r + dr) * cols + (c + dc)] === 0) oceanCount++;
          }
        }
        // 如果周围有 >= 4 个海洋格子，这个陆地格子很可能是海岸线/窄地峡，标记为海洋
        if (oceanCount >= 4) {
          result[idx] = 0;
        }
      }
    }
  }
  return result;
}

// ============================================================
// 5. 主流程
// ============================================================

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  Ocean Mask Generator                     ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  // 下载 Natural Earth 陆地数据
  console.log('Downloading Natural Earth 110m land data...');
  const res = await fetch(NE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const geojson = await res.json() as any;
  console.log(`Downloaded: ${geojson.features.length} land features\n`);

  // 初始化网格（全部为海洋=0）
  const grid = new Uint8Array(GRID_COLS * GRID_ROWS);

  // 光栅化：对每个格子检测其中心点是否在陆地内
  console.log(`Rasterizing to ${GRID_COLS}x${GRID_ROWS} grid...`);
  let landCount = 0;

  for (let row = 0; row < GRID_ROWS; row++) {
    const lat = 90 - (row + 0.5) * RESOLUTION;  // 格子中心纬度
    for (let col = 0; col < GRID_COLS; col++) {
      const lon = -180 + (col + 0.5) * RESOLUTION;  // 格子中心经度
      const idx = row * GRID_COLS + col;

      for (const feature of geojson.features) {
        if (pointInFeature(lon, lat, feature.geometry)) {
          grid[idx] = 1;  // 陆地
          landCount++;
          break;
        }
      }
    }
    if ((row + 1) % 120 === 0) {
      console.log(`  Row ${row + 1}/${GRID_ROWS} (lat ${lat.toFixed(1)}°)`);
    }
  }

  console.log(`\nRaw rasterization: ${landCount} land cells, ${GRID_COLS * GRID_ROWS - landCount} ocean cells`);

  // 强制标记关键水道为海洋
  let forcedCount = 0;
  for (const [lat, lon] of FORCED_OCEAN) {
    const row = Math.floor((90 - lat) / RESOLUTION);
    const col = Math.floor((lon + 180) / RESOLUTION);
    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
      const idx = row * GRID_COLS + col;
      if (grid[idx] === 1) {
        grid[idx] = 0;
        forcedCount++;
      }
    }
  }
  console.log(`Forced ocean (straits/canals): ${forcedCount} cells`);

  // 海岸线膨胀
  const dilated = dilateOcean(grid, GRID_COLS, GRID_ROWS);
  let dilatedCount = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1 && dilated[i] === 0) dilatedCount++;
  }
  console.log(`Coastal dilation: ${dilatedCount} cells converted to ocean`);

  // 编码为 hex 字符串
  const finalGrid = dilated;
  const bytes = new Uint8Array(Math.ceil(finalGrid.length / 8));
  for (let i = 0; i < finalGrid.length; i++) {
    if (finalGrid[i] === 1) {
      bytes[Math.floor(i / 8)] |= (1 << (7 - (i % 8)));
    }
  }
  const hexString = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // 统计最终结果
  let finalLand = 0;
  for (let i = 0; i < finalGrid.length; i++) {
    if (finalGrid[i] === 1) finalLand++;
  }
  console.log(`\nFinal: ${finalLand} land, ${finalGrid.length - finalLand} ocean`);
  console.log(`Hex string length: ${hexString.length} chars (~${(hexString.length / 2 / 1024).toFixed(1)} KB)`);

  // 生成 TypeScript 文件
  const tsContent = `/**
 * ocean-mask.ts — 自动生成，请勿手动编辑
 * 
 * 全球海洋/陆地网格（${RESOLUTION}° 分辨率）
 * 来源：Natural Earth 110m land polygons
 * 生成时间：${new Date().toISOString()}
 * 
 * 网格规格：
 * - ${GRID_COLS} 列 × ${GRID_ROWS} 行 = ${GRID_COLS * GRID_ROWS} 格子
 * - 分辨率：${RESOLUTION}°（每格约 ${Math.round(RESOLUTION * 111)} km at equator）
 * - row 0 = 90°N, col 0 = 180°W
 * - 每个格子 1 bit: 0=海洋, 1=陆地
 */

export const OCEAN_MASK_COLS = ${GRID_COLS};
export const OCEAN_MASK_ROWS = ${GRID_ROWS};
export const OCEAN_MASK_RESOLUTION = ${RESOLUTION};

/** 
 * Packed hex string: ${bytes.length} bytes = ${hexString.length} hex chars
 * ${finalLand} land cells, ${finalGrid.length - finalLand} ocean cells
 */
export const OCEAN_MASK_HEX = '${hexString}';

/** 检查给定经纬度是否为陆地 */
export function isLand(lat: number, lon: number): boolean {
  const row = Math.floor((90 - lat) / ${RESOLUTION});
  const col = Math.floor((lon + 180) / ${RESOLUTION});
  if (row < 0 || row >= ${GRID_ROWS} || col < 0 || col >= ${GRID_COLS}) return false;
  const bitIndex = row * ${GRID_COLS} + col;
  const byteIndex = Math.floor(bitIndex / 8);
  const bitOffset = 7 - (bitIndex % 8);
  const byteVal = parseInt(OCEAN_MASK_HEX.substr(byteIndex * 2, 2), 16);
  return ((byteVal >> bitOffset) & 1) === 1;
}

/** 检查给定经纬度是否为海洋 */
export function isOcean(lat: number, lon: number): boolean {
  return !isLand(lat, lon);
}
`;

  fs.writeFileSync(OUTPUT_PATH, tsContent, 'utf-8');
  console.log(`\nWritten to: ${OUTPUT_PATH}`);
  console.log('Done!\n');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
