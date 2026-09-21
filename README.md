# NMRView — MRI & spectroscopy

NMRView takes its name from nuclear magnetic resonance, the physics behind magnetic resonance imaging (MRI). The MRI viewer and NMR spectroscopy workspace share the same application.

A responsive browser workstation for MRI volumes and processed 1D NMR spectra. Research and education use; not validated or certified for diagnosis.

## Run

Node 22.13+ is required. `npm ci`, then `npm run dev`. The normal local URL is http://localhost:5173/. `npm run build` produces a Cloudflare-compatible bundle in `dist/`.

## MRI workspace

- Browser-local NIfTI (.nii/.nii.gz), NRRD, MGH/MGZ and DICOM-series import.
- DICOM is converted in a Web Worker by the bundled dcm2niix WebAssembly distribution. Conversion supports its built-in JPEG codecs; unusual vendor encodings still need validation.
- Linked axial, coronal, sagittal and volume-rendered views powered by NiiVue.
- Multiple physical-space volume layers, visibility, opacity, overlay ordering and color maps.
- Window/level fields for the selected layer, automatic contrast, gamma, pan, zoom, crosshair, radiological convention and ruler.
- Slice navigation, cine playback, 4D frame controls when available, and 3D clipping.
- High-contrast yellow crosshairs, with stronger occluded 3D cursor segments. Restore images recenters the view, resets clipping/zoom, shows the base layer, restores automatic base contrast and returns to multiplanar layout without replacing scans or annotations. Hidden layers have an explicit recovery prompt.
- Persistent distance and angle measurements, label painting/erasing/undo and NIfTI label export.
- PNG screenshots, measurement JSON, and embedded NiiVue `.nvd` session save/restore.
- DICOM import is capped at 512 MB per operation. Expanded data can consume substantially more memory.

Images must already be registered. This viewer does not estimate registration, perform acquisition reconstruction, or check patient identity. A new local import replaces the reference study; later imports add layers. Check units and orientation against acquisition metadata before interpreting measurements. NiiVue mouse windowing acts on the base volume; numeric fields address the selected layer.

Keyboard: C locate, W windowing, P pan, D distance, A angle, B draw, E erase, R reset, arrows browse slices, Space cine, Escape locate. Touch gestures are provided by NiiVue; explicit controls remain available in the mobile Controls panel.

## Spectroscopy workspace

- Experimental processed 1D JCAMP-DX import, including compressed XY encodings and linked blocks, through the MIT-licensed jcampconverter 9.0.1.
- Two-column CSV/TSV: chemical shift in ppm and intensity. Optional header. Hz JCAMP axes are converted using observe frequency; ambiguous axes are rejected.
- Layered overlay or stacked displays; visibility, opacity, color and per-trace gain.
- Region zoom, pan, wheel/pinch zoom, reversed chemical shift axis and peak-preserving plotting decimation.
- Manual peak selection and threshold-based local maxima, with a 0.015 ppm minimum separation and 250-peak cap. Review results manually; this is not multiplet fitting.
- Signed trapezoidal integration with interpolated interval endpoints and optional relative integral reference.
- Chemical-shift referencing and optional linear edge-median baseline correction. Changing reference/baseline clears affected analyses; original data are retained.
- SVG plot, corrected CSV, analysis JSON, and full spectrum session JSON exports.
- Up to 24 spectra / 5 million data points per session.

Raw FID processing, Bruker acquisition folders, 2D spectroscopy, automatic assignments and quantitative concentration estimates are outside this version. Spectral comparisons should use compatible nuclei and acquisition conditions. Keyboard: Z region zoom, P pan, K peak, I integral, F reference, R fit, Escape cancel. Display scaling does not affect exported integrals.

## Performance

MRI slices and volume rendering use NiiVue's WebGL GPU renderer. DICOM conversion runs in a WebAssembly worker; spectroscopy file parsing and session validation also run in a worker so they do not block input while parsing. No remote GPU service is used.

