$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
function Resize-Asset([string]$Source, [string]$Destination, [int]$Width, [int]$Height) {
  $inputImage = [System.Drawing.Image]::FromFile((Join-Path $projectRoot $Source))
  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($inputImage, 0, 0, $Width, $Height)
    $outputPath = Join-Path $projectRoot $Destination
    [System.IO.Directory]::CreateDirectory((Split-Path $outputPath -Parent)) | Out-Null
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose(); $inputImage.Dispose() }
}
Resize-Asset 'design/characters/t35/home-desk-open-source.png' 'public/assets/companion/home-desk/open.png' 1152 768
Resize-Asset 'design/characters/t35/home-desk-blink-source.png' 'public/assets/companion/home-desk/blink.png' 1152 768
Resize-Asset 'design/characters/t35/sidebar-open-source.png' 'public/assets/expressions/soft/transparent-open.png' 256 256
Resize-Asset 'design/characters/t35/sidebar-closed-source.png' 'public/assets/expressions/soft/transparent-closed.png' 256 256
