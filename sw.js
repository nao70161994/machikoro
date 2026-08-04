/**
 * Service Worker - オフラインキャッシュ
 * バージョンを上げるとキャッシュが更新される
 */
const CACHE_NAME = 'machikoro-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/privacy.html',
  '/rules.html',
  '/how-to-play.html',
  '/cards.html',
  '/ai-cpu.html',
  '/style.css',
  '/manifest.json',
  '/manifest.webmanifest',
  '/js/Card.js',
  '/js/Player.js',
  '/js/gameSelectionState.js',
  '/js/gameSetupState.js',
  '/js/gameRuntimeState.js',
  '/js/onlineRuntimeState.js',
  '/js/onlineSetupState.js',
  '/js/actionContract.js',
  '/js/gameSchemaNegotiation.js',
  '/js/gameSnapshot.js',
  '/js/gameEngineRuntimeAdapter.js',
  '/js/localSaveRepository.js',
  '/js/localSaveRuntime.js',
  '/js/gameSchemaCodec.js',
  '/js/gameSchemaWire.js',
  '/js/recreateRoomPayload.js',
  '/js/gameSchemaRecreateWire.js',
  '/js/gameEngine.js',
  '/js/gameEngineDeterminism.js',
  '/js/gameEngineAuthority.js',
  '/js/gameEngineClientShadow.js',
  '/js/pendingActionQueue.js',
  '/js/gameTurnPolicy.js',
  '/js/gameDicePolicy.js',
  '/js/gameCardActivationPolicy.js',
  '/js/gameBuildPolicy.js',
  '/js/gameCoinTransaction.js',
  '/js/gamePendingTransition.js',
  '/js/gamePendingResolutionPolicy.js',
  '/js/GameManager.js',
  '/js/cpuTuning.js',
  '/js/cpuProfile.js',
  '/js/cpuSelection.js',
  '/js/cpuDiagnostics.js',
  '/js/cpuEvaluationCache.js',
  '/js/cpuEvaluation.js',
  '/js/cpuLegalMoves.js',
  '/js/cpuBusinessMoves.js',
  '/js/cpuActionProposal.js',
  '/js/cpuBuildExecution.js',
  '/js/cpuSimulation.js',
  '/js/cpuPendingResolution.js',
  '/js/CPU.js',
  '/js/RLCPU.js',
  '/js/rlModelCatalog.js',
  '/js/RLModelPortfolio.js',
  '/js/adSlots.js',
  '/js/confetti.js',
  '/js/audio.js',
  '/js/clientStorage.js',
  '/js/onlineStorage.js',
  '/js/onlinePayload.js',
  '/js/onlineRestoreQueueState.js',
  '/js/onlineRestoreLifecycleState.js',
  '/js/onlineRestoreQueue.js',
  '/js/onlineReconnectCleanup.js',
  '/js/onlineReconnectRequest.js',
  '/js/onlineRestoreAbort.js',
  '/js/onlineActionTimeout.js',
  '/js/onlineDecodeFailure.js',
  '/js/onlineActionApplyFailure.js',
  '/js/onlineActionGap.js',
  '/js/onlineActionNoGame.js',
  '/js/onlineActionCommit.js',
  '/js/onlineSocketConnect.js',
  '/js/onlineSocketRegistry.js',
  '/js/onlineSocketDisconnect.js',
  '/js/onlineHostChanged.js',
  '/js/onlineRejoinPersistence.js',
  '/js/onlinePendingOutboundState.js',
  '/js/onlinePendingResend.js',
  '/js/onlineRestoreReplay.js',
  '/js/onlineRestoreActivation.js',
  '/js/onlinePlayerSettings.js',
  '/js/onlineLobbyRequestState.js',
  '/js/onlineHostlessRestoreState.js',
  '/js/onlineRestoreRank.js',
  '/js/onlineActionSequence.js',
  '/js/onlineActionLog.js',
  '/js/onlineSessionLifecycle.js',
  '/js/onlineReconnectState.js',
  '/js/onlineRuntimeFlags.js',
  '/js/onlineDiagnosticState.js',
  '/js/onlineRetryPolicy.js',
  '/js/onlineSchemaTransport.js',
  '/js/onlineClientEffects.js',
  '/js/onlineDomEffects.js',
  '/js/onlineSocketEffects.js',
  '/js/online.js',
  '/js/uiNotice.js',
  '/js/uiLogDisplay.js',
  '/js/uiCardOrder.js',
  '/js/uiPlayerDisplay.js',
  '/js/uiInputPolicy.js',
  '/js/uiBuildMenu.js',
  '/js/uiPendingMenu.js',
  '/js/uiPendingEffects.js',
  '/js/uiCardDetail.js',
  '/js/uiCardSelect.js',
  '/js/uiTutorialSettings.js',
  '/js/uiTutorial.js',
  '/js/uiDiceChoice.js',
  '/js/uiDiceDisplay.js',
  '/js/uiTurnAnnouncer.js',
  '/js/uiModalPolicy.js',
  '/js/uiModalOpen.js',
  '/js/uiModalClose.js',
  '/js/uiWinner.js',
  '/js/uiWinnerEffects.js',
  '/js/uiGameStatusView.js',
  '/js/uiGameStatusEffects.js',
  '/js/uiTabView.js',
  '/js/uiTabEffects.js',
  '/js/uiRuntimeSnapshot.js',
  '/js/uiRenderRuntime.js',
  '/js/ui.js',
  '/js/savedGameValidation.js',
  '/js/storageSettings.js',
  '/js/localResumePolicy.js',
  '/js/localResumePreloadState.js',
  '/js/localResumeView.js',
  '/js/storedOnlineReconnect.js',
  '/js/storage.js',
  '/js/uiStatsView.js',
  '/js/stats.js',
  '/js/appShellStorage.js',
  '/js/clientCheckpoint.js',
  '/js/clientReporting.js',
  '/js/clientReportingTransport.js',
  '/js/lifecycleNotify.js',
  '/js/lifecycleRuntime.js',
  '/js/lifecycleTransport.js',
  '/js/clientEventRuntime.js',
  '/js/uiWatchdog.js',
  '/js/uiDomSnapshot.js',
  '/js/uiRecoveryEffects.js',
  '/js/appShellRuntimeEffects.js',
  '/js/uiWatchdogMonitor.js',
  '/js/uiWatchdogReporting.js',
  '/js/clientRuntimeSnapshot.js',
  '/js/crashScreen.js',
  '/js/crashScreenEffects.js',
  '/js/pwaShell.js',
  '/js/actionUiRegistry.js',
  '/js/appShell.js',
  '/js/localPlayerSettings.js',
  '/js/localGameStart.js',
  '/js/autoSkipPolicy.js',
  '/js/pageActivationPolicy.js',
  '/js/delayedHumanActionPolicy.js',
  '/js/cpuSchedulerState.js',
  '/js/cpuTurnStrategy.js',
  '/js/localActionPolicy.js',
  '/js/uiEventDelegation.js',
  '/js/citySkyline.js',
  '/js/main.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const RL_MODEL_PATH_PATTERN = /^\/models\/rl_model\/portfolio\/[^/]+\.browser\.json$/;