Spectra use a compact, cached extrema tree (64-sample blocks) for exact peak-preserving display reduction. Zoom/pan reuse the index; baseline changes rebuild it, while opacity, color, gain and chemical-shift changes reuse it. Original samples remain available for numerical analysis and export. Monotonic acquisition axes bypass sorting and temporary pair-object allocations. Index caches use weak references so removed spectra can be collected.

`npm run benchmark` compares the indexed plotting calculation with the previous full-scan implementation on a synthetic 2-million-point spectrum and checks exact output equality across zoom, baseline, shift and block boundaries. A local run measured 3.45 ms versus 0.81 ms median (4.3×), with an 18.71 ms initial index build. These are CPU calculation timings, not end-to-end frame rates or promises for mobile hardware. Physical-device profiling is still needed.

## Public online repositories

Open **Import scans → Public online repositories**. MRI supports OpenNeuro dataset IDs/URLs and Zenodo record IDs/URLs. Spectroscopy supports Zenodo, including browsing individual JCAMP/CSV/TSV members of ZIP archives. Examples: OpenNeuro `ds000228` (PDDL), Zenodo `4616665` (CC BY 4.0). Source/citation links, authors, license, file sizes, file-name filtering and OpenNeuro pagination are shown before loading. Only open Zenodo records are accepted.

Downloads go directly from the repository to the browser with credentials omitted. Progress, cancellation and a five-minute request timeout are provided. Selection limits: 24 files, 512 MB for MRI or 60 MB for spectra. NMR ZIP extraction is asynchronous and limited to 60 MB expanded / 200 compatible entries; choose individual spectra before parsing. Failed downloads do not replace current data. Replace-current-study is on by default; disable it only to add compatible layers. File names retain repository/record identity, and NMR sessions retain source attribution.

OpenNeuro uses the latest public S3 mirror, **not a pinned historical snapshot**, even when a dataset version URL is supplied. In-app keyword discovery searches OpenNeuro’s public MRI catalog and Zenodo’s open records, with pagination, descriptions, authors and license details. Filters distinguish raw/derivative MRI datasets or Zenodo datasets/all record types. Catalog results are filtered before display. OpenNeuro results require supported volume files in the inspected listings; Zenodo spectra and spectrum ZIPs must pass the 1D parser. Documents, unrelated tables, pathology images, raw FIDs and incompatible archives are excluded. Checks use up to two verification workers behind the shared request pacing queue, with one catalog page of up to ten records per explicit search, one OpenNeuro listing page per record and a 128 MB inspection budget per search. Records that cannot be verified within these limits are omitted; this is not an exhaustive catalog of all potentially compatible data. Compatibility verdicts are cached without retaining scan buffers. Known-ID lookup remains available. MRI ZIP access is described below; other archive formats, authenticated repositories, PACS and DICOMweb are not supported. Repository outages, browser access policies and rate limits can prevent downloads. No server proxy is used.

## Data and privacy

Scan imports remain in browser memory and are not sent to a backend. Session exports may contain the original scans and metadata. No account, PACS, DICOMweb, cloud storage, or clinical workflow integration is implemented.

Bundled reference data are free:

- MNI ICBM152 nonlinear asymmetric 2009c T1, T2 and gray-matter probability volumes. Original data are gzip-compressed without resampling. Permission notice and attribution: `public/data/MNI-COPYING.txt`, `public/data/ATTRIBUTION.txt`.
- Jeannerat (2021), NMR spectra, https://doi.org/10.5281/zenodo.4616665, CC BY 4.0. Menthol and geraniol are built-in examples; glucose is also used for parser verification.

Software: NiiVue (BSD-2-Clause), dcm2niix (BSD and notices in its distribution), jcampconverter 9.0.1 (MIT), React and Radix-based UI primitives. The dcm2niix browser distribution in `public/vendor` is copied from the locked npm dependency. Update it together with that dependency and rerun conversion QA.

## Verification

