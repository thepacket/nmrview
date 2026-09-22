import assert from 'node:assert/strict';
import {matchTCIACollections, tciaCollections} from '../lib/tcia.ts';
const record={slug:'prostate-mri',collection_short_title:'PROSTATE-MRI',collection_title:'Prostate MRI',collection_doi:'10.7937/K9/TCIA.2016.6046GUDv'};
const c={collection_id:'prostate_mri',collection_name:'PROSTATE-MRI',description:'',tumor_locations:'Prostate',cancer_types:'',subjects:26,series_count:182};
assert.equal(matchTCIACollections([record],[c])[0].source_url,'https://www.cancerimagingarchive.net/collection/prostate-mri/');
assert.equal(matchTCIACollections([record],[{...c,collection_id:'other',collection_name:'Other data'}]).length,0);
assert.equal(matchTCIACollections([record,{...record,slug:'duplicate'}],[c]).length,0,'ambiguous matches excluded');
assert.equal(matchTCIACollections([{...record,slug:'../../bad'}],[c]).length,0);
const original=globalThis.fetch;
const urls:string[]=[];
try {
 globalThis.fetch=async (url)=>{
  const value=String(url); urls.push(value);
  if(value.includes('cancerimagingarchive.net')) return Response.json([record]);
  if(value.endsWith('/collections')) return Response.json([c,{...c,collection_id:'other',collection_name:'Other data'}]);
  if(value.endsWith('/sql')) return Response.json({rows:[{collection_id:c.collection_id,series_count:182},{collection_id:'other',series_count:4}],truncated:false});
  throw Error('Unexpected endpoint');
 };
 const signal=new AbortController().signal;
 assert.equal((await tciaCollections(signal)).length,1);
 await tciaCollections(signal);
 assert.equal(urls.length,3,'catalogs cached, no image downloads or repeated requests');
 console.log('PASS: exact TCIA provenance, ambiguous/unmapped exclusion, safe links, catalog intersection and cache');
} finally {globalThis.fetch=original;}
