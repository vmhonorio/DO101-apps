"""Converte dist-artifact/index.html no corpo de página aceito pelo Artifact (sem doctype/html/head/body).
Corte por posição: o bundle contém textos como "<head>" dentro de strings JS, então não usar regex gulosa."""
import re, sys
src, out = sys.argv[1], sys.argv[2]
h = open(src, encoding='utf-8').read()
s0 = h.index('<script type="module"')
root = h.rindex('<div id="root"></div>')
s1 = h.rindex('</head>', s0, root)  # script + <style> inline ficam antes do </head> real
links = ''.join(re.findall(r'<link [^>]*>', h[:s0]))
page = '<title>Executive Status</title>\n' + links + '\n' + h[s0:s1] + '\n<div id="root"></div>\n'
page = page.replace('�', '\\uFFFD')
open(out, 'w', encoding='utf-8').write(page)
print(len(page.encode()), 'bytes')