- `npm run typecheck`
- `npm test`: analytical integration, reversed CSV, chemical-shift offsets, baseline, peak detection, peak-preserving decimation, malformed inputs, three real experimental JCAMP files and JSON session round-trip.
- `python3 scripts/make-dicom-fixture.py`: creates an anonymous synthetic three-slice series in `/tmp/nmrview-dicom-test`. Import all three files in the MRI workspace. Expected dimensions: 32 × 32 × 3; spacing: 1 × 2 × 3 mm.
- `npm run build`

Browser QA covered DICOM fixture conversion with expected geometry, rendering the MNI volume, layered T1/T2/gray-matter controls, distance recording, NMR overlay/stacked views, peak detection and integration, import workflows and desktop/mobile breakpoints. This is functional QA, not clinical validation, an exhaustive DICOM conformance suite, or testing on physical mobile devices.

The optional WebMCP tools `read_workspace` and `set_workspace` are feature-detected and share the UI's active workspace. Valid switching and invalid input were checked in a supported browser.

## Participant collections and case documentation

After browsing an MRI repository, choose **Load all participants for comparison**. The app follows the remaining listing pages and groups supported files by BIDS `sub-` and `ses-` identifiers. All discovered participant/session studies appear in a searchable library; one anatomical scan is suggested per study. Files without participant identifiers are not assigned to a person. Collections require these identifiers and support directly listed volumes and indexed online ZIP entries.

Select one to four studies for separate GPU-rendered panes, choose each scan, change the shared plane, adjust individual intensity ranges, or inspect frames in a time series. Optional slice linking uses relative volume position; it does not register anatomy. **Open in main viewer** gives access to the existing measurement and layer tools. The library loads metadata for everyone and downloads scan bytes only for displayed participants. Comparison limits are 128 MB downloaded and 256 MB decoded per scan; the latest collection, selected participants and scans, plane, slice-link setting, search filter and open documentation section are saved automatically in this browser. Reopen them with **Compare participants** after a reload. **Export collection** saves a portable JSON backup; **Open saved collection** restores it. Collection files are separate from MRI session exports and contain repository URLs and documentation, not scan bytes. Downloads require network access; each scan’s contrast, frame, zoom/pan and cursor position are also restored. Frames are clamped to the currently downloaded scan’s available range. Older collection files remain compatible and use default image settings. Browser storage can be cleared or reach its quota; the save status reports failures, and exported files provide a backup. Opening another collection replaces the browser’s last saved collection. Imports are limited to 20 MB and validate schema version, participant/scan references and source URL schemes/hosts.

**Case notes** displays available participant metadata, study README, dataset description, license, source links and the selected OpenNeuro scan’s inherited JSON acquisition metadata. Applicable JSON files are resolved from the dataset root through participant/session folders to the scan folder, with lower-level fields overriding inherited values. Derivative pipelines have isolated roots. Multiple applicable files at one level are reported as ambiguous rather than merged arbitrarily. The source list and per-field origins are available beside the formatted metadata. Requests have a 30-second deadline, bounded listing pages and download sizes; missing or failed metadata is explicitly reported. HTTP(S) and DOI references in metadata and text are clickable. Zenodo study descriptions and document links are also available after repository imports. Source metadata are displayed as supplied, not interpreted as a diagnosis.

`node --experimental-strip-types scripts/test-study-collection.mts` checks participant/session separation, anatomical defaults and metadata parsing. Browser QA loaded all 155 participants from OpenNeuro ds000228, rendered three participants, opened participant metadata and returned to the images without discarding loaded panes.

`node --experimental-strip-types scripts/test-collection-session.mts` checks collection round-trip and rejection of invalid versions, selections, scans and URLs. Browser QA verified that a full reload restores the 155-participant library, three selected studies and coronal layout.

Comparison scan pickers group files by scan type and original/processed pipeline, with session context, acquisition/task/run/echo/space labels, file size and expandable full paths. **Match scans to first participant** applies the first displayed study’s filename profile to the other displayed studies. It requires a unique match with the same type, suffix, processing pipeline and acquisition entities. Unknown types, missing matches and multiple candidates remain unchanged and are reported. This is filename-based assistance, not proof of equivalent acquisition parameters or registration. Selections are retained by collection saving.

