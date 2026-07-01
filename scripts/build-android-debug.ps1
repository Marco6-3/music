param(
    [string]$WebUrl = $env:MUSIC_ANDROID_WEB_URL
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot 'android'
$jbr = 'C:\Program Files\Android\Android Studio\jbr'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

if (Test-Path (Join-Path $jbr 'bin\java.exe')) {
    $env:JAVA_HOME = $jbr
    $env:Path = (Join-Path $jbr 'bin') + ';' + $env:Path
}

if (-not $env:ANDROID_HOME -and (Test-Path $sdk)) {
    $env:ANDROID_HOME = $sdk
}
if (-not $env:ANDROID_SDK_ROOT -and (Test-Path $sdk)) {
    $env:ANDROID_SDK_ROOT = $sdk
}

$argsList = @('assembleDebug')
if ($WebUrl) {
    $argsList += "-PmusicWebUrl=$WebUrl"
}

Push-Location $androidDir
try {
    & .\gradlew.bat @argsList
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$apkSource = Join-Path $androidDir 'app\build\outputs\apk\debug\app-debug.apk'
$apkDir = Join-Path $repoRoot 'dist\android'
$apkDest = Join-Path $apkDir 'music-android-debug.apk'

New-Item -ItemType Directory -Force -Path $apkDir | Out-Null
Copy-Item -LiteralPath $apkSource -Destination $apkDest -Force

Write-Host "Android debug APK: $apkDest"
