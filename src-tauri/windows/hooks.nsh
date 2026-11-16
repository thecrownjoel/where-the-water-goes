; NSIS installer hooks (bundle.windows.nsis.installerHooks in tauri.conf.json).
;
; Registers the screensaver: Windows lists every .scr in System32 under
; Settings → Personalization → Lock screen → Screen saver. A .scr is the app's own .exe under
; another name; the app reads /s, /c and /p from its command line (src-tauri/src/launch.rs).
; We only make it available. We never select it or change the user's screensaver settings.
; The installer runs per-machine (installMode "perMachine"), so it can write to System32.

!include x64.nsh

!macro NSIS_HOOK_POSTINSTALL
  ${DisableX64FSRedirection}
  CopyFiles /SILENT "$INSTDIR\${MAINBINARYNAME}.exe" "$SYSDIR\WhereTheWaterGoes.scr"
  ${EnableX64FSRedirection}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${DisableX64FSRedirection}
  Delete "$SYSDIR\WhereTheWaterGoes.scr"
  ${EnableX64FSRedirection}
!macroend
