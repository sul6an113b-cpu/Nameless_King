# Stamp sw.js with a cache VERSION derived from APP_VERSION and the content of every
# cached file, so any change to the app reaches installed phones ("Update ready").
# Run after every change:  python3 tools/release.py      (tests/release-check.mjs verifies it)
import hashlib, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sw_path = os.path.join(ROOT, 'sw.js')
sw = open(sw_path, encoding='utf-8').read()
assets = re.findall(r"'\./([^']*)'", sw[sw.index('const ASSETS'):sw.index('];')])
app_version = re.search(r"APP_VERSION = '([^']+)'", open(os.path.join(ROOT, 'js', 'export.js'), encoding='utf-8').read()).group(1)
h = hashlib.sha256()
for a in sorted(x for x in assets if x and x != 'sw.js'):
    p = os.path.join(ROOT, a)
    h.update(a.encode())
    h.update(open(p, 'rb').read())
version = f'bopqc-v{app_version}-{h.hexdigest()[:10]}'
new = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", sw, count=1)
if new != sw:
    open(sw_path, 'w', encoding='utf-8').write(new)
print(version)
if '--check' in sys.argv and new != sw:
    sys.exit('sw.js VERSION was stale (now updated) - commit the new sw.js')
