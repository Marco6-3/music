param(
    [string]$WebUrl = $env:MUSIC_ANDROID_WEB_URL,
    [string]$KeystorePath = $env:MUSIC_ANDROID_KEYSTORE,
    [string]$StorePassword = $env:MUSIC_ANDROID_STORE_PASSWORD,
    [string]$KeyAlias = $env:MUSIC_ANDROID_KEY_ALIAS,
    [string]$KeyPassword = $env:MUSIC_ANDROID_KEY_PASSWORD
)

$ErrorActionPreference = 'Stop'

function New-Password {
    return (([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')).Substring(0, 32))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot 'android'
$jbr = 'C:\Program Files\Android\Android Studio\jbr'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$signingProperties = Join-Path $androidDir 'signing.properties'
$usingDefaultKeystore = -not $KeystorePath

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

if (-not $KeystorePath) {
    $KeystorePath = Join-Path $androidDir 'music-release-local.jks'
}
if (Test-Path $signingProperties) {
    foreach ($line in Get-Content -LiteralPath $signingProperties) {
        if ($line -notmatch '^\s*([^#=]+?)\s*=\s*(.*)\s*$') {
            continue
        }
        $name = $Matches[1].Trim()
        $value = $Matches[2].Trim()
        if ($name -eq 'storeFile' -and -not $env:MUSIC_ANDROID_KEYSTORE) {
            $KeystorePath = $value
        } elseif ($name -eq 'storePassword' -and -not $env:MUSIC_ANDROID_STORE_PASSWORD) {
            $StorePassword = $value
        } elseif ($name -eq 'keyAlias' -and -not $env:MUSIC_ANDROID_KEY_ALIAS) {
            $KeyAlias = $value
        } elseif ($name -eq 'keyPassword' -and -not $env:MUSIC_ANDROID_KEY_PASSWORD) {
            $KeyPassword = $value
        }
    }
}
if (-not $StorePassword) {
    $StorePassword = New-Password
}
if (-not $KeyPassword) {
    $KeyPassword = $StorePassword
}
if (-not $KeyAlias) {
    $KeyAlias = 'music-release'
}

$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path $keytool)) {
    $keytool = 'keytool'
}

$keystoreNeedsCreate = -not (Test-Path $KeystorePath)
if (-not $keystoreNeedsCreate -and $usingDefaultKeystore) {
    & $keytool -list -keystore $KeystorePath -storepass $StorePassword -alias $KeyAlias *> $null
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $KeystorePath -Force
        $keystoreNeedsCreate = $true
    }
}

if ($keystoreNeedsCreate) {
    $keystoreDir = Split-Path -Parent $KeystorePath
    if ($keystoreDir) {
        New-Item -ItemType Directory -Force -Path $keystoreDir | Out-Null
    }
    & $keytool -genkeypair `
        -keystore $KeystorePath `
        -storetype PKCS12 `
        -storepass $StorePassword `
        -keypass $KeyPassword `
        -alias $KeyAlias `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -dname "CN=music Android,O=music,C=CN"
    if ($LASTEXITCODE -ne 0) {
        throw "keytool failed with exit code $LASTEXITCODE"
    }
}

$storeFileForProperties = (Resolve-Path -LiteralPath $KeystorePath).Path.Replace('\', '/')
$signingContent = @"
storeFile=$storeFileForProperties
storePassword=$StorePassword
keyAlias=$KeyAlias
keyPassword=$KeyPassword
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($signingProperties, $signingContent, $utf8NoBom)

$argsList = @('assembleRelease')
if ($WebUrl) {
    $argsList += "-PmusicWebUrl=$WebUrl"
}

Push-Location $androidDir
try {
    & .\gradlew.bat @argsList
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle release build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$releaseDir = Join-Path $androidDir 'app\build\outputs\apk\release'
$apkSource = Join-Path $releaseDir 'app-release.apk'
if (-not (Test-Path $apkSource)) {
    $fallbackApk = Get-ChildItem -Path $releaseDir -Filter '*.apk' |
        Where-Object { $_.Name -notmatch 'unsigned' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($fallbackApk) {
        $apkSource = $fallbackApk.FullName
    }
}
if (-not (Test-Path $apkSource) -or (Split-Path -Leaf $apkSource) -match 'unsigned') {
    throw "Signed release APK was not produced. Check android/signing.properties and Gradle signingConfig."
}
$apkDir = Join-Path $repoRoot 'dist\android'
$apkDest = Join-Path $apkDir 'music-android-release.apk'

New-Item -ItemType Directory -Force -Path $apkDir | Out-Null
Copy-Item -LiteralPath $apkSource -Destination $apkDest -Force

Write-Host "Android release APK: $apkDest"
Write-Host "Signing config: $signingProperties"
