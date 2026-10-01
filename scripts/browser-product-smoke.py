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
viewport_height=int(os.environ.get('SMOKE_HEIGHT','844'))
if not 320 <= viewport_width <= 1920:
    raise SystemExit('SMOKE_WIDTH must be between 320 and 1920')
if not 320 <= viewport_height <= 1920:
    raise SystemExit('SMOKE_HEIGHT must be between 320 and 1920')
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
focus_card=os.environ.get("SMOKE_FOCUS_CARD", "")
if target_landmark not in ["駅", "ショッピングモール", "電波塔", "all"]:
    raise SystemExit("SMOKE_LANDMARK must be 駅, ショッピングモール, 電波塔 or all")
trace=[]
player_area_top=None
market_art_gallery_count=0
landmark_art_gallery_count=0
town_density_captured=False
result_share_card_captured=False
market_gallery_session=None
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
def capture_result_share_card(s):
    data_url=js(s,"const g=GameRuntimeState.runtime.snapshot().game,winner=g&&g.checkWinner(),model=UiWinner.buildResultCardModel({winner,players:g?.players,turnCount:(g?.turnCount||0)+1}),canvas=document.createElement('canvas');if(!UiWinner.drawResultCard(canvas,model))return null;return canvas.toDataURL('image/png')")
    if not isinstance(data_url,str) or not data_url.startswith('data:image/png;base64,'):
        raise RuntimeError('Could not render the result share card')
    (out/'sunset-result-share-card.png').write_bytes(base64.b64decode(data_url.split(',',1)[1]))
