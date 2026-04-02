import type { NextRequest } from "next/server";

const HOST_PATH = "https://setup-aws.rbxcdn.com";

// Given a version hash, try to detect what binary type it is by
// fetching the manifest for player vs studio
export async function GET(request: NextRequest) {
  const version = request.nextUrl.searchParams.get("version") || "";
  const channel = request.nextUrl.searchParams.get("channel") || "LIVE";

  if (!version) {
    return Response.json({ error: "Missing version" }, { status: 400 });
  }

  const resolved = version.startsWith("version-") ? version : `version-${version}`;
  const channelPath =
    channel === "LIVE"
      ? HOST_PATH
      : `${HOST_PATH}/channel/${channel.toLowerCase()}`;

  // Try common channel fallback too
  const prefixes = [
    `${channelPath}/${resolved}-`,
    `${HOST_PATH}/channel/common/${resolved}-`,
  ];

  for (const prefix of prefixes) {
    // Try Windows (blob dir /)
    const manifestUrl = `${prefix}rbxPkgManifest.txt`;
    try {
      const resp = await fetch(manifestUrl, {
        headers: { "User-Agent": "RDDPlus/1.0" },
      });
      if (!resp.ok) continue;

      const text = await resp.text();
      const lines = text.split("\n").map((l) => l.trim());

      if (lines[0] !== "v0") continue;

      const isPlayer = lines.includes("RobloxApp.zip");
      const isStudio = lines.includes("RobloxStudio.zip");

      return Response.json({
        valid: true,
        version: resolved,
        binaryType: isPlayer
          ? "WindowsPlayer"
          : isStudio
          ? "WindowsStudio64"
          : "unknown",
        manifestUrl,
        packageCount: lines.filter((l) => l.endsWith(".zip")).length,
      });
    } catch {
      continue;
    }
  }

  // Try Mac
  const macPrefix = `${channelPath}/mac/${resolved}-`;
  try {
    const resp = await fetch(`${macPrefix}RobloxPlayer.zip`, {
      method: "HEAD",
      headers: { "User-Agent": "RDDPlus/1.0" },
    });
    if (resp.ok) {
      return Response.json({
        valid: true,
        version: resolved,
        binaryType: "MacPlayer",
        manifestUrl: `${macPrefix}RobloxPlayer.zip`,
        packageCount: 1,
      });
    }
  } catch {
    // ignore
  }

  return Response.json({ valid: false, version: resolved });
}
