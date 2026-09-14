param([string]$SourceDirectory = 'C:/Users/Administrator/Downloads')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $projectRoot 'public/assets/companion/home-video'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$items = @(@('等待','idle'), @('倾听','listen'), @('思考','think'), @('说话','speak'))
$records = foreach ($item in $items) {
  $source = Join-Path $SourceDirectory ($item[0] + '.mp4')
  $output = Join-Path $destination ($item[1] + '.mp4')
  $inputInfo = (& ffprobe -v error -show_streams -show_format -of json $source | Out-String | ConvertFrom-Json)
  $video = $inputInfo.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
  if ([Math]::Abs($video.width / $video.height - 4/3) -gt 0.001) { throw 'Source must be 4:3; do not silently crop or stretch.' }
  & ffmpeg -hide_banner -loglevel error -i $source -map 0:v:0 -an -sn -dn -map_metadata -1 -vf 'scale=960:720:flags=lanczos,setsar=1' -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -y $output
  if ($LASTEXITCODE -ne 0) { throw "Transcode failed: $($item[1])" }
  $outputInfo = (& ffprobe -v error -show_streams -show_format -of json $output | Out-String | ConvertFrom-Json)
  if ($outputInfo.streams.Count -ne 1 -or $outputInfo.streams[0].codec_type -ne 'video') { throw 'Output must contain video only.' }
  [ordered]@{state=$item[1]; sourceName=($item[0]+'.mp4'); sourceSha256=(Get-FileHash $source -Algorithm SHA256).Hash; sourceBytes=(Get-Item $source).Length; file=($item[1]+'.mp4'); sha256=(Get-FileHash $output -Algorithm SHA256).Hash; bytes=(Get-Item $output).Length; duration=[double]$outputInfo.format.duration; width=960; height=720; fps=24; audio=$false}
}
& ffmpeg -hide_banner -loglevel error -i (Join-Path $destination 'idle.mp4') -frames:v 1 -y (Join-Path $destination 'poster.jpg')
if ($LASTEXITCODE -ne 0) { throw 'Poster extraction failed.' }
[ordered]@{version=1; provenance='User-supplied generated companion clips, authorized for DeskMate on 2026-09-13. Originals remain untouched outside the repository.'; transform='H.264 CRF23, 960x720, square pixels, video-only, faststart'; clips=@($records)} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding utf8
$records | Format-Table state,bytes,duration,width,height
