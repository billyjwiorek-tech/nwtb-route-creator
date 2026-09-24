from pathlib import Path

for name in ('index.html','app.html'):
    p=Path(name)
    if not p.exists():
        continue
    s=p.read_text(encoding='utf-8')
    s=s.replace('VERSION 2026-09-24 • DELIVERY ROUTING ENGINE','VERSION 2026-09-24 • BUILT-IN TURN-BY-TURN')
    s=s.replace('NWTB Delivery road routing engine • Google Maps + RouteXL','NWTB Delivery road routing engine • Built-in turn-by-turn • Google Maps backup')
    nav_tag='<script src="./navigation.js?v=20260924DELIVERY"></script>'
    built='<script src="./sales-built-in-navigation.js?v=20260924TBT1"></script>'
    if built not in s:
        if nav_tag not in s:
            raise SystemExit(f'Could not find Sales navigation script tag in {name}')
        s=s.replace(nav_tag,nav_tag+built,1)
    p.write_text(s,encoding='utf-8')

idx=Path('index.html').read_text(encoding='utf-8')
assert 'VERSION 2026-09-24 • BUILT-IN TURN-BY-TURN' in idx
assert 'sales-built-in-navigation.js?v=20260924TBT1' in idx
assert 'Built-in turn-by-turn • Google Maps backup' in idx
print('Sales built-in turn-by-turn navigation is wired into the production page.')
