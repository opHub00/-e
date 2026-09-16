"""Local HWP5 paragraph extraction. Requires olefile==0.47; never infers pages.
Usage: python scripts/extract-hwp-text.py INPUT.hwp OUTPUT.json
Record offsets identify the decompressed BodyText stream, not file/page offsets.
"""
import hashlib
import json
import pathlib
import struct
import sys
import zlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.cache/hwp-parser'))
import olefile

source, output = map(pathlib.Path, sys.argv[1:])
data = source.read_bytes()
records = []
controls = []
memo_headers = []
with olefile.OleFileIO(data) as ole:
    header = ole.openstream('FileHeader').read()
    if not header.startswith(b'HWP Document File'):
        raise ValueError('Not an HWP5 document')
    flags = struct.unpack_from('<I', header, 36)[0]
    if flags & 2 or flags & 4:
        raise ValueError('Encrypted/distribution document is unsupported')
    for path in sorted(ole.listdir(), key=lambda p: (p[0], int(p[1][7:]) if len(p)>1 and p[1].startswith('Section') else 0)):
        if len(path) != 2 or path[0] != 'BodyText' or not path[1].startswith('Section'):
            continue
        body = ole.openstream(path).read()
        if flags & 1:
            body = zlib.decompress(body, -15)
        offset = 0
        while offset < len(body):
            start = offset
            h = struct.unpack_from('<I', body, offset)[0]; offset += 4
            tag, level, size = h & 1023, (h >> 10) & 1023, h >> 20
            if size == 4095:
                size = struct.unpack_from('<I', body, offset)[0]; offset += 4
            chunk = body[offset:offset+size]; offset += size
            if len(chunk) != size:
                raise ValueError('Truncated HWP record')
            if tag == 71 and chunk[:4].decode('latin1')[::-1].startswith('%'):
                controls.append({'stream':'/'.join(path),'offset':start,'precedingParagraph':len(records)-1,'id':chunk[:4].decode('latin1')[::-1],'hex':chunk.hex()})
            if tag in [92,93]:
                memo_headers.append({'tag':tag,'offset':start,'nextParagraph':len(records),'hex':chunk.hex()})
            if tag != 67:
                continue
            units = struct.unpack('<' + 'H' * (len(chunk)//2), chunk)
            chars, i = [], 0
            while i < len(units):
                c = units[i]
                if c in [1,2,3,4,5,6,7,8,9,11,12,14,15,16,17,18,19,20,21,22,23]:
                    if c == 9: chars.append('\t')
                    i += 8
                else:
                    if c >= 32: chars.append(chr(c))
                    elif c in [10,13]: chars.append('\n')
                    i += 1
            text = ''.join(chars).encode('utf-16-le', 'surrogatepass').decode('utf-16-le').strip()
            if text:
                records.append({'stream':'/'.join(path),'offset':start,'level':level,'text':text})
result = {'fileName':source.name,'sha256':hashlib.sha256(data).hexdigest(),'paragraphs':records,'fieldControls':controls,'memoHeaders':memo_headers}
output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
output.with_suffix('.txt').write_text('\n'.join(f"[{i}] {r['text']}" for i,r in enumerate(records)), encoding='utf-8')
print(json.dumps({'sha256':result['sha256'],'paragraphs':len(records)},ensure_ascii=False))
