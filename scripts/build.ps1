# Windows build script.
#
# Standard machines (MSVC toolchain): `npm run tauri:build` is enough.
#
# This script targets the setup on the current machine: the Rust toolchain
# lives in C:\rust and the Windows username contains non-ASCII characters,
# which some native tools (GNU linker) do not support. It sets the required
# environment variables. When the MSVC toolchain is the default, the exe is
# statically linked against WebView2Loader and runs fully standalone.

$env:RUSTUP_HOME = "C:\rust\rustup"
$env:CARGO_HOME   = "C:\rust\cargo"
$env:CARGO_TARGET_DIR = "C:\rust\target-crp"
$env:Path = "C:\rust\cargo\bin;" + $env:Path

npm run tauri:build
