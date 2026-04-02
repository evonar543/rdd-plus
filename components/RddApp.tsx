"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type BinaryType = "WindowsPlayer" | "WindowsStudio64" | "MacPlayer" | "MacStudio";

interface VersionEntry {
  version: string;
  timestamp: string;
  binaryType: string;
}

interface LogEntry {
  text: string;
  kind: "info" | "ok" | "warn" | "error";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOST_PATH = "https://setup-aws.rbxcdn.com";

const BINARY_TYPES: { id: BinaryType; label: string; icon: string; os: "win" | "mac" }[] = [
  { id: "WindowsPlayer",   label: "Windows Player",  icon: "🎮", os: "win" },
  { id: "WindowsStudio64", label: "Windows Studio",  icon: "🛠️", os: "win" },
  { id: "MacPlayer",       label: "Mac Player",      icon: "🎮", os: "mac" },
  { id: "MacStudio",       label: "Mac Studio",      icon: "🛠️", os: "mac" },
];

const COMMON_CHANNELS = ["LIVE", "ZLIVE", "zCanary", "zIntegration"];

const BLOB_DIRS: Record<BinaryType, string> = {
  WindowsPlayer:   "/",
  WindowsStudio64: "/",
  MacPlayer:       "/mac/",
  MacStudio:       "/mac/",
};

// Extract roots for Windows ZIPs (same as original rdd.js)
const EXTRACT_ROOTS_PLAYER: Record<string, string> = {
  "RobloxApp.zip": "",
  "redist.zip": "",
  "shaders.zip": "shaders/",
  "ssl.zip": "ssl/",
  "WebView2.zip": "",
  "WebView2RuntimeInstaller.zip": "WebView2RuntimeInstaller/",
  "content-avatar.zip": "content/avatar/",
  "content-configs.zip": "content/configs/",
  "content-fonts.zip": "content/fonts/",
  "content-sky.zip": "content/sky/",
  "content-sounds.zip": "content/sounds/",
  "content-textures2.zip": "content/textures/",
  "content-models.zip": "content/models/",
  "content-platform-fonts.zip": "PlatformContent/pc/fonts/",
  "content-platform-dictionaries.zip": "PlatformContent/pc/shared_compression_dictionaries/",
  "content-terrain.zip": "PlatformContent/pc/terrain/",
  "content-textures3.zip": "PlatformContent/pc/textures/",
  "extracontent-luapackages.zip": "ExtraContent/LuaPackages/",
  "extracontent-translations.zip": "ExtraContent/translations/",
  "extracontent-models.zip": "ExtraContent/models/",
  "extracontent-textures.zip": "ExtraContent/textures/",
  "extracontent-places.zip": "ExtraContent/places/",
};

const EXTRACT_ROOTS_STUDIO: Record<string, string> = {
  "RobloxStudio.zip": "",
  "RibbonConfig.zip": "RibbonConfig/",
  "redist.zip": "",
  "Libraries.zip": "",
  "LibrariesQt5.zip": "",
  "WebView2.zip": "",
  "WebView2RuntimeInstaller.zip": "",
  "shaders.zip": "shaders/",
  "ssl.zip": "ssl/",
  "Qml.zip": "Qml/",
  "Plugins.zip": "Plugins/",
  "StudioFonts.zip": "StudioFonts/",
  "BuiltInPlugins.zip": "BuiltInPlugins/",
  "ApplicationConfig.zip": "ApplicationConfig/",
  "BuiltInStandalonePlugins.zip": "BuiltInStandalonePlugins/",
  "content-qt_translations.zip": "content/qt_translations/",
  "content-sky.zip": "content/sky/",
  "content-fonts.zip": "content/fonts/",
  "content-avatar.zip": "content/avatar/",
  "content-models.zip": "content/models/",
  "content-sounds.zip": "content/sounds/",
  "content-configs.zip": "content/configs/",
  "content-api-docs.zip": "content/api_docs/",
  "content-textures2.zip": "content/textures/",
  "content-studio_svg_textures.zip": "content/studio_svg_textures/",
  "content-platform-fonts.zip": "PlatformContent/pc/fonts/",
  "content-platform-dictionaries.zip": "PlatformContent/pc/shared_compression_dictionaries/",
  "content-terrain.zip": "PlatformContent/pc/terrain/",
  "content-textures3.zip": "PlatformContent/pc/textures/",
  "extracontent-translations.zip": "ExtraContent/translations/",
  "extracontent-luapackages.zip": "ExtraContent/LuaPackages/",
  "extracontent-textures.zip": "ExtraContent/textures/",
  "extracontent-scripts.zip": "ExtraContent/scripts/",
  "extracontent-models.zip": "ExtraContent/models/",
  "studiocontent-models.zip": "StudioContent/models/",
  "studiocontent-textures.zip": "StudioContent/textures/",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RddApp() {
  const [binaryType, setBinaryType] = useState<BinaryType>("WindowsPlayer");
  const [channel, setChannel] = useState("LIVE");
  const [version, setVersion] = useState("");
  const [compressZip, setCompressZip] = useState(false);
  const [compressionLevel, setCompressionLevel] = useState(5);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFetchingVersion, setIsFetchingVersion] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [versionHistory, setVersionHistory] = useState<VersionEntry[]>([]);
  const [nBack, setNBack] = useState(0);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const log = useCallback((text: string, kind: LogEntry["kind"] = "info") => {
    setLogs((prev) => [...prev, { text, kind }]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Version from history index ───────────────────────────────────────────
  useEffect(() => {
    if (versionHistory.length > 0 && versionHistory[nBack]) {
      setVersion(versionHistory[nBack].version);
    }
  }, [nBack, versionHistory]);

  // ── Fetch current version ─────────────────────────────────────────────────
  async function fetchCurrentVersion() {
    setIsFetchingVersion(true);
    log(`Fetching current version for ${binaryType} on channel ${channel}…`);
    try {
      const res = await fetch(
        `/api/version?binaryType=${encodeURIComponent(binaryType)}&channel=${encodeURIComponent(channel)}`
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        log(`Failed to fetch version: ${data.error ?? res.status}`, "error");
        return;
      }
      const v: string = data.clientVersionUpload || data.version || "";
      if (!v) {
        log("No version hash found in response", "warn");
        return;
      }
      log(`Current version: ${v}`, "ok");
      setVersion(v.startsWith("version-") ? v : `version-${v}`);
      setNBack(0);
    } catch (e) {
      log(`Error: ${e}`, "error");
    } finally {
      setIsFetchingVersion(false);
    }
  }

  // ── Fetch version history ─────────────────────────────────────────────────
  async function fetchHistory() {
    setIsFetchingHistory(true);
    try {
      const res = await fetch(
        `/api/history?binaryType=${encodeURIComponent(binaryType)}&channel=${encodeURIComponent(channel)}&limit=20`
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        log(`History unavailable: ${data.error ?? res.status}`, "warn");
        setVersionHistory([]);
        return;
      }
      setVersionHistory(data.versions ?? []);
    } catch {
      setVersionHistory([]);
    } finally {
      setIsFetchingHistory(false);
    }
  }

  // Refresh history whenever binaryType or channel changes
  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binaryType, channel]);

  // ── Permalink ─────────────────────────────────────────────────────────────
  function getPermalink() {
    const params = new URLSearchParams({
      channel,
      binaryType,
      version,
    });
    if (compressZip) {
      params.set("compressZip", "true");
      params.set("compressionLevel", String(compressionLevel));
    }
    return `${window.location.origin}?${params.toString()}`;
  }

  async function copyLink() {
    await navigator.clipboard.writeText(getPermalink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Download logic ────────────────────────────────────────────────────────
  function triggerBrowserDownload(fileName: string, data: ArrayBuffer) {
    const blob = new Blob([data], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  async function fetchBinary(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.arrayBuffer();
  }

  async function startDownload() {
    if (!version) {
      log("Please fetch or enter a version hash first.", "warn");
      return;
    }
    if (isDownloading) return;

    setIsDownloading(true);
    setLogs([]);

    const resolvedVersion = version.startsWith("version-") ? version : `version-${version}`;
    const blobDir = BLOB_DIRS[binaryType];
    let channelPath = channel === "LIVE" ? HOST_PATH : `${HOST_PATH}/channel/${channel.toLowerCase()}`;
    let versionPrefix = `${channelPath}${blobDir}${resolvedVersion}-`;
    const outputFileName = `${channel}-${binaryType}-${resolvedVersion}.zip`;

    try {
      if (binaryType === "MacPlayer" || binaryType === "MacStudio") {
        const zipFile =
          binaryType === "MacPlayer" ? "RobloxPlayer.zip" : "RobloxStudioApp.zip";
        log(`Fetching Mac archive: ${zipFile}…`);
        const data = await fetchBinary(versionPrefix + zipFile);
        log("Download complete — saving file…", "ok");
        triggerBrowserDownload(outputFileName, data);
        log(`Saved as: ${outputFileName}`, "ok");
        return;
      }

      // Windows — fetch manifest
      log(`Fetching rbxPkgManifest for ${resolvedVersion} @ ${channel}…`);

      let manifestText = "";
      let manifestResp = await fetch(versionPrefix + "rbxPkgManifest.txt");
      if (!manifestResp.ok) {
        // Try channel/common fallback
        channelPath = `${HOST_PATH}/channel/common`;
        versionPrefix = `${channelPath}${blobDir}${resolvedVersion}-`;
        manifestResp = await fetch(versionPrefix + "rbxPkgManifest.txt");
      }
      if (!manifestResp.ok) {
        log(
          `Failed to fetch manifest (status ${manifestResp.status}). Check version hash and binary type.`,
          "error"
        );
        return;
      }
      manifestText = await manifestResp.text();

      const lines = manifestText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines[0] !== "v0") {
        log(`Unknown manifest version: "${lines[0]}"`, "error");
        return;
      }

      const isPlayer = lines.includes("RobloxApp.zip");
      const isStudio = lines.includes("RobloxStudio.zip");

      if (!isPlayer && !isStudio) {
        log("Unrecognized manifest format.", "error");
        return;
      }
      if (isPlayer && binaryType === "WindowsStudio64") {
        log("BinaryType mismatch: expected Studio but got Player manifest.", "error");
        return;
      }
      if (isStudio && binaryType === "WindowsPlayer") {
        log("BinaryType mismatch: expected Player but got Studio manifest.", "error");
        return;
      }

      const extractRoots = isPlayer ? EXTRACT_ROOTS_PLAYER : EXTRACT_ROOTS_STUDIO;
      const packages = lines.filter((l) => l.endsWith(".zip"));

      log(`Found ${packages.length} packages — downloading…`);

      const zip = new JSZip();
      zip.file(
        "AppSettings.xml",
        `<?xml version="1.0" encoding="UTF-8"?>\n<Settings>\n\t<ContentFolder>content</ContentFolder>\n\t<BaseUrl>http://www.roblox.com</BaseUrl>\n</Settings>\n`
      );

      let completed = 0;
      await Promise.all(
        packages.map(async (pkg) => {
          log(`↓ ${pkg}`);
          const data = await fetchBinary(versionPrefix + pkg);

          if (!(pkg in extractRoots)) {
            log(`  (no extract root for "${pkg}" — placing at root)`, "warn");
            zip.file(pkg, data);
          } else {
            const root = extractRoots[pkg];
            const inner = await JSZip.loadAsync(data);
            const filePromises: Promise<void>[] = [];
            inner.forEach((path, obj) => {
              if (path.endsWith("\\") || path.endsWith("/")) return;
              const fixedPath = path.replace(/\\/g, "/");
              filePromises.push(
                obj.async("arraybuffer").then((buf) => {
                  zip.file(root + fixedPath, buf);
                })
              );
            });
            await Promise.all(filePromises);
          }

          completed++;
          log(`  ✓ ${pkg} (${completed}/${packages.length})`, "ok");
        })
      );

      log("");
      if (compressZip) {
        log(
          `Compressing output zip (level ${compressionLevel}/9) — this may take a moment…`,
          "info"
        );
      }
      log(`Assembling: ${outputFileName}…`);

      const outputData = await zip.generateAsync({
        type: "arraybuffer",
        compression: compressZip ? "DEFLATE" : "STORE",
        compressionOptions: { level: compressionLevel },
      });

      log(`Done — saving file…`, "ok");
      triggerBrowserDownload(outputFileName, outputData);
      log(`Saved as: ${outputFileName}`, "ok");
    } catch (e) {
      log(`Error: ${e}`, "error");
    } finally {
      setIsDownloading(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const selectedHistory = versionHistory[nBack];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono">RDD+</h1>
            <Badge variant="secondary" className="font-mono text-xs">
              Roblox Deployment Downloader
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Download any Roblox deployment directly from{" "}
            <span className="font-mono text-xs">setup-aws.rbxcdn.com</span>.{" "}
            <a
              href="https://github.com/latte-soft/rdd"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Based on RDD by Latte Softworks
            </a>{" "}
            · MIT License
          </p>
        </div>

        <Separator />

        {/* Platform selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Platform
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BINARY_TYPES.map((bt) => (
                <button
                  key={bt.id}
                  onClick={() => {
                    setBinaryType(bt.id);
                    setNBack(0);
                    setVersion("");
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-4 text-sm transition-all",
                    binaryType === bt.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <span className="text-xl">{bt.icon}</span>
                  <span className="font-medium leading-tight text-center">{bt.label}</span>
                  <Badge
                    variant={bt.os === "win" ? "outline" : "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {bt.os === "win" ? "Windows" : "macOS"}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Channel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Channel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value);
                  setNBack(0);
                  setVersion("");
                }}
                placeholder="LIVE"
                className="font-mono"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_CHANNELS.map((ch) => (
                <button
                  key={ch}
                  onClick={() => {
                    setChannel(ch);
                    setNBack(0);
                    setVersion("");
                  }}
                  className={cn(
                    "rounded px-2 py-0.5 font-mono text-xs transition-colors",
                    channel === ch
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {ch}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Version */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Version
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Auto-detect row */}
            <div className="flex gap-2">
              <Button
                onClick={fetchCurrentVersion}
                disabled={isFetchingVersion || isDownloading}
                variant="outline"
                size="sm"
                className="shrink-0"
              >
                {isFetchingVersion ? "Fetching…" : "Fetch Current"}
              </Button>
              <Input
                value={version}
                onChange={(e) => {
                  setVersion(e.target.value);
                  setNBack(0);
                }}
                placeholder="version-xxxxxxxxxxxxxxxx"
                className="font-mono text-sm"
              />
            </div>

            {/* N-back selector */}
            {versionHistory.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">
                    Versions back:
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        setNBack((n) => Math.max(0, n - 1))
                      }
                      disabled={nBack === 0}
                    >
                      −
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      max={versionHistory.length - 1}
                      value={nBack}
                      onChange={(e) =>
                        setNBack(
                          Math.max(
                            0,
                            Math.min(
                              versionHistory.length - 1,
                              parseInt(e.target.value) || 0
                            )
                          )
                        )
                      }
                      className="h-7 w-16 text-center font-mono text-sm p-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        setNBack((n) =>
                          Math.min(versionHistory.length - 1, n + 1)
                        )
                      }
                      disabled={nBack >= versionHistory.length - 1}
                    >
                      +
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {nBack === 0
                      ? "current"
                      : `${nBack} release${nBack > 1 ? "s" : ""} ago`}
                  </span>
                </div>

                {/* Version history list */}
                <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                  {isFetchingHistory ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      Loading history…
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {versionHistory.map((entry, i) => (
                        <button
                          key={entry.version}
                          onClick={() => setNBack(i)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors hover:bg-accent",
                            nBack === i && "bg-primary/10"
                          )}
                        >
                          <span className="font-mono text-foreground truncate">
                            {entry.version}
                          </span>
                          <span className="text-muted-foreground ml-2 shrink-0">
                            {i === 0 ? (
                              <Badge variant="default" className="text-[10px] px-1 py-0">
                                latest
                              </Badge>
                            ) : (
                              entry.timestamp || `−${i}`
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedHistory?.timestamp && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Deployed: {selectedHistory.timestamp}
                  </p>
                )}
              </div>
            )}

            {versionHistory.length === 0 && !isFetchingHistory && (
              <p className="text-xs text-muted-foreground">
                Version history not available for this channel/platform.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Options */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                id="compress"
                type="checkbox"
                checked={compressZip}
                onChange={(e) => setCompressZip(e.target.checked)}
                className="accent-primary"
              />
              <Label htmlFor="compress" className="text-sm cursor-pointer">
                Compress output zip
              </Label>
              {compressZip && (
                <div className="flex items-center gap-2 ml-auto">
                  <Label className="text-xs text-muted-foreground">
                    Level (1–9):
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={9}
                    value={compressionLevel}
                    onChange={(e) =>
                      setCompressionLevel(
                        Math.max(1, Math.min(9, parseInt(e.target.value) || 5))
                      )
                    }
                    className="h-7 w-16 text-center font-mono text-sm p-1"
                  />
                </div>
              )}
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button
                onClick={startDownload}
                disabled={isDownloading || !version}
                className="flex-1"
              >
                {isDownloading ? "Downloading…" : "Download"}
              </Button>
              <Button
                variant="outline"
                onClick={copyLink}
                disabled={!version}
                title="Copy a permanent link to this version"
              >
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Log output */}
        {logs.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Output
                {isDownloading && (
                  <Badge variant="outline" className="text-[10px] animate-pulse">
                    running
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-black/60 border border-border p-3 font-mono text-xs max-h-64 overflow-y-auto space-y-0.5">
                {logs.map((entry, i) => (
                  <div
                    key={i}
                    className={cn(
                      "leading-5",
                      entry.kind === "ok" && "text-emerald-400",
                      entry.kind === "warn" && "text-yellow-400",
                      entry.kind === "error" && "text-red-400",
                      entry.kind === "info" && "text-zinc-300"
                    )}
                  >
                    {entry.text || "\u00A0"}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
