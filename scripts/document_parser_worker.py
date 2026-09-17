"""Bounded, local-only PDF/HWP5/HWPX parsing. No document scripts/macros are executed.
Run through the Node parser adapter (timeout, clean environment, hash binding).
"""
import argparse
import hashlib
import io
import json
import pathlib
import re
import struct
import sys
import zipfile
import zlib
import xml.etree.ElementTree as ET

VERSION = 'document-parser-v1'
MAX_BYTES = 50_000_000
MAX_EXPANDED = 128_000_000
MAX_BLOCKS = 50000
MAX_CHARS = 8_000_000


class ParseFailure(Exception):
    pass


def inflate(data):
    decoder = zlib.decompressobj(-15)
    value = decoder.decompress(data, MAX_EXPANDED + 1)
    if len(value) > MAX_EXPANDED or decoder.unconsumed_tail or not decoder.eof:
        raise ParseFailure('DECOMPRESSION_LIMIT_OR_TRUNCATED')
    return value


def hwp_text(chunk):
    if len(chunk) % 2:
        raise ParseFailure('INVALID_UTF16_RECORD')
    units = struct.unpack('<' + 'H' * (len(chunk) // 2), chunk)
    chars, index = [], 0
    while index < len(units):
        code = units[index]
        if code in [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]:
            if index + 8 > len(units):
                raise ParseFailure('TRUNCATED_HWP_CONTROL')
            if code == 9:
                chars.append('\t')
            index += 8
        else:
            if code >= 32:
                chars.append(chr(code))
            elif code in [10, 13]:
                chars.append('\n')
            index += 1
    return ''.join(chars).encode('utf-16-le', 'surrogatepass').decode('utf-16-le', 'replace').strip()


class Builder:
    def __init__(self):
        self.blocks, self.tables, self.warnings = [], [], []
        self.attempts, self.characters = 0, 0
        self.sections = []

    def block(self, text, locator, kind=None):
        self.attempts += 1
        text = text.strip()
        if not text:
            return None
        self.characters += len(text)
        if len(self.blocks) >= MAX_BLOCKS or self.characters > MAX_CHARS:
            raise ParseFailure('TEXT_LIMIT')
        # Heuristic headings are labelled; never invent a source section/page.
        heading = len(text) < 180 and bool(re.match(r'^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+[.\s]|[IVX]+\.\s|\d+[.\s]+(?:신청|공급|청약|특별|일반|유의)|\[?표\s*\d+)', text))
        if heading:
            self.sections = [text]
        block = {'id': f'b{len(self.blocks):06d}', 'type': kind or ('heading' if heading else 'paragraph'),
                 'text': text, 'sectionPath': list(self.sections), 'sourceLocator': locator}
        self.blocks.append(block)
        return block

    def table(self, locator, rows, columns, fidelity):
        if rows <= 0 or columns <= 0 or rows * columns > 20000 or len(self.tables) > 2000:
            raise ParseFailure('TABLE_LIMIT')
        table = {'id': f't{len(self.tables):05d}', 'caption': None, 'rows': [[] for _ in range(rows)],
                 'rowCount': rows, 'columnCount': columns, 'sourceLocator': locator,
                 'fidelity': fidelity, 'warnings': []}
        self.tables.append(table)
        return table


def parse_hwp(data, b):
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.cache/hwp-parser'))
    import olefile
    if not data.startswith(bytes.fromhex('d0cf11e0a1b11ae1')):
        raise ParseFailure('INVALID_HWP_SIGNATURE')
    metadata = {'pagesStable': False, 'memoAnchors': [], 'parserLibrary': 'olefile ' + olefile.__version__}
    with olefile.OleFileIO(data) as ole:
        header = ole.openstream('FileHeader').read()
        if len(header) < 40 or not header.startswith(b'HWP Document File'):
            raise ParseFailure('INVALID_HWP_HEADER')
        flags = struct.unpack_from('<I', header, 36)[0]
        if flags & 2:
            raise ParseFailure('ENCRYPTED_HWP')
        if flags & 4:
            raise ParseFailure('DISTRIBUTION_PROTECTED_HWP')
        expanded = 0
        paths = sorted([p for p in ole.listdir() if len(p) == 2 and p[0] == 'BodyText' and re.fullmatch(r'Section\d+', p[1])], key=lambda p: int(p[1][7:]))
        if not paths:
            raise ParseFailure('NO_BODY_TEXT')
        for path in paths:
            stream = '/'.join(path)
            if ole.get_size(path) > MAX_BYTES:
                raise ParseFailure('STREAM_LIMIT')
            body = ole.openstream(path).read()
            if flags & 1:
                body = inflate(body)
            expanded += len(body)
            if expanded > MAX_EXPANDED:
                raise ParseFailure('EXPANDED_DOCUMENT_LIMIT')
            offset, stack, memo = 0, [], None
            while offset < len(body):
                start = offset
                if offset + 4 > len(body):
                    raise ParseFailure('TRUNCATED_RECORD_HEADER')
                h = struct.unpack_from('<I', body, offset)[0]; offset += 4
                tag, level, size = h & 1023, (h >> 10) & 1023, h >> 20
                if size == 4095:
                    if offset + 4 > len(body):
                        raise ParseFailure('TRUNCATED_RECORD_SIZE')
                    size = struct.unpack_from('<I', body, offset)[0]; offset += 4
                if offset + size > len(body):
                    raise ParseFailure('TRUNCATED_RECORD')
                chunk = body[offset:offset + size]; offset += size
                while stack and level <= stack[-1]['level']:
                    stack.pop()
                locator = {'kind': 'HWP_RECORD', 'pageNumber': None, 'stream': stream, 'recordOffset': start, 'recordLevel': level}
                if tag == 71:
                    control = chunk[:4][::-1]
                    if control == b'tbl ':
                        stack.append({'level': level, 'table': None, 'cell': None})
                    if control.startswith(b'%'):
                        # Field command UTF-16 starts after an odd-width binary header.
                        # Find its literal bytes rather than decoding the entire misaligned record.
                        command_start = chunk.find('MEMO/'.encode('utf-16-le'))
                        command = chunk[command_start:] if command_start >= 0 else b''
                        match = re.search(r'MEMO/\d+/(\d+)', command[:len(command) // 2 * 2].decode('utf-16-le', 'ignore'))
                        if match:
                            metadata['memoAnchors'].append({'memoId': int(match[1]), 'precedingBlockId': b.blocks[-1]['id'] if b.blocks else None, 'sourceLocator': locator})
                if tag == 93 and len(chunk) >= 4:
                    memo = struct.unpack_from('<I', chunk)[0]
                if tag == 77 and stack and level == stack[-1]['level'] + 1:
                    rows, cols = struct.unpack_from('<HH', chunk, 4)
                    stack[-1]['table'] = b.table(locator, rows, cols, 'STRUCTURAL')
                if tag == 72 and stack and stack[-1]['table'] and level == stack[-1]['level'] + 1:
                    # Modern HWP5 list header: paragraph count/reserved + property flags = 8 bytes.
                    # Reject incompatible layouts; do not guess offsets or cell coordinates.
                    if len(chunk) < 34:
                        raise ParseFailure('UNSUPPORTED_HWP_CELL_HEADER')
                    col, row, colspan, rowspan = struct.unpack_from('<HHHH', chunk, 8)
                    table = stack[-1]['table']
                    if not colspan or not rowspan or row + rowspan > table['rowCount'] or col + colspan > table['columnCount']:
                        raise ParseFailure('INVALID_HWP_CELL_ADDRESS')
                    cell = {'row': row, 'column': col, 'rowSpan': rowspan, 'columnSpan': colspan, 'text': '', 'blockIds': [],
                            'sourceLocator': {**locator, 'tableId': table['id'], 'row': row, 'column': col}}
                    table['rows'][row].append(cell); stack[-1]['cell'] = cell
                    if rowspan > 1 or colspan > 1:
                        table['warnings'] = ['MERGED_CELLS_PRESERVED']
                if tag == 67:
                    text = hwp_text(chunk)
                    locator['paragraphIndex'] = len(b.blocks)
                    if memo is not None:
                        locator['memoId'] = memo
                    cell = stack[-1]['cell'] if stack and stack[-1]['table'] else None
                    if cell:
                        locator.update({k: cell['sourceLocator'][k] for k in ['tableId', 'row', 'column']})
                    block = b.block(text, locator, 'note' if memo is not None else None)
                    if block and cell:
                        cell['blockIds'].append(block['id']); cell['text'] += ('\n' if cell['text'] else '') + block['text']
    b.warnings.extend(['HWP_PAGES_UNSTABLE', 'LAYOUT_TABLES_NOT_SEMANTICALLY_CLASSIFIED'])
    if metadata['memoAnchors'] or any('memoId' in x['sourceLocator'] for x in b.blocks):
        b.warnings.append('REVIEW_MEMOS_PRESENT')
    return metadata, None


def parse_pdf(data, b):
    import pdfplumber
    from pypdf import PdfReader
    if not data.startswith(b'%PDF-'):
        raise ParseFailure('INVALID_PDF_SIGNATURE')
    reader = PdfReader(io.BytesIO(data), strict=False)
    if reader.is_encrypted:
        raise ParseFailure('ENCRYPTED_PDF')
    pages = len(reader.pages)
    if not 1 <= pages <= 150:
        raise ParseFailure('PDF_PAGE_LIMIT')
    page_chars = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for number, page in enumerate(pdf.pages, 1):
            if len(page.chars) > 150000:
                raise ParseFailure('PDF_PAGE_CHARACTER_LIMIT')
            lines = page.extract_text_lines(strip=True)
            before = b.characters
            for line in lines:
                b.block(line['text'], {'kind': 'PDF_BBOX', 'pageNumber': number, 'bbox': [line[k] for k in ['x0', 'top', 'x1', 'bottom']]})
            page_chars.append(b.characters - before)
            for found in page.find_tables():
                values = found.extract()
                if not values:
                    continue
                table = b.table({'kind': 'PDF_BBOX', 'pageNumber': number, 'bbox': list(found.bbox)}, len(values), max(map(len, values)), 'GEOMETRY_INFERRED')
                table['warnings'] = ['PDF_TABLE_GRID_REQUIRES_REVIEW']
                xs = sorted(set(round(x, 2) for c in found.cells for x in [c[0], c[2]]))
                ys = sorted(set(round(y, 2) for c in found.cells for y in [c[1], c[3]]))
                seen = set()
                for ri, row in enumerate(found.rows):
                    for ci, bbox in enumerate(row.cells):
                        if bbox is None or tuple(bbox) in seen:
                            continue
                        seen.add(tuple(bbox))
                        span_x = sum(round(bbox[0], 2) <= x < round(bbox[2], 2) for x in xs)
                        span_y = sum(round(bbox[1], 2) <= y < round(bbox[3], 2) for y in ys)
                        cell_text = values[ri][ci] or ''
                        table['rows'][ri].append({'row': ri, 'column': ci, 'rowSpan': span_y or None, 'columnSpan': span_x or None,
                            'text': cell_text, 'blockIds': [], 'sourceLocator': {'kind': 'PDF_BBOX', 'pageNumber': number,
                            'bbox': list(bbox), 'tableId': table['id'], 'row': ri, 'column': ci}})
            page.close()
    b.warnings.extend(['PDF_READING_ORDER_REQUIRES_REVIEW', 'PDF_TABLE_GRID_REQUIRES_REVIEW'])
    if any(n < 20 for n in page_chars):
        b.warnings.append('PAGES_WITH_LITTLE_TEXT_NO_OCR')
    return {'parserLibrary': 'pdfplumber ' + pdfplumber.__version__, 'pageTextCharacters': page_chars, 'pagesStable': True}, pages


def parse_hwpx(data, b):
    def local(tag):
        return tag.rsplit('}', 1)[-1]

    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        infos = archive.infolist()
        if len(infos) > 3000 or sum(i.file_size for i in infos) > MAX_EXPANDED:
            raise ParseFailure('ZIP_EXPANSION_LIMIT')
        for item in infos:
            if item.flag_bits & 1 or item.file_size > 32_000_000 or (item.file_size > 1_000_000 and item.file_size / max(item.compress_size, 1) > 250):
                raise ParseFailure('ZIP_ENCRYPTED_OR_EXPANSION_LIMIT')
            if '..' in pathlib.PurePosixPath(item.filename).parts or item.filename.startswith('/'):
                raise ParseFailure('UNSAFE_ZIP_PATH')
        if len(set(i.filename for i in infos)) != len(infos):
            raise ParseFailure('DUPLICATE_ZIP_ENTRY')
        if archive.read('mimetype').strip() != b'application/hwp+zip':
            raise ParseFailure('INVALID_HWPX_MIMETYPE')
        sections = sorted([i.filename for i in infos if re.fullmatch(r'Contents/section\d+\.xml', i.filename)], key=lambda s: int(re.search(r'(\d+)\.xml', s)[1]))
        if not sections:
            raise ParseFailure('NO_HWPX_SECTIONS')
        for name in sections:
            xml_bytes = archive.read(name)
            # Inspect decoded text too: UTF-16 must not bypass DTD/entity rejection.
            encoding = 'utf-16' if xml_bytes.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig'
            xml = xml_bytes.decode(encoding, 'strict')
            if '<!DOCTYPE' in xml.upper() or '<!ENTITY' in xml.upper():
                raise ParseFailure('XML_DTD_FORBIDDEN')
            root = ET.fromstring(xml)
            count = 0

            def visit(element, xpath, cell=None, depth=0):
                nonlocal count
                count += 1
                if count > 150000 or depth > 80:
                    raise ParseFailure('XML_COMPLEXITY_LIMIT')
                tag = local(element.tag)
                loc = {'kind': 'HWPX_XML', 'pageNumber': None, 'stream': name, 'xpath': xpath}
                if tag == 'tbl':
                    table = b.table(loc, int(element.attrib['rowCnt']), int(element.attrib['colCnt']), 'STRUCTURAL')
                    for ri, tr in enumerate(x for x in element if local(x.tag) == 'tr'):
                        for ci, tc in enumerate(x for x in tr if local(x.tag) == 'tc'):
                            addr = next(x for x in tc if local(x.tag) == 'cellAddr')
                            span = next(x for x in tc if local(x.tag) == 'cellSpan')
                            row, col = int(addr.attrib['rowAddr']), int(addr.attrib['colAddr'])
                            rs, cs = int(span.attrib['rowSpan']), int(span.attrib['colSpan'])
                            if row < 0 or col < 0 or rs < 1 or cs < 1 or row + rs > table['rowCount'] or col + cs > table['columnCount']:
                                raise ParseFailure('INVALID_HWPX_CELL')
                            cell_loc = {**loc, 'xpath': f'{xpath}/tr[{ri}]/tc[{ci}]', 'tableId': table['id'], 'row': row, 'column': col}
                            c = {'row': row, 'column': col, 'rowSpan': rs, 'columnSpan': cs, 'text': '', 'blockIds': [], 'sourceLocator': cell_loc}
                            table['rows'][row].append(c)
                            if rs > 1 or cs > 1:
                                table['warnings'] = ['MERGED_CELLS_PRESERVED']
                            for j, sub in enumerate(tc):
                                if local(sub.tag) == 'subList':
                                    visit(sub, f'{cell_loc["xpath"]}/subList[{j}]', c, depth + 1)
                    return
                if tag == 'p':
                    # Only text belonging to this paragraph; nested table paragraphs are visited separately.
                    def text_of(node):
                        if local(node.tag) == 'tbl':
                            return ''
                        if local(node.tag) == 't':
                            return ''.join(node.itertext())
                        if local(node.tag) == 'tab':
                            return '\t'
                        if local(node.tag) == 'lineBreak':
                            return '\n'
                        return ''.join(text_of(x) for x in node)
                    if cell:
                        loc.update({k: cell['sourceLocator'][k] for k in ['tableId', 'row', 'column']})
                    loc['paragraphIndex'] = len(b.blocks)
                    block = b.block(text_of(element), loc)
                    if block and cell:
                        cell['text'] += ('\n' if cell['text'] else '') + block['text']; cell['blockIds'].append(block['id'])
                for i, child in enumerate(element):
                    visit(child, f'{xpath}/{local(child.tag)}[{i}]', cell, depth + 1)
            visit(root, '/' + local(root.tag))
    b.warnings.append('HWPX_PAGES_UNSTABLE')
    return {'parserLibrary': 'stdlib zipfile/ElementTree', 'pagesStable': False}, None


def parse_document(path, mime, expected_hash):
    b = Builder()
    result = {'schemaVersion': 1, 'documentId': 'sha256:' + expected_hash, 'sha256': expected_hash, 'mimeType': mime,
              'parserVersion': VERSION, 'status': 'UNREADABLE', 'pages': None, 'blocks': [], 'tables': [], 'metadata': {}}
    try:
        source = pathlib.Path(path)
        if source.stat().st_size > MAX_BYTES:
            raise ParseFailure('INPUT_SIZE_LIMIT')
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected_hash:
            raise ParseFailure('HASH_MISMATCH')
        parser = {'application/pdf': parse_pdf, 'application/x-hwp': parse_hwp, 'application/hwp+zip': parse_hwpx}.get(mime)
        if not parser:
            result['status'] = 'UNSUPPORTED'; raise ParseFailure('UNSUPPORTED_MIME')
        metadata, pages = parser(data, b)
        result.update({'metadata': metadata, 'pages': pages})
        text = '\n'.join(x['text'] for x in b.blocks)
        replacements = text.count('\ufffd')
        broken = replacements / max(len(text), 1) > .01 or len(re.findall(r'\(cid:\d+\)', text)) > 20
        if len(text.strip()) < 100 or broken:
            raise ParseFailure('BROKEN_ENCODING' if broken else 'INSUFFICIENT_TEXT')
        result['status'] = 'PARTIAL' if b.warnings else 'PARSED'
    except ParseFailure as error:
        b.warnings.append(str(error))
    except ImportError:
        result['status'] = 'UNSUPPORTED'; b.warnings.append('PARSER_DEPENDENCY_MISSING')
    except Exception:
        b.warnings.append('PARSE_ERROR')
    text = '\n'.join(x['text'] for x in b.blocks)
    result.update({'blocks': b.blocks, 'tables': b.tables})
    result['quality'] = {'textBlockCount': len(b.blocks), 'tableCount': len(b.tables), 'characterCount': len(text),
        'emptyBlockRatio': (b.attempts - len(b.blocks)) / max(b.attempts, 1), 'replacementCharacterCount': text.count('\ufffd'),
        'suspiciousEncoding': text.count('\ufffd') / max(len(text), 1) > .01 or len(re.findall(r'\(cid:\d+\)', text)) > 20,
        'parserWarnings': sorted(set(b.warnings)), 'extractionAllowed': result['status'] in ['PARSED', 'PARTIAL']}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True); parser.add_argument('--output', required=True)
    parser.add_argument('--mime', required=True); parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    parsed = parse_document(args.input, args.mime, args.sha256)
    encoded = json.dumps(parsed, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    if len(encoded) > 64_000_000:
        raise ParseFailure('OUTPUT_SIZE_LIMIT')
    with open(args.output, 'xb') as output:
        output.write(encoded)
    print(json.dumps({'status': parsed['status'], 'blocks': len(parsed['blocks']), 'tables': len(parsed['tables'])}))
