# NMRView

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

OpenNeuro uses the latest public S3 mirror, **not a pinned historical snapshot**, even when a dataset version URL is supplied. In-app keyword discovery searches OpenNeuro’s public MRI catalog and Zenodo’s open records, with pagination, descriptions, authors and license details. Filters distinguish raw/derivative MRI datasets or Zenodo datasets/all record types. Catalog results are filtered before display. OpenNeuro results require supported volume files in the inspected listings; Zenodo spectra and spectrum ZIPs must pass the 1D parser. Documents, unrelated tables, pathology images, raw FIDs and incompatible archives are excluded. Checks use three concurrent requests, bounded catalog/listing pages and a 128 MB spectrum inspection budget per search. Records that cannot be verified within these limits are omitted; this is not an exhaustive catalog of all potentially compatible data. Compatibility verdicts are cached without retaining scan buffers. Known-ID lookup remains available. Direct MRI archives, authenticated repositories, PACS and DICOMweb are not supported. Repository outages, browser access policies and rate limits can prevent downloads. No server proxy is used.

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

After browsing an MRI repository, choose **Load all participants for comparison**. The app follows the remaining listing pages and groups supported files by BIDS `sub-` and `ses-` identifiers. All discovered participant/session studies appear in a searchable library; one anatomical scan is suggested per study. Files without participant identifiers are not assigned to a person. Collections require these identifiers and currently support directly listed volumes, not MRI archives.

Select one to four studies for separate GPU-rendered panes, choose each scan, change the shared plane, adjust individual intensity ranges, or inspect frames in a time series. Optional slice linking uses relative volume position; it does not register anatomy. **Open in main viewer** gives access to the existing measurement and layer tools. The library loads metadata for everyone and downloads scan bytes only for displayed participants. Comparison limits are 128 MB downloaded and 256 MB decoded per scan; collections and selections are held in memory and are not included in session exports.

**Case notes** displays available participant metadata, study README, dataset description, license, source links and the selected OpenNeuro scan's individual JSON sidecar. Missing notes are explicitly identified; inherited BIDS sidecars are not resolved. Zenodo study descriptions and document links are also available after repository imports. Source metadata are displayed as supplied, not interpreted as a diagnosis.

`node --experimental-strip-types scripts/test-study-collection.mts` checks participant/session separation, anatomical defaults and metadata parsing. Browser QA loaded all 155 participants from OpenNeuro ds000228, rendered three participants, opened participant metadata and returned to the images without discarding loaded panes.
