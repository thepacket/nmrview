"""Generate a small, anonymous 3-slice MRI test series; no patient data."""
import struct, pathlib, math
out=pathlib.Path('/tmp/nmrview-dicom-test');out.mkdir(exist_ok=True)
def element(group,tag,vr,value):
 if isinstance(value,str): value=value.encode('ascii')
 if len(value)%2:value+=b'\0' if vr=='UI' else b' '
 key=struct.pack('<HH',group,tag)+vr.encode()
 return key+(b'\0\0'+struct.pack('<I',len(value)) if vr in ('OB','OW','SQ','UN','UT') else struct.pack('<H',len(value)))+value
for z in range(3):
 uid=f'1.2.826.0.1.3680043.10.999.3.{z+1}'
 meta=b''.join([element(2,1,'OB',b'\0\1'),element(2,2,'UI','1.2.840.10008.5.1.4.1.1.4'),element(2,3,'UI',uid),element(2,16,'UI','1.2.840.10008.1.2.1'),element(2,18,'UI','1.2.826.0.1.3680043.10.999')])
 tags=[(8,8,'CS','ORIGINAL\\PRIMARY\\M'),(8,22,'UI','1.2.840.10008.5.1.4.1.1.4'),(8,24,'UI',uid),(8,32,'DA','20200101'),(8,96,'CS','MR'),(8,112,'LO','NMRVIEW TEST'),(8,4158,'LO','Synthetic geometry QA'),(16,16,'PN','Synthetic^Phantom'),(16,32,'LO','QA-ONLY'),(24,80,'DS','3'),(24,128,'DS','2000'),(24,129,'DS','20'),(24,136,'DS','3'),(32,13,'UI','1.2.826.0.1.3680043.10.999.1'),(32,14,'UI','1.2.826.0.1.3680043.10.999.2'),(32,17,'IS','1'),(32,19,'IS',str(z+1)),(32,50,'DS',f'0\\0\\{z*3}'),(32,55,'DS','1\\0\\0\\0\\1\\0'),(40,2,'US',struct.pack('<H',1)),(40,4,'CS','MONOCHROME2'),(40,16,'US',struct.pack('<H',32)),(40,17,'US',struct.pack('<H',32)),(40,48,'DS','2\\1'),(40,256,'US',struct.pack('<H',16)),(40,257,'US',struct.pack('<H',16)),(40,258,'US',struct.pack('<H',15)),(40,259,'US',struct.pack('<H',0))]
 pixels=b''.join(struct.pack('<H',int(100+z*100+x+y*2) if (x-16)**2+(y-16)**2<180 else 0) for y in range(32) for x in range(32))
 data=b'\0'*128+b'DICM'+element(2,0,'UL',struct.pack('<I',len(meta)))+meta+b''.join(element(*t) for t in tags)+element(0x7fe0,0x10,'OW',pixels)
 (out/f'slice-{z+1}.dcm').write_bytes(data)
print(out)
