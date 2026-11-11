#!/usr/bin/env python3
"""Inline every module + the stylesheet into one double-clickable HTML file."""
import re

ORDER = ['src/engine/Vec2.js', 'src/engine/Body.js', 'src/engine/Integrators.js',
         'src/engine/Forces.js', 'src/engine/Collisions.js', 'src/engine/World.js',
         'src/render/Camera.js', 'src/render/Renderer.js', 'src/render/HUD.js',
         'src/render/IntegratorRace.js',
         'ui.js', 'input.js',
         'src/ui/StateURL.js', 'src/ui/CSVExport.js',
         'src/scenes.js', 'src/main.js']

parts = []
for f in ORDER:
    with open(f, encoding='utf-8') as source:
        s = source.read()
    s = re.sub(r'^\s*import\s[\s\S]*?from\s*[\'"][^\'"]+[\'"];\s*$', '', s, flags=re.M)
    s = re.sub(r'^\s*export\s*\{[^}]*\}\s*;\s*$', '', s, flags=re.M)
    s = re.sub(r'^export\s+', '', s, flags=re.M)
    parts.append(f"/* ===== {f} ===== */\n" + s.strip() + "\n")

with open('index.html', encoding='utf-8') as source:
    html = source.read()
html = html.replace('<link rel="stylesheet" href="styles.css">',
                    '<style>\n' + open('styles.css', encoding='utf-8').read() + '\n</style>')
html = html.replace('<script type="module" src="src/main.js"></script>',
                    '<script type="module">\n' + "\n".join(parts) + '\n</script>')
html = html.replace('<title>Week 10 Reference \u2014', '<title>Week 10 Reference (standalone) \u2014')
html = html.replace('<span class="sub">Interactivity',
                    '<span class="sub">STANDALONE single-file build &mdash; Interactivity')
with open('standalone.html', 'w', encoding='utf-8', newline='') as output:
    output.write(html)
print(f'standalone.html written ({len(html):,} bytes)')
