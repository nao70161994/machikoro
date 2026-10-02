"""Exercise real Chromium service workers across two server generations and an outage."""
import base64
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
ONLINE_LOBBY = os.environ.get('PWA_SMOKE_CONTEXT', 'local') == 'online-lobby'
VIEWPORT_WIDTH = int(os.environ.get('PWA_SMOKE_WIDTH', '390'))
VIEWPORT_HEIGHT = int(os.environ.get('PWA_SMOKE_HEIGHT', '844'))
REPORT_ROOT = ROOT / 'artifacts' / ('product-pwa-online-lobby' if ONLINE_LOBBY else 'product-pwa-browser')
OUT = REPORT_ROOT / (time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8])
OUT.mkdir(parents=True, exist_ok=True)


def write_report(report):
    report['artifactDirectory'] = str(OUT.relative_to(ROOT))
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    (OUT / 'result.json').write_text(encoded)
    (REPORT_ROOT / 'result.json').write_text(encoded)
    print(json.dumps(report, ensure_ascii=False))


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


server_port = free_port()
driver_port = free_port()
origin = f'http://127.0.0.1:{server_port}'
driver_url = f'http://127.0.0.1:{driver_port}'
browser = os.environ.get('CHROMIUM_BINARY') or shutil.which('chromium-browser') or shutil.which('chromium')
if not browser or not shutil.which('chromedriver'):
    raise SystemExit('Chromium and matching chromedriver are required')
if not 320 <= VIEWPORT_WIDTH <= 1920 or not 320 <= VIEWPORT_HEIGHT <= 1920:
    raise SystemExit('PWA_SMOKE_WIDTH and PWA_SMOKE_HEIGHT must be between 320 and 1920')
processes = []
logs = []
session = None


def request(method, route, data=None):
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(driver_url + route, data=body, method=method,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            value = json.load(response)['value']
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'WebDriver {method} {route}: {error.read().decode("utf-8", errors="replace")}') from error
    if isinstance(value, dict) and value.get('error'):
        raise RuntimeError(value)
    return value


def js(code):
    return request('POST', f'/session/{session}/execute/sync', {'script': code, 'args': []})


def wait(code):
    deadline = time.monotonic() + 45
    last_error = None
    while time.monotonic() < deadline:
        try:
            value = js(code)
            if value:
                return value
        except Exception as error:
            last_error = str(error)
        time.sleep(.2)
    raise RuntimeError(f'Timed out: {code}; last error: {last_error}')


def launch(command, name, env=None):
    log = open(OUT / (name + '.log'), 'w')
    logs.append(log)
    process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=log)
    processes.append(process)
    return process


def stop(process):
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def start_server(version):
    process = launch(['node', 'server.js'], version,
                     dict(os.environ, PORT=str(server_port), BUILD_HASH=version,
                          NODE_ENV='test', NTFY_TOPIC='', CANONICAL_STATE_STORE='noop'))
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError('Server exited: ' + version)
        try:
            with urllib.request.urlopen(origin + '/api/version', timeout=1) as response:
                if json.load(response)['hash'] == version:
                    return process
        except Exception:
            pass
        time.sleep(.1)
    raise RuntimeError('Server did not start: ' + version)


def screenshot(name):
    png = request('GET', f'/session/{session}/screenshot')
    (OUT / (name + '.png')).write_bytes(base64.b64decode(png))


