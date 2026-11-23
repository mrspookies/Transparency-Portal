$ws = New-Object -ComObject WScript.Shell
$root = "E:\SpookyVault\MOVE\TRANSPARENCY_PORTAL\transparency-portal"
$desktop = [Environment]::GetFolderPath('Desktop')

$admin = $ws.CreateShortcut((Join-Path $desktop "Transparency Portal Admin.lnk"))
$admin.TargetPath = Join-Path $root "transparency-admin.bat"
$admin.WorkingDirectory = $root
$admin.IconLocation = Join-Path $root "tp_icon.ico"
$admin.Description = "Open the Transparency Portal admin console"
$admin.Save()

$portal = $ws.CreateShortcut((Join-Path $desktop "Transparency Portal.lnk"))
$portal.TargetPath = Join-Path $root "transparency-portal.bat"
$portal.WorkingDirectory = $root
$portal.IconLocation = Join-Path $root "tp_icon.ico"
$portal.Description = "Open the Transparency Portal exit plan"
$portal.Save()

Write-Output ("created: " + (Join-Path $desktop "Transparency Portal Admin.lnk"))
Write-Output ("created: " + (Join-Path $desktop "Transparency Portal.lnk"))
