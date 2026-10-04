import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStations, normalizeModelStations, normalizeForecast, waterStatus, distanceKm } from "../lib/water-data.js";

const NOW = Date.parse("2026-10-04T09:00:00+07:00");
function payload(properties = {}, geometry = { type: "Point", coordinates: [100.58, 13.85] }) {
  return { data: { "10": { type: "FeatureCollection", features: [{ type: "Feature", geometry, properties: {
    station: { id: 1107, station: "คลองลาดพร้าว", stationCode: "BKK021" },
    waterlevelMsl: 1.906, waterlevelMslPrevious: 1.895, waterlevelDatetime: "2026-10-04T08:20:00+07:00",
    minBank: 2.2, storagePercent: 88.38, waterlevelMslPercent: 86.64, ...properties,
  } }] } } };
}

test("zero and negative MSL are readings; null and blanks are missing", () => {
  for (const value of [0, -2.484]) assert.equal(normalizeStations(payload({ waterlevelMsl: value }))[0].level, value);
  for (const value of [null, "", " ", false, "unknown"])
    assert.equal(normalizeStations(payload({ waterlevelMsl: value }))[0].level, null);
});

test("ThaiWater storage criteria use storagePercent, never the MSL ratio", () => {
  const station = normalizeStations(payload({ waterlevelMsl: -2.484, minBank: 1.415, storagePercent: 51.38, waterlevelMslPercent: 175.55 }))[0];
  assert.equal(waterStatus(station, NOW).key, "normal");
  assert.ok(Math.abs(station.belowBank - 3.899) < 0.0001);
  const overflow = normalizeStations(payload({ waterlevelMsl: 2.015, minBank: 1.97, storagePercent: 101.51 }))[0];
  assert.equal(waterStatus(overflow, NOW).key, "overflow");
  assert.ok(overflow.belowBank < 0);
});

test("missing bank metadata, old data, missing timestamps, and future clocks do not become normal", () => {
  for (const patch of [
    { minBank: null }, { waterlevelDatetime: null },
    { waterlevelDatetime: "2026-10-03T08:20:00+07:00" },
    { waterlevelDatetime: "2026-10-05T08:20:00+07:00" },
    { waterlevelMsl: null },
  ]) {
    const state = waterStatus(normalizeStations(payload(patch))[0], NOW);
    assert.ok(["unknown", "stale", "invalid-time"].includes(state.key), state.key);
  }
});

test("a local station datum cannot be subtracted from an MSL bank", () => {
  const station = normalizeStations(payload({ waterlevelMsl: null, waterlevelM: 1.5 }))[0];
  assert.equal(station.level, 1.5);
  assert.equal(station.belowBank, null);
  assert.equal(station.storagePercent, null);
});

test("invalid coordinates and duplicate stale records cannot pollute station map", () => {
  assert.equal(normalizeStations(payload({}, { type: "Point", coordinates: [null, 13] })).length, 0);
  assert.equal(normalizeStations(payload({}, { type: "Point", coordinates: [100, 95] })).length, 0);
  const data = payload();
  data.data[10].features.push(payload({ waterlevelDatetime: "2026-10-03T08:20:00+07:00", waterlevelMsl: 99 }).data[10].features[0]);
  assert.equal(normalizeStations(data).length, 1);
  assert.equal(normalizeStations(data)[0].level, 1.906);
  assert.throws(() => normalizeStations({ data: { error: "unavailable" } }));
});

test("model catalog excludes discharge forecasts in cubic metres per second", () => {
  const stage = payload({ type: "waterlevelForecast" });
  stage.data[10].features.push(payload({ type: "waterlevelRidForecast", discharge: 2500 }).data[10].features[0]);
  assert.equal(normalizeModelStations(stage).length, 1);
});

test("forecast times are Bangkok time, future-only, bounded to 72 hours; null is not zero", () => {
  const points = normalizeForecast({ data: [
    { datetime: "2026-10-04 08:00:00", foreValue: 2 },
    { datetime: "2026-10-04 10:00:00", foreValue: 0 },
    { datetime: "2026-10-04 11:00:00", foreValue: null },
    { datetime: "2026-10-07 10:00:00", foreValue: 999 },
    { datetime: "2026-10-04 12:00:00", foreValue: -1 },
  ] }, NOW);
  assert.deepEqual(points.map(point => point.value), [0, -1]);
  assert.equal(Date.parse(points[0].time), Date.parse("2026-10-04T03:00:00Z"));
});

test("nearby stations use geographic distance in km", () => {
  assert.equal(distanceKm({lat:13.8,lon:100.6},{lat:13.8,lon:100.6}), 0);
  const km = distanceKm({lat:0,lon:0},{lat:1,lon:0});
  assert.ok(km > 111 && km < 112);
});