`node --experimental-strip-types scripts/test-scan-selection.mts` verifies cross-participant/session matching and prevents mixing acquisitions, runs or original/processed scans, including ambiguous and unknown inputs.

`node --experimental-strip-types scripts/test-acquisition-metadata.mts` verifies BIDS metadata applicability, directory precedence, derivative isolation and field provenance. Inheritance behavior follows https://bids-specification.readthedocs.io/en/stable/common-principles.html#the-inheritance-principle.

Comparison loading has per-pane cancellation/retry, a five-minute deadline, early rejection using listed scan sizes, and download progress updates capped at ten per second. Gzipped NIfTI data is streamed through a 256 MB expansion limit before image parsing. Other formats retain the decoded-buffer check after parsing; this does not bound their decoder's peak allocation or total GPU memory. Old images and frame controls are hidden while replacement scans load, and partially initialized viewers are cleaned up on failure. `node --experimental-strip-types scripts/test-comparison-download.mts` checks gzip expansion, limits, malformed input and cancellation. Browser QA exercised cancellation, retry and switching back to anatomy; physical mobile memory/thermal profiling remains outstanding.

## Viewing state and collection library

Main and comparison views now use the same scan-view controller. **Fit image** keeps the complete reference volume fitted as controls open or the viewport resizes. Panning or changing the zoom enters **Manual zoom**; resizing preserves the 2D display scale in CSS pixels per millimetre and the physical pan coordinates. Fit does not change contrast, slice position, measurements or labels. Restore images remains the stronger recovery action. Pure 3D views retain NiiVue's camera behavior; physical scale preservation applies to slice views.

Comparison controls are docked rather than covering the images. Each participant has immediately available Fit, Open in main viewer and Expand actions. Opening a comparison scan in the main viewer carries its contrast, cursor, 4D frame and fit/manual state across. Main-view changes return to comparison through the saved collection. Returning to the same already-loaded main scan reuses it, preserving its measurements and labels; opening a different scan still replaces the main study. Repository scan annotations now follow the scan between both views (see below).

**Collections** opens a browser-local library of up to 30 named snapshots. Save, open, rename, delete and export snapshots independently of the current collection's autosave. Snapshots include participant selections, scan choices, documentation and viewing state, not image bytes or main-view annotations. Later edits update the current collection, not existing named snapshots. Save a new snapshot to preserve a later arrangement. Exports remain available if browser storage fills. Repository files must remain accessible; OpenNeuro sources still use the latest mirror rather than pinned historical versions.

Regression checks for this transition: `scripts/test-viewer-state.mts`, `scripts/test-collection-library.mts` and `scripts/test-collection-session.mts`. The controller tests exercise physical-scale preservation, repeated and hidden-view resizing, fit versus manual behavior, cross-viewport restoration, frame clamping and event cleanup.

## Guided comparison arrangements

In the comparison workspace, **Arrange scans → Participants / Sequences / Visits** previews an arrangement before loading. Participants matches the reference filename profile against the chosen studies (or suggests a second participant when only one is selected). Sequences displays different scan types from a single participant/session, preferring original data and excluding masks. Visits finds the same filename acquisition profile across sessions for one participant. Session labels are not interpreted as dates. Each preview shows its chosen files, download sizes, ambiguous matches and missing acquisitions; ambiguous choices are never automatically selected. At least two selected scans are needed to apply a preset, with a four-pane limit and the existing 128 MB download limit. Decoded-memory checks still run during loading.

A comparison can now contain multiple scans from one study. Each pane has its own scan identity, display state and frame controls. Arrangements survive current-collection autosave and named snapshot export/import. Relative cursor linking identifies each pane independently, including panes belonging to the same participant; it does not register scans. Presets start with independent navigation.

