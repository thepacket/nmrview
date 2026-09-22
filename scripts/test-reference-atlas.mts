import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const root=new URL("../public/data/mni-hires/",import.meta.url);
const m=JSON.parse(readFileSync(new URL("manifest.json",root),"utf8"));
const chunks=m.parts.map((p:{name:string;bytes:number;sha256:string})=>{
 const data=readFileSync(new URL(p.name,root));assert.equal(data.length,p.bytes);assert(data.length<25*1024*1024);assert.equal(createHash("sha256").update(data).digest("hex"),p.sha256);return data;
});
const raw=gunzipSync(Buffer.concat(chunks));
assert.equal(createHash("sha256").update(raw).digest("hex"),m.uncompressedSha256);
assert.deepEqual([42,44,46].map(i=>raw.readInt16LE(i)),[394,466,378]);
assert.deepEqual([80,84,88].map(i=>raw.readFloatLE(i)),[.5,.5,.5]);
assert.equal(raw.length,138804976);
console.log("Official atlas parts, hashes, unchanged NIfTI dimensions and 0.5 mm spacing verified.");
