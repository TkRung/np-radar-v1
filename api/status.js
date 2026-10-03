export default async function handler(req,res) {
  const sources = {
    RainViewer:"https://api.rainviewer.com/public/weather-maps.json",
    ECMWF:"https://api.open-meteo.com/v1/ecmwf?latitude=13.75&longitude=100.50&hourly=precipitation&forecast_days=1",
    GFS:"https://api.open-meteo.com/v1/gfs?latitude=13.75&longitude=100.50&hourly=precipitation&forecast_days=1"
  };

  const out = {};

  await Promise.all(Object.entries(sources).map(async ([name,url]) => {
    const start = Date.now();
    try {
      const r = await fetch(url,{headers:{"Accept":"application/json"}});
      out[name] = {ok:r.ok,status:r.status,ms:Date.now()-start};
    } catch (e) {
      out[name] = {ok:false,error:String(e),ms:Date.now()-start};
    }
  }));

  res.setHeader("Cache-Control","no-store");
  res.status(200).json({ok:true,checked_at:new Date().toISOString(),sources:out});
}
