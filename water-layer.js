import { WATER_LEVELS, WATER_SOURCE, waterStatus, distanceKm } from "./lib/water-data.js";

const $ = id => document.getElementById(id);
const fmt = value => value === null || !Number.isFinite(value) ? "—" : value.toFixed(2);
const date = value => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "ไม่ระบุเวลา";
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function json(url, signal) {
  const response = await fetch(url, { cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "ThaiWater ไม่ตอบสนอง");
  return payload.data;
}

export function createWaterLayer({ map, getTarget }) {
  const L = window.L;
  const layer = L.layerGroup();
  const renderer = L.canvas({ padding: 0.3 });
  let stations = [], modelStations = [], markers = new Map();
  let currentMode = "observations", visible = false, loaded = false;
  let pending = null, forecastRequest = null, modelRequest = 0;
  let fetchedAt = null, lastError = "", selectedForecast = null, forecastTimer = null;

  const legend = $("waterLegend");
  for (const level of [...WATER_LEVELS, { label: "ข้อมูลเก่า / ไม่ครบ", color: "#aebfd1" }]) {
    const item = element("span", level.label);
    const dot = element("i"); dot.style.backgroundColor = level.color;
    item.prepend(dot); legend.append(item);
  }

  function bankText(station) {
    if (station.belowBank === null) return "ไม่มีระดับตลิ่งสำหรับเปรียบเทียบ";
    if (Math.abs(station.belowBank) < 0.005) return "เท่าระดับตลิ่ง";
    return `${station.belowBank < 0 ? "สูงกว่าตลิ่ง" : "ต่ำกว่าตลิ่ง"} ${fmt(Math.abs(station.belowBank))} ม.`;
  }

  function popup(station) {
    const box = element("div", undefined, "water-popup");
    const status = waterStatus(station);
    box.append(element("strong", station.name), element("div", `${station.district} ${station.province}`),
      element("b", `${fmt(station.level)} ${station.unit}`), element("div", `สถานะ ณ เวลาตรวจวัด: ${status.label}`),
      element("div", bankText(station)), element("div", `ตรวจวัด ${date(station.observedAt)}`),
      element("div", `สถานี ${station.code} • ${station.agency}`));
    if (station.change !== null) {
      box.append(element("div", `เทียบค่าก่อนหน้า: ${station.change > 0 ? "+" : ""}${fmt(station.change)} ม. (ต้นทางไม่ระบุช่วงเวลา)`));
    }
    box.append(element("small", "ระดับน้ำแม่น้ำ/คลอง ณ สถานี ไม่ใช่ความลึกน้ำท่วมถนน"));
    const source = element("a", "ดูข้อมูล ThaiWater ↗");
    source.href = WATER_SOURCE; source.target = "_blank"; source.rel = "noopener noreferrer";
    box.append(source);
    return box;
  }

  function drawMarkers() {
    layer.clearLayers(); markers.clear();
    const items = currentMode === "observations" ? stations : modelStations;
    for (const station of items) {
      const status = currentMode === "observations" ? waterStatus(station) : { color: "#c6a2ff" };
      const marker = L.circleMarker([station.lat, station.lon], {
        renderer, radius: currentMode === "observations" ? 6 : 8,
        weight: 2, color: "#fff", fillColor: status.color, fillOpacity: 0.9,
        dashArray: currentMode === "forecast" ? "3 3" : undefined,
      }).addTo(layer);
      // DOM nodes keep upstream station names out of HTML interpretation.
      marker.bindTooltip(element("span", station.name));
      if (currentMode === "observations") marker.bindPopup(() => popup(station), { maxWidth: 290, autoPan: false });
      else marker.on("click", () => { $("waterModelStation").value = station.id; loadForecast(station.id); });
      markers.set(station.id, marker);
    }
    if (visible && $("waterLayerEnabled").checked && !map.hasLayer(layer)) layer.addTo(map);
  }

  function renderNearby() {
    const target = getTarget();
    const radius = Number($("waterRadius").value);
    const nearby = stations.map(station => ({ ...station, distance: distanceKm(target, station) }))
      .filter(station => station.distance <= radius).sort((a, b) => a.distance - b.distance);
    $("waterTarget").textContent = `รอบ${target.name} • ระยะตรง ${radius} กม.`;
    const high = nearby.filter(station => ["high", "overflow"].includes(waterStatus(station).key)).length;
    $("waterSummary").textContent = lastError || (nearby.length
      ? `${nearby.length} สถานีในระยะ • น้ำมาก/ล้นตลิ่ง ${high} สถานีจากข้อมูลไม่เกิน 3 ชม.`
      : "ไม่พบสถานีในระยะนี้ ลองขยายระยะหรือเลื่อนแผนที่ — ไม่ได้หมายความว่าไม่มีความเสี่ยงน้ำท่วม");
    const list = $("waterStationList"); list.replaceChildren();
    for (const station of nearby.slice(0, 8)) {
      const status = waterStatus(station);
      const item = element("button", undefined, "water-station");
      item.type = "button"; item.style.setProperty("--water-color", status.color);
      item.append(element("strong", station.name), element("span", `${station.distance.toFixed(1)} กม. • ${station.province}`, "water-muted"),
        element("b", `${fmt(station.level)} ${station.unit} · ${status.label}`),
        element("span", bankText(station)), element("small", `ตรวจวัด ${date(station.observedAt)}`));
      item.addEventListener("click", () => {
        $("waterLayerEnabled").checked = true; layer.addTo(map);
        // Offset the station below the floating panel, so its popup remains usable on phones.
        map.setView([station.lat, station.lon], 13);
        map.panBy([0, -Math.min(map.getSize().y * 0.22, 200)], { animate: false });
        markers.get(station.id)?.openPopup();
      });
      list.append(item);
    }
    $("waterMore").textContent = nearby.length > 8 ? `แสดง 8 สถานีใกล้ที่สุด • หมุดบนแผนที่แสดงทุกสถานีที่ต้นทางส่งมา (${stations.length})` : `หมุดบนแผนที่: ${stations.length} สถานีทั่วประเทศ`;
  }

  function setState(text, isError = false) {
    $("waterStatus").textContent = text;
    $("waterStatus").classList.toggle("water-error", isError);
  }

  async function refresh() {
    if (pending) return pending;
    setState("กำลังโหลดระดับน้ำจาก ThaiWater…");
    pending = (async () => {
      try {
        const data = await json("/api/waterlevel", AbortSignal.timeout(22000));
        if (!Array.isArray(data.stations)) throw new Error("รูปแบบข้อมูลระดับน้ำไม่ถูกต้อง");
        stations = data.stations; fetchedAt = data.fetchedAt; loaded = true; lastError = "";
        setState(`ตรวจวัดจริง • ${stations.length} สถานี • ดึงข้อมูล ${date(fetchedAt)}`);
      } catch (error) {
        stations = []; loaded = false; lastError = "ข้อมูลระดับน้ำไม่พร้อม — ยังประเมินสถานะน้ำไม่ได้";
        setState(lastError, true);
      } finally {
        if (currentMode === "observations") drawMarkers();
        renderNearby(); pending = null;
      }
    })();
    return pending;
  }

  function svgNode(tag, attrs, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderForecast(data) {
    selectedForecast = data;
    const box = $("waterForecastResult"); box.replaceChildren();
    const points = data.points.filter(point => Date.parse(point.time) >= Date.now());
    if (!points.length) {
      box.append(element("p", "ต้นทางไม่มีค่าพยากรณ์ในช่วง 72 ชั่วโมงข้างหน้าสำหรับสถานีนี้")); return;
    }
    const peak = points.reduce((a, b) => b.value > a.value ? b : a);
    box.append(element("b", `${data.stationName} • ระดับน้ำคาดการณ์ (${data.unit})`),
      element("p", `สูงสุดในช่วงข้อมูล ${fmt(peak.value)} ${data.unit} • ${date(peak.time)}`));
    const allValues = points.map(point => point.value);
    if (data.bankMsl !== null) allValues.push(data.bankMsl);
    const min = Math.min(...allValues) - 0.1, max = Math.max(...allValues) + 0.1;
    const start = Date.parse(points[0].time), end = Date.parse(points.at(-1).time);
    const x = point => 48 + (Date.parse(point.time) - start) / Math.max(1, end - start) * 444;
    const y = value => 148 - (value - min) / (max - min) * 122;
    const svg = svgNode("svg", { viewBox: "0 0 540 190", role: "img", "aria-label": `พยากรณ์ระดับน้ำ ${data.stationName} สูงสุด ${fmt(peak.value)} ${data.unit}` });
    for (let i = 0; i <= 3; i++) {
      const value = min + (max - min) * i / 3, yy = y(value);
      svg.append(svgNode("line", { x1: 48, x2: 492, y1: yy, y2: yy, stroke: "#344a60" }),
        svgNode("text", { x: 40, y: yy + 4, "text-anchor": "end", fill: "#c5d6e6", "font-size": 11 }, fmt(value)));
    }
    if (data.bankMsl !== null) {
      svg.append(svgNode("line", { x1: 48, x2: 492, y1: y(data.bankMsl), y2: y(data.bankMsl), stroke: "#ff9f4e", "stroke-dasharray": "5 4" }),
        svgNode("text", { x: 490, y: y(data.bankMsl) - 6, "text-anchor": "end", fill: "#ffc38f", "font-size": 11 }, `ตลิ่ง ${fmt(data.bankMsl)}`));
    }
    // Split gaps rather than inventing a continuous forecast across missing hours.
    let path = "";
    points.forEach((point, index) => {
      const gap = index === 0 || Date.parse(point.time) - Date.parse(points[index - 1].time) > 2 * 3600000;
      path += `${gap ? "M" : "L"}${x(point).toFixed(1)},${y(point.value).toFixed(1)} `;
    });
    svg.append(svgNode("path", { d: path, fill: "none", stroke: "#c6a2ff", "stroke-width": 2.5 }),
      svgNode("text", { x: 48, y: 175, fill: "#c5d6e6", "font-size": 11 }, date(points[0].time)),
      svgNode("text", { x: 492, y: 175, "text-anchor": "end", fill: "#c5d6e6", "font-size": 11 }, date(points.at(-1).time)));
    box.append(svg);
    const details = element("details"); details.append(element("summary", "ดูค่าพยากรณ์รายชั่วโมง"));
    const table = element("table");
    const head = element("tr"); head.append(element("th", "เวลาไทย"), element("th", "ระดับน้ำ (ม.รทก.)"));
    const thead = element("thead"); thead.append(head); table.append(thead);
    const body = element("tbody");
    for (const point of points) { const row = element("tr"); row.append(element("td", date(point.time)), element("td", fmt(point.value))); body.append(row); }
    table.append(body); details.append(table); box.append(details);
    box.append(element("p", `ดึงข้อมูล ${date(data.fetchedAt)} • ต้นทางไม่ระบุเวลารันโมเดล`, "water-muted"),
      element("p", "ค่าพยากรณ์อาจเปลี่ยนได้ ใช้ร่วมกับค่าตรวจวัดของสถานี ไม่ใช่ความลึกน้ำท่วมที่ตำแหน่งผู้ใช้", "water-muted"));
  }

  async function loadForecast(id) {
    forecastRequest?.abort();
    clearTimeout(forecastTimer);
    forecastRequest = new AbortController();
    const request = forecastRequest;
    selectedForecast = null;
    $("waterForecastResult").replaceChildren(element("p", "กำลังโหลดพยากรณ์ระดับน้ำ…"));
    const timer = setTimeout(() => request.abort(), 35000);
    try {
      const data = await json(`/api/waterlevel?mode=forecast&stationId=${encodeURIComponent(id)}`, request.signal);
      if (request !== forecastRequest) return;
      renderForecast(data);
      forecastTimer = setTimeout(() => {
        if (currentMode === "forecast" && visible) loadForecast(id);
      }, 5 * 60000);
    } catch (error) {
      if (request !== forecastRequest) return;
      $("waterForecastResult").replaceChildren(element("p", "โหลดพยากรณ์ไม่สำเร็จ กรุณากดอัปเดตน้ำอีกครั้ง", "water-error"));
    } finally { clearTimeout(timer); }
  }

  async function selectMode(mode) {
    currentMode = mode;
    $("waterObserved").hidden = mode !== "observations";
    $("waterForecast").hidden = mode !== "forecast";
    $("waterStatus").hidden = mode === "forecast";
    $("waterLegend").hidden = mode !== "observations";
    for (const [id, value] of [["waterObservedBtn", "observations"], ["waterForecastBtn", "forecast"]]) {
      $(id).classList.toggle("active", mode === value); $(id).setAttribute("aria-pressed", String(mode === value));
    }
    map.closePopup();
    if (mode === "observations") { ++modelRequest; forecastRequest?.abort(); clearTimeout(forecastTimer); drawMarkers(); return; }
    const version = ++modelRequest;
    layer.clearLayers();
    $("waterForecastResult").textContent = "กำลังโหลดสถานีที่มีแบบจำลองระดับน้ำ…";
    $("waterModelStation").disabled = true;
    try {
      const data = await json("/api/waterlevel?mode=models", AbortSignal.timeout(18000));
      if (version !== modelRequest || currentMode !== "forecast") return;
      modelStations = data.stations.sort((a, b) => distanceKm(getTarget(), a) - distanceKm(getTarget(), b));
      const select = $("waterModelStation"); select.replaceChildren();
      for (const station of modelStations) {
        const option = element("option", `${station.name} • ${station.province} (${distanceKm(getTarget(), station).toFixed(0)} กม.)`);
        option.value = station.id; select.append(option);
      }
      drawMarkers(); select.disabled = !modelStations.length;
      if (modelStations.length) await loadForecast(select.value);
      else $("waterForecastResult").textContent = "ต้นทางไม่มีสถานีแบบจำลองระดับน้ำให้แสดง";
    } catch (error) {
      if (version === modelRequest) $("waterForecastResult").textContent = "โหลดรายชื่อสถานีแบบจำลองไม่สำเร็จ กรุณากดอัปเดตน้ำอีกครั้ง";
    }
  }

  function setVisible(value) {
    visible = value;
    if (value) {
      // Recompute freshness immediately when returning from the rain view.
      if (currentMode === "observations") { renderNearby(); drawMarkers(); }
      if ($("waterLayerEnabled").checked) layer.addTo(map);
      if (!loaded) refresh();
      if (currentMode === "forecast" && modelStations.length) loadForecast($("waterModelStation").value);
    } else { map.removeLayer(layer); clearTimeout(forecastTimer); }
  }
  $("waterLayerEnabled").addEventListener("change", () => {
    if ($("waterLayerEnabled").checked && visible) layer.addTo(map); else map.removeLayer(layer);
  });
  $("waterRadius").addEventListener("change", renderNearby);
  $("waterRefreshBtn").addEventListener("click", () => currentMode === "forecast" ? selectMode("forecast") : refresh());
  $("waterObservedBtn").addEventListener("click", () => selectMode("observations"));
  $("waterForecastBtn").addEventListener("click", () => selectMode("forecast"));
  $("waterModelStation").addEventListener("change", event => loadForecast(event.target.value));
  $("waterModelMapBtn").addEventListener("click", () => {
    const station = modelStations.find(item => item.id === $("waterModelStation").value);
    if (station) {
      $("waterLayerEnabled").checked = true; layer.addTo(map);
      map.setView([station.lat, station.lon], 12);
      map.panBy([0, -Math.min(map.getSize().y * 0.22, 200)], { animate: false });
      markers.get(station.id)?.openTooltip();
    }
  });
  $("waterCountryBtn").addEventListener("click", () => map.fitBounds([[5.6, 97.3], [20.5, 105.7]], { padding: [20, 20] }));
  setInterval(() => { if (loaded && currentMode === "observations") { renderNearby(); if (visible) drawMarkers(); } }, 60000);
  return {
    refresh: () => visible ? refresh() : Promise.resolve(), setVisible,
    updateTarget: () => { renderNearby(); if (visible && currentMode === "forecast") selectMode("forecast"); },
  };
}
