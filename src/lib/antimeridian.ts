// src/lib/antimeridian.ts
// 2D地图用：展开跨反子午线的经度（供 MapLibre2D 使用）
export function fixAntimeridian(geojson: any): any {
  if (!geojson) return geojson;
  if (geojson.type === 'FeatureCollection') {
    return { ...geojson, features: geojson.features.map((f: any) => fixAntimeridian(f)) };
  }
  if (geojson.type === 'Feature') {
    return { ...geojson, geometry: fixAntimeridian(geojson.geometry) };
  }
  if (geojson.type === 'LineString') {
    return { ...geojson, coordinates: fixLineCoords(geojson.coordinates) };
  }
  if (geojson.type === 'MultiLineString') {
    return { ...geojson, coordinates: geojson.coordinates.map((line: number[][]) => fixLineCoords(line)) };
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
    if (diff > 180) lng -= 360;
    else if (diff < -180) lng += 360;
    result.push([lng, curr[1], ...curr.slice(2)]);
  }
  return result;
}

// 3D地球用：在反子午线处把折线拆分成多段（供 CesiumGlobe 使用）
// Cesium 渲染球体时不需要展开经度，但需要在 180° 处截断折线，
// 否则跨线的两个点之间会画出一条穿越整个地球背面的错误弧线
export function splitAtAntimeridian(coords: number[][]): number[][][] {
  if (!coords || coords.length < 2) return [coords];

  const segments: number[][][] = [];
  let current: number[][] = [coords[0]];

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const diff = curr[0] - prev[0];

    if (Math.abs(diff) > 180) {
      // 检测到跨越反子午线，截断当前段，开启新段
      if (current.length >= 2) segments.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }

  if (current.length >= 2) segments.push(current);
  return segments.length > 0 ? segments : [coords];
}