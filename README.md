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
