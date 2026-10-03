const SOURCES = {
  ecmwf:"https://api.open-meteo.com/v1/ecmwf",
  gfs:"https://api.open-meteo.com/v1/gfs"
};

export default async function handler(req,res) {
  if (req.method !== "GET") {
    res.status(405).json({ok:false,error:"Method not allowed"});
    return;
  }

  try {
    const model = String(req.query.model || "ecmwf").toLowerCase();
    const base = SOURCES[model];

    if (!base) {
      res.status(400).json({ok:false,error:"Unknown model"});
      return;
    }

    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ok:false,error:"Invalid coordinates"});
      return;
    }

    const q = new URLSearchParams({
      latitude:String(lat),
      longitude:String(lon),
      timezone:"Asia/Bangkok",
      hourly:"precipitation,wind_gusts_10m,cape",
      forecast_days:"2"
    });

    const upstream = await fetch(`${base}?${q.toString()}`, {
      headers:{ "Accept":"application/json" }
    });

    if (!upstream.ok) {
      throw new Error(`${model} HTTP ${upstream.status}`);
    }

    const data = await upstream.json();

    res.setHeader("Cache-Control","s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({ok:true,data});
  } catch (e) {
    res.status(502).json({ok:false,error:String(e)});
  }
}
