# Spectroscopy workflows

Open **NMR spectroscopy**, then choose **Laboratory NMR**, **2D NMR**, or **Tissue MRS**. Switching views retains loaded data in this tab. New online imports use the existing host allowlist, request pacing, size limits and cancellation. No processing service or patient-data upload is introduced.

## Laboratory 1D NMR

The existing JCAMP-DX and CSV workflow retains peak picking, integration, referencing, baseline correction, overlay/stacked layouts, SVG and session exports. CSV now also accepts three columns: `ppm,real,imaginary`. Both complex arrays are retained, and zero/first-order phase controls appear only when imaginary data exist. Phase is in degrees, with first-order pivot at the ppm axis midpoint. Baseline estimation uses the phase-corrected spectrum. Changing processing clears dependent peak/integral analyses; display gain does not affect numerical results. Session exports retain the complex data and phase settings.

**Analysis & quality** adds:

- User-selected signal and signal-free noise intervals. Noise is sample standard deviation after least-squares linear detrending, with n−2 degrees of freedom. SNR is positive peak height above the extrapolated noise baseline divided by noise SD. This is an explicitly defined estimate, not interchangeable with other packages' SNR definitions.
- Interpolated full width at half maximum in ppm, and Hz when observe frequency is known. Missing crossings give unavailable results. Overlapping lines, phase, baseline, broadening and a contaminated noise interval bias these estimates.
- Adjacent picked-peak spacings in Hz within the signal interval. These are candidate couplings, not automatic multiplet assignments.
- Bounded normalized cross-correlation alignment against a selected spectrum of the same known nucleus. At least 16 common samples, correlation ≥0.8 and a non-boundary solution are required. Review the overlay; one-step undo restores the previous reference shift. Chemical shift changes invalidate previous analyses.
- Review JSON containing metadata, method, selected intervals, results, phase/reference/baseline parameters, peaks, integrals and operator notes. Export the plot separately as SVG, or package the review and plot together as ZIP.

## Processed 2D laboratory NMR

Load a direct public Zenodo or OpenNeuro S3 file URL in **2D NMR**. Accepted input:

- Processed 2D JCAMP-DX whose two independent NTUPLES axes explicitly use ppm.
- Rectangular, uniformly spaced CSV grids with the exact header `f2_ppm,f1_ppm,intensity`; each coordinate pair appears once.

Limits: 32 MB download, one million cells, 60-second import deadline. Parsing runs in a worker. The intensity map preserves positive (teal) and negative (pink) values, with no interpolation smoothing. Adjust display threshold, zoom and horizontal/vertical position. Clicking records sampled coordinates and intensity, without claiming a peak assignment. Export the plot and picked-coordinate JSON. Raw indirect-dimension processing, contour fitting and automatic cross-peak assignments are not implemented.

## Tissue MRS

Load a direct public `.nii`/`.nii.gz` URL in **Tissue MRS**. The dedicated importer accepts NIfTI-MRS complex64/complex128 time-domain acquisitions with the MRS intent and JSON extension code 44. It does not treat an ordinary anatomical NIfTI file as a spectrum.

Limits: 64 MB downloaded, 128 MB decompressed, eight million complex samples, 16–65,536 time points per FID. The worker retains original data and is terminated on cancellation or a 60-second processing deadline. Higher-dimensional coil, dynamic and editing indices are selected individually, never implicitly averaged. Spatial k-space is rejected. Positive-gyromagnetic nuclei currently supported for display: 1H, 13C, 19F, 23Na and 31P.

Missing header units require the operator to explicitly confirm seconds and millimetres. Unsupported nonzero unit codes are not overridden. This choice is recorded in the metadata. An example from the standard's [public example collection](https://zenodo.org/records/5085449), `example_10.nii.gz`, was checked in the browser; its old header omits units. Reference data remain subject to their source license.

### Processing and comparison

Processing uses a forward, negative-exponential FFT, first-point half weighting, and zero filling to the next power of two. Zero filling interpolates the spectral sampling and does not improve acquired resolution. Ppm increases to the left. For the supported nuclei, ppm = receiver reference − FFT frequency / observe frequency + user shift.

Zero/first-order phase, frequency shift, optional linear edge baseline and exponential FID apodization are reversible. Line broadening defaults to **0 Hz**. The initial 1H receiver reference is **4.65 ppm**, an editable assumption that must be verified against acquisition/reference information; other nuclei start at zero. No water removal, eddy-current correction, coil combination or dynamic alignment is silently applied.

Pin up to three processed selections beside the current selection on a shared amplitude scale. Pins freeze their spectrum and processing provenance. Quality review also offers a user-defined water-region absolute peak ratio for 1H; this is not water concentration or an automatic pass/fail verdict.

### Anatomical location

Load the matching anatomical scan in the main MRI viewer, then explicitly confirm it belongs to the same participant and registered coordinate space. The MRS review makes a separate copy (maximum 128 MB) and overlays the selected encoded voxel. It does not modify the main viewer's labels. Sform is preferred; qform-only NIfTI-1/2 is supported. Geometry is converted to millimetres. Missing, singular or unlocalized geometry disables the link. No registration or subject matching is performed. Voxel extent is not the RF excitation profile.

