<#
.SYNOPSIS
    Stáhne denní zálohy (DB dump + archiv uploads) z produkčního serveru na tento počítač.

.DESCRIPTION
    Off-site kopie záloh, které na serveru každou noc vytváří cron (npm run backup:all, 3:00)
    do /home/reathyze/backups/cabin/{db,uploads}. Cron instaluje deploy workflow.

    - stahuje jen soubory, které lokálně chybí (nebo mají jinou velikost),
    - přeskočí soubory mladší 10 minut (záloha se možná ještě zapisuje),
    - každý stažený soubor ověří přes SHA-256 proti serveru,
    - lokálně drží zálohy KeepDays dní, vždy ale nejméně MinKeep nejnovějších od každého druhu,
    - upozorní, když je nejnovější záloha starší než StaleHours (server přestal zálohovat?).

    Exit kódy: 0 = OK, 1 = chyba (server nedostupný, nesedí hash...), 2 = zálohy jsou staré nebo chybí.

    Soubor je uložený jako UTF-8 s BOM, aby Windows PowerShell 5.1 správně načetl diakritiku.

.EXAMPLE
    .\manual-pull-backups.ps1 -ServerHost 203.0.113.10

    Používá BatchMode (žádné dotazy na heslo), takže klíč musí fungovat bez hesla/přes ssh-agent
    a host key serveru musí být v known_hosts — poprvé se na server připoj ručně: ssh reathyze@IP

.EXAMPLE
    # jednorázové stažení + registrace denní úlohy v Plánovači úloh
    .\manual-pull-backups.ps1 -ServerHost 203.0.113.10 -InstallScheduledTask
#>
param(
    [Parameter(Mandatory = $true)][string]$ServerHost,
    [string]$ServerUser = "reathyze",
    [int]$Port = 22,
    [string]$RemoteBackupRoot = "/home/reathyze/backups/cabin",
    [string]$LocalRoot = (Join-Path $env:USERPROFILE "chata-zalohy"),
    [int]$KeepDays = 30,
    [int]$MinKeep = 3,
    [int]$StaleHours = 48,
    [string]$IdentityFile,
    [string[]]$SshOption = @(),
    [switch]$Notify,
    [switch]$InstallScheduledTask,
    [string]$TaskTime = "12:00",
    [string]$TaskName = "Chata - stažení záloh"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$kinds = @(
    @{ Name = "db"; Pattern = "*.dump" },
    @{ Name = "uploads"; Pattern = "*.tar.gz" }
)
$sshTarget = "$ServerUser@$ServerHost"
$sshOptions = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "ServerAliveInterval=30")
if ($IdentityFile) {
    $sshOptions += @("-i", $IdentityFile, "-o", "IdentitiesOnly=yes")
}
foreach ($option in $SshOption) {
    $sshOptions += @("-o", $option)
}
$logPath = Join-Path $LocalRoot "pull-backups.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Write-Host $line
    Add-Content -Path $logPath -Value $line -Encoding UTF8
}

function Show-Alert {
    param([string]$Message)
    if (-not $Notify.IsPresent) { return }
    try {
        Add-Type -AssemblyName System.Windows.Forms, System.Drawing
        $icon = New-Object System.Windows.Forms.NotifyIcon
        $icon.Icon = [System.Drawing.SystemIcons]::Warning
        $icon.Visible = $true
        $icon.ShowBalloonTip(15000, "Zálohy chaty", $Message, [System.Windows.Forms.ToolTipIcon]::Warning)
        Start-Sleep -Seconds 15
        $icon.Dispose()
    } catch {
        Write-Log "Notifikaci se nepodařilo zobrazit: $($_.Exception.Message)" "WARN"
    }
}

function ConvertTo-ShSingleQuoted {
    param([Parameter(Mandatory = $true)][string]$Value)
    return "'" + $Value.Replace("'", "'`"'`"'") + "'"
}

# Skript pošleme jako base64, ať se nepereme s quotováním mezi PowerShellem, ssh.exe a vzdáleným shellem.
function Invoke-RemoteSh {
    param([Parameter(Mandatory = $true)][string]$Script)
    $normalized = $Script.Replace("`r`n", "`n")
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($normalized))
    $output = & ssh @sshOptions -p $Port $sshTarget "printf '%s' '$encoded' | base64 -d | sh -s"
    if ($LASTEXITCODE -ne 0) {
        throw "Vzdálený příkaz na $sshTarget selhal (exit $LASTEXITCODE)."
    }
    return @($output | Where-Object { $_ -and $_.Trim().Length -gt 0 })
}

