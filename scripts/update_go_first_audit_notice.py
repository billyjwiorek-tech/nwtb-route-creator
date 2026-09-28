from pathlib import Path
for name in ['index.html','app.html','navigation.js','chat.js']:
    p=Path(name)
    s=p.read_text(encoding='utf-8')
    s=s.replace('53 commercial stops approved • 13 valid GO FIRST accounts held until a commercial route stop is verified.','55 commercial stops approved • 11 valid GO FIRST accounts held until a commercial route stop is verified.')
    s=s.replace('53 route-approved • 13 commercial-stop hold','55 route-approved • 11 commercial-stop hold')
    p.write_text(s,encoding='utf-8')
print('Updated GO FIRST audit notice to 55 approved / 11 hold')
