param(
    [Parameter(Mandatory = $true)]
    [string]$BuildDirectory,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$repositoryDirectory = (Resolve-Path (Join-Path $projectDirectory '..\..')).Path
$resolvedBuildDirectory = (Resolve-Path $BuildDirectory).Path

$head = (& git -C $repositoryDirectory rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40}$') {
    throw 'Unable to resolve the repository HEAD.'
}
$shortHead = (& git -C $repositoryDirectory rev-parse --short=7 HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $shortHead -notmatch '^[0-9a-f]{7}$') {
    throw 'Unable to resolve the short repository HEAD.'
}
$status = (& git -C $repositoryDirectory status --porcelain=v1)
if ($LASTEXITCODE -ne 0 -or $status) {
    throw 'Release manifests may only be generated from a clean worktree.'
}

$idfVersion = (& idf.py --version).Trim()
if ($LASTEXITCODE -ne 0 -or $idfVersion -ne 'ESP-IDF v5.5.5') {
    throw "Expected ESP-IDF v5.5.5, got '$idfVersion'."
}

$descriptionPath = Join-Path $resolvedBuildDirectory 'project_description.json'
$description = Get-Content -Raw $descriptionPath | ConvertFrom-Json
if ($description.target -ne 'esp32s3') {
    throw "Expected esp32s3 build target, got '$($description.target)'."
}
$resolvedProjectPath = (Resolve-Path $description.project_path).Path
if ($resolvedProjectPath -ne (Resolve-Path $projectDirectory).Path) {
    throw "Build directory belongs to a different project: '$resolvedProjectPath'."
}
if ((Resolve-Path $description.build_dir).Path -ne $resolvedBuildDirectory) {
    throw "Build metadata points to a different build directory: '$($description.build_dir)'."
}
if ($description.project_name -ne 'deskmate_easyinput_controller') {
    throw "Unexpected project name '$($description.project_name)'."
}
if ($description.project_version -ne $shortHead) {
    throw "Build app version '$($description.project_version)' does not match clean HEAD '$shortHead'. Rebuild before generating a release manifest."
}

$appPath = Join-Path $resolvedBuildDirectory 'deskmate_easyinput_controller.bin'
$partitionPath = Join-Path $resolvedBuildDirectory 'partition_table\partition-table.bin'
$app = Get-Item $appPath
$appOffset = 0x10000L
$appEndInclusive = $appOffset + $app.Length - 1L

$manifest = [ordered]@{
    schema = 'deskmate-easyinput-release-manifest-v1'
    head = $head
    idf_version = $idfVersion
    target = $description.target
    app_version = $description.project_version
    build_command = 'idf.py -C firmware/easyinput-controller build'
    app_offset = ('0x{0:X6}' -f $appOffset)
    app_size_bytes = $app.Length
    app_size_hex = ('0x{0:X}' -f $app.Length)
    app_end_inclusive = ('0x{0:X6}' -f $appEndInclusive)
    app_sha256 = (Get-FileHash -Algorithm SHA256 $appPath).Hash
    partition_sha256 = (Get-FileHash -Algorithm SHA256 $partitionPath).Hash
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
    New-Item -ItemType Directory -Force $outputDirectory | Out-Null
}
$manifest | ConvertTo-Json | Set-Content -Encoding utf8 $OutputPath
Write-Output "RELEASE_MANIFEST=$OutputPath"