**Acquisition differences** shows a docked side-by-side table of reported scanner, field strength, timing, flip angle and other acquisition properties. It uses inherited OpenNeuro JSON metadata, highlights differing reported values and distinguishes loading, unavailable and unreported data. Source links and field provenance are retained. Zenodo acquisitions without this metadata remain explicitly unavailable. This is a review aid, not proof of equivalent acquisition parameters or anatomical alignment.

## Comparison loading and scan memory

Comparison panes share a session-only LRU cache of prepared files, capped at 192 MB. Revisiting an available scan avoids another application download and gzip expansion; each renderer still parses its own independent volume. Cached sources expire after 15 minutes and are never written to browser storage. URL, filename, listed size and local blob identity distinguish sources; this is not historical version pinning. Scans larger than the cache budget remain viewable within the existing comparison limits but are not retained in this cache.

At most two downloads/preparations run concurrently. Additional requests show a queued state. Concurrent requests for the same scan share the work; cancelling one pane only cancels the underlying job when its last consumer leaves. Failed loads can retry, and Retry discards that scan's cached file first. Comparison tools show retained bytes, queued/active jobs and reuse counts. Clear scan cache releases retained files without unloading displayed scans; loads already running finish for their viewers but do not repopulate the cleared cache. Image parser allocations, active volumes, GPU textures and the browser HTTP cache are additional memory, not included in the 192 MB cap.

`node --experimental-strip-types scripts/test-scan-cache.mts` covers eviction, oversize handling, concurrency, shared-request cancellation, clear during loading, retry and expiry.

## Scan geometry review

Comparison → **Scan geometry** inspects the loaded renderer's RAS-ordered voxel grid, reporting dimensions, voxel spacing, field of view and the first voxel centre. Differences in grid orientation and origin are checked separately from spacing and dimensions. Declared metres and micrometres are normalized to millimetres; unspecified units, invalid dimensions and degenerate transforms are explicitly unverified. Values come from the image geometry, independently of acquisition JSON sidecars. The comparison controls summarize whether selected grids differ or are still pending.

Comparison tolerances are 0.01 mm for spacing, 0.1 mm for field of view/origin and 0.001 for direction components. Field of view is the length along each grid axis including full voxel widths, not an axis-aligned anatomical bounding box. Matching grids do not prove registration, common subject coordinates or acquisition equivalence. Cursor linking remains relative volume position; no automatic registration or resampling is performed. Geometry reports are computed after loading and are not persisted in saved collections.

Comparison additionally caps retained decoded voxel arrays at **384 MB across all panes** (256 MB per scan). Image parsing runs one scan at a time, including cache hits. A scan that would exceed the aggregate budget is not attached to a renderer; close another scan and retry. **Close scan** removes a single pane, including a single sequence within a participant, and releases its renderer and decoded-data reservation. Comparison tools show active decoded bytes separately from cached files. Cancellation, replacement, load failures and leaving comparison also release reservations.

This limits retained voxel arrays, not total process memory: one parser's temporary allocations, GPU textures, prepared files, browser overhead and the main viewer are additional. Non-NIfTI decoders can allocate before their output size is known. This is not a guarantee against device memory exhaustion. `scripts/test-comparison-memory.mts` checks aggregate limits, release, parser scheduling, cancellation and recovery.

## Shared scan annotations and segmentation

For a repository scan, open **Annotations** on its comparison pane, or **Controls → Scan annotations** in the main viewer. Distance and angle tools record physical coordinates and the current time frame. Rename, locate or delete each measurement; Locate restores its frame, plane and position. Draw/erase labels on slice views, rename regions, undo strokes and keep scan notes. Label maps cover the spatial volume and are shared across time frames. This is manual segmentation; no automatic tissue or lesion segmentation is performed.

Measurements, region names, notes and label maps follow the same repository scan between main and comparison views. They autosave separately in IndexedDB and survive a reload. Collection snapshots contain viewing arrangements, not annotation copies. Imported local volumes and the built-in atlas retain the existing MRI `.nvd` session workflow. Autosave is browser-local, not multi-user or cross-tab collaboration: edit a scan in one browser tab at a time. Storage failure is reported; export before leaving if saving fails. An unreadable existing record is not overwritten.