try:
    launch(['chromedriver', '--port=' + str(driver_port)], 'driver')
    for _ in range(100):
        try:
            request('GET', '/status')
            break
        except Exception:
            time.sleep(.1)
    server = start_server('pwa-smoke-v1')
    value = request('POST', '/session', {'capabilities': {'alwaysMatch': {
        'browserName': 'chrome', 'goog:chromeOptions': {
            'binary': browser,
            'args': ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            'mobileEmulation': {'deviceMetrics': {'width': VIEWPORT_WIDTH, 'height': VIEWPORT_HEIGHT,
                                                 'pixelRatio': 1, 'mobile': VIEWPORT_WIDTH <= 600,
                                                 'touch': VIEWPORT_WIDTH <= 600}},
        }}}})
    session = value['sessionId']
    request('POST', f'/session/{session}/url', {'url': origin + '/'})
    wait('return !!navigator.serviceWorker.controller')
    wait("return caches.keys().then(keys=>keys.includes('machikoro-pwa-smoke-v1'))")
    js("const e=document.getElementById('designThemeSelect');e.value='sunset';e.dispatchEvent(new Event('change',{bubbles:true}))")
    if ONLINE_LOBBY:
        js("document.getElementById('tabOnline').click();document.getElementById('playerNameInput').value='PWAHost'")
        install_action_state = js("const banner=document.getElementById('pwaInstallBanner');banner.style.display='block';document.body.classList.add('pwa-banner-open');const action=document.getElementById('onlineCreateSubmitButton');action.scrollIntoView({block:'center'});const a=action.getBoundingClientRect(),b=banner.getBoundingClientRect(),x=Math.min(innerWidth-1,Math.max(0,a.left+a.width/2)),y=Math.min(innerHeight-1,Math.max(0,a.top+a.height/2)),hit=document.elementFromPoint(x,y);return {clear:(a.bottom<=b.top||a.top>=b.bottom)&&!!hit&&(hit===action||action.contains(hit)),action:{top:a.top,bottom:a.bottom},banner:{top:b.top,bottom:b.bottom},hit:hit?.id||hit?.className||hit?.tagName}")
        assert install_action_state['clear'], f'Online create action is hidden behind the PWA install banner: {install_action_state}'
        js("const banner=document.getElementById('pwaInstallBanner');banner.style.display='none';document.body.classList.remove('pwa-banner-open')")
        js("document.getElementById('onlineCreateSubmitButton').click()")
        wait("return !!document.querySelector('[data-ui-action=leaveOnlineLobby]')")
    else:
        js("document.getElementById('btnStart').click()")
        wait("return document.getElementById('confirmModal').style.display !== 'none'")
        js("document.getElementById('confirmOkBtn').click()")
        wait("return document.getElementById('gameScreen').style.display !== 'none'")
    stop(server)
    server = start_server('pwa-smoke-v2')
    js('return navigator.serviceWorker.getRegistration().then(r=>r.update()).then(()=>true)')
    wait("return navigator.serviceWorker.getRegistration().then(r=>r.waiting?.state === 'installed')")
    wait("return document.getElementById('pwaUpdateBanner').offsetHeight > 0")
    assert js("return document.getElementById('pwaUpdateBtn').disabled") == ONLINE_LOBBY
    assert js('return window.MACHIKORO_CLIENT_VERSION') == 'pwa-smoke-v1'
    screenshot('update-deferred-during-game')
    if ONLINE_LOBBY:
        wait("return document.getElementById('onlineResumeSection').offsetHeight > 0")
        js("document.querySelector('[data-ui-action=deleteOnlineSession]').click()")
        wait("return document.getElementById('confirmModal').style.display !== 'none'")
        js("document.getElementById('confirmOkBtn').click()")
        wait("return document.getElementById('onlineWaitingPanel').innerHTML === ''")
        wait("return window.MACHIKORO_CLIENT_VERSION === 'pwa-smoke-v2'")
        screenshot('updated-after-discarding-reconnect')
        report = {
            'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            'browser': subprocess.check_output([browser, '--version'], text=True).strip(),
            'viewport': f'{VIEWPORT_WIDTH}x{VIEWPORT_HEIGHT} emulation',
            'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()),
            'context': 'online lobby followed by server restart',
            'passed': ['room created through UI', 'v2 service worker remains waiting',
                       'update banner visible and manual update disabled', 'client remains on v1',
                       'online create action is reachable with install banner visible',
                       'discarding reconnect clears stale waiting-room UI',
                       'discarding reconnect through UI activates v2'],
            'notCovered': ['online match update deferral', 'reconnect completion',
                           'physical devices', 'WebKit'],
        }
        report['status'] = 'passed'
        write_report(report)
        raise SystemExit(0)
    update_layout = js("const banner=document.getElementById('pwaUpdateBanner'),screen=document.getElementById('gameScreen'),style=getComputedStyle(screen),r=screen.getBoundingClientRect(),b=banner.getBoundingClientRect();return {open:document.body.classList.contains('pwa-banner-open'),scrollable:style.overflowY==='auto'&&screen.scrollHeight>screen.clientHeight,bannerSafe:b.bottom<=innerHeight&&b.top>=0,screenBeforeBanner:r.bottom<=b.top||r.top>=b.bottom,viewport:{width:innerWidth,height:innerHeight},screen:{top:r.top,bottom:r.bottom,clientHeight:screen.clientHeight,scrollHeight:screen.scrollHeight},banner:{top:b.top,bottom:b.bottom}}")
    assert update_layout['open'] and update_layout['scrollable'] and update_layout['bannerSafe'], f'PWA update banner does not reserve a reachable gameplay scroll region: {update_layout}'
    if js("return GameRuntimeState.runtime.snapshot().game.phase") == 'roll':
        js("document.getElementById('btnRoll').click()")
    wait("return GameRuntimeState.runtime.snapshot().game.phase==='build'&&!!document.querySelector('#buildMenu .card-btn:not(:disabled)')")
    market_action = js("const action=document.querySelector('#buildMenu .card-btn:not(:disabled)'),banner=document.getElementById('pwaUpdateBanner');action.scrollIntoView({block:'center'});const a=action.getBoundingClientRect(),b=banner.getBoundingClientRect(),x=Math.min(innerWidth-1,Math.max(0,a.left+a.width/2)),y=Math.min(innerHeight-1,Math.max(0,a.top+a.height/2)),hit=document.elementFromPoint(x,y);return {clear:(a.bottom<=b.top||a.top>=b.bottom)&&!!hit&&(hit===action||action.contains(hit)),action:{top:a.top,bottom:a.bottom},banner:{top:b.top,bottom:b.bottom},hit:hit?.className||hit?.tagName}")
    assert market_action['clear'], f'Market build action is hidden behind the PWA update banner: {market_action}'
    js("document.querySelector('#buildMenu .card-btn:not(:disabled)').click()")
    wait("return GameRuntimeState.runtime.snapshot().game.builtThisTurn")
    js("document.getElementById('btnRestart').click()")
    wait("return document.getElementById('confirmModal').style.display !== 'none'")
    js("document.getElementById('confirmOkBtn').click()")
    wait("return window.MACHIKORO_CLIENT_VERSION === 'pwa-smoke-v2'")
    wait("return caches.keys().then(keys=>keys.length===1 && keys[0]==='machikoro-pwa-smoke-v2')")
    wait('return !!navigator.serviceWorker.controller')
    assert js("return document.documentElement.dataset.design") == 'sunset'
    screenshot('updated-title')
    stop(server)
    request('POST', f'/session/{session}/refresh', {})
    wait("return typeof reviewGameSetup === 'function' && document.getElementById('titleScreen').style.display !== 'none'")
    assert js('return window.MACHIKORO_CLIENT_VERSION') == 'pwa-smoke-v2'
    wait("return document.querySelector('.sunset-hero img').complete && document.querySelector('.sunset-hero img').naturalWidth > 0")
    assert js("return caches.match(new URL('icons/facility-art.svg',location.href).href).then(r=>!!r && r.ok)")
    screenshot('server-unavailable-cached-title')
    report = {
        'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'browser': subprocess.check_output([browser, '--version'], text=True).strip(),
        'viewport': f'{VIEWPORT_WIDTH}x{VIEWPORT_HEIGHT} emulation',
        'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()),
        'context': 'local',
        'passed': ['v1 service worker controls page', 'v2 waits during a local game',
                   'manual update available locally without automatic reload',
                   'update banner reserves a safe scroll region for gameplay',
                   'market card remains reachable and buildable while update is pending',
                   'leaving context activates v2 and reloads',
                   'v1 cache removed', 'design preference survives update',
                   'title and art load with origin server stopped'],
        'notCovered': ['airplane mode', 'physical devices', 'WebKit', 'online game update deferral'],
    }
    report['status'] = 'passed'
    write_report(report)
except Exception as error:
    write_report({
        'status': 'failed',
        'checkedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'context': 'online-lobby' if ONLINE_LOBBY else 'local',
        'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'error': str(error),
    })
    if session:
        try:
            screenshot('failure')
        except Exception:
            pass
    raise
finally:
    if session:
        try:
            request('DELETE', f'/session/{session}')
        except Exception:
            pass
    for process in reversed(processes):
        stop(process)
    for log in logs:
        log.close()
