param(
  [ValidateSet("Local", "Remote")]
  [string]$Mode = "Local"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot ".r2-media-staging\collection-manifest.json"
$stagingRoot = Join-Path $projectRoot ".r2-media-staging"
$wranglerConfig = Join-Path $projectRoot "apps\web\wrangler.jsonc"
$objects = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

foreach ($item in $objects) {
  $sourcePath = Join-Path $stagingRoot $item.key
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Missing staged R2 object: $sourcePath"
  }

  $arguments = @(
    "exec",
    "wrangler",
    "r2",
    "object",
    "put",
    "life-ledger-media/$($item.key)",
    "--file",
    $sourcePath,
    "--content-type",
    "image/webp",
    "--cache-control",
    "private, max-age=31536000, immutable",
    "--config",
    $wranglerConfig,
    "--force"
  )

  if ($Mode -eq "Remote") {
    $arguments += "--remote"
  } else {
    $arguments += @(
      "--local",
      "--persist-to",
      (Join-Path $projectRoot "apps\web\.wrangler\state")
    )
  }

  Write-Output "UPLOAD $Mode $($item.key) ($($item.bytes) bytes)"
  & pnpm @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "R2 upload failed for $($item.key)"
  }
}

Write-Output "COMPLETE $Mode $($objects.Count) objects"
