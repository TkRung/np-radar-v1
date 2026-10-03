export default async function handler(req,res) {
  if (req.method !== "GET") {
    res.status(405).json({ok:false,error:"Method not allowed"});
    return;
  }

  try {
    const upstream = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
      headers:{ "Accept":"application/json" }
    });

    if (!upstream.ok) {
      throw new Error(`RainViewer HTTP ${upstream.status}`);
    }

    const data = await upstream.json();

    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ok:true,data});
  } catch (e) {
    res.status(502).json({ok:false,error:String(e)});
  }
}
