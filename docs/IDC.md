# Imaging Data Commons (IDC)

In the **MRI imaging** workspace, open **Import scans** and select **IDC · public MRI series** under **Online repository**. No account, API key or server proxy is required. Requests go directly to IDC's public metadata API and public AWS storage; local scans are never uploaded.

## Find and load a series

1. Choose **Browse MRI collections**. Search locally by collection name, anatomy, disease or description, then choose a collection’s **Browse** button. Only collections containing MRI are shown; descriptions expand in place. This clears previous region/participant/examination filters. Alternatively, choose **Load body-region filters**, then select a region, or leave **All regions** selected. Region labels come from IDC metadata across all modalities, so some have no MRI results. Scans without a body-region tag appear only under All regions.
2. Optionally enter an exact collection ID and participant ID. These fields are case-sensitive identifiers, not keyword search.
3. Choose **Find MRI series**. Results are grouped by collection, participant and examination, with acquisition descriptions, DICOM instance counts and estimated download sizes. Study and series identifiers are expandable. **Browse this examination** narrows the search to that study without requiring an identifier to be copied. It clears the body-region filter so missing body-part tags do not exclude related sequences.
4. Choose **Load complete series**. NMRView retrieves the source documentation and license information, checks the full object listing, downloads the DICOM files and converts them locally using its existing dcm2niix worker.
5. The converted volume opens in the main MRI viewer. Collection documentation and selected-series provenance are available through the existing case notes controls.

**Replace current study** defaults to enabled. Disable it only when adding already aligned data for the same participant; NMRView does not register unrelated scans automatically.

## Bounded access

- Only MRI (`MR`) series are searched. CT, PET, pathology and segmentation objects are not offered by this connector.
- Ten series are requested per page. **Load more series** explicitly appends the next page and deduplicates sequences. Groups cover loaded pages only and may represent incomplete examinations. Browsing stops after 20 pages (200 series); narrow the filters to continue. There is no background crawl.
- Opening the collection catalog makes two metadata requests: collection descriptions and a fixed aggregate MRI-count query. Text filtering and **Show more collections** run locally without additional network requests. Catalog counts include MRI series above the individual import limits, and participant totals describe the whole collection, not only MRI participants.
- Metadata responses are cached for five minutes, with at most 40 cached requests. Lookups time out after 30 seconds.
- Imports are limited to 1,000 instances and 512 MB per series. Actual object sizes are checked before downloading; every downloaded size and the complete instance count are checked before opening the series.
- Downloads use at most three concurrent requests with request starts paced at least 300 ms apart. Throttling pauses requests through the existing retry-after policy; there are no automatic retries.
- The download operation has a five-minute deadline. The existing DICOM conversion worker has its own two-minute deadline.
- Cancellation or a missing, duplicate, truncated or incomplete object listing prevents a partial series from being opened.

A metadata result is a candidate MRI acquisition, not a guarantee that every DICOM encoding or geometry can be converted. Localizers, unusual enhanced objects and vendor-specific encodings may fail or produce multiple volumes. Collection licenses differ; free access does not remove source attribution or reuse conditions.

## Current boundaries

This connector loads one series at a time. Multi-series batch loading, automatic comparison setup, IDC segmentations, clinical-table queries, free-text clinical search and pinned historical IDC releases are not implemented. OpenNeuro and Zenodo remain available in their existing workflows; fastMRI is not connected.

## Development and verification

```sh
node --experimental-strip-types scripts/test-idc.mts
node --experimental-strip-types scripts/test-repository-traffic.mts
npm run typecheck
npm run build
```

Tests use synthetic metadata and mocked API requests to check MRI filtering, query bounds, cache reuse, cancellation, storage allowlisting, size limits, complete-series validation, MRI-only collection filtering, local text search and examination grouping. Grouping keys include collection, participant and study, preventing unrelated examinations from being merged. They make no requests to public repositories.

Browser verification loaded the public `cmb_pca` / `MSB-04780` **Cor T2 Prop.** series (30 DICOM instances) into a 512 × 512 × 30 volume and confirmed its collection notes and CC BY 4.0 license in Study documentation. This is a functional integration check, not a clinical or exhaustive DICOM validation.

Official references:

- [IDC API user guide](https://github.com/ImagingDataCommons/IDC-REST-MCP/blob/main/docs/user-guide.md)
- [IDC download mechanisms](https://learn.canceridc.dev/data/downloading-data)
- [IDC collections and source documentation](https://portal.imaging.datacommons.cancer.gov/collections/)

NMRView uses the public `/v3/cohort/manifest` metadata endpoint and downloads complete DICOM objects from AWS. It does not use IDC's viewer-only DICOMweb proxy for bulk downloads.