function Install-PullTask {
    $argList = @(
        "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
        "-File", "`"$PSCommandPath`"",
        "-ServerHost", "`"$ServerHost`"",
        "-ServerUser", "`"$ServerUser`"",
        "-Port", $Port,
        "-RemoteBackupRoot", "`"$RemoteBackupRoot`"",
        "-LocalRoot", "`"$LocalRoot`"",
        "-KeepDays", $KeepDays,
        "-MinKeep", $MinKeep,
        "-StaleHours", $StaleHours,
        "-Notify"
    )
    if ($IdentityFile) { $argList += @("-IdentityFile", "`"$IdentityFile`"") }
    foreach ($option in $SshOption) { $argList += @("-SshOption", "`"$option`"") }
    $argList = $argList -join " "

    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argList -WorkingDirectory $LocalRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At $TaskTime
    # PC neběží pořád: StartWhenAvailable doběhne zmeškané spuštění hned, jak to půjde.
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
        -Principal $principal -Force `
        -Description "Stahuje denní zálohy chaty z $sshTarget`:$RemoteBackupRoot do $LocalRoot." | Out-Null

    Write-Log "Naplánovaná úloha '$TaskName' zaregistrována (denně v $TaskTime, zmeškané spuštění se doběhne)."
}

function Invoke-Pull {
    $errors = New-Object System.Collections.Generic.List[string]
    $rootQuoted = ConvertTo-ShSingleQuoted -Value $RemoteBackupRoot

    $listScript = @"
set -eu
cd $rootQuoted 2>/dev/null || { echo "Na serveru chybí adresář se zálohami: $RemoteBackupRoot" >&2; exit 3; }
for dir in db uploads; do
  [ -d "`$dir" ] || continue
  find "`$dir" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.tar.gz' \) -mmin +10 | while IFS= read -r f; do
    printf '%s\t%s\n' "`$f" "`$(wc -c < "`$f" | tr -d ' ')"
  done
done
"@

    $remoteFiles = @()
    foreach ($line in (Invoke-RemoteSh -Script $listScript)) {
        $parts = $line -split "`t"
        if ($parts.Count -ne 2) { continue }
        $relative = $parts[0].Trim()
        if ($relative -notmatch '^(db|uploads)/[A-Za-z0-9._-]+$') {
            Write-Log "Přeskakuji neočekávaný název souboru ze serveru: $relative" "WARN"
            continue
        }
        $remoteFiles += [pscustomobject]@{ Relative = $relative; Size = [int64]$parts[1] }
    }
    Write-Log "Na serveru je $($remoteFiles.Count) záloh."

    $toDownload = @()
    $keepCutoff = (Get-Date).Date.AddDays(-$KeepDays)
    foreach ($file in $remoteFiles) {
        # Co by lokální prune hned zase smazal, nestahujeme (jinak by se to točilo dokola).
        if ($file.Relative -match '_(\d{4}-\d{2}-\d{2})T' -and [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd', $null) -lt $keepCutoff) {
            continue
        }

        $localPath = Join-Path $LocalRoot ($file.Relative -replace '/', '\')
        if ((Test-Path -LiteralPath $localPath) -and ((Get-Item -LiteralPath $localPath).Length -eq $file.Size)) {
            continue
        }
        $toDownload += $file
    }

    if ($toDownload.Count -eq 0) {
        Write-Log "Nic nového ke stažení."
        return $errors
    }

    # Hash jen pro nové soubory (hashovat všechny archivy denně by zbytečně zatěžovalo malý VPS).
    $hashArgs = ($toDownload | ForEach-Object { ConvertTo-ShSingleQuoted -Value $_.Relative }) -join " "
    $remoteHashes = @{}
    foreach ($line in (Invoke-RemoteSh -Script "set -eu`ncd $rootQuoted`nsha256sum $hashArgs")) {
        if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$') {
            $remoteHashes[$Matches[2].Trim()] = $Matches[1].ToUpperInvariant()
        }
    }

    foreach ($file in $toDownload) {
        $kindDir = Join-Path $LocalRoot ($file.Relative.Split('/')[0])
        $fileName = $file.Relative.Split('/')[1]
        $finalPath = Join-Path $kindDir $fileName
        $partName = "$fileName.part"
        $partPath = Join-Path $kindDir $partName

        if (-not $remoteHashes.ContainsKey($file.Relative)) {
            $errors.Add("Chybí SHA-256 ze serveru pro $($file.Relative)")
            continue
        }

        Write-Log ("Stahuji {0} ({1:N1} MB)..." -f $file.Relative, ($file.Size / 1MB))
        Remove-Item -LiteralPath $partPath -Force -ErrorAction SilentlyContinue

        # Relativní cíl: scp by jinak mohl "C:" v lokální cestě vyložit jako hostname.
        Push-Location $kindDir
        try {
            & scp @sshOptions -q -p -P $Port "${sshTarget}:$RemoteBackupRoot/$($file.Relative)" $partName | Out-Host
            $scpExit = $LASTEXITCODE
        } finally {
            Pop-Location
        }

        if ($scpExit -ne 0 -or -not (Test-Path -LiteralPath $partPath)) {
            Remove-Item -LiteralPath $partPath -Force -ErrorAction SilentlyContinue
            $errors.Add("scp selhal pro $($file.Relative) (exit $scpExit)")
            continue
        }

        $localHash = (Get-FileHash -LiteralPath $partPath -Algorithm SHA256).Hash
        if ($localHash -ne $remoteHashes[$file.Relative]) {
            Remove-Item -LiteralPath $partPath -Force
            $errors.Add("Nesedí SHA-256 u $($file.Relative) — soubor smazán, zkusí se příště znovu")
            continue
        }

        Move-Item -LiteralPath $partPath -Destination $finalPath -Force
        Write-Log "OK $($file.Relative) (SHA-256 ověřen)"
    }

    return $errors
}

function Invoke-LocalPrune {
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    foreach ($kind in $kinds) {
        $dir = Join-Path $LocalRoot $kind.Name
        Get-ChildItem -LiteralPath $dir -Filter "*.part" -File -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-12) } |
            Remove-Item -Force

        $files = @(Get-ChildItem -LiteralPath $dir -Filter $kind.Pattern -File | Sort-Object LastWriteTime -Descending)
        $files | Select-Object -Skip $MinKeep | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
            Write-Log "Smazána stará lokální záloha $($kind.Name)/$($_.Name)"
        }
    }
}

