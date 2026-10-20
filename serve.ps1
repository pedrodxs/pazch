# ============================================================================
# PEDROO — tiny local web server (PowerShell only, no Node/Python required)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File "serve.ps1"
#   then open http://localhost:5500/
#
# Firebase Authentication needs an http(s) origin (localhost works), so use
# this instead of double-clicking zizA.html when testing login.
# ============================================================================
param([int]$Port = 5500)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot ".")).Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
Write-Host "Press Ctrl+C to stop."

$mime = @{
  ".html" = "text/html; charset=utf-8";   ".htm"  = "text/html; charset=utf-8";
  ".css"  = "text/css; charset=utf-8";    ".js"   = "text/javascript; charset=utf-8";
  ".json" = "application/json; charset=utf-8";
  ".svg"  = "image/svg+xml";              ".png"  = "image/png";
  ".jpg"  = "image/jpeg";                 ".jpeg" = "image/jpeg";
  ".webp" = "image/webp";                 ".gif"  = "image/gif";
  ".woff2" = "font/woff2";                ".woff" = "font/woff";
  ".ico"  = "image/x-icon";               ".txt"  = "text/plain; charset=utf-8"
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "zizA.html" }
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403; $res.Close(); continue
    }
    if (Test-Path -LiteralPath $full -PathType Container) {
      $full = Join-Path $full "zizA.html"
    }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes("Not found")
      $res.ContentType = "text/plain; charset=utf-8"
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close(); continue
    }
    $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
    $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
    $res.Headers.Add("Cache-Control", "no-store")
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
  } catch {
    try { $res.StatusCode = 500; $res.Close() } catch {}
  }
}
