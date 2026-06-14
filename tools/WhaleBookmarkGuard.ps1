<#
.SYNOPSIS
  Naver Whale bookmark inspection and cleanup guard.
.DESCRIPTION
  Finds Whale profiles, backs up bookmark data, reports suspicious extensions,
  saves an allowlist, removes bookmarks not in that allowlist, and optionally
  installs a per-user scheduled task.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('report', 'init', 'clean', 'install-task')]
  [string]$Mode,

  [string]$UserDataPath = (Join-Path $env:LOCALAPPDATA 'Naver\Naver Whale\User Data'),
  [string]$GuardRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'WhaleBookmarkGuard')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BackupDir = Join-Path $GuardRoot 'backup'
$LogDir = Join-Path $GuardRoot 'logs'
$AllowlistPath = Join-Path $GuardRoot 'allowlist.json'
$RemovedCandidatesPath = Join-Path $GuardRoot 'removed_candidates.json'
$TaskName = 'WhaleBookmarkGuard'

function Initialize-GuardDirectories {
  foreach ($path in @($GuardRoot, $BackupDir, $LogDir)) {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
  }
}

function Write-GuardLog {
  param([string]$Message, [string]$Level = 'INFO')
  $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
  Write-Host $line
  Add-Content -LiteralPath (Join-Path $LogDir ('guard-{0}.log' -f (Get-Date -Format 'yyyyMMdd'))) -Value $line -Encoding UTF8
}

function ConvertFrom-WhaleTimestamp {
  param($Value)
  try {
    if (-not $Value) { return $null }
    return ([DateTime]'1601-01-01T00:00:00Z').AddSeconds(([Int64]$Value) / 1000000).ToLocalTime()
  } catch { return $null }
}

function ConvertTo-StableJson {
  param([Parameter(ValueFromPipeline = $true)]$InputObject)
  $InputObject | ConvertTo-Json -Depth 100
}

function Read-JsonFile {
  param([string]$Path)
  (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

function Save-JsonAtomic {
  param([object]$Data, [string]$Path)
  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $tmp = '{0}.{1}.tmp' -f $Path, ([Guid]::NewGuid().ToString('N'))
  $Data | ConvertTo-StableJson | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Get-WhaleProfiles {
  if (-not (Test-Path -LiteralPath $UserDataPath)) {
    Write-GuardLog "Whale user data path not found: $UserDataPath" 'WARN'
    return @()
  }
  Get-ChildItem -LiteralPath $UserDataPath -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'Bookmarks') } |
    Sort-Object Name |
    ForEach-Object {
      [pscustomobject]@{
        Name = $_.Name
        Path = $_.FullName
        BookmarksPath = Join-Path $_.FullName 'Bookmarks'
        ExtensionsPath = Join-Path $_.FullName 'Extensions'
        PreferencesPath = Join-Path $_.FullName 'Preferences'
      }
    }
}

function Backup-WhaleFiles {
  param([object[]]$Profiles)
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  foreach ($profile in $Profiles) {
    $safeProfile = $profile.Name -replace '[^A-Za-z0-9._-]', '_'
    foreach ($file in @($profile.BookmarksPath, $profile.PreferencesPath)) {
      if (Test-Path -LiteralPath $file) {
        $name = '{0}-{1}-{2}' -f $stamp, $safeProfile, (Split-Path -Leaf $file)
        Copy-Item -LiteralPath $file -Destination (Join-Path $BackupDir $name) -Force
      }
    }
  }
  Write-GuardLog "Backed up profile files to $BackupDir"
}

function Get-BookmarkEntries {
  param([object]$Node, [string]$FolderPath = '')
  $entries = New-Object System.Collections.Generic.List[object]
  if ($null -eq $Node) { return $entries }
  if ($Node.type -eq 'url') {
    $entries.Add([pscustomobject]@{
      id = $Node.id
      title = [string]$Node.name
      url = [string]$Node.url
      folderPath = $FolderPath
      dateAdded = ConvertFrom-WhaleTimestamp $Node.date_added
      key = ('{0}|{1}|{2}' -f $Node.url, $Node.name, $FolderPath)
    })
  } elseif ($Node.children) {
    $nextFolder = if ($FolderPath) { Join-Path $FolderPath ([string]$Node.name) } else { [string]$Node.name }
    foreach ($child in @($Node.children)) { $entries.AddRange((Get-BookmarkEntries -Node $child -FolderPath $nextFolder)) }
  }
  return $entries
}

function Get-BookmarksForProfile {
  param([object]$Profile)
  $json = Read-JsonFile $Profile.BookmarksPath
  $entries = New-Object System.Collections.Generic.List[object]
  foreach ($rootName in $json.roots.PSObject.Properties.Name) {
    $entries.AddRange((Get-BookmarkEntries -Node $json.roots.$rootName -FolderPath $rootName))
  }
  return [pscustomobject]@{ Json = $json; Entries = @($entries) }
}

function Get-ExtensionReport {
  param([object]$Profile)
  $prefExtensions = @{}
  if (Test-Path -LiteralPath $Profile.PreferencesPath) {
    try {
      $prefs = Read-JsonFile $Profile.PreferencesPath
      if ($prefs.extensions.settings) {
        foreach ($property in $prefs.extensions.settings.PSObject.Properties) { $prefExtensions[$property.Name] = $property.Value }
      }
    } catch { Write-GuardLog "Could not parse Preferences for $($Profile.Name): $_" 'WARN' }
  }

  $results = New-Object System.Collections.Generic.List[object]
  if (Test-Path -LiteralPath $Profile.ExtensionsPath) {
    Get-ChildItem -LiteralPath $Profile.ExtensionsPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $extensionId = $_.Name
      $versionDir = Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
      $manifest = $null
      $manifestPath = if ($versionDir) { Join-Path $versionDir.FullName 'manifest.json' } else { $null }
      if ($manifestPath -and (Test-Path -LiteralPath $manifestPath)) {
        try { $manifest = Read-JsonFile $manifestPath } catch { Write-GuardLog "Could not parse manifest: $manifestPath" 'WARN' }
      }
      $pref = $prefExtensions[$extensionId]
      $permissions = @()
      if ($manifest -and $manifest.permissions) { $permissions += @($manifest.permissions) }
      if ($manifest -and $manifest.optional_permissions) { $permissions += @($manifest.optional_permissions) }
      if ($pref -and $pref.permissions.api) { $permissions += @($pref.permissions.api) }
      $permissions = @($permissions | Where-Object { $_ } | Sort-Object -Unique)
      $results.Add([pscustomobject]@{
        profile = $Profile.Name
        id = $extensionId
        name = if ($manifest.name) { $manifest.name } elseif ($pref.manifest.name) { $pref.manifest.name } else { '(unknown)' }
        version = if ($manifest.version) { $manifest.version } elseif ($pref.manifest.version) { $pref.manifest.version } else { '(unknown)' }
        enabled = if ($null -ne $pref.state) { $pref.state -eq 1 } else { $null }
        permissions = $permissions
        suspicious = @($permissions) -contains 'bookmarks'
      })
    }
  }
  return @($results)
}

