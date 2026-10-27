# Mapline

**UX maps (journey map, blueprint, storyboards), user flows and personas — in a fast native app that never leaves your machine.**

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![Platform: macOS | Windows | Linux](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/aminart/Mapline/releases/latest)

<p align="center">
  <!-- Demo: replace with a recording of the app -->
  <img src="assets/demo.gif" alt="Mapline demo" width="900">
</p>

---

## Quick Download

Latest release: **v1.1.1** · [All releases](https://github.com/aminart/Mapline/releases)

| Platform | Installer |
| --- | --- |
| macOS (Apple Silicon & Intel, universal) | [`Mapline_1.1.1_universal.dmg`](https://github.com/aminart/Mapline/releases/download/v1.1.1/Mapline_1.1.1_universal.dmg) |
| Windows 10/11 (x64) | [`Mapline_1.1.1_x64-setup.exe`](https://github.com/aminart/Mapline/releases/download/v1.1.1/Mapline_1.1.1_x64-setup.exe) · [`.msi`](https://github.com/aminart/Mapline/releases/download/v1.1.1/Mapline_1.1.1_x64_en-US.msi) |
| Linux (x64) | [`.AppImage`](https://github.com/aminart/Mapline/releases/download/v1.1.1/Mapline_1.1.1_amd64.AppImage) · [`.deb`](https://github.com/aminart/Mapline/releases/download/v1.1.1/Mapline_1.1.1_amd64.deb) |

> Builds are not yet code-signed. On macOS, right-click the app and choose **Open** the first time; on Windows, choose **More info → Run anyway**.

## Why Mapline?

### 100% offline & private
No account, no cloud. Mapline makes zero network requests: your projects are simple files stored on your device, and they stay there.

### Built for complex UX deliverables
Not an empty whiteboard, but a structured tool for the deliverables you actually ship:

**Map your user journeys** — phases, steps, persona swimlanes, activity and decision cards, lines of visibility, alternate paths, storyboard and notes rows, smart routed arrows that never cross a card. A project holds as many maps, flows and personas as you need, and presents them all in one go.

**User flows** — activity and decision cards on a grid that grow with their text, with tags and comments; branches, loops, and return links; add a card in any direction and the flow automatically reflows around it.

**Personas** — ready-to-use sheets with lists, gauges, colour-coded tags, and free-form text, seamlessly synced with your journey personas — photo included.

### Ultra-lightweight, native performance
Built with Tauri v2 and Rust leveraging the system webview: a lightweight installer, fast startup. Undo/redo, multi-project tabs, and session restore are natively built in.

### Multiple built-in export formats
Projects are JSON files (.mapline). Export to high-resolution PNG (up to 3x, transparent background), JPEG, multi-page A4 PDF (paginated by step or phase), and CSV, or copy directly to the clipboard to paste into Figma or other tools.

## Run from source

Requires Node.js 20+, Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
git clone https://github.com/aminart/Mapline.git mapline
cd mapline
npm install
npm run tauri dev
```

Build an installer for your machine with `npm run tauri build` (output in `src-tauri/target/release/bundle/`). Tests: `npm test` (model) and `npm run e2e` (interface, Chromium and WebKit).

Stack: React 19 and TypeScript, Zustand, Vite, Tauri v2 / Rust.


## Intellectual property & license

Mapline is an independent project, designed, developed and maintained by **Albane Minart**.

Mapline Copyright (C) 2026 Albane Minart. Distributed under the **GNU General Public License v3.0 or later** — see [`LICENSE`](LICENSE) for the full text. You are free to use, study, modify and redistribute Mapline; any redistributed version, modified or not, must remain under the GPL and ship with its source code. The software is provided without any warranty.

The license covers the software only. Projects and exports you create with Mapline are yours.
