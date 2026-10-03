export default async function handler(req,res) {
  if (req.method !== "GET") {
    res.status(405).json({ok:false,error:"Method not allowed"});
    return;
  }

  try {
    const src = String(req.query.url || "");
    if (!src) throw new Error("Missing url");

    const u = new URL(src);
    const h = u.hostname.toLowerCase();

    if (!(h === "rainviewer.com" || h.endsWith(".rainviewer.com"))) {
      res.status(400).json({ok:false,error:"Only RainViewer image hosts are allowed"});
      return;
    }

    const upstream = await fetch(src, {
      headers:{
        "Accept":"image/png,image/*,*/*",
        "Referer":"https://www.rainviewer.com/"
      }
    });

    if (!upstream.ok) {
      throw new Error(`Radar image HTTP ${upstream.status}`);
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type",upstream.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=900");
    res.status(200).send(bytes);
  } catch (e) {
    res.status(502).json({ok:false,error:String(e)});
  }
}