### Basis fitting and maps

The initial fitter is a **restricted research linear-basis fitter**, not a replacement for FSL-MRS, LCModel or a clinical quantification workflow. It fits nonnegative fixed spectral-template amplitudes plus an unconstrained linear baseline over the visible ppm interval. It does not optimize component frequency shifts/linewidths or simulate acquisition-specific basis functions. Basis and data must already have compatible phase, referencing, line shapes and processing. Edge-baseline correction must be disabled when fitting.

The operator supplies an acquisition-matched basis JSON through a public repository URL, confirms compatibility, and runs the fit explicitly. Nucleus and frequency must match (frequency tolerance 0.1%); EchoTime and SequenceName must match acquisition metadata. Supported per-acquisition header overrides are resolved before checking. Singular/near-collinear bases and non-convergence are rejected. Amplitudes use **arbitrary basis units**, not absolute concentrations. Reported errors are conditional OLS approximations under fixed-model assumptions, not CRLB estimates or validated confidence intervals.

The plot can show total fit, residuals, fitted baseline and individual components. For multivoxel data, fit the current XY slice (maximum 256 voxels) to create an amplitude or component-ratio map. Failed fits and components below three approximate standard errors are masked. A ratio denominator must also exceed that threshold. The acquisition-grid map is not an anatomical orientation; use the registered anatomy overlay for location. Map values, mask, residual errors and geometry are exported in JSON. Map display uses a relative color scale; numerical values are retained in the export.

#### Basis exchange format

The complete schema is enforced by `lib/nmr/basis.ts`. A JSON object has:

- `format`: `nmrview-basis-1`
- `name`, `source`: meaningful template identification and provenance
- `nucleus`, `frequencyMHz`, `echoTimeSeconds`, `sequence`: matching acquisition values
- `x`: strictly increasing ppm samples (16–8,192)
- `components`: 1–20 objects, each with a unique `name` and an equal-length finite `y` array

At least 32 data samples and eight per component are required; at most 8,192 data samples may be fitted. Do not relabel unrelated laboratory spectra as tissue-metabolite bases. No validated basis collection is bundled. Reference: [FSL-MRS fitting and basis requirements](https://pages.fmrib.ox.ac.uk/fsl/fsl_mrs/fitting.html).

### Export and AI

**Export complete review ZIP** packages the displayed spectrum, optional linked anatomical view, processed CSV, acquisition/processing metadata and available fit/map results. Use **Include in complete review** in the quality dialog to add quality settings and operator notes to that ZIP; processing or voxel changes invalidate the attached quality review. They can also be exported separately. The original FID is never overwritten; reload it from its source to reproduce the recorded processing. Review packages may contain identifying metadata and images.

The existing AI attachment workflow now accepts visible 1D/2D spectra, tissue-MRS plots and the explicitly linked anatomical view. Capture is local; transmission still requires the operator to attach, preview and explicitly send to an image-capable model. AI explains visible patterns and supplied metadata; numerical processing and fitting run independently of the model.

## Verification and limits

`node --experimental-strip-types scripts/test-spectroscopy-analysis.mts` checks analytical line width, SNR intervals, alignment direction, coupling spacing, complex phase/session round-trip, FFT sign, known basis coefficients, degeneracy rejection, grid validation, MRS dimensions/units and NIfTI-2 qform geometry. Existing spectroscopy parser/integration and performance tests remain applicable.

This is functional and numerical regression coverage, not clinical validation. Quantitative concentration estimation, relaxation/tissue corrections, nonlinear metabolite fitting, raw vendor formats, automatic multiplet assignments, and independent anatomical/clinical validation remain outside this implementation.

## Required and optional inputs

One NIfTI-MRS acquisition is sufficient for spectrum display, processing, comparison, quality review and export. Fitting and anatomical localization are optional, collapsed sections. A conventional MRI cannot replace the spectroscopy acquisition.

After loading, NMRView checks the online source in the background without blocking spectrum use. For Zenodo, it reads one record listing, the exact acquisition JSON sidecar if present, and at most three JSON files with “basis” in their names. It loads a basis only if exactly one inspected candidate matches nucleus, frequency (0.1% tolerance), echo time and sequence. Processing and amplitude conventions still require operator verification before fitting. Multiple matches are not automatically selected. Standard basis formats other than `nmrview-basis-1` are not converted.

For OpenNeuro S3 files, the exact adjacent JSON sidecar is checked; inherited BIDS sidecars and remote basis discovery are not currently resolved. Notes are displayed as formatted metadata and included in review exports; they do not override the acquisition header. Discovery uses the existing repository pacing, a 30-second deadline and bounded downloads. Missing optional files never prevent viewing.

Anatomical scans are not chosen automatically: sharing a repository does not establish participant identity or spatial registration. Load the matching MRI in the main view and confirm its coordinate space in the optional anatomy section.
