# Build Windows — configuration de cette machine.
#
# Contexte : la toolchain Rust GNU est installée dans C:\rust et le nom
# d'utilisateur Windows contient des caractères non ASCII, ce que certains
# outils natifs (linker GNU) ne supportent pas. Ce script fixe les variables
# d'environnement nécessaires. Sur une machine standard (toolchain MSVC),
# `npm run tauri:build` suffit directement.

$env:RUSTUP_HOME = "C:\rust\rustup"
$env:CARGO_HOME   = "C:\rust\cargo"
$env:CARGO_TARGET_DIR = "C:\rust\target-crp"
$env:Path = "C:\rust\cargo\bin;" + $env:Path

npm run tauri:build
