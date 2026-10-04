import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/waterlevel.js";

function response() {
  return { headers:{}, statusCode:200, body:null,
    setHeader(k,v) { this.headers[k]=v; }, status(code) { this.statusCode=code; return this; },
    json(body) { this.body=body; return this; } };
}
test("untrusted URLs and unsupported methods cannot turn the API into an open proxy", async t => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("must not fetch"); });
  for (const req of [{method:"POST",query:{}},{method:"GET",query:{mode:"https://example.com"}},
    {method:"GET",query:{mode:"forecast",stationId:"../secrets"}}]) {
    const res=response(); await handler(req,res); assert.ok([400,405].includes(res.statusCode));
  }
  assert.equal(fetch.mock.callCount(),0);
});
test("upstream failures are unavailable, not an empty successful measurement", async t => {
  t.mock.method(globalThis,"fetch",async()=>({ok:false,status:503}));
  const res=response(); await handler({method:"GET",query:{}},res);
  assert.equal(res.statusCode,502); assert.equal(res.body.ok,false);
  assert.equal(res.headers["Cache-Control"],"no-store");
});
test("discharge-only station is rejected before attempting a stage forecast", async t => {
  const fetch=t.mock.method(globalThis,"fetch",async()=>({ok:true,json:async()=>({data:{type:"waterlevelRidForecast"}})}));
  const res=response(); await handler({method:"GET",query:{mode:"forecast",stationId:"3786"}},res);
  assert.equal(res.statusCode,404); assert.equal(fetch.mock.callCount(),1);
});
