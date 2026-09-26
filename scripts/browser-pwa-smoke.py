"""Exercise real Chromium service workers across two server generations and an outage."""
import base64
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifacts' / 'product-pwa-browser'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'result.json').unlink(missing_ok=True)


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
processes = []
logs = []
session = None


def request(method, route, data=None):
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(driver_url + route, data=body, method=method,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=40) as response:
        value = json.load(response)['value']
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
            'mobileEmulation': {'deviceMetrics': {'width': 390, 'height': 844, 'pixelRatio': 1,
                                                 'mobile': True, 'touch': True}},
        }}}})
    session = value['sessionId']
    request('POST', f'/session/{session}/url', {'url': origin + '/'})
    wait('return !!navigator.serviceWorker.controller')
    wait("return caches.keys().then(keys=>keys.includes('machikoro-pwa-smoke-v1'))")
    js("const e=document.getElementById('designThemeSelect');e.value='sunset';e.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('btnStart').click()")
    wait("return document.getElementById('confirmModal').style.display !== 'none'")
    js("document.getElementById('confirmOkBtn').click()")
    wait("return document.getElementById('gameScreen').style.display !== 'none'")
    stop(server)
    server = start_server('pwa-smoke-v2')
    js('return navigator.serviceWorker.getRegistration().then(r=>r.update()).then(()=>true)')
    wait("return navigator.serviceWorker.getRegistration().then(r=>r.waiting?.state === 'installed')")
    wait("return document.getElementById('pwaUpdateBanner').offsetHeight > 0")
    assert not js("return document.getElementById('pwaUpdateBtn').disabled")
    assert js('return window.MACHIKORO_CLIENT_VERSION') == 'pwa-smoke-v1'
    screenshot('update-deferred-during-game')
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
        'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()),
        'passed': ['v1 service worker controls page', 'v2 waits during a local game',
                   'manual update available locally without automatic reload', 'title return activates v2 and reloads',
                   'v1 cache removed', 'design preference survives update',
                   'title and art load with origin server stopped'],
        'notCovered': ['airplane mode', 'physical devices', 'WebKit', 'online game update deferral'],
    }
    (OUT / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False))
except Exception:
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
