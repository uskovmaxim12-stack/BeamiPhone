-- BeamiPhone persistent Game Engine extensions.
-- The radio extension is bundled in the same ZIP; it uses the LuaSocket library
-- shipped with BeamNG and does not launch any external process.
setExtensionUnloadMode('beamiphone_musicScanner', 'manual')
setExtensionUnloadMode('beamiphone_radio', 'manual')
loadManualUnloadExtensions()
