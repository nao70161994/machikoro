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
if not 320 <= viewport_width <= 1920:
    raise SystemExit('SMOKE_WIDTH must be between 320 and 1920')
browser=os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium-browser') or shutil.which('chromium')
if not browser or not shutil.which('chromedriver'):
    raise SystemExit('Chromium and a matching chromedriver are required')
out_value=Path(os.environ.get('SMOKE_OUTPUT_DIR', str(root/'artifacts'/'product-browser')))
out=out_value if out_value.is_absolute() else root/out_value
out.mkdir(parents=True,exist_ok=True)
(out/'result.json').unlink(missing_ok=True)
logs=[]
processes=[]
sessions=[]
target_landmark=os.environ.get("SMOKE_LANDMARK", "駅")
if target_landmark not in ["駅", "ショッピングモール", "電波塔", "all"]:
    raise SystemExit("SMOKE_LANDMARK must be 駅, ショッピングモール, 電波塔 or all")
trace=[]
player_area_top=None
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
def reveal_start(s):
    return js(s,"const screen=document.getElementById('titleScreen'),button=document.getElementById('btnStart'),banner=document.getElementById('pwaInstallBanner'),screenRect=screen.getBoundingClientRect(),buttonRect=button.getBoundingClientRect(),bannerRect=banner.getBoundingClientRect();const lower=Math.min(innerHeight,screenRect.bottom,bannerRect.height?bannerRect.top:innerHeight)-16;if(screen.scrollHeight>screen.clientHeight+1){screen.scrollTop=Math.max(0,Math.min(screen.scrollHeight-screen.clientHeight,screen.scrollTop+buttonRect.bottom-lower));}else{window.scrollTo(0,Math.max(0,scrollY+buttonRect.bottom-lower));}return {scrollTop:screen.scrollTop,scrollY,button:document.getElementById('btnStart').getBoundingClientRect().toJSON(),screen:screen.getBoundingClientRect().toJSON(),banner:banner.getBoundingClientRect().toJSON()};")
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
        v=request('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'chrome','pageLoadStrategy':'eager','goog:chromeOptions':{'binary':browser,'args':['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=2'],'mobileEmulation':{'deviceMetrics':{'width':viewport_width,'height':844,'pixelRatio':1,'mobile':True,'touch':True}}}}}})
        s=v['sessionId'];sessions.append(s)
        request('POST','/session/'+s+'/url',{'url':base_url+'/'})
        wait(s,"return typeof reviewGameSetup === 'function'")
        js(s,"const e=document.getElementById('designThemeSelect');e.value="+json.dumps(design)+";e.dispatchEvent(new Event('change',{bubbles:true}));")
        assert js(s,"return document.documentElement.dataset.design")==design
        expected_select_background='rgb(27, 43, 58)' if design=='sunset' else 'rgb(18, 18, 37)'
        assert js(s,"return getComputedStyle(document.querySelector('#playerSettings .player-setting-select')).backgroundColor")==expected_select_background, 'Player type selector does not match the selected dark theme'
        setup_controls_clear = js(s,"const a=document.getElementById('btnStart').getBoundingClientRect(),b=document.querySelector('#tabContentLocal .player-select').getBoundingClientRect();return a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right")
        assert setup_controls_clear, 'Start action overlaps player-count controls'
        if viewport_width >= 760:
            title_columns_clear = js(s,"const a=document.querySelector('.title-header').getBoundingClientRect(),b=document.getElementById('tabContentLocal').getBoundingClientRect();return a.right < b.left && b.width > a.width")
            assert title_columns_clear, 'Wide title does not separate brand and setup columns'
        js(s,"window.scrollTo(0,0);")
        shot(s,design+'-title')
        if viewport_width >= 760:
            count_up = "document.querySelector('#tabContentLocal [data-ui-action=\\\"changeCount\\\"][data-delta=\\\"1\\\"]')"
            js(s, f"{count_up}.click();{count_up}.click();")
            assert js(s,"return Number(document.getElementById('playerCount').textContent.replace(/\\D/g,''))") == 4
            assert js(s,"return document.querySelectorAll('#playerSettings .player-setting').length") == 4
            assert js(s,"return Array.from(document.querySelectorAll('#playerSettings .player-setting-select')).every(e=>e.getBoundingClientRect().width>=140)") , 'Wide player setup selects are too narrow at 4 players'
            reveal_state = reveal_start(s)
            four_player_start_state = js(s,"const screen=document.getElementById('titleScreen'),a=document.getElementById('btnStart').getBoundingClientRect(),b=document.getElementById('pwaInstallBanner').getBoundingClientRect(),r=screen.getBoundingClientRect();return {clear:a.top>=0&&a.bottom<=innerHeight&&(!b.height||a.bottom<=b.top||a.top>=b.bottom),button:{top:a.top,bottom:a.bottom},banner:{top:b.top,bottom:b.bottom,height:b.height},screen:{top:r.top,bottom:r.bottom,scrollTop:screen.scrollTop,scrollHeight:screen.scrollHeight,clientHeight:screen.clientHeight},viewport:{height:innerHeight,scrollY}}")
            assert four_player_start_state['clear'], f"Four-player start action is hidden or overlaps the PWA install banner: before/after={reveal_state}, result={four_player_start_state}"
            shot(s,design+'-title-4p-start')
            js(s,"document.getElementById('titleScreen').scrollTop=0;window.scrollTo(0,0);")
            shot(s,design+'-title-4p')
            count_down = "document.querySelector('#tabContentLocal [data-ui-action=\\\"changeCount\\\"][data-delta=\\\"-1\\\"]')"
            js(s, f"{count_down}.click();{count_down}.click();")
            assert js(s,"return Number(document.getElementById('playerCount').textContent.replace(/\\D/g,''))") == 2
        else:
            count_up = "document.querySelector('#tabContentLocal [data-ui-action=\\\"changeCount\\\"][data-delta=\\\"1\\\"]')"
            js(s, f"{count_up}.click();{count_up}.click();")
            assert js(s,"return Number(document.getElementById('playerCount').textContent.replace(/\\D/g,''))") == 4
            assert js(s,"return document.querySelectorAll('#playerSettings .player-setting').length") == 4
            assert js(s,"return document.documentElement.scrollWidth <= innerWidth && Array.from(document.querySelectorAll('#playerSettings .player-setting-select')).every(e=>e.getBoundingClientRect().width>=200)"), 'Phone 4-player setup overflows or squeezes player selectors'
            shot(s,design+'-title-4p')
            reveal_state = reveal_start(s)
            four_player_start_state = js(s,"const screen=document.getElementById('titleScreen'),a=document.getElementById('btnStart').getBoundingClientRect(),b=document.querySelector('#pwaInstallBanner').getBoundingClientRect(),r=screen.getBoundingClientRect();return {clear:a.top>=0&&a.bottom<=innerHeight&&(!b.height||a.bottom<=b.top||a.top>=b.bottom),button:{top:a.top,bottom:a.bottom},banner:{top:b.top,bottom:b.bottom,height:b.height},screen:{top:r.top,bottom:r.bottom,scrollTop:screen.scrollTop,scrollHeight:screen.scrollHeight,clientHeight:screen.clientHeight},viewport:{height:innerHeight,scrollY}}")
            assert four_player_start_state['clear'], f"Phone 4-player start action is hidden or overlaps the PWA install banner: before/after={reveal_state}, result={four_player_start_state}"
            shot(s,design+'-title-4p-start')
            js(s,"document.getElementById('titleScreen').scrollTop=0;window.scrollTo(0,0);")
            count_down = "document.querySelector('#tabContentLocal [data-ui-action=\\\"changeCount\\\"][data-delta=\\\"-1\\\"]')"
            js(s, f"{count_down}.click();{count_down}.click();")
            assert js(s,"return Number(document.getElementById('playerCount').textContent.replace(/\\D/g,''))") == 2
        if design == 'sunset' or viewport_width >= 760:
            reveal_start(s)
            start_action_state = js(s,"const screen=document.getElementById('titleScreen'),a=document.getElementById('btnStart').getBoundingClientRect(),b=document.getElementById('pwaInstallBanner').getBoundingClientRect();return {clear:a.top>=0&&a.bottom<=innerHeight&&(!b.height||a.bottom<=b.top||a.top>=b.bottom),button:{top:a.top,bottom:a.bottom,left:a.left,right:a.right},banner:{top:b.top,bottom:b.bottom,height:b.height,display:getComputedStyle(document.getElementById('pwaInstallBanner')).display},viewport:{width:innerWidth,height:innerHeight,scrollY:scrollY,screenTop:screen.getBoundingClientRect().top,screenBottom:screen.getBoundingClientRect().bottom,screenScrollTop:screen.scrollTop,screenScrollHeight:screen.scrollHeight,screenClientHeight:screen.clientHeight},classes:document.body.className}")
            assert start_action_state['clear'], f"Start action is hidden or overlaps the PWA install banner: {start_action_state}"
            if design == 'sunset':
                shot(s,'sunset-title-start')
            elif viewport_width >= 760:
                shot(s,'classic-title-start')
        js(s,"window.landmarkEnableTrace=[]; const descriptor=Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype,'disabled'); Object.defineProperty(HTMLButtonElement.prototype,'disabled',{...descriptor,set(value){if(!value && this.dataset.action==='buildLandmark') window.landmarkEnableTrace.push({name:this.dataset.landmarkName,stack:new Error().stack}); descriptor.set.call(this,value);}});")
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
        js(s,"window.scrollTo(0,0);")
        assert js(s,"return document.documentElement.scrollWidth <= window.innerWidth"), 'Horizontal overflow in game'
        log_before_players=js(s,"return !!(document.getElementById('gameLogContainer').compareDocumentPosition(document.getElementById('players')) & Node.DOCUMENT_POSITION_FOLLOWING)")
        assert log_before_players == (design == 'classic'), 'Unexpected game section order'
        if design == 'sunset':
            player_area_top = js(s,"return document.getElementById('players').getBoundingClientRect().top")
            assert player_area_top <= 0.60 * 844, 'Player city is pushed below the initial viewport'
        if viewport_width >= 760:
            wide_game_columns_clear = js(s,"const game=getComputedStyle(document.getElementById('gameScreen'));const a=document.querySelector('.game-action-panel').getBoundingClientRect(),b=document.querySelector('.player-area').getBoundingClientRect();return game.display==='grid' && a.right < b.left && b.top <= 0.60 * innerHeight")
            assert wide_game_columns_clear, 'Wide game does not align player cities beside the action panel'
            if design == 'classic':
                classic_town_visible = js(s,"return Array.from(document.querySelectorAll('.player-box .sunset-facility-art')).some(e=>getComputedStyle(e).display!=='none'&&e.getBBox().width>0)")
                assert classic_town_visible, 'Classic wide board does not render facility artwork'
        if viewport_width <= 480 and design == 'classic':
            compact_board_priority = js(s,"const a=document.querySelector('.player-area').getBoundingClientRect(),b=document.getElementById('gameLogContainer').getBoundingClientRect(),town=document.querySelector('.player-box .sunset-town');return a.top < b.top && town && getComputedStyle(town).display!=='none'")
            assert compact_board_priority, 'Classic compact board places player cities after the log or hides the town view'
        if viewport_width <= 389:
            assert js(s,"return document.getElementById('gameActivityStatus').getBoundingClientRect().height<=60"), 'Compact-screen activity status takes too much vertical space'
            assert js(s,"return document.querySelector('.player-box.active').getBoundingClientRect().top<=0.72*innerHeight"), 'Compact-screen guidance pushes the active city too far below the initial view'
        shot(s,design+'-online')
        assert js(s,"return document.documentElement.dataset.design")==design
    actor=next(s for s in sessions if js(s,"return !document.getElementById('btnRoll').disabled"))
    js(actor,"document.getElementById('btnRoll').click()")
    wait(actor,"return !!document.querySelector('#buildMenu .card-btn:not(:disabled)')")
    for s,design in zip(sessions,['classic','sunset']):
        js(s,"showCoinAnimation(0,1)")
        coin_feedback_clear = js(s,"const floats=Array.from(document.querySelectorAll('.coin-float'));return floats.length>0&&floats.every(e=>{const row=e.closest('.player-coin-row'),summary=e.closest('.player-box')?.querySelector('.town-summary');if(!row)return false;if(!summary)return true;const a=e.getBoundingClientRect(),b=summary.getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom})")
        assert coin_feedback_clear, 'Coin feedback is missing, outside the coin row, or overlaps the player city summary'
        shot(s,design+'-coin-feedback')
    for s,design in zip(sessions,['classic','sunset']):
        js(s,"document.getElementById('buildMenu').scrollIntoView({block:'start'})")
        if viewport_width >= 760:
            market_context_visible = js(s,"const area=document.querySelector('.player-area'),r=area.getBoundingClientRect();return getComputedStyle(area).position==='sticky' && r.top>=0 && r.top<innerHeight && Array.from(document.querySelectorAll('.player-box')).some(e=>{const b=e.getBoundingClientRect();return b.bottom>0&&b.top<innerHeight})")
            assert market_context_visible, 'Wide market scroll loses the player board context'
            if viewport_width <= 859:
                market_cards_readable = js(s,"return Array.from(document.querySelectorAll('#buildMenu .build-card-section .card-wrapper')).every(e=>e.getBoundingClientRect().width>=175)")
                assert market_cards_readable, 'Tablet market cards are too narrow to read comfortably'
        if design == 'sunset':
            wait(s,"return Array.from(document.querySelectorAll('.sunset-facility-art use')).some(e=>e.getBBox().width > 0)")
        disabled_card_contrast = js(s,"const cards=Array.from(document.querySelectorAll('#buildMenu .card-btn:disabled'));return cards.length>0&&cards.every(e=>Number(getComputedStyle(e).opacity)>=0.54)")
        assert disabled_card_contrast, 'Disabled facility cards are too faint to compare'
        if design == 'classic':
            disabled_effect_readable = js(s,"const e=document.querySelector('#buildMenu .card-btn:disabled .card-effect'),c=e&&getComputedStyle(e).color.match(/\\d+/g);return !!c&&Number(c[0])>=190&&Number(c[1])>=190&&Number(c[2])>=205")
            assert disabled_effect_readable, 'Disabled classic card effects are too low-contrast'
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
                    assert js(s,"return document.body.classList.contains('game-finished') && ['#gameConnectivityPanel','#turnTimeline','#tutorialBox','.game-action-panel','#gameLogContainer','.player-area','#buildMenu','#onlineLeaveHelp','#btnRestart'].every(selector => { const element=document.querySelector(selector); return element && getComputedStyle(element).display === 'none'; })"), 'Finished match still exposes active gameplay UI'
                    if viewport_width >= 760:
                        assert js(s,"const d=document.querySelector('.winner-screen .winner-review-details'),r=document.querySelector('#winnerRematchButton');return !!d&&!d.open&&!!r&&!!(r.compareDocumentPosition(d)&Node.DOCUMENT_POSITION_FOLLOWING)"), 'Wide winner details are not collapsed after the next action'
                    if viewport_width <= 480 and design == 'classic':
                        assert js(s,"const town=document.querySelector('.winner-screen .sunset-town');return !!town&&getComputedStyle(town).display!=='none'"), 'Classic compact winner view omits the town summary'
                    js(s,"window.scrollTo(0,0)")
                    assert js(s,"const group=document.querySelector('.winner-share-actions'),buttons=Array.from(group?.querySelectorAll('button')||[]),rect=group?.getBoundingClientRect();return buttons.length===2&&buttons[1].textContent.trim()==='画像を保存・共有'&&document.documentElement.scrollWidth<=innerWidth&&rect&&rect.width<=innerWidth&&buttons.every(button=>{const b=button.getBoundingClientRect();return b.width>=100&&b.height>=44&&b.height<=60})"), 'Winner share actions are missing, cramped, or overflowing'
                    assert js(s,"return !document.querySelector('.winner-screen .ad-slot')")
                    shot(s,design+'-winner')
                assert js(host,"return document.querySelector('.winner-title').textContent")==js(guest,"return document.querySelector('.winner-title').textContent")
                break
        previous=js(actor,"return GameRuntimeState.runtime.snapshot().game.currentPlayerIndex")
        js(actor,"document.getElementById('btnSkip').click();document.getElementById('confirmOkBtn').click()")
        for s in sessions:
            wait(s,"return GameRuntimeState.runtime.snapshot().game.currentPlayerIndex !== "+str(previous))
    else: raise RuntimeError('Match did not finish within '+str(max_turns)+' turns')
    city_visibility_check = 'sunset city enters the initial viewport'
    wide_layout_check = ['wide title separates brand and setup', 'wide start action stays visible above PWA banner', 'wide game aligns player cities beside actions', 'wide market preserves player board context'] if viewport_width >= 760 else []
    report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'browser':subprocess.check_output([browser,'--version'],text=True).strip(),'viewport':str(viewport_width)+'x844 emulation','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),'sunsetPlayerAreaTopAtPageStart':player_area_top,'passed':['classic/sunset title at page start',*wide_layout_check,'start action does not overlap player-count controls','sunset start action stays visible without covering PWA install banner',city_visibility_check,'mixed-design online start with ready','dice roll and build menu','sunset external SVG rendering','large text increases sunset card effect size','build and authoritative undo','host refresh and rejoin','finished match hides active gameplay UI',target_landmark+'-only online match completed with matching winners'],'notCovered':['physical device touch','WebKit',*(['standard all-landmark full match'] if target_landmark != 'all' else []),'PWA update']}
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
