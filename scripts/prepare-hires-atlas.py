"""Losslessly package the official 2009b T1 NIfTI into static-host-sized parts.
Usage: python3 scripts/prepare-hires-atlas.py /path/to/mni_icbm152_nlin_asym_09b_nifti.zip
"""
import gzip, hashlib, io, json, pathlib, struct, sys, zipfile
root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'public/data/mni-hires'
out.mkdir(exist_ok=True)
with zipfile.ZipFile(sys.argv[1]) as z:
    raw = z.read('mni_icbm152_nlin_asym_09b/mni_icbm152_t1_tal_nlin_asym_09b_hires.nii')
    license_text = z.read('COPYING')
assert struct.unpack_from('<3h', raw, 42) == (394,466,378)
assert struct.unpack_from('<3f', raw, 80) == (.5,.5,.5)
compressed = gzip.compress(raw, compresslevel=6, mtime=0)
parts=[]
for i, start in enumerate(range(0,len(compressed),22*1024*1024)):
    part=compressed[start:start+22*1024*1024]
    name=f't1-{i:02}.bin'
    (out/name).write_bytes(part)
    parts.append({'name':name,'bytes':len(part),'sha256':hashlib.sha256(part).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'source':'https://www.bic.mni.mcgill.ca/~vfonov/icbm/2009/mni_icbm152_nlin_asym_09b_nifti.zip','name':'MNI152_T1_2009b_0.5mm.nii.gz','dimensions':[394,466,378],'voxelMM':[.5,.5,.5],'uncompressedSha256':hashlib.sha256(raw).hexdigest(),'bytes':len(compressed),'parts':parts},indent=2)+'\n')
(out/'COPYING.txt').write_bytes(license_text)
assert gzip.decompress(b''.join((out/p['name']).read_bytes() for p in parts)) == raw
print(f'Packaged and verified {len(parts)} parts, {len(compressed)} bytes; NIfTI unchanged.')
