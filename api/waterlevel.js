import { normalizeStations, normalizeModelStations, normalizeForecast, finiteNumber, WATER_SOURCE } from "../lib/water-data.js";

const BASE = "https://twa-api-public.thaiwater.net";
// Anonymous web-client identifier published by ThaiWater's public website.
// This is not a user's login token. An operator can override it if the provider rotates it.
const PUBLIC_CLIENT_ID = "TPSXrHRvTHeVT2Lygq6YeTqqAm4xZ72x";

export async function fetchThaiWater(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      "Accept": "application/json",
      "Accept-Language": "th",
      "x-api-key": process.env.THAIWATER_PUBLIC_CLIENT_ID || PUBLIC_CLIENT_ID,
    },
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`ThaiWater HTTP ${response.status}`);
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const mode = req.query?.mode || "observations";
  if (!["observations", "models", "forecast"].includes(mode)) {
    return res.status(400).json({ ok: false, error: "Unknown water-level mode" });
  }
  if (mode === "forecast" && !/^\d{1,9}$/.test(String(req.query?.stationId || ""))) {
    return res.status(400).json({ ok: false, error: "Invalid station ID" });
  }
  try {
    if (mode === "models") {
      const stations = normalizeModelStations(await fetchThaiWater("/v2/waterlevel-discharge/forecast"));
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, must-revalidate");
      return res.status(200).json({ ok: true, data: { kind: "model-stations", stations } });
    }
    if (mode === "forecast") {
      const id = String(req.query.stationId);
      const detail = await fetchThaiWater(`/v2/waterlevel-discharge/forecast/${id}/detail`);
      // RID discharge forecasts use m³/s. Never relabel those as metres of water level.
      if (detail?.data?.type !== "waterlevelForecast") {
        return res.status(404).json({ ok: false, error: "สถานีนี้ไม่มีแบบจำลองระดับน้ำหน่วยเมตร" });
      }
      const now = Date.now();
      const thaiDate = ms => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
      const query = new URLSearchParams({ stationId: id, timezone: "7", limit: "-1",
        startDate: `${thaiDate(now)} 00:00`, endDate: `${thaiDate(now + 72 * 3600000)} 23:59` });
      const graph = await fetchThaiWater(`/data/platform/v1/public/latest_waterlevel/forecast/graph?${query}`);
      const points = normalizeForecast(graph, now);
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, must-revalidate");
      return res.status(200).json({ ok: true, data: {
        kind: "forecast", stationId: id,
        stationName: String(detail.data.station?.stationName || detail.data.sstationName || id),
        unit: "ม.รทก.", bankMsl: finiteNumber(detail.data.station?.minBank),
        source: "ThaiWater / สสน.", sourceUrl: WATER_SOURCE,
        fetchedAt: new Date(now).toISOString(), modelRunAt: null, points,
      } });
    }
    const payload = await fetchThaiWater("/v2/waterlevel");
    const stations = normalizeStations(payload);
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, must-revalidate");
    return res.status(200).json({
      ok: true, data: {
        source: "ThaiWater • คลังข้อมูลน้ำแห่งชาติ / สสน.", sourceUrl: WATER_SOURCE,
        kind: "observation", fetchedAt: new Date().toISOString(), stations,
      },
    });
  } catch (error) {
    console.warn("ThaiWater water-level request failed:", error.message);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ ok: false, error: "โหลดระดับน้ำจาก ThaiWater ไม่สำเร็จ กรุณาลองใหม่หรือเปิดเว็บต้นทาง" });
  }
}
