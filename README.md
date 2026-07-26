# ShortcutOverlay

A lightweight system-tray app that shows a hotkey-triggered overlay with
shortcut cheat sheets for any application.

Press the hotkey, see the cheat sheet, release to dismiss.

> **Status:** early / pre-1.0. Works, but the UI and sheet library are still
> evolving.

## Install

Grab the latest installer from [Releases](../../releases), run it. It starts
silently in your **system tray** — press `Alt+Shift+/` to show the overlay.

> Binaries are currently **unsigned**: Windows SmartScreen warns on first run.
> Click *More info → Run anyway*. (Signing is on the roadmap.)

## Develop

```bash
npm install
npm run tauri dev
```

Requires Node, Rust, and the Tauri v2 prerequisites.

## License

MIT — see [LICENSE](./LICENSE).
