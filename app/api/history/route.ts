import type { NextRequest } from "next/server";

// Maps binaryType to how it appears in DeployHistory.txt
const binaryTypeLabels: Record<string, string[]> = {
  WindowsPlayer: ["WindowsPlayer", "Player"],
  WindowsStudio64: ["WindowsStudio64", "Studio64", "Studio"],
  MacPlayer: ["MacPlayer"],
  MacStudio: ["MacStudio"],
};

export interface VersionEntry {
  version: string;
  timestamp: string;
  binaryType: string;
}

export async function GET(request: NextRequest) {
  const binaryType =
    request.nextUrl.searchParams.get("binaryType") || "WindowsPlayer";
  const channel = request.nextUrl.searchParams.get("channel") || "LIVE";
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") || "20"),
    50
  );

  const channelPrefix =
    channel === "LIVE" ? "" : `/channel/${channel.toLowerCase()}`;
  const historyUrl = `https://setup-aws.rbxcdn.com${channelPrefix}/DeployHistory.txt`;

  try {
    const resp = await fetch(historyUrl, {
      headers: { "User-Agent": "RDDPlus/1.0" },
      next: { revalidate: 60 },
    });

    if (!resp.ok) {
      return Response.json(
        { error: `CDN returned ${resp.status}` },
        { status: resp.status }
      );
    }

    const text = await resp.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    const labels = binaryTypeLabels[binaryType] || [binaryType];

    // Format: "New WindowsPlayer version-abc at 4/2/2026 ..."
    // or just "version-abc" in older channels
    const entries: VersionEntry[] = [];
    for (const line of lines) {
      let matched = false;
      for (const label of labels) {
        const pattern = new RegExp(
          `New\\s+${label}\\s+(version-[a-f0-9]+)(?:\\s+at\\s+(.+))?`,
          "i"
        );
        const m = line.match(pattern);
        if (m) {
          entries.push({
            version: m[1],
            timestamp: m[2]?.trim() || "",
            binaryType,
          });
          matched = true;
          break;
        }
      }
      // Some channels just have bare version hashes
      if (!matched && /^version-[a-f0-9]+$/.test(line)) {
        entries.push({ version: line, timestamp: "", binaryType });
      }
    }

    // Most recent first
    entries.reverse();

    return Response.json(
      { versions: entries.slice(0, limit), total: entries.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
