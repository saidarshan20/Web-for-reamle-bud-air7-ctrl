# realme Buds Air 7 Web Control

A browser-based controller built specifically for the **standard realme Buds Air 7 (non-Pro)**.

This project is a customization of **[Realme Web Control by DuGanTaDa](https://github.com/DuGanTaDa/Realme-Web-Control)**. Its existing interface, visual styling, illustrations, animations and Web Serial foundation were used as the starting point for the Air 7-specific changes.

**Target device:** realme Buds Air 7, product ID `064812`. Other earbud models are outside this project's scope.

## Features

- **Noise control:** Off, Noise cancellation and Transparency.
- **ANC strength:** Smart, Max, Moderate and Mild, with device state read-back and retention of the last confirmed strength when switching modes during a connection.
- **EQ modes:** Serenade, Original sound, Deep Bass and Clear Bass.
- **Named custom EQ:** create, select, edit, rename and delete six-band presets saved on the earbuds. Use the **⋯ menu** beside a preset for management actions.
- **Button settings:** separate left/right Double-tap, Triple-tap and Touch and hold assignments, using the standard Air 7 action menus.
- **Device features:** Game mode, High-definition sound, Spatial Audio, In-Ear Detection, Enhanced Voices, Wind noise reduction and the Dynamic Bass switch when the device reports support.
- **Battery indicators**, connection recovery and a **Serial Log** for troubleshooting.
- **Responsive layout** with the original Realme BT styling.

Controls depend on the connected device's advertised commands and reported state. Changes are confirmed through Bluetooth acknowledgements and state read-back; a successful write alone is not treated as proof that a setting applied.

## Requirements

- A standard **realme Buds Air 7** paired with your computer.
- A desktop browser with **Web Serial** support, such as Brave, Chrome or Edge.
- An **HTTPS** website or a local development server on `localhost`.
- Node.js and npm for local development.

The layout adapts to phones, but mobile Bluetooth control is not claimed. This app uses **Bluetooth Classic RFCOMM through Web Serial**, rather than a BLE connection.

## Run locally

```sh
git clone https://github.com/saidarshan20/Web-for-reamle-bud-air7-ctrl.git
cd Web-for-reamle-bud-air7-ctrl
npm ci
npm run dev
```

Open the local URL printed by Vite.

### Connect your earbuds

1. Pair your Buds Air 7 with the computer and keep the earbuds awake.
2. Close other controller apps that may hold the Bluetooth control connection.
3. Click **Connect** and select the realme Buds Air7 entry containing `0000079a` when available.
4. Wait for the app to identify the device and load its settings.

The browser may list the same earbuds more than once because they expose different Bluetooth services. These UUIDs are service identifiers, not earbud serial numbers. The `0000079a` entry is the preferred vendor control service.

### Manage custom EQ presets

- **Create:** New preset → enter a name → adjust the six bands → Create preset.
- **Apply:** click a saved preset's name.
- **Edit:** ⋯ → Edit EQ → adjust the bands → Save preset.
- **Rename:** ⋯ → Rename → change the name → Save preset.
- **Delete:** ⋯ → Delete → confirm Delete preset.
- **Cancel:** discard an unsaved local edit without sending it to the earbuds.

The interface allows up to three custom presets using the protocol reference's default limit. Names are limited to 32 UTF-8 bytes. Device-assigned preset IDs and existing frequency metadata are preserved; the preset list is reloaded after writes and deletions.

## Current limitations

| Control or behavior | Status |
| --- | --- |
| Volume enhancer | Visible but disabled because its command/state mapping is not verified for the standard Air 7. |
| Single Dynamic Bass intensity slider | Visible but disabled: Air 7 uses three dynamic-sound bands, which the original single slider cannot represent correctly. |
| Dynamic Bass naming | Retained; the old combined control is not assumed to be identical to every setting called Dynamic audio in realme Link. |
| Custom EQ availability | Requires a valid preset-list read and advertised command support. Unsupported preset layouts remain unavailable for editing. |
| ANC strength after reconnecting with ANC Off | A previously stored strength cannot be displayed unless the device reports it. The session's last confirmed strength is retained while switching modes. |
| Firmware differences | Features may be unavailable or refused depending on firmware, codec and current earbud state. |

Golden Sound is not included in this Air 7 interface. Advanced settings and dual-device management are outside the current scope.

## Build and test

```sh
npm run build
npm run preview
npm test
npx tsc --noEmit -p tsconfig.app.json
```

The production build is written to `dist`.

For browser regression checks:

```sh
npx playwright install chromium
npx playwright test
```

Automated Bluetooth tests use a **simulated serial device**. Browser checks cover mobile, tablet and desktop layouts, preset management, gesture controls and card alignment. Manual Windows hardware checks and detailed protocol notes are in **[docs/AIR7.md](docs/AIR7.md)**.

## Deploy on Vercel for free

1. Sign in to [Vercel](https://vercel.com/new) with GitHub and select a personal **Hobby** project.
2. Import **saidarshan20/Web-for-reamle-bud-air7-ctrl**.
3. Confirm the settings below, then click **Deploy**.

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Root directory | `./` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | None |

These settings and the SPA routing fallback are included in [vercel.json](vercel.json). Use Vercel's included `.vercel.app` address. The app needs no backend, database or paid service. Once connected to GitHub, Vercel can deploy updates when changes are pushed to the production branch.

## Credits

- **Original application and UI foundation:** [DuGanTaDa / Realme-Web-Control](https://github.com/DuGanTaDa/Realme-Web-Control). This customization builds on that project; credit for the original work remains with its author.
- **Air 7-specific customization:** [Saidarshan Sahu](https://github.com/saidarshan20).
- **Protocol and model references:** [spizganed / QuickBuds](https://github.com/spizganed/QuickBuds), including its documented Air 7 definitions. QuickBuds is GPL-3.0; its implementation code was not copied into this project.
- **Product artwork:** realme product renders, with sources documented in [src/assets/SOURCES.md](src/assets/SOURCES.md).

## License and affiliation

The original copyright notice **Copyright (c) 2026 DuGanTaDa** and [LICENSE](LICENSE) are retained. Product artwork and trademarks remain the property of their respective owners.

This is an **unofficial community project** and is not affiliated with or endorsed by realme. Protocol work is for device interoperability.
