# Standard realme Buds Air 7 customization

Target product id: **064812**. Air 7 Pro is **064C12** and is deliberately rejected for model-specific writes.

## Scope and design

The existing React, Tailwind and Framer Motion components remain the foundation. Card ordering, illustrations, battery indicators, animations, switches, sliders, Serial Log and connection workflow are preserved. Added settings are the four-option ANC strength group, Touch and hold inside each existing earbud panel, and named custom EQ creation/editing in the existing Custom EQ card. The original desktop columns remain; they stack independently with balanced bottom cards, removing the gaps below EQ mode and below the shorter column. Mobile card order is preserved.

The supplied source has a **light theme**, despite the initial request describing a dark theme. The user selected **Keep source styling** when asked. `src/index.css`, `src/App.css`, global colors and design tokens were left unchanged. Longer labels receive small responsive wrapping adjustments within existing buttons.

No advanced settings, new page, dual-device manager, backend, database, service subscription or runtime dependency was added. Existing prohibited features were not introduced. The user authorized publishing the finished source to their GitHub repository; deployment remains a separate user step.

## Protocol evidence and limits

Inspected on 19 November 2026:

- [Original project](https://github.com/DuGanTaDa/Realme-Web-Control), including the supplied Web Serial hook and README.
- [QuickBuds model definitions](https://github.com/spizganed/QuickBuds/blob/main/app/src/main/assets/models.json): entry `064812`, name `realme Buds Air7`. Its own ANC slots, gesture menus, holdMask, sharedHold, windMode, bassBands, EQ presets and statusQuery were checked separately from the Pro entry.
- [QuickBuds protocol](https://github.com/spizganed/QuickBuds/blob/main/docs/PROTOCOL.md), sections 1–6 and 13–18, 21.3–21.7.
- [QuickBuds model status](https://github.com/spizganed/QuickBuds/blob/main/docs/MODELS.md) lists standard Air7 owner-confirmed noise control and gestures. The protocol still describes individual non-Pro realme writes as vendor-derived / not individually owner-verified. This implementation is based on that standard-model definition, **not physical verification on the user's hardware**.
- [Chrome's custom RFCOMM Web Serial documentation](https://developer.chrome.com/blog/serial-over-bluetooth/).

No QuickBuds implementation code was copied or translated. Protocol facts and public model mappings informed an independent TypeScript implementation. QuickBuds remains GPL-3.0; its authors retain their rights. The original application's LICENSE and attribution to DuGanTaDa are retained unchanged.

## ANC strength and synchronization

All commands use the same long-lived Web Serial / Bluetooth RFCOMM port at 115200 baud. The picker permits the documented custom services `0000079A-D102-11E1-9B23-00025B00A5A5` and `00001107-D102-11E1-9B23-00025B00A5A5`. Web Serial exposes service information, not a reliable Bluetooth friendly-name API: the displayed device name comes from the detected product id, with the requested Air 7 name as the disconnected default.

| UI setting | Standard Air 7 slot | Mask | Command and payload |
|---|---:|---:|---|
| Off | 0 | 01 | `0404: 01 01 01` |
| Transparency | 1 | 02 | `0404: 01 01 02` |
| Smart | 5 | 20 | `0404: 01 01 20` |
| Max | 3 | 08 | `0404: 01 01 08` |
| Moderate | 4 | 10 | `0404: 01 01 10` |
| Mild | 2 | 04 | `0404: 01 01 04` |

Numbers above are hexadecimal. These are **masks**, not the numeric mode ids in QuickBuds. Strengths and the ANC button use `0404`; they do not send the speculative `01 02 <level>` payload. `010C: 01 01` reads back `810C: 00 01 01 <mask LE>`. Both write acknowledgement and matching read-back are required before displaying success. Refusal, timeout and read-back mismatch produce an error toast and Serial Log entry. The UI is driven by confirmed reports and never optimistically switches selection.

On initialization, `0100` supplies the command bitmap and `0103` identifies the product. Model-specific writes require product `064812` and the relevant command bitmap bit. `0200` obtains offered event codes; only offered codes are subscribed using `0205`, with `0201` fallback. ANC pushes are decoded only for `0204` payloads beginning `03 01 01`; hold-cycle reports cannot overwrite the selected ANC mode. Battery pushes retain battery display functionality.

### Battery display

The connected dashboard displays left bud, right bud and case percentages, charging flags and a Refresh button. `0106` supplies a snapshot; event `01` supplies partial updates. Part ids are `01` left, `02` right and `03` case; the low seven bits contain the level and bit 7 indicates charging. Zero and levels above 100 are treated as unavailable, including their charging flag. An omitted part in a fresh query is cleared; a partial push preserves other parts. Empty or malformed reports do not overwrite the last valid report. Disconnecting clears all readings.

In addition to subscribed battery pushes, the app queries after valid event `02` (wear/lid changes), every 30 seconds while the page is visible and no setting operation is busy, and when the page becomes visible or regains focus. Concurrent refreshes share one request. All refresh listeners and timers are cleaned up on disconnect/unmount; responses from an old port cannot update the current connection.

Case availability depends on what the Air 7 firmware exposes over the connected RFCOMM service. Open the lid with at least one bud in the case for manual verification. No BLE scan or second Bluetooth service is added, and no case level is estimated. Protocol reference: [QuickBuds OPPO-PROTOCOL.md, section 13](https://github.com/spizganed/QuickBuds/blob/214e03f073da1fffe655cec67c539644e6e8f1ad/docs/OPPO-PROTOCOL.md#13-battery-and-wearing), reviewed 25 November 2026; the parser is independently implemented from the documented layout.

Battery validation uses simulated replies/pushes for charging flags, unknown/omitted parts, lid-event refresh, polling, hidden-page behavior, disconnect cleanup and all four responsive dashboard widths. Hardware behavior still needs checking on the actual earbuds: compare both bud levels with realme Link, leave one bud inside the open case, then close/reopen the lid and use Refresh if needed.

Changing strength is available only with ANC active and after a valid state read. Turning Off or Transparency on does not clear the last confirmed strength in that connection. Selecting Noise cancellation reuses it. When connecting with ANC already Off, the mode read does **not** expose a previously stored strength; none is displayed or invented. If no prior strength was confirmed in the current session, entering ANC uses the model's generic ANC/Max mask `08`. Reconnect/reload resets cached state and rereads the device; persistence of an unknown stored level across those events needs hardware evidence.

The transport now matches command **and sequence**, bounds requests with timeouts, serializes writes, releases writer locks in `finally`, validates incoming lengths, handles fragmented/coalesced input, LEB128 lengths and protocol slices, and cancels outstanding requests after disconnection. It does not invoke a codec switch, power-saving switch or audio restart when setting ANC. Actual uninterrupted playback still requires the Windows hardware test below.

## Button settings

Read: `0108` (empty payload). Reply: `8108: 00 <count> [<dev> <button> <gesture> <action>]...`.

Write: `0401: <count> <entire table>`. Confirm with `8401` followed by a fresh `0108` table read and comparison. A zero acknowledgement alone is insufficient.

| Gesture | Air 7 definition | Supported menu actions |
|---|---|---|
| Double-tap (`02`) | options 581 | None `00`, Play / Pause `01`, Voice Assistant `03`, Next Track `06` |
| Triple-tap (`03`) | options 8825 | None `00`, Voice Assistant `03`, Previous Track `05`, Next Track `06`, Volume Up `0B`, Volume Down `0C`, Game mode `11` |
| Touch and hold (`04`) | holdMask 8833 | None `00`, Voice Assistant `03`, Switch noise control modes `08`, Game mode `11` |

Side `01` is left and `02` is right. Only gestures present in the device's table can be edited. Unknown action values are shown as detected hexadecimal values, never mapped to a guessed label. Missing/conflicting settings show **Not reported**. In particular, Switch noise control modes appears as the selected hold action only after the device reports `08`.

Apply reads the latest whole table, changes only fields edited for the selected side, preserves all other entries (including calls and the other earbud), writes the complete table and verifies the result. Apply Left/Right can save all three gestures together, but does not overwrite unchanged values. The noise cycle mask itself is preserved: selecting the cycle action does not rewrite which modes it cycles. Air 7 uses a shared cycle, so this iteration does not add a cycle editor.

The previous site's labels for some action bytes were incorrect: `08` is the hold noise cycle, `0B/0C` are volume up/down, and `11` is game mode. Options now come from standard Air 7 menus rather than the former generic list.

## Renamed labels

| Previous | Current |
|---|---|
| Buds Air 5 Pro | realme Buds Air 7 (detected model) |
| Noise Control | Noise control |
| Normal | Off |
| ANC | Noise cancellation |
| EQ Preset | EQ mode |
| Original | Original sound |
| HD Sound Mode | High-definition sound |
| Game Mode | Game mode |
| Wind Noise Reduction | Wind noise reduction |
| Volume Enhancer | Volume enhancer |
| Touch Controls | Button settings |
| Left Earbud | Left earbud actions |
| Right Earbud | Right earbud actions |
| Double Tap | Double-tap |
| Triple Tap | Triple-tap |

Spatial Audio, In-Ear Detection, Enhanced Voices and Dynamic Bass retain their names. Golden Sound was removed in the follow-up revision after web verification of the standard model. Serenade, Original sound, Deep Bass and Clear Bass retain their existing preset ids and ordering. Existing uppercase heading typography is preserved.

## Compatibility and deliberately disabled controls

| Control | Behavior on standard Air 7 |
|---|---|
| Game mode, High-definition sound, Spatial Audio, In-Ear Detection, Enhanced Voices, Wind noise reduction | Enabled only when the matching model-appropriate feature id is actually returned and writes are advertised. Writes use `0403` and read back `010D`; game mode is retried briefly for delayed application. Hi-Res may be refused on a PC codec and can reconnect the earbuds; this is not claimed as tested. |
| Golden Sound | Removed from the UI after checking standard Air 7 references against the Air 7 Pro manual. The standard-model screen definition does not include the hearing-profile switch. It is not substituted with another function. |
| Volume enhancer | Kept visible but disabled: the old `0110` state query and `0407` meaning are not verified for standard Air 7. |
| Dynamic Bass on/off | Existing `1D` toggle is available only if the earbuds report it. It is requested because the Air 7 definition has `bassBands: 3`, alongside its documented dynamic-sound switch. |
| Existing single Dynamic Bass intensity slider | Kept visible but disabled with an explanation. Air 7 is a three-band dynamic-sound model; unbanded `041B FB 05 <level>` can be acknowledged without applying. Adding three sliders is outside this iteration. No fake success or guessed write is used. |
| Custom EQ | Existing six sliders remain, with named preset chips, New preset, Preset name, Create/Save and Cancel. A valid list read (including an empty list) plus advertised `0122/0418/010F` support enables creation. Existing six-band -6..+6 presets keep their real ids and frequencies; new presets use reported compatible frequencies or the documented six-band model default. Device-assigned ids are read back; no id 4 is invented. |
| Dynamic audio naming | Left as Dynamic Bass. The reference associates switch `1D` with realme dynamic sound but also exposes the three-band distinction. The exact equivalence of the user's app label and the old site's combined single-band UI has not been established. |

Unknown models, Pro devices, missing bitmap entries and failed/malformed state reads leave dependent controls disabled. No absent capability is inferred from a default zero. Read-back proves device state, not the subjective sound effect or safe coexistence of audio streams.

## Modified files

| Files | Purpose |
|---|---|
| `src/hooks/useSerial.ts` | Identify model, custom RFCOMM picker, request matching, state reads, confirmed writes, reconnection and errors |
| `src/lib/air7.ts` | Standard-model mappings, gesture/EQ validation, command capabilities and wire framing |
| `src/components/NoiseControlCard.tsx` | Existing labels plus native ANC strength group |
| `src/components/TouchControlsCard.tsx` | Hold dropdowns, actual action menus, editable drafts and confirmed Apply |
| `src/components/HeaderBar.tsx`, `LandingHero.tsx`, `DashboardBuds.tsx` | Model presentation and state labels |
| `src/components/EQPresetCard.tsx` | Requested labels, unavailable state and longer-label wrapping |
| `src/components/SystemFeaturesCard.tsx`, `DynamicBassCard.tsx`, `CustomEQCard.tsx` | Requested labels, capability disabling and reported EQ metadata |
| `src/pages/Index.tsx` | Pass confirmed state and operations into existing cards |
| `src/test/air7.test.ts`, `src/test/useSerial.test.tsx`, `src/test/TouchControlsCard.test.tsx`, `src/test/CustomEQCard.test.tsx` | Protocol and simulated Web Serial regressions |
| `tests/air7.spec.ts`, `playwright.config.ts` | Responsive browser checks with a simulated device |
| `vercel.json`, `.gitignore` | Static hosting configuration and ignore test outputs |
| `README.md`, `docs/AIR7.md` | Setup, protocol evidence, limits and manual tests |

## Automated validation

- Production build: `npm run build` passes. Vite emits the original ambiguous `duration-[600ms]` Tailwind warning and, after importing the existing accessible dropdown, a warning about the approximately 563 kB JavaScript entry chunk. Neither blocks output; no dependency was added.
- TypeScript: `npx tsc --noEmit -p tsconfig.app.json` passes.
- Unit/integration: **27 tests pass** (`npm test`), covering framing, masks, menu restrictions, custom EQ metadata, whole-table preservation, model rejection, all four strengths, Off/On retention, refused/ignored writes, push discrimination, unmatched-reply timeouts, and late UI state synchronization.
- Responsive browser tests: `npx playwright test`, with a simulated serial device. Tested in a fresh headless Brave instance at **320, 390, 768 and 1440px**. Checks include no horizontal document overflow, desktop columns/mobile stacking, four ANC selections, Off/On, hold Apply and preservation of the other earbud.
- In this environment localhost network requests were blocked and the default Playwright Chromium download was absent. Browser tests therefore used the installed Brave binary and fulfilled requests directly from built `dist` files with `OFFLINE_BROWSER_TESTS=1`. This exercises the rendered production app and browser interactions, not actual Bluetooth or external font/Vanta CDN availability.
- Changed TypeScript/component files pass targeted ESLint. Whole-project lint still reports pre-existing errors in `InteractiveBackground.tsx`, UI `command.tsx`, UI `textarea.tsx`, and `tailwind.config.ts`, plus existing Fast Refresh warnings. Unrelated files were not rewritten to silence them.

To reproduce browser tests normally, install Playwright Chromium (`npx playwright install chromium`) and run `npx playwright test`; the test configuration starts Vite automatically. To use installed Brave offline after building:

```powershell
$env:OFFLINE_BROWSER_TESTS = '1'
$env:BROWSER_EXECUTABLE = 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
npx playwright test
```

## Windows hardware test (required before claiming device validation)

1. In this project directory run `npm ci`, then `npm run dev`. Open the displayed localhost URL in desktop Brave. Mobile layouts are supported, but mobile Bluetooth Web Serial operation is not claimed.
2. Pair the standard realme Buds Air 7 with Windows, keep a bud in your ear, and close realme Link/QuickBuds or other apps holding the control service. Connect using the existing button and choose the earbud's control service in the port picker. Confirm product `064812` in the Serial Log. If the picker is empty, verify pairing and browser serial permission; a plain Windows COM port may expose a different service.
3. Compare the initial Noise control, EQ, battery and all six gesture dropdowns with realme Link, using one controller app at a time. Unknown or missing settings must remain unselected/disabled. No capability should appear enabled just because it was formerly initialized to zero.
4. With audio playing, select Smart, Max, Moderate and Mild. Verify the selected strength, success feedback, `0404` acknowledgement and matching `810C` read-back. Confirm the audible change and uninterrupted playback. Select Moderate, then Off, then Noise cancellation; verify Moderate returns. Repeat through Transparency. Reconnect with ANC Off and check the documented unknown-stored-strength limitation.
5. Change only the left hold action and Apply Left; verify it physically and in realme Link. Confirm both tap settings, the right earbud and call gestures stay unchanged. Repeat on the right, then edit all three fields before one Apply. Verify only actions offered by the standard model can be sent.
6. Remove both buds from your ears and try ANC. A device refusal should show an error and retain/reload actual state. Disconnect Bluetooth during an operation and verify timeout/error feedback, disabled controls and reconnection. No success should be shown for a mere visual selection, status-only acknowledgement or mismatched read-back.
7. Verify enabled existing EQ and feature toggles with read-back. High-definition sound can be codec-dependent and can restart a connection. When Custom EQ is enabled, choose New preset, enter a name, adjust the six bands and click Create preset. Verify the name and gains in realme Link and after reconnecting. Rename with Preset name → Save preset; select another saved preset by its chip. Check actual frequencies and read-back. Golden Sound must be absent. Disabled Volume enhancer and the single intensity slider must not transmit commands.

## GitHub and Vercel preparation

No backend is needed. Vercel settings: **Vite**, build **npm run build**, output **dist**, root **./** in the published repository (package.json is at the repository root). The install command is explicitly **npm ci**, using the tested npm lockfile. `vercel.json` contains the SPA fallback. Preserve `LICENSE` and the original project's attribution.

The source was supplied as an extracted tree. The user authorized publishing to [saidarshan20/Web-for-reamle-bud-air7-ctrl](https://github.com/saidarshan20/Web-for-reamle-bud-air7-ctrl). The repository contains the app at its root; node_modules, dist and test outputs are excluded. Import this repository into a personal Vercel Hobby project for free static hosting.

## Follow-up revision — 19 November 2026

- Removed the Golden Sound row after web research. The [standard Air 7 product page](https://www.realme.com/global/more-products/realme-buds-air-7) and model screen do not advertise it; the [Air 7 Pro manufacturer manual](https://media.tatacroma.com/Croma%20Assets/Communication/Headphones%20and%20Earphones/User%20Manual/316010_User%20Manual?updatedAt=1786687110358) explicitly shows Golden sound. The absence from standard-model material is the basis for removing it here, rather than claiming it is a universal firmware impossibility.
- Replaced the OS-native gesture menus with the project's existing Radix Select component, styled with the same inset trigger, rounded raised popup, orange highlighting and checkmark selection. No dependency was added. Keyboard navigation, Escape and scrolling remain available.
- Replaced generic/incorrect product artwork with actual Ivory Gold **standard Air 7** product renders; see [image sources](../src/assets/SOURCES.md). The existing illustration positions, sizes and animations remain. SVG viewports display each earbud from the unmodified pair image; they do not synthesize a different product.
- The two picker entries shown by the user are service endpoints: `00001101-0000-1000-8000-00805f9b34fb` is standard Serial Port Profile (SPP), while `0000079a-d102-11e1-9b23-00025b00a5a5` is the vendor control RFCOMM service. This is not evidence of two connected pairs. Prefer the 079a service for this protocol; the user's report that both entries worked is preserved as user-reported testing, not assistant-performed hardware validation. The existing working picker behavior was retained; the browser controls its device labels and cannot be made to merge those entries by this UI.

## Named custom EQ revision — 19 November 2026

The user subsequently requested creation and naming, extending the earlier save-existing-only scope. Custom EQ now reads all saved presets, lets the user create, rename, adjust and select them, and keeps draft slider edits local until explicit Save. Cancel discards a local draft; there is no browser-only preset store and a per-preset menu for editing, renaming and confirmed deletion. Unsaved edits remain after an operation fails.

Wire operations follow QuickBuds PROTOCOL.md section 17: `0122` reads the preset table; `0418 01 FA 06 00 <nameLength> <UTF-8 name> 06 <frequency u16 LE, gain s8>…` creates. The device's returned id is matched to a newly read table. A subsequent `0418 02` saves/selects the device-assigned preset; `010F` confirms the active id. Rename/save/select use the complete existing preset metadata, with a fresh table before writing and a full comparison afterwards. Renumbered ids are tolerated during creation; other preset contents must remain unchanged. External changes to a preset abort a stale save. Interrupted writes trigger state rereads. An acknowledgement by itself never produces success.

New six-band presets use the frequencies from a compatible reported preset, else the catalog's documented default: **62, 250, 1000, 4000, 8000, 16000 Hz**, range **-6 to +6 dB**. Names are trimmed, Unicode-normalized, and limited conservatively by this UI to **32 UTF-8 bytes**; blank/control-character and duplicate names are blocked. The model catalog's default limit is **three** custom presets; firmware can still refuse a lower limit, which produces an error rather than a claimed save. This is protocol/simulator-tested, not physically verified by the assistant.

The desktop column wrappers now stack Noise control → System Features on the left and EQ mode → Dynamic Bass on the right with the original 20 px card gap. On mobile, display-contents and card order retain Noise control → EQ mode → System Features → Dynamic Bass. Custom EQ and Button settings still span both desktop columns below. No colors, card styling, illustrations or connection commands were changed in this revision.

Regression coverage includes empty-list creation, device-assigned ids, rename/save/select, preservation of other presets, ignored writes, external changes, duplicate names, full lists, unsupported devices, local UI drafts and UTF-8 name validation. Browser tests exercise create/rename/switch at all four widths and check the exact desktop gap plus original mobile order. Windows verification must still check real device persistence and realme Link visibility.

## Preset management and balanced columns — 19 November 2026

Each saved preset now has a ⋯ menu: **Edit EQ** loads its bands into the existing editor without activating it; **Rename** focuses and selects its name; **Delete** opens a matching confirmation dialog. Save still applies and confirms the edited preset. Failed deletion keeps the confirmation open.

Delete uses the documented `0418` action **03**, with the full preset metadata from a fresh `0122` read. The handler takes the original preset snapshot, so an old dialog cannot delete a different preset after firmware renumbers ids. Afterwards it rereads `0122` and `010F`, confirms that exactly the intended preset was removed and all remaining names/gains/frequencies survived, and shows the actual fallback selected by the firmware. It does not force a guessed fallback; the protocol reference notes firmware differences (Off/Original versus Clear Bass). This implementation is independent; QuickBuds core/src/cmd.rs was consulted only to verify the documented full delete payload.

The lower two cards grow within equal-height desktop columns. Dynamic Bass's intensity section stays at the bottom, and the System Features and Dynamic Bass card bottoms align before the full-width Custom EQ card. The 20 px gaps between cards and the mobile ordering are unchanged; Dynamic Bass rows distribute additional desktop height evenly. Browser checks assert both the 20 px gap below EQ mode and aligned lower card edges, at tablet and desktop widths.

Additional tests cover delete confirmation, failed deletes, editing a non-active preset without applying it, firmware id renumbering, stale delete targets and acknowledgements that do not actually delete. No push or deployment was performed. Physical deletion and realme Link synchronization still require device verification.
