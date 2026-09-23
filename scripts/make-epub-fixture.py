#!/usr/bin/env python3
"""Build a tiny valid EPUB 3 fixture for Phase 16 testing (browser reader + curl upload)."""
import zipfile, os, pathlib

out = pathlib.Path('/home/z/my-project/tests/fixtures')
out.mkdir(parents=True, exist_ok=True)
path = out / 'tiny-book.epub'

container = '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>'''

opf = '''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:saarthi-phase16-fixture</dc:identifier>
    <dc:title>Deep Work (Fixture)</dc:title>
    <dc:creator>Cal Newport (Fixture)</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>'''

para = ('<p>Clarity about what matters provides clarity about what does not. '
        'The deep work hypothesis says the ability to perform deep work is becoming '
        'increasingly rare at exactly the same time it is becoming increasingly valuable. '
        'Efforts to cultivate your concentration will yield strong benefits. </p>')

ch1 = ('<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head>'
       '<body><h1>Chapter 1 — The Deep Work Hypothesis</h1>' + para * 12 + '</body></html>')
ch2 = ('<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 2</title></head>'
       '<body><h1>Chapter 2 — Rules of Focus</h1>' + para * 12 + '</body></html>')
nav = ('<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
       '<head><title>Nav</title></head><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Chapter 1</a></li>'
       '<li><a href="ch2.xhtml">Chapter 2</a></li></ol></nav></body></html>')

with zipfile.ZipFile(path, 'w') as z:
    z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip', zipfile.ZIP_STORED)
    z.writestr('META-INF/container.xml', container)
    z.writestr('OEBPS/content.opf', opf)
    z.writestr('OEBPS/ch1.xhtml', ch1)
    z.writestr('OEBPS/ch2.xhtml', ch2)
    z.writestr('OEBPS/nav.xhtml', nav)

print(f'{path} · {path.stat().st_size} bytes')
