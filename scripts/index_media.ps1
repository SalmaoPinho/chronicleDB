# scripts/index_media.ps1 - Automates image_index.json generation (Recursive + Global Index)
# Handles structured Year Manifests (e.g., 2026/image_index.json { portraits, outfits, groups }).
# Includes support for .mp4, .mov, and .webm videos.

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
$picturesDir = Join-Path $projectRoot "pictures"
$globalIndexFile = Join-Path $picturesDir "global_asset_index.json"

Write-Host "Scanning directories recursively in $picturesDir..." -ForegroundColor Cyan

if (-not (Test-Path $picturesDir)) {
    Write-Error "Could not find $picturesDir directory!"
    return
}

$mediaExtensions = @(".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".mp4", ".mov", ".webm")
$allAssetPaths = New-Object System.Collections.Generic.List[string]

# Clear existing manifests first to ensure a clean state
Get-ChildItem -Path $picturesDir -Filter "image_index.json" -Recurse | Remove-Item -Force

# Recursively find ALL subdirectories
$allDirs = Get-ChildItem -Path $picturesDir -Directory -Recurse
$allDirs += Get-Item -Path $picturesDir

foreach ($dir in $allDirs) {
    $dirName = $dir.Name
    $dirRelativePath = $dir.FullName.Replace($projectRoot, "").TrimStart("\").Replace("\", "/")
    $outputPath = Join-Path $dir.FullName "image_index.json"

    # Identify if this is a "Year Folder" (e.g., pictures/2026)
    $isYearFolder = $dirName -match "^\d{4}$" -and $dir.Parent.Name -eq "pictures"
    
    if ($isYearFolder) {
        Write-Host "Creating Year Manifest for $dirRelativePath..." -ForegroundColor Cyan
        
        $yearManifest = @{
            portraits = @()
            outfits = @()
            groups = @()
            fieldMedia = @()
        }

        # Subfolders
        foreach ($sub in "portraits", "outfits", "groups") {
            $subPath = Join-Path $dir.FullName $sub
            if (Test-Path $subPath) {
                $files = Get-ChildItem -Path $subPath -File | Where-Object { $mediaExtensions -contains $_.Extension.ToLower() } | Select-Object -ExpandProperty Name
                $yearManifest.$sub = @($files)
                foreach ($f in $files) { $allAssetPaths.Add("$dirRelativePath/$sub/$f") }
            }
        }

        # Root files
        $rootFiles = Get-ChildItem -Path $dir.FullName -File | Where-Object { $mediaExtensions -contains $_.Extension.ToLower() } | Select-Object -ExpandProperty Name
        $yearManifest.fieldMedia = @($rootFiles)
        foreach ($f in $rootFiles) { $allAssetPaths.Add("$dirRelativePath/$f") }

        $json = ConvertTo-Json $yearManifest -Compress
        $json | Out-File -FilePath $outputPath -Encoding utf8 -NoNewline
        $allAssetPaths.Add("$dirRelativePath/image_index.json")
    } else {
        # Skip sub-folders of years to avoid redundant flat manifests
        if ($dir.Parent.Name -match "^\d{4}$" -and $dir.Parent.Parent.Name -eq "pictures") {
            continue
        }

        $files = Get-ChildItem -Path $dir.FullName -File | Where-Object { $mediaExtensions -contains $_.Extension.ToLower() } | Select-Object -ExpandProperty Name
        
        if ($files.Count -gt 0) {
            $json = ConvertTo-Json @($files) -Compress
            $json | Out-File -FilePath $outputPath -Encoding utf8 -NoNewline
            
            foreach ($file in $files) { $allAssetPaths.Add("$dirRelativePath/$file") }
            $allAssetPaths.Add("$dirRelativePath/image_index.json")
        }
    }
}

# Final: Sync the global asset index
Write-Host "Syncing Global Asset Index..." -ForegroundColor Cyan
$globalJson = ConvertTo-Json @($allAssetPaths) -Compress
$globalJson | Out-File -FilePath $globalIndexFile -Encoding utf8 -NoNewline
Write-Host "Index complete: $($allAssetPaths.Count) assets." -ForegroundColor Green
