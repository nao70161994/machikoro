import base64, json, os, shutil, subprocess, time, urllib.request, socket
from pathlib import Path
root=Path(__file__).resolve().parent.parent
os.chdir(root)
def available_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0))
        return listener.getsockname()[1]
server_port=available_port()
driver_port=available_port()
base_url='http://127.0.0.1:'+str(server_port)
driver_url='http://127.0.0.1:'+str(driver_port)
viewport_width=int(os.environ.get('SMOKE_WIDTH','390'))
if not 320 <= viewport_width <= 1024:
    raise SystemExit('SMOKE_WIDTH must be between 320 and 1024')
browser=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium-browser') or shutil.which('chromium')
if not browser or not shutil.which('chromedriver'):
    raise SystemExit('Chromium and a matching chromedriver are required')
out=root/'artifacts'/'product-browser'
out.mkdir(parents=True,exist_ok=True)
(out/'result.json').unlink(missing_ok=True)
logs=[]
processes=[]
sessions=[]
target_landmark=os.environ.get("SMOKE_LANDMARK", "駅")
if target_landmark not in ["駅", "ショッピングモール", "電波塔", "all"]:
    raise SystemExit("SMOKE_LANDMARK must be 駅, ショッピングモール, 電波塔 or all")
trace=[]
(out/'failure.json').unlink(missing_ok=True)
(out/'trace.json').unlink(missing_ok=True)
def record(s,label):
    entry=js(s, "const g=GameRuntimeState.runtime.snapshot().game; return {phase:g?.phase,turn:g?.turnCount,current:g?.currentPlayerIndex,coins:g?.players.map(p=>p.coins),built:g?.builtThisTurn,modal:document.getElementById('confirmModal')?.style.display,landmarks:Array.from(document.querySelectorAll('[data-action=buildLandmark]')).map(e=>({name:e.dataset.landmarkName,disabled:e.disabled}))}")
    trace.append({'label':label,'client':sessions.index(s),'state':entry})
    (out/'trace.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2))
def request(method,path,data=None):
    body=None if data is None else json.dumps(data).encode()
    req=urllib.request.Request(driver_url+path,data=body,method=method,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=40) as response:
        result=json.load(response)
    value=result.get('value')
    if isinstance(value,dict) and value.get('error'): raise RuntimeError(value)
    return value

def js(s,code):return request('POST','/session/'+s+'/execute/sync',{'script':code,'args':[]})
def wait(s,code):
    for _ in range(100):
        try:
            value=js(s,code)
            if value:return value
        except Exception:pass
        time.sleep(.2)
    raise RuntimeError('Timed out: '+code)
def shot(s,name):
    (out/(name+'.png')).write_bytes(base64.b64decode(request('GET','/session/'+s+'/screenshot')))
try:
    for cmd,name,env in [(['node','server.js'],'server',dict(os.environ,PORT=str(server_port),NODE_ENV='test',NTFY_TOPIC='',CANONICAL_STATE_STORE='noop')),(['chromedriver','--port='+str(driver_port)],'driver',None)]:
        log=open(out/(name+'.log'),'w');logs.append(log)
        processes.append(subprocess.Popen(cmd,stdout=log,stderr=log,env=env))
    for _ in range(100):
        try:
            request('GET','/status')
            urllib.request.urlopen(base_url+'/api/version',timeout=1).close()
            break
        except Exception: time.sleep(.2)
    for design in ['classic','sunset']:
        v=request('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'chrome','goog:chromeOptions':{'binary':browser,'args':['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],'mobileEmulation':{'deviceMetrics':{'width':viewport_width,'height':844,'pixelRatio':1,'mobile':True,'touch':True}}}}}})
        s=v['sessionId'];sessions.append(s)
        request('POST','/session/'+s+'/url',{'url':base_url+'/'})
        wait(s,"return typeof reviewGameSetup === 'function'")
        js(s,"const e=document.getElementById('designThemeSelect');e.value="+json.dumps(design)+";e.dispatchEvent(new Event('change',{bubbles:true}));")
        assert js(s,"return document.documentElement.dataset.design")==design
        js(s,"window.landmarkEnableTrace=[]; const descriptor=Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype,'disabled'); Object.defineProperty(HTMLButtonElement.prototype,'disabled',{...descriptor,set(value){if(!value && this.dataset.action==='buildLandmark') window.landmarkEnableTrace.push({name:this.dataset.landmarkName,stack:new Error().stack}); descriptor.set.call(this,value);}});")
        shot(s,design+'-title')
    host,guest=sessions
    for s,name in [(host,'BrowserHost'),(guest,'BrowserGuest')]:
        js(s,"document.getElementById('tabOnline').click();document.getElementById('playerNameInput').value="+json.dumps(name))
    if target_landmark != "all":
        js(host,"showCardSelect(); const names=Array.from(document.querySelectorAll('[data-action=\"toggleLandmark\"][aria-pressed=\"true\"]')).map(e=>e.dataset.landmarkName).filter(n=>n!=='駅'); for(const name of names){Array.from(document.querySelectorAll('[data-action=\"toggleLandmark\"]')).find(e=>e.dataset.landmarkName===name).click();} document.querySelector('[data-action=\"closeCardSelect\"]').click();".replace("駅",target_landmark))
    js(host,"document.getElementById('onlineCreateSubmitButton').click()")
    room=wait(host,"return document.querySelector('#onlineWaitingPanel .room-id-display')?.textContent.trim()")
    js(guest,"document.getElementById('onlineTabJoin').click();document.getElementById('roomIdInput').value="+json.dumps(room)+";document.getElementById('onlineJoinSubmitButton').click()")
    ready="document.querySelector('[data-ui-action=\"setOnlineLobbyReady\"][data-ready=\"true\"]')"
    for s in sessions:wait(s,'return !!'+ready)
    for s in sessions:js(s,ready+'.click()')
    for s,design in zip(sessions,['classic','sunset']):
        wait(s,"return document.getElementById('gameScreen').style.display !== 'none'")
        assert js(s,"return document.documentElement.scrollWidth <= window.innerWidth"), 'Horizontal overflow in game'
        log_before_players=js(s,"return !!(document.getElementById('gameLogContainer').compareDocumentPosition(document.getElementById('players')) & Node.DOCUMENT_POSITION_FOLLOWING)")
        assert log_before_players == (design == 'classic'), 'Unexpected game section order'
        shot(s,design+'-online')
        assert js(s,"return document.documentElement.dataset.design")==design
    actor=next(s for s in sessions if js(s,"return !document.getElementById('btnRoll').disabled"))
    js(actor,"document.getElementById('btnRoll').click()")
    wait(actor,"return !!document.querySelector('#buildMenu .card-btn:not(:disabled)')")
    for s,design in zip(sessions,['classic','sunset']):
        js(s,"document.getElementById('buildMenu').scrollIntoView({block:'start'})")
        if design == 'sunset':
            wait(s,"return Array.from(document.querySelectorAll('.sunset-facility-art use')).some(e=>e.getBBox().width > 0)")
        shot(s,design+'-market')
        if design == 'sunset':
            normal_size=js(s,"return parseFloat(getComputedStyle(document.querySelector('#buildMenu .card-effect')).fontSize)")
            js(s,"const e=document.getElementById('accessibilityFontScale');e.value='large';e.dispatchEvent(new Event('change',{bubbles:true}));")
            assert js(s,"return parseFloat(getComputedStyle(document.querySelector('#buildMenu .card-effect')).fontSize)") > normal_size
            shot(s,'sunset-market-large-text')
            js(s,"const e=document.getElementById('accessibilityFontScale');e.value='standard';e.dispatchEvent(new Event('change',{bubbles:true}));")
    before=js(actor,"return GameRuntimeState.runtime.snapshot().game.currentPlayer().coins")
    js(actor,"document.querySelector('[data-action=\"buildCard\"][data-card-name=\"麦畑\"]').click();document.getElementById('confirmOkBtn').click()")
    wait(actor,"return GameRuntimeState.runtime.snapshot().game.builtThisTurn")
    js(actor,"document.querySelector('[data-action=\"undoBuild\"]').click();document.getElementById('confirmOkBtn').click()")
    wait(actor,"return !GameRuntimeState.runtime.snapshot().game.builtThisTurn")
    for s in sessions:
        wait(s,"return !GameRuntimeState.runtime.snapshot().game.builtThisTurn && GameRuntimeState.runtime.snapshot().game.currentPlayer().coins === "+str(before))
    request('POST','/session/'+host+'/refresh',{})
    wait(host,"return document.getElementById('onlineResumeSection').style.display !== 'none'")
    js(host,"document.querySelector('[data-ui-action=\"reconnectOnline\"]').click()")
    wait(host,"return document.getElementById('gameScreen').style.display !== 'none'")
    max_turns=240 if target_landmark == 'all' else 60
    for turn in range(max_turns):
        actor=next(s for s in sessions if js(s,"return !document.getElementById('btnRoll').disabled || !document.getElementById('btnSkip').disabled"))
        if js(actor,"return !document.getElementById('btnRoll').disabled"):
            js(actor,"document.getElementById('btnRoll').click()")
            wait(actor,"return !document.getElementById('btnSkip').disabled || !!document.querySelector('#diceChoose button:not(:disabled)')")
            if js(actor,"return !!document.querySelector('[data-action=selectDiceCount]:not(:disabled)')"):
                js(actor,"document.querySelector('[data-action=selectDiceCount][data-use-two=false]').click()")
            wait(actor,"return !document.getElementById('btnSkip').disabled")
        record(actor,'turn-'+str(turn))
        assert js(actor,"return Array.from(document.querySelectorAll('#buildMenu .card-btn')).every(e=>e.disabled === !e.classList.contains('can-afford'))"), 'Build eligibility differs from rendered state'
        choice=js(actor,"""
            const available=Array.from(document.querySelectorAll('#buildMenu .card-btn:not(:disabled)'));
            const g=GameRuntimeState.runtime.snapshot().game;
            const p=g.currentPlayer();
            const full=arguments[0];
            if (full) {
                for(const name of ['パン屋','麦畑']) {
                    const card=available.find(e=>e.dataset.cardName===name);
                    if(card && p.cards.filter(c=>c.name===name).length < 4)
                        return {action:'buildCard', name};
                }
                for(const name of ['空港','ショッピングモール','遊園地','港','駅','電波塔']) {
                    if(p.landmarks[name]) continue;
                    const card=available.find(e=>e.dataset.landmarkName===name);
                    return card ? {action:'buildLandmark',name} : null;
                }
                return null;
            }
            const card=available.find(e=>e.dataset.action==='buildLandmark');
            return card ? {action:'buildLandmark',name:card.dataset.landmarkName} : null;
        """.replace('arguments[0]', 'true' if target_landmark == 'all' else 'false'))
        if choice:
            js(actor,"const choice="+json.dumps(choice)+";Array.from(document.querySelectorAll('#buildMenu .card-btn')).find(e=>e.dataset.action===choice.action && (e.dataset.cardName || e.dataset.landmarkName)===choice.name).click();document.getElementById('confirmOkBtn').click()")
            wait(actor,"return GameRuntimeState.runtime.snapshot().game.builtThisTurn")
            record(actor,'build-confirmed')
            if js(actor,"return !!document.querySelector('.winner-title')"):
                for s,design in zip(sessions,['classic','sunset']):
                    wait(s,"return !!document.querySelector('.winner-title')")
                    assert js(s,"return document.querySelector('.winner-sub').textContent.includes((GameRuntimeState.runtime.snapshot().game.turnCount + 1) + 'ターン')")
                    js(s,"window.scrollTo(0,0)")
                    assert js(s,"return !document.querySelector('.winner-screen .ad-slot')")
                    shot(s,design+'-winner')
                assert js(host,"return document.querySelector('.winner-title').textContent")==js(guest,"return document.querySelector('.winner-title').textContent")
                break
        previous=js(actor,"return GameRuntimeState.runtime.snapshot().game.currentPlayerIndex")
        js(actor,"document.getElementById('btnSkip').click();document.getElementById('confirmOkBtn').click()")
        for s in sessions:
            wait(s,"return GameRuntimeState.runtime.snapshot().game.currentPlayerIndex !== "+str(previous))
    else: raise RuntimeError('Match did not finish within '+str(max_turns)+' turns')
    report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'browser':subprocess.check_output([browser,'--version'],text=True).strip(),'viewport':str(viewport_width)+'x844 emulation','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),'passed':['classic/sunset title','mixed-design online start with ready','dice roll and build menu','sunset external SVG rendering','large text increases sunset card effect size','build and authoritative undo','host refresh and rejoin',target_landmark+'-only online match completed with matching winners'],'notCovered':['physical device touch','WebKit',*(['standard all-landmark full match'] if target_landmark != 'all' else []),'PWA update']}
    (out/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False))
except Exception:
    diagnostics=[]
    for s in sessions:
        try:
            diagnostics.append(js(s, "const g=GameRuntimeState.runtime.snapshot().game; return {enableTrace:window.landmarkEnableTrace,phase:g?.phase,turn:g?.turnCount,current:g?.currentPlayerIndex,players:g?.players.map(p=>({name:p.name,coins:p.coins,landmarks:p.landmarks})),enabled:g ? Array.from(g.enabledLandmarks):[],buttons:Array.from(document.querySelectorAll('[data-action=buildLandmark]')).map(e=>({text:e.textContent,disabled:e.disabled})),body:document.body.innerText.slice(-6000)}"))
            shot(s,'failure-'+str(sessions.index(s)))
        except Exception as error: diagnostics.append(str(error))
    (out/'failure.json').write_text(json.dumps(diagnostics,ensure_ascii=False,indent=2))
    raise
finally:
    for s in sessions:
        try:request('DELETE','/session/'+s)
        except Exception:pass
    for p in processes:
        p.terminate()
        try:p.wait(timeout=8)
        except subprocess.TimeoutExpired:p.kill();p.wait()
    for log in logs:log.close()
