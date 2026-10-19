import urllib.request,urllib.parse,json,re,time
from pathlib import Path
from PIL import Image
from io import BytesIO
out=Path('scopa/assets')
api='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','generator':'categorymembers','gcmtitle':'Category:Naples deck','gcmtype':'file','gcmlimit':100,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':500})
def get(url):
 for attempt in range(4):
  try:return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ScopaLocalProject/1.0 (card asset attribution audit)'}),timeout=40).read()
  except Exception:
   if attempt==3:raise
   time.sleep(2+attempt*2)
data=json.loads(get(api));records=[]
for p in sorted(data['query']['pages'].values(),key=lambda p:p['title']):
 title=p['title'][5:];m=re.match(r'(\d\d) ',title)
 if not m and title!='Carte Napoletane retro.jpg':continue
 if m and not 1<=int(m[1])<=40:continue
 num=int(m[1]) if m else 0
 suit=['denari','coppe','spade','bastoni'][(num-1)//10] if num else None
 name=f'{suit}-{(num-1)%10+1:02}.webp' if num else 'retro.webp'
 info=p['imageinfo'][0];meta=info['extmetadata'];license=meta.get('LicenseShortName',{}).get('value','')
 if 'public domain' not in license.lower():raise ValueError((title,license))
 file=out/name
 if not file.exists():
  im=Image.open(BytesIO(get(info.get('thumburl',info['url'])))).convert('RGB');im.thumbnail((480,800));im.save(file,'WEBP',quality=90)
 records.append({'file':name,'title':title,'source':info['descriptionurl'],'original':info['url'],'author':re.sub('<[^>]+>','',meta.get('Artist',{}).get('value','')),'license':license,'changes':'Ridimensionamento e conversione WebP; disegno originale conservato.'})
 print(name,license,flush=True)
 time.sleep(2)
if len(records)!=41:raise ValueError(f'Expected41 got{len(records)}')
(out/'credits.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('41 images ready',sum(p.stat().st_size for p in out.glob('*.webp')),'bytes')