function Invoke-Report {
  param([object[]]$Profiles)
  foreach ($profile in $Profiles) {
    $bookmarks = Get-BookmarksForProfile -Profile $profile
    Write-GuardLog "Profile: $($profile.Name) ($($profile.Path))"
    Write-GuardLog "Bookmark count: $($bookmarks.Entries.Count)"
    $recent = @($bookmarks.Entries | Where-Object { $_.dateAdded } | Sort-Object dateAdded -Descending | Select-Object -First 20)
    if ($recent.Count -gt 0) {
      Write-Host 'Recent bookmarks:'
      $recent | Select-Object dateAdded,title,url,folderPath | Format-Table -AutoSize
    }
    $extensions = Get-ExtensionReport -Profile $profile
    if ($extensions.Count -gt 0) {
      Write-Host 'Extensions (* means has bookmarks permission):'
      $extensions | Select-Object @{n='flag';e={if ($_.suspicious) {'*'} else {''}}},enabled,name,version,id,@{n='permissions';e={$_.permissions -join ','}} | Format-Table -AutoSize
    }
  }
}

function Invoke-Init {
  param([object[]]$Profiles)
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($profile in $Profiles) {
    $bookmarks = Get-BookmarksForProfile -Profile $profile
    foreach ($entry in $bookmarks.Entries) {
      $items.Add([pscustomobject]@{ profile = $profile.Name; url = $entry.url; title = $entry.title; folderPath = $entry.folderPath; key = $entry.key })
    }
  }
  $allowlist = [pscustomobject]@{ createdAt = (Get-Date).ToString('o'); userDataPath = $UserDataPath; items = @($items) }
  Save-JsonAtomic -Data $allowlist -Path $AllowlistPath
  Write-GuardLog "Saved allowlist with $($items.Count) bookmarks: $AllowlistPath"
}

