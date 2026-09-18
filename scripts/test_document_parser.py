"""Optional Python parser integration tests. Requires document-parser-requirements.txt."""
import hashlib
import io
import pathlib
import struct
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
import document_parser_worker as worker


class ParserTests(unittest.TestCase):
    def parse(self, data, mime):
        with tempfile.TemporaryDirectory(prefix='wanpan-parser-') as folder:
            path = pathlib.Path(folder) / 'input'
            path.write_bytes(data)
            return worker.parse_document(path, mime, hashlib.sha256(data).hexdigest())

    def pdf(self, encrypted=False, blank=False):
        writer = PdfWriter()
        page = writer.add_blank_page(width=600, height=800)
        if not blank:
            font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
            page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
            stream = DecodedStreamObject()
            stream.set_data(b'BT /F1 12 Tf 30 750 Td (Income 130% inclusive, 100% exclusive. 2026-09-14.) Tj 0 -20 Td (Review source table and preserve all amounts and operators.) Tj ET\n20 600 m 500 600 l S 20 650 m 500 650 l S 20 700 m 500 700 l S 20 600 m 20 700 l S 250 600 m 250 700 l S 500 600 m 500 700 l S\nBT /F1 12 Tf 30 675 Td (130%) Tj 230 0 Td (362,000,000) Tj ET')
            page[NameObject('/Contents')] = writer._add_object(stream)
        if encrypted:
            writer.encrypt('secret')
        out = io.BytesIO(); writer.write(out); return out.getvalue()

    def hwpx(self, xml):
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as z:
            z.writestr('mimetype', 'application/hwp+zip')
            z.writestr('Contents/content.hpf', '<package/>')
            z.writestr('Contents/section0.xml', xml)
        return out.getvalue()

    def test_pdf_text_table_and_page(self):
        d = self.parse(self.pdf(), 'application/pdf')
        self.assertTrue(d['quality']['extractionAllowed'])
        self.assertEqual(d['pages'], 1)
        self.assertTrue(d['tables'])
        self.assertIn('130%', str(d['tables']))
        self.assertEqual(d['blocks'][0]['sourceLocator']['pageNumber'], 1)

    def test_blank_pdf_blocked(self):
        self.assertFalse(self.parse(self.pdf(blank=True), 'application/pdf')['quality']['extractionAllowed'])

    def test_encrypted_pdf_blocked(self):
        d = self.parse(self.pdf(encrypted=True), 'application/pdf')
        self.assertIn('ENCRYPTED_PDF', d['quality']['parserWarnings'])

    def test_malformed_pdf_blocked(self):
        self.assertFalse(self.parse(b'%PDF-1.7 garbage', 'application/pdf')['quality']['extractionAllowed'])

    def test_html_pdf_blocked(self):
        self.assertIn('INVALID_PDF_SIGNATURE', self.parse(b'<html>error</html>', 'application/pdf')['quality']['parserWarnings'])

    def test_hwp_text_controls_and_korean_boundaries(self):
        text = '소득 130% 이하 100% 초과 만19세 이상 40세 미만 (362백만원) 2026-09-14'
        self.assertEqual(worker.hwp_text(text.encode('utf-16-le')), text)
        with self.assertRaises(worker.ParseFailure):
            worker.hwp_text(b'\x09\x00')

    def test_hwp_protection(self):
        import olefile
        for flag, expected in [(2, 'ENCRYPTED_HWP'), (4, 'DISTRIBUTION_PROTECTED_HWP')]:
            header = b'HWP Document File'.ljust(36, b'\0') + struct.pack('<I', flag)
            with patch.object(olefile, 'OleFileIO') as ole:
                ole.return_value.__enter__.return_value.openstream.return_value = io.BytesIO(header)
                d = self.parse(bytes.fromhex('d0cf11e0a1b11ae1'), 'application/x-hwp')
                self.assertIn(expected, d['quality']['parserWarnings'])

    def test_hwp_table_and_odd_offset_memo(self):
        import olefile
        def record(tag, level, data):
            return struct.pack('<I', tag | level << 10 | len(data) << 20) + data
        table = record(71, 1, b' lbt') + record(77, 2, bytes(4) + struct.pack('<HH', 1, 2))
        table += record(72, 2, bytes(8) + struct.pack('<HHHH', 0, 0, 2, 1) + bytes(18))
        table += record(67, 3, ('130% 이하 3점 ' * 20).encode('utf-16-le'))
        table += record(71, 1, b'knu%' + bytes(7) + 'MEMO/65535/15/'.encode('utf-16-le'))
        table += record(93, 0, struct.pack('<I', 15)) + record(67, 1, '검토필요'.encode('utf-16-le'))
        header = b'HWP Document File'.ljust(40, b'\0')
        with patch.object(olefile, 'OleFileIO') as ole:
            obj = ole.return_value.__enter__.return_value
            obj.openstream.side_effect = [io.BytesIO(header), io.BytesIO(table)]
            obj.listdir.return_value = [['BodyText', 'Section0']]
            obj.get_size.return_value = len(table)
            d = self.parse(bytes.fromhex('d0cf11e0a1b11ae1'), 'application/x-hwp')
        self.assertTrue(d['quality']['extractionAllowed'])
        self.assertEqual(d['tables'][0]['rows'][0][0]['columnSpan'], 2)
        self.assertEqual(d['metadata']['memoAnchors'][0]['memoId'], 15)
        self.assertEqual(d['blocks'][-1]['type'], 'note')

    def test_hwpx_korean_merged_table(self):
        xml = '<sec><p><run><t>' + ('소득 130% 이하 자산 362백만원 공고일 2026-09-14. ' * 4) + '</t></run></p><tbl rowCnt="1" colCnt="2"><tr><tc><cellAddr rowAddr="0" colAddr="0"/><cellSpan rowSpan="1" colSpan="2"/><subList><p><run><t>70% 이하 3점</t></run></p></subList></tc></tr></tbl></sec>'
        d = self.parse(self.hwpx(xml), 'application/hwp+zip')
        self.assertTrue(d['quality']['extractionAllowed'])
        self.assertIsNone(d['pages'])
        cell = d['tables'][0]['rows'][0][0]
        self.assertEqual(cell['columnSpan'], 2)
        self.assertEqual(cell['text'], '70% 이하 3점')
        self.assertTrue(cell['blockIds'])

    def test_hwpx_dtd_rejected(self):
        d = self.parse(self.hwpx('<!DOCTYPE sec [<!ENTITY a "x">]><sec/>'), 'application/hwp+zip')
        self.assertIn('XML_DTD_FORBIDDEN', d['quality']['parserWarnings'])

    def test_hwpx_utf16_dtd_rejected(self):
        d = self.parse(self.hwpx('<!DOCTYPE sec [<!ENTITY a "x">]><sec/>'.encode('utf-16')), 'application/hwp+zip')
        self.assertIn('XML_DTD_FORBIDDEN', d['quality']['parserWarnings'])

    def test_hwpx_zip_path_rejected(self):
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as z:
            z.writestr('../escape', 'x')
        self.assertIn('UNSAFE_ZIP_PATH', self.parse(out.getvalue(), 'application/hwp+zip')['quality']['parserWarnings'])

    def test_hash_binding(self):
        with tempfile.TemporaryDirectory(prefix='wanpan-parser-') as folder:
            path = pathlib.Path(folder) / 'input'; path.write_bytes(self.pdf())
            self.assertIn('HASH_MISMATCH', worker.parse_document(path, 'application/pdf', 'a'*64)['quality']['parserWarnings'])

    def test_broken_encoding_blocks_extraction(self):
        xml = '<sec><p><t>' + '\ufffd'*200 + '</t></p></sec>'
        self.assertFalse(self.parse(self.hwpx(xml), 'application/hwp+zip')['quality']['extractionAllowed'])


if __name__ == '__main__':
    # Existing Samdo tooling may already provide olefile without a second installation.
    try:
        import olefile  # noqa: F401
    except ImportError:
        import sys
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.cache/hwp-parser'))
    unittest.main()
