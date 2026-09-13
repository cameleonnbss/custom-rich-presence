use std::fs;
use std::path::PathBuf;

fn main() {
    // windres (ressources GNU) ne supporte pas les chemins contenant des
    // caractères non ASCII ou des espaces : on copie l'icône vers OUT_DIR
    // (chemin ASCII grâce à CARGO_TARGET_DIR) et on pointe la ressource ici.
    let icon_out = PathBuf::from(std::env::var("OUT_DIR").unwrap())
        .join("app-icon.ico");
    let icon_src = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("icons")
        .join("icon.ico");
    if let Ok(bytes) = fs::read(&icon_src) {
        let _ = fs::write(&icon_out, bytes);
    }

    tauri_build::try_build(
        tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new().window_icon_path(icon_out),
        ),
    )
    .expect("échec de la génération des ressources Tauri");
}
