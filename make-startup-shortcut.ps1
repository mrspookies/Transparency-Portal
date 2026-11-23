$ws = New-Object -ComObject WScript.Shell
$link = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\TransparencyPortalServer.lnk"
$s = $ws.CreateShortcut($link)
$s.TargetPath = "E:\SpookyVault\MOVE\TRANSPARENCY_PORTAL\transparency-portal\start-server-hidden.vbs"
$s.WorkingDirectory = "E:\SpookyVault\MOVE\TRANSPARENCY_PORTAL\transparency-portal"
$s.Description = "Auto-starts the Transparency Portal backend server at login"
$s.Save()
Write-Output ("shortcut created: " + $link)