**Export annotations** produces an `.nmra` package containing measurements, notes, label names and raw label voxels without the source MRI. **Import annotations** replaces the current scan's annotation record only when source identity, geometry, dimensions and frame count agree. **Measurement report** exports formatted JSON including physical coordinates, frames, scan identity and region definitions; **NIfTI labels** exports the label map for other imaging tools. Packages are bounded to 64 MB of label voxels plus 2 MB of metadata. Retained annotation label buffers are capped at 128 MB; renderer copies and pending storage writes add memory. Eight native undo states are kept per viewer; undo history is not exported or restored across viewers.

Identity uses repository URL, filename, listed size and the loaded geometry/data type/frame count. It is not a content hash or a pinned dataset version: changed data at the same URL with the same identity may require separate handling. Annotations are never registered or transferred onto a different participant automatically. Physical measurement accuracy depends on acquisition geometry and units.

Regression scripts `test-annotations.mts`, `test-annotation-store.mts` and `test-annotation-viewer.mts` cover package validation, scan mismatch, frame isolation, storage recovery, shared records, independent renderer buffers, callback cleanup, replaced-volume protection and memory limits.

## Evolution phases

1. Predictable image fitting, shared viewing state and docked controls.
2. Participant/session organization, case documentation and named collection snapshots.
3. Guided participant, sequence and visit comparisons, with acquisition review.
4. Bounded concurrent loading, reusable prepared scans, cancellation/retry, decoded-memory accounting and geometry review.
5. Shared repository-scan measurements, manual labels, browser persistence and portable annotation/report exports.

These phases describe the implemented workstation scope. Automatic registration, automated segmentation, PACS integration, multi-user collaboration and clinical validation remain outside this release. Physical-device mobile performance profiling remains outstanding.

Browser QA for phases 4–5 used OpenNeuro ds000228 anatomical and functional scans: both rendered after reopening the browser, a drawn distance and label map followed the scan into the main viewer and survived a full page reload, and test annotations were removed afterward. A narrow viewport exposed overlapping comparison rows with annotations open; rows now accommodate the complete pane. Package serialization/import is regression-tested; the embedded browser's download-event API did not confirm the native save operation. Browser checks do not replace physical mobile-device testing.

## Direct Zenodo ZIP access

Online MRI imports now start on Zenodo without a prefilled brain keyword. Search and record browsing inspect ZIP/ZIP64 central directories for NIfTI, NRRD and MGH/MGZ volumes. The file list presents individual volumes; selecting one fetches only its compressed byte range and verifies its declared size and CRC before passing it to the viewer. No manual archive download or local conversion is required. Archive entry URLs retain the archive size, entry name and checksum, so saved collections can reopen the same entries through the regular download/cache path.

Stored and DEFLATE entries are supported. Encryption, split archives, unsafe paths, 7z/RAR/tar, Python pickle, raw scanner arrays and archive-contained DICOM series are not supported by this path. Each scan is limited to 128 MB compressed and expanded ZIP-entry bytes (a `.nii.gz` file still has the separate image expansion limit). Directory browsing is limited to 8 MB and 50,000 entries per archive, with a shared 128 MB search byte budget. Directory metadata is cached for five minutes, up to 24 archives; image bytes are not retained there. Servers must support HTTP 206 range responses; the app never silently downloads the full archive as fallback. An unreadable archive is reported as unchecked in search rather than classified as incompatible.

Regression coverage: `scripts/test-remote-zip.mts` exercises selective extraction, ZIP64, CRC/size validation, unsafe paths, cancellation, byte budgets and range refusal. Existing repository and collection URL validation remain in force. The renderer still validates scan contents after loading; a supported filename alone does not prove a valid MRI acquisition.

Browser QA loaded and rendered `imagesTs/imagesTs/oaizib_497_0000.nii.gz` from Zenodo record 14934086 (OAIZIB-CM), directly from the online ZIP. This verified actual browser CORS/range access, extraction integrity, NIfTI parsing and multiplanar/3D display. No full archive was downloaded.

