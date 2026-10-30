# Shichinin on iPhone — feasibility verdict

**Question:** can Mando test Shichinin v1 on his iPhone?

**Short answer:** Not in Chrome — ever. The only route is converting Shichinin into a **Safari Web Extension** on his Mac and sideloading it through Xcode. That route exists and the core APIs mostly have Safari equivalents, but it costs real setup time, the free version **expires every 7 days**, and two of Shichinin's core mechanisms (background automation across all sites, and the cookie pool) run into Safari-specific friction. **Recommendation: park phone testing until desktop v1 proves out.** Details and sources below.

---

## 1. Chrome on iOS: no extensions, no workaround

Chrome extensions **do not run on iOS Chrome**. Every browser on iOS is WebKit-based under the hood, and Chrome for iOS has no extension support, no developer mode, and no sideloading path. This is a platform rule, not a Shichinin problem — there is nothing to configure or unlock.

Sources:
- https://web-highlights.com/blog/how-to-use-browser-extensions-on-iphone/
- https://robots.net/tech/how-to-use-chrome-extensions-on-iphone/
- https://devhunt.org/blog/discover-dev-tools-for-chrome-on-ios

## 2. The only route: Safari Web Extensions

Safari is the one iOS browser that supports Web Extensions. An extension can't be installed by itself — it ships **inside a containing app**, and getting that app onto your own phone means building it with Xcode on a Mac.

**Conversion.** Apple provides a command-line converter that wraps an existing extension into an Xcode project:

```sh
xcrun safari-web-extension-converter /path/to/schroeder
```

It generates a project with macOS and iOS targets by default, referencing the original extension resources (so Shichinin's JS mostly carries over as-is; the manifest and background model need Safari adjustments — see §4). Apple also offers a **Safari Web Extension Packager**: upload a ZIP in App Store Connect and Apple converts it for TestFlight distribution — but that requires App Store Connect access, i.e. the paid program below.

Sources:
- https://developer.apple.com/safari/extensions/
- https://developer.apple.com/videos/play/wwdc2021/10104/ (WWDC21: "Meet Safari Web Extensions")
- Worked conversion example: https://deepwiki.com/slovensko-digital/autogram-extension/2.4-safari-extension-build
- Converter usage notes: https://gist.github.com/rxliuli/940584d75f55de3a4e9e2c5682bbcae8

## 3. Getting it onto his iPhone — two ways, both with expiry

### Free: Xcode + Personal Team (plain Apple ID, $0)
1. Open the converted project in Xcode on the Mac; sign in with his Apple ID (creates a free "Personal Team").
2. Enable **Developer Mode** on the iPhone; connect the phone to the Mac.
3. Build/run from Xcode onto the phone; enable the extension in iOS Settings → Safari → Extensions.
4. **The catch: free provisioning profiles expire after 7 days.** When they lapse, the app/extension stops launching until the iPhone is reconnected to the Mac and the app is reinstalled from Xcode. Other free-tier limits: 10 App IDs, 3 registered devices, max 3 development apps on one device at a time.

Sources:
- https://www.kodeco.com/books/swiftui-apprentice/v1.0/chapters/12-apple-app-development-ecosystem
- https://appbuilder24.com/blog/apple-developer-account-needed
- https://daily.dev/posts/how-to-install-your-own-apps-on-your-iphone-with-xcode-rrp1uvbm9
- https://techdows.com/download-xcode-for-pc-windows-11-10-mac.html

### Paid: Apple Developer Program ($99/year) → TestFlight
1. Enroll in the Apple Developer Program ($99/year).
2. Upload the build to App Store Connect; distribute via **TestFlight**.
3. **TestFlight builds expire after 90 days** (then reinstall a fresh build). Up to 100 internal testers with no review; up to 10,000 external testers, with the first build of each version passing Beta App Review. No UDID collection needed if using public links. (Paid development provisioning profiles for direct Xcode installs last ~1 year instead of 7 days.)

Sources:
- https://www.drizz.dev/post/testflight-access
- https://bitrig.com/blog/testflight-for-beginners
- https://betadrop.app/testflight-alternative/

## 4. Do Shichinin's APIs exist in Safari?

Checked against MDN browser-compat-data (via the W3cub mirror) and WebKit release notes:

| Shichinin need | Safari desktop | Safari on iOS | Notes |
|---|---|---|---|
| `alarms` (scheduler tick) | ✅ Safari 14 | ✅ iOS 15 | Supported — https://docs.w3cub.com/web_extensions/api/alarms/create.html |
| `storage` (settings, log, day plan) | ✅ | ✅ | Actively maintained — Safari Technology Preview 255 notes even fix `storage.local.get()` behavior: https://webkit.org/blog/18482/release-notes-for-safari-technology-preview-255/ |
| `tabs`, `runtime`, messaging | ✅ | ✅ | Core APIs are supported per the same compat data |
| `action` (popup) | ✅ with limits | ✅ with limits | Popup is manual-tap only on mobile; badge text color unsupported — cosmetic for Shichinin |
| `cookies` (the cookie pool) | ⚠️ Partial | ⚠️ **Unverified** | `cookies.getAll` shows Safari 14 / iOS 15 in current compat data, **with caveats**: only the default cookie store is returned and **HttpOnly cookies are not retrieved**. Snapshots disagree on iOS method coverage, and `set`/`remove` on iOS were not definitively verified. This is the **#1 thing to verify inside the converted project** — the cookie pool is a core mechanism and historically the shakiest API in Safari. https://docs.w3cub.com/web_extensions/api/cookies/getall.html |
| `idle` (pause when locked) | ❓ No support evidence found | ❓ | Shichinin already degrades gracefully (falls back to "active"), so worst case the lock-pause simply never fires on iOS |

**Platform friction beyond the API table:**
- **Per-site permission grants.** Safari asks the user to grant an extension access per site ("for one day" or "always"). That model fights Shichinin's design, which needs `<all_urls>` background automation without babysitting prompts. Source: https://ppc.land/browser-extension-permissions/
- **Intelligent Tracking Prevention.** Safari blocks/partitions third-party cookies by default, which changes what the cookie pool can even see — part of Shichinin's target surface is pre-shrunk on Safari. Source: https://www.browserling.com/safari-testing
- **Different background model.** Safari's extension background/service-worker behavior differs from Chrome's, so the alarm-driven executor would need real adaptation and testing, not just a repackage. Source: https://www.wiredlabz.com/article/what-to-expect-from-the-next-generation-of-extension-apis

## 5. Bottom line

**Exact steps, if he wants it anyway:**
1. On the Mac: run `xcrun safari-web-extension-converter` on the `schroeder/` folder.
2. Open the generated project in Xcode; sign with his Apple ID (free) — accept the 7-day reinstall loop — or enroll in the $99/yr Developer Program for ~1-year profiles / 90-day TestFlight builds.
3. Enable Developer Mode on the iPhone, build to the device, enable the extension in Settings → Safari → Extensions, and grant site access.
4. First verification task in the converted project: confirm `cookies.set`/`remove` actually work on iOS Safari; if they don't, the cookie pool — a core mechanism — doesn't port, and what remains is personas + consent only.

**Recommendation: park it.** Desktop load-unpacked (`chrome://extensions` → Developer mode → Load unpacked) is a 30-second iteration loop; the iOS route is hours of conversion and signing friction for a build that dies every 7 days on the free tier, on a platform whose permission prompts and ITP actively fight the automation — with the Nov 4 hackathon deadline in between. Revisit phone testing after desktop v1 proves the concept; if phone testing ever becomes the priority, the $99 program + TestFlight is the only version of it that isn't a weekly chore.
