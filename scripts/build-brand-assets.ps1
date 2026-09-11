$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandRoot = Split-Path $PSScriptRoot -Parent

# Packaging only: resize the approved raster assets and encode PNG/ICO.
# Do not redraw, mask, recolor or remove backgrounds here.
function Convert-BrandPng([string]$Source, [int]$Size) {
    $inputBitmap = [System.Drawing.Bitmap]::FromFile((Join-Path $brandRoot $Source))
    $outputBitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($outputBitmap)
    $stream = [System.IO.MemoryStream]::new()
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($inputBitmap, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))
        $outputBitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        return ,$stream.ToArray()
    } finally { $stream.Dispose(); $graphics.Dispose(); $outputBitmap.Dispose(); $inputBitmap.Dispose() }
}

$brandSource = 'design/brand/t26a/dm-icon-source.png'
$outputs = @(
    @{ Source=$brandSource; Size=512; Path='public/assets/branding/deskmate-logo.png' },
    @{ Source=$brandSource; Size=256; Path='electron/assets/deskmate-dm.png' },
    @{ Source='design/brand/t26a/companion-open-source.png'; Size=768; Path='public/assets/expressions/soft/open.png' },
    @{ Source='design/brand/t26a/companion-closed-source.png'; Size=768; Path='public/assets/expressions/soft/closed.png' }
)
foreach ($item in $outputs) {
    [System.IO.File]::WriteAllBytes((Join-Path $brandRoot $item.Path), (Convert-BrandPng $item.Source $item.Size))
}
$sizes = @(16,20,24,32,40,48,64,128,256)
$frames = @($sizes | ForEach-Object { ,(Convert-BrandPng $brandSource $_) })
$iconStream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($iconStream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i=0; $i -lt $sizes.Count; $i++) {
        $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
        $offset += $frames[$i].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
    $writer.Flush()
    [System.IO.File]::WriteAllBytes((Join-Path $brandRoot 'electron/assets/deskmate-dm.ico'), $iconStream.ToArray())
} finally { $writer.Dispose(); $iconStream.Dispose() }
Write-Output 'T26A approved brand PNGs and nine-size Windows ICO generated.'