function Get-StaleWarnings {
    $warnings = @()
    $threshold = (Get-Date).AddHours(-$StaleHours)
    foreach ($kind in $kinds) {
        $dir = Join-Path $LocalRoot $kind.Name
        # scp -p zachová čas vytvoření zálohy na serveru, takže LastWriteTime = stáří zálohy.
        $newest = Get-ChildItem -LiteralPath $dir -Filter $kind.Pattern -File |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $newest) {
            $warnings += "Lokálně není žádná záloha typu $($kind.Name)."
        } elseif ($newest.LastWriteTime -lt $threshold) {
            $warnings += "Nejnovější záloha $($kind.Name) je z $($newest.LastWriteTime.ToString('d. M. yyyy HH:mm')) — server možná přestal zálohovat."
        }
    }
    return $warnings
}

# --- main ---

foreach ($dir in @($LocalRoot) + ($kinds | ForEach-Object { Join-Path $LocalRoot $_.Name })) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

if ((Test-Path -LiteralPath $logPath) -and ((Get-Item -LiteralPath $logPath).Length -gt 1MB)) {
    Get-Content -LiteralPath $logPath -Tail 2000 -Encoding UTF8 | Set-Content -LiteralPath $logPath -Encoding UTF8
}

Write-Log "Start: $sshTarget`:$RemoteBackupRoot -> $LocalRoot"

if ($InstallScheduledTask.IsPresent) {
    Install-PullTask
}

$exitCode = 0
try {
    $pullErrors = @(Invoke-Pull)
    Invoke-LocalPrune
} catch {
    $pullErrors = @($_.Exception.Message)
}

foreach ($message in $pullErrors) {
    Write-Log $message "ERROR"
}
if ($pullErrors.Count -gt 0) {
    $exitCode = 1
}

$staleWarnings = @(Get-StaleWarnings)
foreach ($message in $staleWarnings) {
    Write-Log $message "WARN"
}
if ($staleWarnings.Count -gt 0 -and $exitCode -eq 0) {
    $exitCode = 2
}

if ($exitCode -ne 0) {
    $summary = (@($pullErrors) + @($staleWarnings) | Select-Object -First 2) -join " "
    Show-Alert -Message "$summary Detail: $logPath"
}

Write-Log "Hotovo (exit $exitCode)."
exit $exitCode
