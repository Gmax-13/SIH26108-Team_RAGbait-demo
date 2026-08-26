"""Verify the BIS searchIS JSON API works over plain HTTP with base64 params."""
import urllib.request, urllib.parse, ssl, json, http.cookiejar, base64
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
BASE="https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/knowyourstandards/Indian_standards/"
COLS=["id","is_no","is_title","amendments","technical_committee","aspect","referirmatin_year","Action","DownloadAction"]
b64=lambda s: base64.b64encode(s.encode()).decode()

def make_session():
    cj=http.cookiejar.CookieJar()
    op=urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx), urllib.request.HTTPCookieProcessor(cj))
    op.open(urllib.request.Request(BASE+"isdetails/",headers={"User-Agent":UA}),timeout=60).read()
    return op

def search(op, seachby, txt, start=0, length=10):
    d={"draw":"1","start":str(start),"length":str(length),"search[value]":"","search[regex]":"false"}
    for i,c in enumerate(COLS):
        d.update({f"columns[{i}][data]":c,f"columns[{i}][name]":"",f"columns[{i}][searchable]":"true",
                  f"columns[{i}][orderable]":"false",f"columns[{i}][search][value]":"",f"columns[{i}][search][regex]":"false"})
    url=f"{BASE}searchIS?seachby={b64(seachby)}&txt_search={b64(txt)}"
    req=urllib.request.Request(url,data=urllib.parse.urlencode(d).encode(),
        headers={"User-Agent":UA,"X-Requested-With":"XMLHttpRequest","Referer":BASE+"isdetails/",
                 "Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
                 "Accept":"application/json, text/javascript, */*; q=0.01"})
    return json.loads(op.open(req,timeout=120).read().decode("utf-8","ignore"))

if __name__=="__main__":
    op=make_session()
    for term in ["cable","switchgear","transformer"]:
        j=search(op,"keywords",term,0,3)
        n=j.get("iTotalRecords")
        print(f"{term:12} total={n:>6}  rows={len(j.get('aaData',[]))}")
        for row in j.get("aaData",[])[:2]:
            print(f"     {row['is_no'][:48]!r:52} | {row['technical_committee']} | {row['aspect']}")
    print("\n--- pagination check (start=300) ---")
    j=search(op,"keywords","cable",300,5)
    print("rows:",len(j.get("aaData",[])), "| first:", j["aaData"][0]["is_no"][:50] if j.get("aaData") else None)
