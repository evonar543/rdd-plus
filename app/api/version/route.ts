import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const binaryType =
    request.nextUrl.searchParams.get("binaryType") || "WindowsPlayer";
  const channel =
    request.nextUrl.searchParams.get("channel") || "LIVE";

  const url = `https://clientsettings.roblox.com/v2/client-version/${encodeURIComponent(binaryType)}/channel/${encodeURIComponent(channel)}`;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "RDDPlus/1.0" },
      next: { revalidate: 30 },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return Response.json(
        { error: `Roblox API returned ${resp.status}`, detail: body },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
