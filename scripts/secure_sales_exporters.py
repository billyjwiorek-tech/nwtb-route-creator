from pathlib import Path
import re

for name in ('map-sync-final.html','map-sync-business-names.html'):
    p=Path(name)
    s=p.read_text(encoding='utf-8')
    cloud='<script src="./sales-cloud-auth.js?v=20260928CLOUD1"></script>\n'
    if cloud not in s:
        idx=s.find('<script>')
        if idx<0:
            raise SystemExit(f'No main script in {name}')
        s=s[:idx]+cloud+s[idx:]
    s,n=re.subn(r"const r=await fetch\('\./accounts\.json[^']*',\{cache:'no-store'\}\);if\(!r\.ok\)throw new Error\('Could not load accounts\.json'\);\s*const raw=await r\.json\(\),f=",
                "const raw=await window.nwtbLoadSalesAccounts(),f=",s,count=1)
    if n==0 and 'window.nwtbLoadSalesAccounts()' not in s:
        raise SystemExit(f'Could not replace accounts.json loader in {name}')
    p.write_text(s,encoding='utf-8')

for name in ('map-sync-final.html','map-sync-business-names.html'):
    s=Path(name).read_text(encoding='utf-8')
    assert 'sales-cloud-auth.js?v=20260928CLOUD1' in s
    assert 'window.nwtbLoadSalesAccounts()' in s
    assert "fetch('./accounts.json" not in s
print('My Maps exporters now require employee login and load private Sales data from Supabase.')
