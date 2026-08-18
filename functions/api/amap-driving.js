export async function onRequest(context) {
  const url = new URL(context.request.url);
  const origin = url.searchParams.get('origin');       // "lng,lat" (GCJ-02)
  const destinations = url.searchParams.get('destinations'); // "lng1,lat1|lng2,lat2|..." (GCJ-02)

  if (!origin || !destinations) {
    return new Response(JSON.stringify({ error: 'missing origin or destinations' }), { status: 400 });
  }

  const amapKey = context.env.AMAP_KEY;
  if (!amapKey) {
    return new Response(JSON.stringify({ error: 'AMAP_KEY not configured' }), { status: 500 });
  }

  // 高德距离测量 API: origins 和 destination 参数
  // origins: "lng1,lat1|lng2,lat2|..." 最多 100 个
  // destination: "lng,lat"
  // type=1: 驾车导航距离
  const amapUrl = `https://restapi.amap.com/v3/distance?origins=${encodeURIComponent(destinations)}&destination=${encodeURIComponent(origin)}&type=1&key=${amapKey}`;

  try {
    const r = await fetch(amapUrl);
    const data = await r.json();

    if (data.status !== '1' || !data.results) {
      return new Response(JSON.stringify({ durations: [], distances: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 高德返回 results 数组，每项有 origin_id(1-based), dest_id, distance(米), duration(秒)
    // 注意：算路失败的点可能被略过或缺少字段，必须按 origin_id 对位回填，
    // 否则数组错位会让后面所有点的结果串位
    const originCount = destinations.split('|').length;
    const durations = new Array(originCount).fill(null);
    const distances = new Array(originCount).fill(null);
    for (const item of data.results) {
      const idx = Number(item.origin_id) - 1;
      if (idx < 0 || idx >= originCount) continue;
      const dur = Number(item.duration);
      const dist = Number(item.distance);
      durations[idx] = Number.isFinite(dur) && dur > 0 ? dur : null;
      distances[idx] = Number.isFinite(dist) ? dist : null;
    }

    return new Response(JSON.stringify({ durations, distances }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502 });
  }
}
