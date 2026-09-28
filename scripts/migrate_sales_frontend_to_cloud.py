from pathlib import Path
import re

for name in ('index.html','app.html'):
    p=Path(name)
    if not p.exists():
        continue
    s=p.read_text(encoding='utf-8')

    cloud='<script src="./sales-cloud-auth.js?v=20260928CLOUD1"></script>'
    if cloud not in s:
        marker='<script>let accounts='
        if marker not in s:
            raise SystemExit(f'Could not find main Sales script marker in {name}')
        s=s.replace(marker,cloud+marker,1)

    s_new,n=re.subn(r'accounts=await\(await fetch\("\./accounts\.json\?v=[^"]+"\)\)\.json\(\);',
                    'accounts=await window.nwtbLoadSalesAccounts();',s,count=1)
    if n==0 and 'accounts=await window.nwtbLoadSalesAccounts();' not in s:
        raise SystemExit(f'Could not replace public accounts.json loader in {name}')
    s=s_new

    s=s.replace('VERSION 2026-09-24 • BUILT-IN TURN-BY-TURN','VERSION 2026-09-28 • CLOUD SECURE')
    s=s.replace('VERSION 2026-09-24 • DELIVERY ROUTING ENGINE','VERSION 2026-09-28 • CLOUD SECURE')
    s=s.replace('Sales Intelligence Map • NWTB Delivery road routing engine • Built-in turn-by-turn • Google Maps backup',
                'Sales Intelligence Map • Private Supabase data • NWTB Delivery road routing engine • Built-in turn-by-turn • Google Maps backup')

    p.write_text(s,encoding='utf-8')

idx=Path('index.html').read_text(encoding='utf-8')
assert 'sales-cloud-auth.js?v=20260928CLOUD1' in idx
assert 'accounts=await window.nwtbLoadSalesAccounts();' in idx
assert './accounts.json' not in idx
assert 'VERSION 2026-09-28 • CLOUD SECURE' in idx
print('Sales frontend now requires employee login and loads accounts from private Supabase.')
