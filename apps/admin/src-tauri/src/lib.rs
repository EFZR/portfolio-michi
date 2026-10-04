#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // El actualizador no es opcional en esta arquitectura: el panel se
        // publica una vez y el vocabulario nuevo (tipos de campo, operadores)
        // llega por actualización automática. Ver docs/fase-2-ui-dinamica.md §1.5.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Reiniciar la app tras instalar la actualización.
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error al arrancar la aplicación");
}
