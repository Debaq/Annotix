fn main() {
    #[cfg(windows)]
    {
        let mut res = tauri_winres::WindowsResource::new();
        res.set_icon("icons/icon.ico");
        let _ = res.compile();
    }
    tauri_build::build()
}