function Remove-UnallowedFromNode {
  param([object]$Node, [hashtable]$AllowedKeys, [string]$FolderPath, [System.Collections.Generic.List[object]]$Removed)
  if (-not $Node.children) { return }
  $nextFolder = if ($FolderPath) { Join-Path $FolderPath ([string]$Node.name) } else { [string]$Node.name }
  $kept = @()
  foreach ($child in @($Node.children)) {
    if ($child.type -eq 'url') {
      $key = '{0}|{1}|{2}' -f $child.url, $child.name, $nextFolder
      if ($AllowedKeys.ContainsKey($key)) { $kept += $child } else {
        $Removed.Add([pscustomobject]@{ title = $child.name; url = $child.url; folderPath = $nextFolder; dateAdded = ConvertFrom-WhaleTimestamp $child.date_added; key = $key })
      }
    } else {
      Remove-UnallowedFromNode -Node $child -AllowedKeys $AllowedKeys -FolderPath $nextFolder -Removed $Removed
      $kept += $child
    }
  }
  $Node.children = @($kept)
}

function Invoke-Clean {
  param([object[]]$Profiles)
  if (-not (Test-Path -LiteralPath $AllowlistPath)) { throw "allowlist.json not found. Run init after manually cleaning bookmarks first: $AllowlistPath" }
  if (Get-Process -Name 'whale' -ErrorAction SilentlyContinue) { throw 'Naver Whale is running. Close Whale completely, then run clean again.' }
  $allowlist = Read-JsonFile $AllowlistPath
  $allowed = @{}
  foreach ($item in @($allowlist.items)) { $allowed[[string]$item.key] = $true }

  $allRemoved = New-Object System.Collections.Generic.List[object]
  foreach ($profile in $Profiles) {
    $bookmarks = Get-BookmarksForProfile -Profile $profile
    $beforeCount = $bookmarks.Entries.Count
    $removed = New-Object System.Collections.Generic.List[object]
    foreach ($rootName in $bookmarks.Json.roots.PSObject.Properties.Name) {
      Remove-UnallowedFromNode -Node $bookmarks.Json.roots.$rootName -AllowedKeys $allowed -FolderPath $rootName -Removed $removed
    }
    if ($removed.Count -ge $beforeCount -and $beforeCount -gt 0) { throw "Safety stop: clean would remove all bookmarks from profile $($profile.Name). No files changed." }
    foreach ($entry in $removed) { $allRemoved.Add([pscustomobject]@{ profile = $profile.Name; title = $entry.title; url = $entry.url; folderPath = $entry.folderPath; dateAdded = $entry.dateAdded; key = $entry.key }) }
    if ($removed.Count -gt 0) {
      Save-JsonAtomic -Data $bookmarks.Json -Path $profile.BookmarksPath
      Write-GuardLog "Removed $($removed.Count) unallowed bookmarks from $($profile.Name)."
    } else { Write-GuardLog "No unallowed bookmarks found in $($profile.Name)." }
  }
  Save-JsonAtomic -Data ([pscustomobject]@{ generatedAt = (Get-Date).ToString('o'); candidates = @($allRemoved) }) -Path $RemovedCandidatesPath
  Write-GuardLog "Saved removed candidate list: $RemovedCandidatesPath"
}

function Install-ScheduledTask {
  $installedScript = Join-Path $GuardRoot 'WhaleBookmarkGuard.ps1'
  Copy-Item -LiteralPath $PSCommandPath -Destination $installedScript -Force
  $powershell = Join-Path $PSHOME 'powershell.exe'
  if (-not (Test-Path -LiteralPath $powershell)) { $powershell = 'powershell.exe' }
  $action = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" clean' -f $installedScript)
  $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
  $repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logonTrigger, $repeatTrigger) -Principal $principal -Settings $settings -Description 'Clean Naver Whale bookmarks that are not in WhaleBookmarkGuard allowlist.' -Force | Out-Null
  Write-GuardLog "Installed or updated scheduled task: $TaskName"
}

Initialize-GuardDirectories
Write-GuardLog "Starting mode: $Mode"
$profiles = @(Get-WhaleProfiles)
if ($profiles.Count -eq 0) { Write-GuardLog 'No Whale profiles with Bookmarks files were found.' 'WARN' }
Backup-WhaleFiles -Profiles $profiles

switch ($Mode) {
  'report' { Invoke-Report -Profiles $profiles }
  'init' { Invoke-Init -Profiles $profiles }
  'clean' { Invoke-Clean -Profiles $profiles }
  'install-task' { Install-ScheduledTask }
}
Write-GuardLog "Finished mode: $Mode"
