!macro WASMAGICK_REGISTER_CONTEXT_MENU EXT
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\WASMagick" "MUIVerb" "Edit with WASMagick"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\WASMagick" "Icon" "$INSTDIR\WASMagick.exe"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\WASMagick\command" "" '"$INSTDIR\WASMagick.exe" "%1"'
!macroend

!macro WASMAGICK_UNREGISTER_CONTEXT_MENU EXT
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.${EXT}\shell\WASMagick"
!macroend

!macro customInstall
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU png
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU jpg
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU jpeg
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU gif
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU webp
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU bmp
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU tif
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU tiff
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU avif
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU svg
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU ico
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU heic
  !insertmacro WASMAGICK_REGISTER_CONTEXT_MENU heif
!macroend

!macro customUnInstall
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU png
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU jpg
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU jpeg
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU gif
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU webp
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU bmp
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU tif
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU tiff
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU avif
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU svg
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU ico
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU heic
  !insertmacro WASMAGICK_UNREGISTER_CONTEXT_MENU heif
!macroend