def prepare_market_art_gallery(s):
    if os.environ.get('SMOKE_CAPTURE_ALL_FACILITIES') == '1':
        cards=js(s,"const allCards=CARDS;window.__artReviewCards=allCards.map(card=>UiBuildMenu.renderBuildCardButton({card,stock:6,canBuildThis:true,escapeHtml,getEffectText}));window.__artReviewCardMeta=allCards.map(card=>({name:card.name,title:card.name}));return window.__artReviewCardMeta")
    else:
        cards=js(s,"const wrappers=Array.from(document.querySelectorAll('#buildMenu .card-wrapper'));window.__artReviewCards=wrappers.map(wrapper=>wrapper.outerHTML);window.__artReviewCardMeta=wrappers.map(wrapper=>({name:wrapper.querySelector('.card-btn')?.dataset.cardName||wrapper.querySelector('.card-btn')?.dataset.landmarkName||'',title:wrapper.querySelector('.card-name')?.textContent||''}));return window.__artReviewCardMeta")
    if not cards:
        raise RuntimeError('No rendered market cards are available for the art gallery')
    (out/'market-art-gallery.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2))
    return len(cards)
def capture_market_art_gallery(s):
    global landmark_art_gallery_count
    cards=js(s,"return window.__artReviewCardMeta||[]")
    if not cards:
        raise RuntimeError('No rendered market cards are available for the art gallery')
    columns=2 if viewport_width<=480 else 5
    page_size=6 if viewport_width<=480 else 15
    style="""<style id=\"art-review-style\">#art-review-overlay{position:fixed;inset:0;z-index:2147483646;box-sizing:border-box;width:100vw;height:100vh;overflow:hidden;padding:8px 10px;background:#132538;color:#f8ebd1;display:flex;flex-direction:column;font-family:system-ui,sans-serif}.art-review-heading{display:flex;justify-content:space-between;gap:8px;margin:0 0 6px;font-size:13px;line-height:18px;flex:0 0 auto}.art-review-grid{display:grid;grid-template-columns:repeat(COLUMNS,minmax(0,1fr));gap:4px 7px;align-content:start;min-height:0}.art-review-grid .card-wrapper{width:100%;min-width:0;margin:0}.art-review-grid .card-btn{width:100%;min-width:0}.art-review-grid .card-body{padding:4px 7px 7px}.art-review-grid .card-name{font-size:13px}.art-review-grid .card-effect{font-size:11px;line-height:1.25}.art-review-grid .card-meta-row{min-height:24px}.art-review-grid .card-detail-btn{min-height:24px;padding:2px 7px;font-size:10px}</style>""".replace('COLUMNS',str(columns))
    page_count=(len(cards)+page_size-1)//page_size
    for page_index in range(page_count):
        start=page_index*page_size
        end=min(len(cards),start+page_size)
        js(s,"let overlay=document.getElementById('art-review-overlay');if(!overlay){overlay=document.createElement('div');overlay.id='art-review-overlay';document.body.append(overlay);}overlay.innerHTML="+json.dumps(style)+"+'<header class=\"art-review-heading\"><strong>市場アートレビュー</strong><span>'+"+json.dumps(str(start+1)+'–'+str(end)+' / '+str(len(cards)))+"+'</span></header><section class=\"art-review-grid\">'+window.__artReviewCards.slice("+str(start)+','+str(end)+").join('')+'</section>';return true")
        shot(s,'sunset-market-gallery-'+str(page_index+1))
    js(s,"document.getElementById('art-review-overlay')?.remove();delete window.__artReviewCards;delete window.__artReviewCardMeta")
    landmark_names=js(s,"return Player.landmarkNames()")
    landmark_cards=js(s,"return Player.landmarkNames().map(name=>renderLandmarkBuildButton(name,false,Player.landmarkCost(name),false))")
    if not landmark_cards or len(landmark_cards)!=len(landmark_names):
        raise RuntimeError('Could not render every landmark card for the art gallery')
    (out/'landmark-art-gallery.json').write_text(json.dumps([{'name':name} for name in landmark_names],ensure_ascii=False,indent=2))
    js(s,"let overlay=document.getElementById('art-review-overlay');if(!overlay){overlay=document.createElement('div');overlay.id='art-review-overlay';document.body.append(overlay);}const style="+json.dumps(style)+";overlay.innerHTML=style+'<header class=\"art-review-heading\"><strong>ランドマークアートレビュー</strong><span>'+"+json.dumps('1–'+str(len(landmark_cards))+' / '+str(len(landmark_cards)))+"+'</span></header><section class=\"art-review-grid\">'+"+json.dumps(''.join(landmark_cards))+"+'</section>';return true")
    shot(s,'sunset-landmark-art-gallery')
    js(s,"document.getElementById('art-review-overlay')?.remove()")
    landmark_art_gallery_count=len(landmark_cards)
    return len(cards)
def reveal_start(s):
    wait(s,"const banner=document.getElementById('pwaInstallBanner');return !banner.getAnimations().some(animation=>animation.playState==='running')")
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
        v=request('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'chrome','pageLoadStrategy':'eager','goog:chromeOptions':{'binary':browser,'args':['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--renderer-process-limit=2'],'mobileEmulation':{'deviceMetrics':{'width':viewport_width,'height':viewport_height,'pixelRatio':1,'mobile':True,'touch':True}}}}}})
        s=v['sessionId'];sessions.append(s)
        request('POST','/session/'+s+'/url',{'url':base_url+'/'})
        wait(s,"return typeof reviewGameSetup === 'function'")
        js(s,"const e=document.getElementById('designThemeSelect');e.value="+json.dumps(design)+";e.dispatchEvent(new Event('change',{bubbles:true}));")
        assert js(s,"return document.documentElement.dataset.design")==design
        expected_select_background='rgb(24, 45, 63)' if design=='sunset' else 'rgb(18, 18, 37)'
        assert js(s,"return getComputedStyle(document.querySelector('#playerSettings .player-setting-select')).backgroundColor")==expected_select_background, 'Player type selector does not match the selected dark theme'
        if viewport_width >= 760:
            if design=='sunset' and viewport_height <= 500:
                landscape_title_state = js(s,"const h=document.querySelector('.title-header').getBoundingClientRect(),t=document.querySelector('.tab-bar').getBoundingClientRect(),c=document.querySelector('#tabContentLocal').getBoundingClientRect();return {ok:h.height<=180&&h.bottom<=Math.max(t.bottom,c.top)&&t.top>=h.top&&c.top>Math.max(h.bottom,t.bottom)&&c.width>=390,hero:{top:h.top,bottom:h.bottom,height:h.height},tabs:{top:t.top,bottom:t.bottom,width:t.width},content:{top:c.top,width:c.width},viewport:{width:innerWidth,height:innerHeight}}")
                assert landscape_title_state['ok'], f"Landscape sunset title does not compact the hero and keep setup content reachable: {landscape_title_state}"
            elif design=='sunset' and viewport_width >= 1000:
                title_columns_clear = js(s,"const h=document.querySelector('.title-header').getBoundingClientRect(),t=document.querySelector('.title-header h1').getBoundingClientRect(),i=document.querySelector('.title-header .sunset-hero img').getBoundingClientRect(),b=document.querySelector('.tab-bar').getBoundingClientRect(),sw=document.querySelector('.design-switcher').getBoundingClientRect(),c=document.querySelector('#tabContentLocal').getBoundingClientRect();return h.width>900&&h.bottom<=b.top&&t.right<i.left&&c.width>900&&c.top>Math.max(sw.bottom,b.bottom)")
                assert title_columns_clear, 'Wide sunset title setup does not use the full width below the hero and tabs'
            elif design=='sunset':
                tablet_title_state = js(s,"const h=document.querySelector('.title-header').getBoundingClientRect(),t=document.querySelector('.title-header h1').getBoundingClientRect(),i=document.querySelector('.title-header .sunset-hero img').getBoundingClientRect(),b=document.querySelector('.tab-bar').getBoundingClientRect(),sw=document.querySelector('.design-switcher').getBoundingClientRect(),c=document.querySelector('#tabContentLocal').getBoundingClientRect();return {ok:h.width>=680&&h.bottom<=sw.top&&t.right<i.left&&sw.width>=250&&b.width>=390&&c.width>=390&&c.top>Math.max(sw.bottom,b.bottom),hero:{left:h.left,right:h.right,width:h.width,bottom:h.bottom},titleRight:t.right,imageLeft:i.left,switch:{width:sw.width,bottom:sw.bottom},tabs:{width:b.width,top:b.top},content:{width:c.width,top:c.top}}")
                assert tablet_title_state['ok'], f"Tablet sunset title setup does not stack hero, setup tabs, and content cleanly: {tablet_title_state}"
            else:
                title_columns_clear = js(s,"const a=document.querySelector('.title-header').getBoundingClientRect(),t=document.querySelector('.tab-bar').getBoundingClientRect(),b=document.getElementById('tabContentLocal').getBoundingClientRect();return {ok:a.right<t.left&&b.top>=Math.max(a.bottom,t.bottom)&&b.width>a.width,brand:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},tabs:{left:t.left,right:t.right,top:t.top,bottom:t.bottom},content:{left:b.left,right:b.right,top:b.top,bottom:b.bottom}}")
                assert title_columns_clear['ok'], f"Wide title does not separate brand/tabs above the setup content: {title_columns_clear}"
        js(s,"window.scrollTo(0,0);")
        shot(s,design+'-title')
        if design == 'sunset':
            js(s,"document.querySelector('.rules-btn').click()")
            wait(s,"return getComputedStyle(document.getElementById('rulesModal')).display!=='none'")
            rules_icon_state = js(s,"const headings=Array.from(document.querySelectorAll('#rulesModal .modal-heading-emoji')),icons=Array.from(document.querySelectorAll('#rulesModal .modal-heading-icon'));return {fallbacks:headings.filter(e=>getComputedStyle(e).display!=='none'&&e.getClientRects().length).map(e=>e.textContent),icons:icons.filter(e=>getComputedStyle(e).display!=='none'&&e.getClientRects().length).length,uses:icons.map(e=>e.querySelector('use')?.getAttribute('href'))}")
            assert not rules_icon_state['fallbacks'] and rules_icon_state['icons']==len(rules_icon_state['uses']) and all(href and href.startswith('icons/interface-ui.svg#') for href in rules_icon_state['uses']), f'Sunset rules dialog does not consistently render vector heading icons: {rules_icon_state}'
            js(s,"document.body.classList.add('accessibility-high-contrast')")
            high_contrast_rules_fallbacks = js(s,"return Array.from(document.querySelectorAll('#rulesModal .modal-heading-emoji')).filter(e=>getComputedStyle(e).display!=='none'&&e.getClientRects().length).map(e=>e.textContent)")
            assert not high_contrast_rules_fallbacks, f'High-contrast sunset rules dialog shows platform emoji fallbacks: {high_contrast_rules_fallbacks}'
            js(s,"document.body.classList.remove('accessibility-high-contrast')")
            js(s,"document.querySelector('#rulesModal [data-ui-action=closeRules]').click()")
            wait(s,"return getComputedStyle(document.getElementById('rulesModal')).display==='none'")
        js(s,"const setup=document.getElementById('customGameSetup');if(!setup.open)setup.querySelector('summary').click();")
        setup_controls_state = js(s,"const a=document.getElementById('btnStart').getBoundingClientRect(),b=document.querySelector('#tabContentLocal .player-select').getBoundingClientRect();return {clear:a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right,start:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},count:{left:b.left,right:b.right,top:b.top,bottom:b.bottom}}")
        assert setup_controls_state['clear'], f"Start action overlaps player-count controls: {setup_controls_state}"
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
            phone_setup_geometry = js(s,"const settings=document.getElementById('playerSettings'),rect=e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {width:r.width,display:c.display,columns:c.gridTemplateColumns,direction:c.flexDirection}};return {scrollWidth:document.documentElement.scrollWidth,innerWidth,settings:rect(settings),tab:rect(document.getElementById('tabContentLocal')),details:rect(document.getElementById('customGameSetup')),cards:Array.from(settings.children).map(rect),selects:Array.from(document.querySelectorAll('#playerSettings .player-setting-select')).map(e=>rect(e))}")
            assert phone_setup_geometry['scrollWidth'] <= viewport_width and all(e['width'] >= 200 for e in phone_setup_geometry['selects']), f"Phone 4-player setup overflows or squeezes player selectors: {phone_setup_geometry}"
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
                if viewport_width <= 360:
                    banner_layout = js(s,"const banner=document.getElementById('pwaInstallBanner'),text=banner.querySelector('.pwa-banner-text').getBoundingClientRect(),actions=banner.querySelector('.pwa-banner-actions').getBoundingClientRect();return {textWidth:text.width,actionsWidth:actions.width,textBottom:text.bottom,actionsTop:actions.top}")
                    assert banner_layout['textWidth'] >= 250 and banner_layout['actionsWidth'] >= 250 and banner_layout['actionsTop'] >= banner_layout['textBottom'] - 1, f"320px install banner does not separate its message from the actions: {banner_layout}"
                shot(s,'sunset-title-start')
            elif viewport_width >= 760:
                shot(s,'classic-title-start')
        js(s,"window.landmarkEnableTrace=[]; const descriptor=Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype,'disabled'); Object.defineProperty(HTMLButtonElement.prototype,'disabled',{...descriptor,set(value){if(!value && this.dataset.action==='buildLandmark') window.landmarkEnableTrace.push({name:this.dataset.landmarkName,stack:new Error().stack}); descriptor.set.call(this,value);}});")
    if os.environ.get('SMOKE_REROLL_RESTORE') == '1':
        restore_session=sessions[1]
        js(restore_session,"document.querySelector('.setup-quick-play').click();return true")
        wait(restore_session,"const g=GameRuntimeState.runtime.snapshot().game;return !!g&&getComputedStyle(document.getElementById('gameScreen')).display!=='none'&&!document.getElementById('btnRoll').disabled")
        js(restore_session,"const g=GameRuntimeState.runtime.snapshot().game,p=g.currentPlayer();p.landmarks[LANDMARK_NAMES.STATION]=true;p.landmarks[LANDMARK_NAMES.RADIO_TOWER]=true;return true")
        js(restore_session,"document.getElementById('btnRoll').click();return true")
        wait(restore_session,"return GameRuntimeState.runtime.snapshot().game.phase===GAME_PHASES.SELECT_DICE")
        js(restore_session,"document.querySelector('.dice-choose [data-action=\"selectDiceCount\"][data-use-two=\"true\"]').click();return true")
        wait(restore_session,"return GameRuntimeState.runtime.snapshot().game.phase===GAME_PHASES.REROLL_CONFIRM")
        js(restore_session,"document.querySelector('.dice-choose [data-action=\"rerollDice\"]').click();return true")
        wait(restore_session,"const g=GameRuntimeState.runtime.snapshot().game;return g.phase===GAME_PHASES.SELECT_DICE&&!!g.pendingRadioTowerReroll")
        pending=js(restore_session,"saveGameState();return JSON.parse(localStorage.getItem('savedGame')).pendingRadioTowerReroll")
        assert pending and pending['result']==pending['dice1']+pending['dice2'], f'Invalid saved reroll state: {pending}'
        request('POST','/session/'+restore_session+'/refresh',{})
        wait(restore_session,"return getComputedStyle(document.getElementById('resumeSection')).display!=='none'")
        js(restore_session,"document.getElementById('btnResume').click();return true")
        restored=wait(restore_session,"const g=GameRuntimeState.runtime.snapshot().game;return g&&g.phase===GAME_PHASES.SELECT_DICE&&g.pendingRadioTowerReroll&&document.querySelector('.dice-choose [data-action=\"selectDiceCount\"]')")
        assert restored, 'Reroll choice did not return after reload'
        dice_layout=js(restore_session,"const panel=document.querySelector('.game-action-panel'),choice=document.querySelector('.dice-choose'),buttons=[...choice.querySelectorAll('button')],panelStyle=getComputedStyle(panel);return {actionHeight:panel.getBoundingClientRect().height,choiceHeight:choice.getBoundingClientRect().height,rollDisplay:getComputedStyle(document.getElementById('btnRoll')).display,panelBorder:panelStyle.borderTopWidth,panelBackground:panelStyle.backgroundColor,choiceButtonHeights:buttons.map(button=>button.getBoundingClientRect().height)}")
        assert dice_layout['rollDisplay']=='none',f'Duplicate roll action remains during dice choice: {dice_layout}'
        assert dice_layout['panelBorder']=='0px' and dice_layout['panelBackground']=='rgba(0, 0, 0, 0)',f'Mobile action panel still adds a redundant outer box: {dice_layout}'
        assert dice_layout['actionHeight']<260 and all(height>=44 for height in dice_layout['choiceButtonHeights']),f'Mobile dice choice uses too much space or has undersized tap targets: {dice_layout}'
        shot(restore_session,'sunset-radio-tower-reroll-restored')
        js(restore_session,"document.querySelector('.dice-choose [data-action=\"selectDiceCount\"][data-use-two=\"true\"]').click();return true")
        reroll_message=wait(restore_session,"const g=GameRuntimeState.runtime.snapshot().game;return g.pendingRadioTowerReroll===null&&g.log.some(entry=>entry.message.startsWith('📡 電波塔で振り直し:'))&&g.log.find(entry=>entry.message.startsWith('📡 電波塔で振り直し:')).message")
        assert ' → 0' not in reroll_message, f'Impossible reroll result appeared in the log: {reroll_message}'
        assert '→ ' in reroll_message, f'Reroll log is incomplete: {reroll_message}'
        report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'browser':subprocess.check_output([browser,'--version'],text=True).strip(),'viewport':str(viewport_width)+'x'+str(viewport_height)+' emulation','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),'pendingBeforeReload':pending,'diceChoiceLayout':dice_layout,'rerollLogAfterRestore':reroll_message,'screenshot':'sunset-radio-tower-reroll-restored.png','passed':['station and Radio Tower actions enter reroll and dice-choice phases','valid local save is written with the pre-reroll dice','reload and local resume restore the pending choice','mobile dice selection hides the duplicate roll button and keeps 44px targets','reroll finishes and writes the complete nonzero Radio Tower log'],'notCovered':['physical device touch','WebKit','CPU turn after reroll completion']}
        (out/'reroll-restore-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
        raise SystemExit(0)
    if os.environ.get('SMOKE_CAPTURE_PENDING') == '1':
        pending_session=sessions[1]
        js(pending_session,"document.querySelector('.setup-quick-play').click();return true")
        wait(pending_session,"return GameRuntimeState.runtime.snapshot().game&&getComputedStyle(document.getElementById('gameScreen')).display!=='none'")
        js(pending_session,"cancelCpuSchedule('pending-product-review');window.scheduleCPU=()=>false;const state=GameRuntimeState.runtime.snapshot(),game=state.game;game.currentPlayerIndex=state.cpuPlayers.findIndex(cpu=>!cpu);game.phase=GAME_PHASES.PENDING;game.pendingBusiness=1;render();return true")
        wait(pending_session,"return getComputedStyle(document.getElementById('pendingModal')).display==='flex'&&document.querySelectorAll('#pendingModal .bc-chip').length>0")
        layout=js(pending_session,"const modal=document.querySelector('#pendingModal'),inner=modal.querySelector('.pending-modal-inner'),chips=[...modal.querySelectorAll('.bc-chip')],title=modal.querySelector('.pending-heading > span'),range=document.createRange(),overflow=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}};range.selectNodeContents(title);const exchange=modal.querySelector('.bc-exchange-btn'),exchangeStyle=getComputedStyle(exchange);return {modal:overflow(modal),inner:overflow(inner),chips:chips.map(e=>({name:e.querySelector('.bc-chip-name')?.textContent,rect:overflow(e),artHeight:e.querySelector('.bc-chip-art').getBoundingClientRect().height,fontSize:getComputedStyle(e.querySelector('.bc-chip-name')).fontSize})),headings:[...modal.querySelectorAll('.bc-step-title')].map(e=>({text:e.textContent,rect:overflow(e)})),pendingTitle:{text:title.textContent,width:title.getBoundingClientRect().width,lines:[...range.getClientRects()].map(r=>r.width),textWrap:getComputedStyle(title).textWrap},exchange:{background:exchangeStyle.backgroundColor,image:exchangeStyle.backgroundImage,border:exchangeStyle.borderColor,color:exchangeStyle.color},bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth}")
        assert layout['inner']['scrollWidth']<=layout['inner']['clientWidth'],f'Pending UI overflows at {viewport_width}px: {layout}'
        assert layout['bodyWidth']<=viewport_width,f'Pending UI makes the page overflow at {viewport_width}px: {layout}'
        assert all(chip['rect']['width']>=72 and chip['artHeight']>=30 for chip in layout['chips']),f'Pending facility choices are not readable card objects: {layout}'
        assert 'linear-gradient' in layout['exchange']['image'] and layout['exchange']['color']=='rgb(28, 45, 58)',f'Business Center primary action does not use the sunset gold palette: {layout}'
        if viewport_width<=480:
            assert layout['pendingTitle']['textWrap']=='balance' and len(layout['pendingTitle']['lines'])<=2,f'Business Center heading wraps awkwardly on mobile: {layout}'
            assert len(layout['pendingTitle']['lines'])==1 or layout['pendingTitle']['lines'][-1]>=layout['pendingTitle']['width']*.48,f'Business Center heading leaves an orphaned final line: {layout}'
        shot(pending_session,'sunset-business-pending-'+str(viewport_width))
        report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'browser':subprocess.check_output([browser,'--version'],text=True).strip(),'viewport':str(viewport_width)+'x'+str(viewport_height)+' emulation','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),'layout':layout,'screenshot':'sunset-business-pending-'+str(viewport_width)+'.png','passed':['business-center pending panel renders with facility art and selected-card affordances','pending content and page fit the viewport without horizontal overflow'],'notCovered':['physical device touch','WebKit','all pending-effect types']}
        (out/'pending-layout-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
        raise SystemExit(0)
    if os.environ.get('SMOKE_CAPTURE_WINNER') == '1':
        winner_session=sessions[1]
        js(winner_session,"document.querySelector('.setup-quick-play').click();return true")
        wait(winner_session,"return GameRuntimeState.runtime.snapshot().game&&getComputedStyle(document.getElementById('gameScreen')).display!=='none'")
        js(winner_session,"const game=GameRuntimeState.runtime.snapshot().game;for(const name of game.enabledLandmarks)game.players[0].landmarks[name]=true;render();return true")
        wait(winner_session,"return document.querySelector('.winner-screen')&&document.body.classList.contains('game-finished')")
        js(winner_session,"window.scrollTo(0,0);document.getElementById('gameScreen').scrollTop=0;return true")
        wait(winner_session,"return document.querySelector('.winner-screen').getBoundingClientRect().top>=0")
        geometry=js(winner_session,"const winner=document.querySelector('.winner-screen'),town=winner.querySelector('.sunset-town'),street=town.querySelector('.town-street'),art=street.querySelector('.sunset-facility-art'),rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}},style=getComputedStyle(winner);return {viewport:innerWidth,winner:rect(winner),town:rect(town),street:rect(street),art:rect(art),winnerMaxWidth:style.maxWidth,bodyWidth:document.documentElement.scrollWidth,artCount:street.querySelectorAll('.sunset-facility-art').length}")
        assert geometry['bodyWidth']<=viewport_width,f'Winner screen overflows at {viewport_width}px: {geometry}'
        if viewport_width>=1200:
            assert geometry['winner']['width']>=1100 and geometry['town']['width']>=1000 and geometry['art']['height']>=95,f'Desktop victory does not give the completed city enough space: {geometry}'
        shot(winner_session,'sunset-result-'+str(viewport_width))
        passed=['real winner rendering runs through the game UI','winner screen and town fit the viewport']
        if viewport_width>=1200:
            passed.append('desktop winner expands the completed city into a wide showcase')
        report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'browser':subprocess.check_output([browser,'--version'],text=True).strip(),'viewport':str(viewport_width)+'x'+str(viewport_height)+' emulation','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),'geometry':geometry,'screenshot':'sunset-result-'+str(viewport_width)+'.png','passed':passed,'notCovered':['physical device display','WebKit']}
        (out/'winner-layout-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
        raise SystemExit(0)
    host,guest=sessions
    online_lobby_check=[]
    for s,name,design in [(host,'BrowserHost','classic'),(guest,'BrowserGuest','sunset')]:
        js(s,"document.getElementById('tabOnline').click();document.getElementById('playerNameInput').value="+json.dumps(name))
        if design=='sunset':
            assert js(s,"return getComputedStyle(document.querySelector('#tabContentOnline .online-tabs')).backgroundColor") == 'rgb(21, 40, 58)', 'Sunset online lobby tabs do not use the shared blue-green palette'
            assert js(s,"return getComputedStyle(document.getElementById('playerNameInput')).backgroundColor") == 'rgb(20, 38, 56)', 'Sunset online name field does not use the shared blue-green palette'
            assert js(s,"return getComputedStyle(document.getElementById('onlineCpuSpeed')).accentColor") == 'rgb(239, 196, 135)', 'Sunset online CPU speed control does not use the sunset gold accent'
            assert js(s,"return !document.querySelector('.online-cpu-speed-settings').open"), 'Sunset online CPU speed advanced setting should start collapsed'
            js(s,"document.querySelector('.online-cpu-speed-settings > summary').click();return true")
            assert js(s,"const e=document.getElementById('onlineCpuSpeed');return e.getBoundingClientRect().height>=44&&getComputedStyle(e).accentColor==='rgb(239, 196, 135)'"), 'Sunset online CPU speed control is not styled after disclosure'
            js(s,"document.querySelector('.online-cpu-speed-settings > summary').click();return true")
            assert js(s,"return getComputedStyle(document.querySelector('#tabContentOnline .setup-secondary-action')).backgroundColor") == 'rgb(41, 70, 90)', 'Sunset online secondary action does not use the shared blue-green palette'
            banner_background = js(s,"return getComputedStyle(document.getElementById('pwaInstallBanner')).backgroundImage")
            assert 'rgb(28, 51, 70)' in banner_background and 'rgb(25, 46, 64)' in banner_background, 'Sunset PWA install banner does not use the shared blue-green palette'
            online_lobby_check.append('sunset online lobby palette and form controls')
        shot(s,design+'-online-lobby')
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
            assert player_area_top <= 0.60 * viewport_height, 'Player city is pushed below the initial viewport'
            assert js(s,"const badge=document.querySelector('.player-cards .card-badge');return !!badge&&getComputedStyle(badge).backgroundColor==='rgb(41, 70, 90)'"), 'Sunset town card badges do not use the blue-green palette'
            assert js(s,"return getComputedStyle(document.getElementById('status')).backgroundImage.includes('rgb(29, 53, 72)')"), 'Sunset active-turn panel does not use the blue-green palette'
            assert js(s,"return getComputedStyle(document.querySelector('.log-header')).backgroundColor==='rgb(29, 53, 72)'"), 'Sunset log header does not use the blue-green palette'
            assert js(s,"return getComputedStyle(document.querySelector('.log-summary')).backgroundColor==='rgb(26, 48, 66)'"), 'Sunset log summary does not use the blue-green palette'
            assert js(s,"return document.querySelectorAll('.player-landmarks .landmark-badge:not(.built)').length===0"), 'Player boards should keep unbuilt landmark badges out of the town view'
            landmark_badge_art=js(s,"const area=document.querySelector('.player-landmarks');if(!area)return null;const badge=document.createElement('span');badge.className='landmark-badge built';badge.innerHTML='<svg class=\"landmark-badge-icon\" viewBox=\"0 0 160 80\"><use href=\"icons/facility-art.svg#station\"></use></svg> 駅';area.append(badge);const use=badge.querySelector('use'),icon=use.closest('svg'),state={href:use.getAttribute('href'),width:getComputedStyle(icon).width,display:getComputedStyle(icon).display};badge.remove();return state")
            assert landmark_badge_art and landmark_badge_art['href']=='icons/facility-art.svg#station' and landmark_badge_art['width']=='28px' and landmark_badge_art['display']!='none', f"Sunset landmark badges do not use legible custom station art: {landmark_badge_art}"
            assert js(s,"const mark=document.querySelector('#buildMenu .card-landmark-mark'),use=mark?.querySelector('use');return !!use&&use.getAttribute('href')==='icons/facility-art.svg#station'&&!mark.textContent.trim()"), 'Sunset landmark market header does not use custom vector art'
            assert js(s,"return !!document.querySelector('.player-icon .player-kind-icon')&&!!document.querySelector('.player-coins .card-coin-mark')"), 'Sunset player headers do not use the custom player and coin icons'
            assert js(s,"const text=document.getElementById('status').textContent;return !text.includes('👤')&&!text.includes('🪙')"), 'Sunset active-turn line still relies on platform emoji'
            visible_emoji_fallbacks = js(s,"return Array.from(document.querySelectorAll('[class]')).filter(element=>String(element.className).split(/\\s+/).some(name=>name.endsWith('-emoji'))&&element.getClientRects().length&&getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden').map(element=>({className:String(element.className),text:element.textContent.trim()}))")
            assert not visible_emoji_fallbacks, f'Sunset gameplay still shows OS-dependent emoji fallbacks beside custom art: {visible_emoji_fallbacks}'
            js(s,"document.body.classList.add('accessibility-high-contrast')")
            high_contrast_emoji_fallbacks = js(s,"return Array.from(document.querySelectorAll('[class]')).filter(element=>String(element.className).split(/\\s+/).some(name=>name.endsWith('-emoji'))&&element.getClientRects().length&&getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden').map(element=>({className:String(element.className),text:element.textContent.trim()}))")
            js(s,"document.body.classList.remove('accessibility-high-contrast')")
            assert not high_contrast_emoji_fallbacks, f'High-contrast sunset gameplay shows OS-dependent emoji fallbacks: {high_contrast_emoji_fallbacks}'
        if viewport_width >= 760:
            if viewport_height <= 500:
                landscape_game_layout = js(s,"const game=getComputedStyle(document.getElementById('gameScreen')),a=document.querySelector('.game-action-panel').getBoundingClientRect(),p=document.querySelector('.player-area').getBoundingClientRect(),c=document.querySelector('.game-connectivity-panel').getBoundingClientRect(),t=document.querySelector('.turn-timeline').getBoundingClientRect();return {ok:game.display==='grid'&&a.right<=p.left&&a.top<0.68*innerHeight&&p.top<0.68*innerHeight&&c.height<=52&&t.height<=52,action:{top:a.top,right:a.right,bottom:a.bottom},players:{top:p.top,left:p.left},connectivity:{top:c.top,height:c.height},timeline:{top:t.top,height:t.height},viewport:{width:innerWidth,height:innerHeight}}")
                assert landscape_game_layout['ok'], f"Landscape sunset board and controls do not fit the short viewport: {landscape_game_layout}"
            else:
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
            market_art_scale_check = js(s,"const arts=Array.from(document.querySelectorAll('#buildMenu .card-btn .sunset-facility-art'));return arts.length>0&&arts.every(e=>{const r=e.getBoundingClientRect();return r.height>=88&&r.height+1>=r.width*.49})")
            assert market_art_scale_check, 'Sunset market scene art is too short for its card width'
            filter_style = js(s,"const e=document.querySelector('.card-filter-bar'),active=document.querySelector('.card-filter-btn.active'),style=getComputedStyle(e);return {background:style.backgroundColor,image:style.backgroundImage,active:getComputedStyle(active).backgroundColor}")
            assert filter_style['active'] == 'rgb(51, 73, 90)', 'Sunset market filters do not use the shared blue-green and gold palette'
            if viewport_width >= 1200:
                assert 'linear-gradient' in filter_style['image'], 'Desktop market filters do not read as part of the shared tabletop'
                desktop_board_check = js(s,"const screen=document.getElementById('gameScreen'),grid=document.querySelector('#buildMenu .card-grid'),style=getComputedStyle(screen);return {surface:style.backgroundImage,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length}")
                assert 'radial-gradient' in desktop_board_check['surface'], 'Desktop game screen has no shared board surface'
                assert desktop_board_check['columns'] == 4, f"Desktop market is not laid out as a four-column board: {desktop_board_check}"
            else:
                assert filter_style['background'] == 'rgb(23, 43, 61)', 'Sunset market filters do not use the shared blue-green palette'
            market_meta_check = js(s,"const wrappers=Array.from(document.querySelectorAll('#buildMenu .card-wrapper')).filter(wrapper=>wrapper.querySelector('.card-stock'));return wrappers.length>0&&wrappers.every(wrapper=>{const card=wrapper.querySelector('.card-btn'),art=wrapper.querySelector('.card-btn .sunset-facility-art'),stock=wrapper.querySelector('.card-stock'),detail=wrapper.querySelector('.card-detail-btn'),icon=detail?.querySelector('.card-detail-icon'),stockRect=stock?.getBoundingClientRect(),cardRect=card?.getBoundingClientRect(),artRect=art?.getBoundingClientRect(),detailRect=detail?.getBoundingClientRect();return !!card&&!!art&&!!stock&&!!detail&&stockRect.top>=cardRect.top&&stockRect.top<artRect.bottom&&stockRect.right<=wrapper.getBoundingClientRect().right&&detailRect.width>=44&&detailRect.height>=44&&getComputedStyle(icon).display!=='none'&&getComputedStyle(detail.querySelector('.card-detail-label')).display==='none'})")
            assert market_meta_check, 'Sunset market card stock/detail controls do not read as one accessible card object'
        disabled_card_style=js(s,"const card=document.querySelector('#buildMenu .card-btn');if(!card)return null;const wasDisabled=card.disabled;card.disabled=true;const effect=card.querySelector('.card-effect'),color=effect&&getComputedStyle(effect).color.match(/\\d+/g),state={opacity:Number(getComputedStyle(card).opacity),effectColor:color&&color.map(Number)};card.disabled=wasDisabled;return state")
        assert disabled_card_style and disabled_card_style['opacity']>=0.54, f"Disabled facility cards are too faint to compare: {disabled_card_style}"
        if design == 'classic':
            effect_color=disabled_card_style['effectColor']
            assert effect_color and effect_color[0]>=190 and effect_color[1]>=190 and effect_color[2]>=205, f"Disabled classic card effects are too low-contrast: {effect_color}"
        shot(s,design+'-market')
        if design == 'sunset' and (os.environ.get('SMOKE_CAPTURE_CARD_GALLERY') == '1' or os.environ.get('SMOKE_CAPTURE_ALL_FACILITIES') == '1'):
            market_art_gallery_count=prepare_market_art_gallery(s)
            market_gallery_session=s
        if design == 'sunset' and focus_card:
            focused = js(s,"const e=Array.from(document.querySelectorAll('#buildMenu .card-btn[data-card-name],#buildMenu .card-btn[data-landmark-name]')).find(button=>button.dataset.cardName==="+json.dumps(focus_card)+"||button.dataset.landmarkName==="+json.dumps(focus_card)+");if(!e)return false;e.scrollIntoView({block:'center'});return true")
            assert focused, 'Requested facility or landmark art is not present in the current market: '+focus_card
            shot(s,'sunset-focus-card')
            js(s,"document.getElementById('buildMenu').scrollIntoView({block:'start'})")
        if design == 'sunset':
            normal_size=js(s,"return parseFloat(getComputedStyle(document.querySelector('#buildMenu .card-effect')).fontSize)")
            js(s,"const e=document.getElementById('accessibilityFontScale');e.value='large';e.dispatchEvent(new Event('change',{bubbles:true}));")
            assert js(s,"return parseFloat(getComputedStyle(document.querySelector('#buildMenu .card-effect')).fontSize)") > normal_size
            shot(s,'sunset-market-large-text')
            js(s,"const e=document.getElementById('accessibilityFontScale');e.value='standard';e.dispatchEvent(new Event('change',{bubbles:true}));")
    if os.environ.get('SMOKE_STOP_AFTER_MARKET') == '1':
        passed=['classic/sunset title and setup at page start','quick start and setup controls do not overlap','4-player start action stays reachable above the PWA install banner','mixed-design online start with ready','sunset city enters the initial viewport','sunset rules dialog uses vector icons without visible emoji duplicates','sunset gameplay hides visible platform emoji fallbacks','market cards and large text scale correctly','market stock badge and detail action fit the card face with accessible targets']
        if viewport_width >= 1200:
            passed.extend(['desktop game screen uses a shared tabletop surface','desktop market and filters form a four-column play area'])
        report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'browser':subprocess.check_output([browser,'--version'],text=True).strip(),'viewport':str(viewport_width)+'x'+str(viewport_height)+' emulation','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),'sunsetPlayerAreaTopAtPageStart':player_area_top,'passed':passed,'notCovered':['match gameplay','physical device touch','WebKit','PWA update']}
        (out/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps(report,ensure_ascii=False))
        raise SystemExit(0)
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
                    if design == 'sunset':
                        assert js(s,"const kind=document.querySelector('.winner-sub-type .winner-kind-icon'),coins=Array.from(document.querySelectorAll('.winner-stats-row .card-coin-mark'));return !!kind&&coins.length===document.querySelectorAll('.winner-stats-row').length&&!document.querySelector('.winner-sub-type').textContent.match(/[👤🤖]/)&&!Array.from(document.querySelectorAll('.winner-stats-row')).some(row=>row.textContent.includes('🪙'))"), 'Sunset winner view still contains emoji player or coin marks'
                    if viewport_width >= 760:
                        assert js(s,"const d=document.querySelector('.winner-screen .winner-review-details'),r=document.querySelector('#winnerRematchButton');return !!d&&!d.open&&!!r&&!!(r.compareDocumentPosition(d)&Node.DOCUMENT_POSITION_FOLLOWING)"), 'Wide winner details are not collapsed after the next action'
                    if viewport_width <= 480 and design == 'classic':
                        assert js(s,"const town=document.querySelector('.winner-screen .sunset-town');return !!town&&getComputedStyle(town).display!=='none'"), 'Classic compact winner view omits the town summary'
                    js(s,"window.scrollTo(0,0)")
                    assert js(s,"const group=document.querySelector('.winner-share-actions'),buttons=Array.from(group?.querySelectorAll('button')||[]),rect=group?.getBoundingClientRect();return buttons.length===2&&buttons[1].textContent.trim()==='画像を保存・共有'&&document.documentElement.scrollWidth<=innerWidth&&rect&&rect.width<=innerWidth&&buttons.every(button=>{const b=button.getBoundingClientRect();return b.width>=100&&b.height>=44&&b.height<=60})"), 'Winner share actions are missing, cramped, or overflowing'
                    if viewport_width <= 360:
                        assert js(s,"return getComputedStyle(document.querySelector('.winner-share-actions')).gridTemplateColumns.trim().split(/\\s+/).length===1"), 'Compact winner share actions do not stack into a single column'
                        if design == 'sunset':
                            assert js(s,"const name=document.querySelector('.winner-title-name'),outcome=document.querySelector('.winner-title-outcome');return !!name&&!!outcome&&Math.abs(name.getBoundingClientRect().top-outcome.getBoundingClientRect().top)<1"), 'Compact winner name and outcome wrap onto separate lines'
                    assert js(s,"return !document.querySelector('.winner-screen .ad-slot')")
                    shot(s,design+'-winner')
                    if design == 'sunset':
                        capture_result_share_card(s)
                        result_share_card_captured=True
                    if design == 'sunset' and os.environ.get('SMOKE_CAPTURE_TOWN_DENSITY') == '1':
                        density=js(s,"const target=document.querySelector('.winner-screen .sunset-town');if(!target)return null;window.__townDensityOriginal=target.outerHTML;const names=Player.landmarkNames(),landmarks=Object.fromEntries(names.map(name=>[name,true]));target.outerHTML=UiBuildMenu.renderTownHtml({cards:CARDS.slice(0,10),landmarks},new Set(names));const town=document.querySelector('.winner-screen .sunset-town'),street=town.querySelector('.town-street'),overflow=town.querySelector('.town-overflow'),range=document.createRange();range.selectNodeContents(overflow);return {facilityCount:town.querySelectorAll('.town-building:not(.town-landmark)').length,landmarkCount:town.querySelectorAll('.town-landmark').length,hasOverflow:!!overflow,overflowSingleLine:range.getClientRects().length===1,fits:town.scrollWidth<=town.clientWidth&&street.scrollWidth<=street.clientWidth&&document.documentElement.scrollWidth<=innerWidth}")
                        assert density and density['facilityCount']==8 and density['landmarkCount']==6 and density['hasOverflow'] and density['overflowSingleLine'] and density['fits'], f"Dense winner town is clipped, wrapped, or incomplete: {density}"
                        shot(s,'sunset-winner-town-density')
                        js(s,"const town=document.querySelector('.winner-screen .sunset-town');if(town&&window.__townDensityOriginal)town.outerHTML=window.__townDensityOriginal;delete window.__townDensityOriginal")
                        town_density_captured=True
                assert js(host,"return document.querySelector('.winner-title').textContent")==js(guest,"return document.querySelector('.winner-title').textContent")
                break
        previous=js(actor,"return GameRuntimeState.runtime.snapshot().game.currentPlayerIndex")
        js(actor,"document.getElementById('btnSkip').click();document.getElementById('confirmOkBtn').click()")
        for s in sessions:
            wait(s,"return GameRuntimeState.runtime.snapshot().game.currentPlayerIndex !== "+str(previous))
    else: raise RuntimeError('Match did not finish within '+str(max_turns)+' turns')
    if market_gallery_session:
        market_art_gallery_count=capture_market_art_gallery(market_gallery_session)
    city_visibility_check = 'sunset city enters the initial viewport'
    wide_layout_check = ['wide title separates brand and setup', 'wide start action stays visible above PWA banner', 'wide game aligns player cities beside actions', 'wide market preserves player board context'] if viewport_width >= 760 else []
    gallery_label='full rendered 38-facility art gallery' if os.environ.get('SMOKE_CAPTURE_ALL_FACILITIES') == '1' else 'full rendered market art gallery'
    report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'browser':subprocess.check_output([browser,'--version'],text=True).strip(),'viewport':str(viewport_width)+'x'+str(viewport_height)+' emulation','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'dirty':bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),'sunsetPlayerAreaTopAtPageStart':player_area_top,'marketArtGalleryCardCount':market_art_gallery_count,'landmarkArtGalleryCardCount':landmark_art_gallery_count,'townDensityCapture':town_density_captured,'passed':['classic/sunset title at page start',*wide_layout_check,'start action does not overlap the PWA install banner','sunset start action stays visible without covering PWA install banner','sunset rules dialog uses vector icons without visible emoji duplicates','sunset gameplay hides visible platform emoji fallbacks',city_visibility_check,*online_lobby_check,'mixed-design online start with ready','dice roll and build menu','sunset external SVG rendering','market art scales with its card width','large text increases sunset card effect size','build and authoritative undo','host refresh and rejoin','finished match hides active gameplay UI',*([gallery_label+': '+str(market_art_gallery_count)+' cards','all '+str(landmark_art_gallery_count)+' rendered landmark cards'] if landmark_art_gallery_count else []),*(['dense winner town art fits (8 facilities + 6 landmarks)'] if town_density_captured else []),*(['result share card rendered from completed match'] if result_share_card_captured else []),target_landmark+'-only online match completed with matching winners'],'notCovered':['physical device touch','WebKit',*(['standard all-landmark full match'] if target_landmark != 'all' else []),'PWA update']}
    (out/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False))
except Exception as error:
    diagnostics=[]
    for s in sessions:
        try:
            diagnostics.append(js(s, "const g=GameRuntimeState.runtime.snapshot().game; return {enableTrace:window.landmarkEnableTrace,phase:g?.phase,turn:g?.turnCount,current:g?.currentPlayerIndex,players:g?.players.map(p=>({name:p.name,coins:p.coins,landmarks:p.landmarks})),enabled:g ? Array.from(g.enabledLandmarks):[],buttons:Array.from(document.querySelectorAll('[data-action=buildLandmark]')).map(e=>({text:e.textContent,disabled:e.disabled})),body:document.body.innerText.slice(-6000)}"))
            shot(s,'failure-'+str(sessions.index(s)))
        except Exception as error: diagnostics.append(str(error))
    (out/'failure.json').write_text(json.dumps({'error':f'{type(error).__name__}: {error}','sessions':diagnostics},ensure_ascii=False,indent=2))
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