Catalog lookup has a ten-second deadline. Verification then has a shared fifteen-second budget, with a six-second limit per record for both providers. Verified results appear incrementally and can be opened before remaining checks finish. Directly listed MRI volumes are recognized before archive probes, without additional network requests. An empty compatible-results page retains the next-page cursor for the operator to continue explicitly. Slow or failed checks are reported as unchecked, not incompatible. This deadline only applies to discovery; explicitly opening a record or downloading a scan retains the normal import deadline. Live browser search for `knee` returned the bilateral qDESS knee dataset (7749765).

## Respectful repository traffic

Search runs only on submission or **Find more**, never on each keystroke. Each action checks at most ten catalog records and does not automatically scan subsequent catalog pages. Completed discovery results are cached for five minutes (up to 20 query pages); failed, cancelled or unchecked results are not cached. All repository metadata, archive ranges and downloads share request pacing of at most one start per second per provider in the current browser page. OpenNeuro API and S3 requests share a queue; Zenodo has its own queue.

HTTP 429 or 503 stops further requests to that provider for at least 60 seconds, respecting a longer `Retry-After` value in either seconds or HTTP-date format. There are no automatic retries. Cancelled queued requests are not sent. These are per-page safeguards, not a global quota across tabs or users. Traffic tests use mocked responses rather than repeated public requests.

## OpenRouter assistant

Open **AI assistant** in the header. Its dock occupies a separate column on desktop and a separate row on mobile; it does not overlay the scan canvas. Select a model from the live OpenRouter catalog, searchable by provider/name with an optional free-token-price filter. Only text models advertising tool support are offered. Input/output prices are displayed per million tokens, not a quote for a whole request. Availability still depends on your OpenRouter account and provider restrictions. The catalog is cached for one hour per tab; refresh reuses that cache.

Open **AI assistant → OpenRouter API key** and paste your own key into the masked field. No macro, server secret, or deployment configuration is needed. Requests go directly from this browser to `https://openrouter.ai/api/v1`; the key is passed only in OpenRouter's Authorization header, never through NMRView's server. The key is kept in React memory for this tab, survives closing/reopening the assistant panel, and disappears on reload, closing the tab, or **Forget key**. It is not placed in localStorage, sessionStorage, URLs, logs, or chat history. Forget key also cancels an in-flight request; it cannot recall a request already sent. Only the selected model preference is saved locally. Set a spending limit on your OpenRouter key; usage is billed to your account. Requests are limited to six per minute per tab, one in flight, with a 45-second upstream timeout. This is not an account-wide budget. Catalog requests are public, key-free, and cached for an hour per tab.

Messages are sent to OpenRouter and the selected model provider. MRI filenames, acquisition geometry and a bounded extract of loaded case notes are optional and off by default, with a preview before sharing. Images, voxel arrays and API keys are never included in client payloads. Conversation is held in component memory and cleared when the panel closes; previous messages remain part of the current chat even if metadata sharing is later disabled. Start a new chat to discard previous context. NMRView’s server receives neither the key nor the conversation. Provider retention policies still apply.

The assistant can propose repository searches, main MRI layout/sampling changes, image fitting, opening the importer, and opening loaded case notes. The operator applies each proposal explicitly; supported display changes offer one-step undo. Searches use the existing compatibility checks, cancellation, cache and repository pacing. Result cards open the existing MRI scan browser without downloading images automatically. Comparison arrangement and scan interpretation are not automated. Answers are research/education assistance, not validated image interpretation or diagnosis.

`node --experimental-strip-types scripts/test-assistant.mts` checks direct OpenRouter destinations, key isolation in the Authorization header, catalog filtering/cache, payload limits, cancellation, model/action validation and pacing using mocked responses. Live inference requires an operator-supplied key in the application settings.

OpenRouter protocol references: [model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) and [tool calling](https://openrouter.ai/docs/guides/features/tool-calling).
