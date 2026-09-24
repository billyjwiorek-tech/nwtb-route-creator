from pathlib import Path

nav_path = Path('navigation.js')
nav = nav_path.read_text(encoding='utf-8')

old_panel = "After you click CREATE + DELIVERY OPTIMIZE, Google Maps Part 1 opens automatically in a new tab. Desktop Google Maps shows the planned route; live turn-by-turn navigation is a phone feature. The final route part returns to Northwest Trucks – Bolingbrook."
new_panel = "Click CREATE + DELIVERY OPTIMIZE to build the route here first. Review the customer list below, then click the blue OPEN IN GOOGLE MAPS button only when you are ready. Google Maps will not open automatically. The final route returns to Northwest Trucks – Bolingbrook."
nav = nav.replace(old_panel, new_panel)

start = nav.find("  window.buildRoute=async function(){")
if start == -1:
    raise SystemExit('Could not find Sales buildRoute override')
end_marker = "\n\n  const baseShow=window.showCard;"
end = nav.find(end_marker, start)
if end == -1:
    raise SystemExit('Could not find end of Sales buildRoute override')

replacement = '''  window.buildRoute=async function(){
    await buildFinalAuditedRoute();
    applyAllReconciliation();
    addNavigationPanel();
  };'''
nav = nav[:start] + replacement + nav[end:]

assert "window.open('about:blank','nwtb_google_maps_route')" not in nav
assert 'Google Maps will not open automatically.' in nav
nav_path.write_text(nav, encoding='utf-8')

for name in ('index.html','app.html'):
    p=Path(name)
    if not p.exists():
        continue
    s=p.read_text(encoding='utf-8')
    s=s.replace('navigation.js?v=20260924DELIVERY','navigation.js?v=20260924REVIEW')
    p.write_text(s,encoding='utf-8')

idx=Path('index.html').read_text(encoding='utf-8')
assert 'navigation.js?v=20260924REVIEW' in idx
print('Sales route review gate applied: Google Maps now opens only by explicit user click.')
