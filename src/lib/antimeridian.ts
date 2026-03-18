// src/lib/antimeridian.ts
// 修复跨越国际日期变更线（180°经线）的 GeoJSON 路由渲染问题
//
// 问题背景：太平洋海缆从日本（东经约140°）延伸到美国（西经约120°），
// 经度会从 +170° 跳到 -170°。地图渲染时会把这两点直接连成一条
// 横穿整个地图的错误线段，或者干脆断开显示。
//
// 修复思路：检测相邻坐标点经度差是否超过180°，超过则把后续所有点
// 的经度加减360°，使路线在平面坐标系里保持连续。

export function fixAntimeridian(geojson: any): any {
  if (!geojson) return geojson;

  // 递归处理 FeatureCollection 或单个 Geometry
  if (geojson.type === 'FeatureCollection') {
    return {
      ...geojson,
      features: geojson.features.map((f: any) => fixAntimeridian(f)),
    };
  }

  if (geojson.type === 'Feature') {
    return {
      ...geojson,
      geometry: fixAntimeridian(geojson.geometry),
    };
  }

  if (geojson.type === 'LineString') {
    return {
      ...geojson,
      coordinates: fixLineCoords(geojson.coordinates),
    };
  }

  if (geojson.type === 'MultiLineString') {
    return {
      ...geojson,
      coordinates: geojson.coordinates.map((line: number[][]) => fixLineCoords(line)),
    };
  }

  return geojson;
}

function fixLineCoords(coords: number[][]): number[][] {
  if (!coords || coords.length < 2) return coords;

  const result: number[][] = [coords[0]];

  for (let i = 1; i < coords.length; i++) {
    const prev = result[i - 1];
    const curr = coords[i];

    let lng = curr[0];
    const diff = lng - prev[0];

    // 经度差超过180°，说明跨越了反子午线，需要"展开"
    if (diff > 180) {
      lng -= 360;
    } else if (diff < -180) {
      lng += 360;
    }

    result.push([lng, curr[1], ...(curr.slice(2))]);
  }

  return result;
}