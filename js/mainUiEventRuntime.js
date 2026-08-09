'use strict';

const MainUiEventRuntime = (() => {
    const STATIC_COMMANDS = Object.freeze([
        'showRules', 'showCardSelect', 'reconnectOnline', 'deleteOnlineSession', 'switchTab',
        'changeCount', 'startGame', 'resumeGame', 'deleteSavedGame', 'switchOnlineTab',
        'changeOnlineCount', 'showCreateRoom', 'joinRoom', 'toggleTutorial',
        'cycleTutorialLevel', 'onRoll', 'onReroll', 'onSkip', 'toggleLog', 'restartGame',
        'closeRules', 'closeCardDetail', 'hideNotice', 'crashResume', 'pwaInstallPrompt',
        'pwaInstallDismiss',
    ]);

    function createRuntime(dependencies = {}) {
        if (!dependencies.delegation || !dependencies.document ||
                typeof dependencies.resolveEffect !== 'function' ||
                typeof dependencies.formatCpuSpeedLabel !== 'function' ||
                typeof dependencies.getWindow !== 'function') {
            throw new TypeError('main UI event runtime dependencies are required');
        }
        const bindingController = dependencies.delegation.createBindingController();
        const invoke = (name, ...args) => {
            const effect = dependencies.resolveEffect(name);
            return typeof effect === 'function' ? effect(...args) : undefined;
        };
        const effectMap = names => Object.freeze(Object.fromEntries(
            names.map(name => [name, (...args) => invoke(name, ...args)])
        ));
        const staticEffects = Object.assign({}, effectMap(STATIC_COMMANDS), {
            reloadPage,
            pwaApplyUpdate() {
                const apply = dependencies.resolveEffect('pwaApplyUpdate');
                if (typeof apply === 'function') apply();
                else reloadPage();
            },
            hidePwaUpdateBanner() {
                const keepVisible = dependencies.resolveEffect('shouldKeepPwaUpdateBannerVisible');
                if (typeof keepVisible === 'function' && keepVisible()) return;
                const banner = dependencies.document.getElementById('pwaUpdateBanner');
                if (banner) banner.style.display = 'none';
                const showInstall = dependencies.resolveEffect('maybeShowPwaInstallBanner');
                if (typeof showInstall === 'function') showInstall();
                else {
                    const installBanner = dependencies.document.getElementById('pwaInstallBanner');
                    const visible = installBanner && installBanner.style.display === 'block';
                    if (!visible && dependencies.document.body && dependencies.document.body.classList) {
                        dependencies.document.body.classList.remove('pwa-banner-open');
                    }
                }
            },
        });

        function actionElement(event, attributeName = 'data-action') {
            return dependencies.delegation.elementFromEvent(event, attributeName);
        }

        function reloadPage() {
            const window = dependencies.getWindow();
            if (window && window.location && typeof window.location.reload === 'function') {
                window.location.reload();
                return;
            }
            const location = dependencies.resolveEffect('location');
            if (location && typeof location.reload === 'function') location.reload();
        }

        function execute(event, family, effects, attributeName = 'data-action') {
            const element = actionElement(event, attributeName);
            if (!element || element.disabled) return false;
            const command = dependencies.delegation.commandFromElement(element, family);
            if (!command) return false;
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            return dependencies.delegation.executeCommand(command, effects(element));
        }

        function handleStaticClick(event) {
            return execute(event, 'static', () => staticEffects, 'data-ui-action');
        }
        function handleStaticInput(event) {
            const element = actionElement(event, 'data-ui-input');
            const command = dependencies.delegation.commandFromElement(element, 'input');
            if (!command) return false;
            return dependencies.delegation.executeCommand(command, {
                cpuSpeed(value) {
                    const label = dependencies.document.getElementById('speedLabel');
                    if (label) label.textContent = dependencies.formatCpuSpeedLabel(value);
                },
                onlineCpuSpeed(value) {
                    const label = dependencies.document.getElementById('onlineSpeedLabel');
                    if (label) label.textContent = dependencies.formatCpuSpeedLabel(value);
                },
                localPlayerName: (...args) => invoke('onChangePlayerName', ...args),
            });
        }
        function handleStaticChange(event) {
            return execute(event, 'change', () => effectMap([
                'toggleTutorialEnabled', 'tutorialLevel', 'localPlayerType', 'onlinePlayerType',
            ]), 'data-ui-change');
        }
        function handleStaticKeydown(event) {
            if (!dependencies.delegation.isKeyboardActivationKey(event)) return false;
            const element = actionElement(event, 'data-ui-action');
            if (!dependencies.delegation.isEnabledRoleButton(element)) return false;
            return handleStaticClick(event);
        }
        function handleDiceClick(event) {
            return execute(event, 'dice', () => effectMap([
                'selectDiceCount', 'rerollDice', 'skipReroll', 'resolveHarbor',
            ]));
        }
        function handlePendingClick(event) {
            return execute(event, 'pending', button => Object.assign({}, effectMap([
                'resolveTV', 'resolveBusiness', 'skipBusiness', 'resolveCleaning', 'resolveMover',
                'resolveRenovation', 'resolveIT',
            ]), {
                selectBusinessCard: inputId => invoke('selectBusinessCard', button, inputId),
            }));
        }
        function handleBuildClick(event) {
            return execute(event, 'build', () => Object.assign({}, effectMap([
                'buildCard', 'buildLandmark', 'showCardDetail', 'setCardFilter', 'undoBuild',
            ]), {
                showLandmarkDetail: (...args) => invoke('showCardDetail', ...args),
            }));
        }
        function handlePlayerClick(event) {
            return execute(event, 'player', () => effectMap(['showCardDetail']));
        }

        function bindStatic() {
            if (bindingController.isBound(dependencies.delegation.BINDINGS.STATIC)) return false;
            if (typeof dependencies.document.addEventListener !== 'function') return false;
            dependencies.document.addEventListener('click', handleStaticClick);
            dependencies.document.addEventListener('input', handleStaticInput);
            dependencies.document.addEventListener('change', handleStaticChange);
            dependencies.document.addEventListener('keydown', handleStaticKeydown);
            bindingController.markBound(dependencies.delegation.BINDINGS.STATIC);
            return true;
        }
        function bindDelegated() {
            if (bindingController.isBound(dependencies.delegation.BINDINGS.DELEGATED)) return false;
            const bindings = [
                ['diceChoose', handleDiceClick], ['pendingMenu', handlePendingClick],
                ['buildMenu', handleBuildClick], ['players', handlePlayerClick],
            ];
            for (const [id, handler] of bindings) {
                const element = dependencies.document.getElementById(id);
                if (element && typeof element.addEventListener === 'function') {
                    element.addEventListener('click', handler);
                }
            }
            bindStatic();
            bindingController.markBound(dependencies.delegation.BINDINGS.DELEGATED);
            return true;
        }

        return Object.freeze({
            bindDelegated, bindStatic, handleBuildClick, handleDiceClick,
            handlePendingClick, handlePlayerClick, handleStaticChange,
            handleStaticClick, handleStaticInput, handleStaticKeydown, reloadPage,
        });
    }
    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MainUiEventRuntime;
if (typeof window !== 'undefined') Object.assign(window, { MainUiEventRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { MainUiEventRuntime });
