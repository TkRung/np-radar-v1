export const WATER_SOURCE = "https://twa.thaiwater.net/th/map/flash-flood/water-level";
export const WATER_STALE_MS = 3 * 60 * 60 * 1000;

// ThaiWater's storagePercent criteria, not waterlevelMslPercent.
export const WATER_LEVELS = [
  { key: "critical-low", label: "น้ำน้อยวิกฤต", color: "#cf843f" },
  { key: "low", label: "น้ำน้อย", color: "#f5c343" },
  { key: "normal", label: "ปกติ", color: "#4ead5b" },
  { key: "high", label: "น้ำมาก", color: "#527dff" },
  { key: "overflow", label: "น้ำล้นตลิ่ง", color: "#ff6464" },
];
const UNKNOWN = { key: "unknown", label: "ไม่มีเกณฑ์เทียบตลิ่ง", color: "#aebfd1" };

export function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  // The API publishes ISO timestamps with an explicit timezone.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function featuresFromPayload(payload) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid ThaiWater dataset");
  const collections = data.type === "FeatureCollection" ? [data] : Object.values(data);
  if (collections.some(collection => collection?.type !== "FeatureCollection" || !Array.isArray(collection.features))) {
    throw new Error("Invalid ThaiWater feature collection");
  }
  return collections.flatMap(collection => collection.features);
}

export function normalizeStations(payload) {
  const stations = new Map();
  for (const feature of featuresFromPayload(payload)) {
    const p = feature.properties || {};
    const id = String(p.station?.id ?? "");
    const [lon, lat] = (feature.geometry?.coordinates || []).map(finiteNumber);
    if (feature.geometry?.type !== "Point" || !/^\d+$/.test(id) || lat === null || lon === null ||
        !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const levelMsl = finiteNumber(p.waterlevelMsl);
    const levelLocal = finiteNumber(p.waterlevelM);
    const bankMsl = finiteNumber(p.minBank);
    const previousMsl = finiteNumber(p.waterlevelMslPrevious);
    const station = {
      id, name: String(p.station.station || p.station.stationName || id),
      code: String(p.station.stationCode || ""), lat, lon,
      province: String(p.geoCode?.province || ""), district: String(p.geoCode?.district || ""),
      river: String(p.riverName || ""), basin: String(p.basin?.basin || ""),
      agency: String(p.agency?.agencyShort || p.agency?.agency || "ThaiWater"),
      observedAt: timestamp(p.waterlevelDatetime),
      level: levelMsl ?? levelLocal,
      unit: levelMsl !== null ? "ม.รทก." : "ม. จากระดับอ้างอิงสถานี",
      levelMsl, bankMsl,
      // Only compare heights on the same datum. Zero and negative MSL values are valid.
      belowBank: levelMsl !== null && bankMsl !== null ? bankMsl - levelMsl : null,
      storagePercent: levelMsl !== null && bankMsl !== null ? finiteNumber(p.storagePercent) : null,
      change: levelMsl !== null && previousMsl !== null ? levelMsl - previousMsl : null,
    };
    const old = stations.get(id);
    if (!old || (Date.parse(station.observedAt) || 0) > (Date.parse(old.observedAt) || 0)) stations.set(id, station);
  }
  return [...stations.values()];
}

export function waterStatus(station, now = Date.now()) {
  const time = Date.parse(station.observedAt);
  if (station.level === null || !Number.isFinite(time)) return { ...UNKNOWN, label: "ไม่มีข้อมูลตรวจวัด" };
  if (time > now + 10 * 60000) return { ...UNKNOWN, key: "invalid-time", label: "เวลาข้อมูลผิดปกติ" };
  if (now - time > WATER_STALE_MS) return { ...UNKNOWN, key: "stale", label: "ข้อมูลเกิน 3 ชม." };
  const percent = station.storagePercent;
  if (percent === null || !Number.isFinite(percent) || station.belowBank === null) return UNKNOWN;
  const index = percent <= 10 ? 0 : percent <= 30 ? 1 : percent <= 70 ? 2 : percent <= 100 ? 3 : 4;
  return WATER_LEVELS[index];
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function normalizeModelStations(payload) {
  return featuresFromPayload(payload).filter(feature => feature.properties?.type === "waterlevelForecast")
    .map(feature => {
      const p = feature.properties;
      const [lon, lat] = (feature.geometry?.coordinates || []).map(finiteNumber);
      return {
        id: String(p.station?.id ?? ""),
        name: String(p.station?.stationName || p.sstationName || ""),
        province: String(p.geoCode?.province || ""),
        agency: String(p.agency?.agencyShort || "ThaiWater"),
        lat, lon, bankMsl: finiteNumber(p.station?.minBank),
      };
    }).filter(station => /^\d+$/.test(station.id) && Number.isFinite(station.lat) && Number.isFinite(station.lon) &&
      Math.abs(station.lat) <= 90 && Math.abs(station.lon) <= 180);
}

export function normalizeForecast(payload, now = Date.now()) {
  if (!Array.isArray(payload?.data)) throw new Error("Invalid forecast dataset");
  const points = new Map();
  for (const row of payload.data) {
    // Requests explicitly set timezone=7; these timezone-less values are Bangkok wall time.
    const raw = String(row.datetime || "");
    const time = timestamp(raw) || (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? timestamp(raw.replace(" ", "T") + "+07:00") : null);
    const value = finiteNumber(row.foreValue);
    const ms = Date.parse(time);
    if (time && value !== null && ms >= now && ms <= now + 72 * 3600000) points.set(ms, { time, value });
  }
  return [...points.entries()].sort(([a], [b]) => a - b).map(([, point]) => point);
}
