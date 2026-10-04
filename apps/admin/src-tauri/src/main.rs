// Sin consola en Windows en release. En Linux no hace nada, pero se deja para
// que el binario se comporte igual en las tres plataformas.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    princess_admin_lib::run()
}
