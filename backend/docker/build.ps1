# Builds all judge images. Run once (and after editing any *.Dockerfile):
#   pwsh backend/docker/build.ps1
# Requires Docker Desktop running.
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot

$images = @(
  @{ Tag = 'judge-gcc:13';     File = 'gcc.Dockerfile' },
  @{ Tag = 'judge-python:3.10'; File = 'python.Dockerfile' },
  @{ Tag = 'judge-node:18';     File = 'node.Dockerfile' },
  @{ Tag = 'judge-java:17';     File = 'java.Dockerfile' }
)

foreach ($img in $images) {
  Write-Host "Building $($img.Tag) ..." -ForegroundColor Cyan
  docker build -t $img.Tag -f (Join-Path $dir $img.File) $dir
  if ($LASTEXITCODE -ne 0) { throw "Build failed for $($img.Tag)" }
}

Write-Host "All judge images built." -ForegroundColor Green