const OPTIONAL_PRECACHE_ASSETS = new Set([
  '/privacy.html',
  '/rules.html',
  '/how-to-play.html',
  '/cards.html',
  '/ai-cpu.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]);

function isOptionalPrecacheAsset(asset) {
  return OPTIONAL_PRECACHE_ASSETS.has(asset);
}

function precacheStaticAssets(cache) {
  const results = STATIC_ASSETS.map((asset) => {
    return cache.add(asset).then(() => ({ asset, ok: true })).catch((error) => ({ asset, ok: false, error }));
  });
  return Promise.all(results).then((entries) => {
    const failedCritical = entries.filter((entry) => !entry.ok && !isOptionalPrecacheAsset(entry.asset));
    const failedOptional = entries.filter((entry) => !entry.ok && isOptionalPrecacheAsset(entry.asset));
    if (failedOptional.length && typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn('[machikoro-sw] optional precache failed', failedOptional.map((entry) => entry.asset));
    }
    if (failedCritical.length) {
      throw new Error('Critical precache failed: ' + failedCritical.map((entry) => entry.asset).join(', '));
    }
  });
}

// 「今すぐ更新」ボタンからのメッセージを受け取る
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// インストール: アプリ起動に必要な軽量アセットだけをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => precacheStaticAssets(cache))
  );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function cacheRuntimeResponse(event, response) {
  const clone = response.clone();
  const cacheWrite = caches.open(CACHE_NAME)
    .then((cache) => cache.put(event.request, clone))
    .catch((error) => {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') console.warn('[machikoro-sw] runtime cache write failed', error);
    });
  if (event && typeof event.waitUntil === 'function') event.waitUntil(cacheWrite);
  return cacheWrite;
}

// フェッチ戦略:
//   JS / CSS / HTML → ネットワーク優先（失敗時はキャッシュ）
//   画像・アイコン  → キャッシュ優先（失敗時はネットワーク）
//   RLモデルJSON   → 選択時に取得してruntime cache（install/updateでは先読みしない）
//   socket.io      → キャッシュしない
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isStaticAssetRequest = STATIC_ASSETS.includes(url.pathname);

  if (url.pathname.startsWith('/socket.io')) return;

  if (RL_MODEL_PATH_PATTERN.test(url.pathname)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.status === 200) {
          cacheRuntimeResponse(event, response);
          return response;
        }
        return caches.match(event.request).then((cached) => cached || response);
      }).catch(() => {
        return caches.match(event.request).then((cached) => cached || Response.error());
      })
    );
    return;
  }

  const isAsset = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(url.pathname);

  if (isAsset) {
    // キャッシュ優先（画像は変わらないので高速配信）
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200 && isStaticAssetRequest) {
            cacheRuntimeResponse(event, response);
          }
          return response;
        });
      })
    );
  } else {
    // ネットワーク優先（JS/CSS/HTMLは常に最新を取得、オフライン時はキャッシュ）
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.status === 200) {
          if (isStaticAssetRequest) {
            cacheRuntimeResponse(event, response);
          }
          return response;
        }
        return caches.match(event.request).then((cached) => cached || response);
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/').then((shell) => shell || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
          }
          return Response.error();
        });
      })
    );
  }
});
