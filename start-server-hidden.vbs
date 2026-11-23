' Transparency Portal - launch the backend server hidden at login.
' A shortcut to this file lives in the Windows Startup folder.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = dir & "\start-server-hidden.bat"
sh.Run "cmd /c """ & batPath & """", 0, False
