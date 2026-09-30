'use strict';

const OnlineHostlessRestoreState = (() => {
    const statusDispositions = Object.freeze({
        IGNORE: 'ignore',
        PROGRESS: 'progress',
        RESTORED: 'restored',
        RETRYABLE: 'retryable',
        FAILED: 'failed',
    });
    const statusReasons = Object.freeze({
        WAITING_FOR_HOST: 'waiting-for-host',
        QUORUM_READY: 'quorum-ready',
        HOST_RESTORED: 'host-restored',
        START_RATE_LIMIT: 'start-rate-limit',
        SESSION_LIMIT: 'session-limit',
    });

    function statusDisposition(reason, stage = '') {
        if (typeof reason !== 'string' || reason === '') return statusDispositions.IGNORE;
        if (reason === statusReasons.HOST_RESTORED) return statusDispositions.RESTORED;
        if (reason === statusReasons.WAITING_FOR_HOST ||
                (reason === statusReasons.QUORUM_READY && stage === 'confirming')) {
            return statusDispositions.PROGRESS;
        }
        if (reason === statusReasons.START_RATE_LIMIT || reason === statusReasons.SESSION_LIMIT) {
            return statusDispositions.RETRYABLE;
        }
        return statusDispositions.FAILED;
    }

    /**
     * @typedef {{connected?: boolean}} HostlessRestoreSocket
     * @typedef {{on: (key: string, handler: (...args: any[]) => any) => any}} HostlessRestoreSocketEvents
     * @typedef {{
     *   keys: {collect: string, confirmation: string, status: string, approved: string},
     *   getSession: () => {myRoomId?: string, myOriginalPlayerIndex?: number},
     *   setStatusText: (message: string) => any,
     *   submitCandidate: (generation: unknown) => boolean,
     *   getSocket: () => HostlessRestoreSocket|null,
     *   confirmRestore: (payload: {roomId: string, approved: boolean}, socket: HostlessRestoreSocket) => any,
     *   showConfirmation: ((message: string, onConfirm: () => void, onCancel: () => void) => any)|null,
     *   clearState: () => any,
     *   clearRetry: () => any,
     *   setReconnectFlag: (value: boolean) => any,
     *   emitRejoinRequest: () => any,
     *   markAttemptExhausted: () => any,
     *   observeRetryExhausted: () => any,
     *   statusMessage: (reason: string) => string
     * }} HostlessRestoreSocketEventDependencies
     */
    function registerSocketEvents(socketEvents, dependencies = {}) {
        if (!socketEvents || typeof socketEvents.on !== 'function') {
            throw new TypeError('socketEvents.on is required');
        }
        const requiredFunctions = [
            'getSession', 'setStatusText', 'submitCandidate', 'getSocket', 'confirmRestore',
            'clearState', 'clearRetry', 'setReconnectFlag', 'emitRejoinRequest',
            'markAttemptExhausted', 'observeRetryExhausted', 'statusMessage',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`${name} is required`);
            }
        }
        if (!dependencies.keys || typeof dependencies.keys !== 'object') {
            throw new TypeError('keys are required');
        }

        const {
            keys,
            getSession,
            setStatusText,
            submitCandidate,
            getSocket,
            confirmRestore,
            showConfirmation,
            clearState,
            clearRetry,
            setReconnectFlag,
            emitRejoinRequest,
            markAttemptExhausted,
            observeRetryExhausted,
            statusMessage,
        } = dependencies;

        socketEvents.on(keys.collect, ({ roomId, generation }) => {
            if (roomId !== getSession().myRoomId) return;
            setStatusText('♻️ 参加者間の復元データ一致を確認しています...');
            if (!submitCandidate(generation)) {
                setStatusText('❌ 復元候補の世代が一致しません。保存データは削除されていません。');
            }
        });

        socketEvents.on(keys.confirmation, ({ roomId, candidateCount }) => {
            if (roomId !== getSession().myRoomId) return;
            const message =
                `${candidateCount || 0}人の参加者データが完全一致しました。あなたを新しいホストとして暫定復元しますか？`;
            const respond = approved => {
                const socket = getSocket();
                if (!socket || socket.connected === false) return;
                confirmRestore({ roomId, approved: approved === true }, socket);
            };
            if (typeof showConfirmation !== 'function' ||
                    showConfirmation(message, () => respond(true), () => respond(false)) !== true) {
                respond(false);
            }
        });

        socketEvents.on(keys.status, ({ roomId, reason, stage, candidateCount }) => {
            if (roomId && roomId !== getSession().myRoomId) return;
            const disposition = statusDisposition(reason, stage);
            if (disposition === statusDispositions.RESTORED) {
                clearState();
                clearRetry();
                setReconnectFlag(true);
                setStatusText('♻️ 元のホストが復元しました。再接続しています...');
                emitRejoinRequest();
                return;
            }
            if (reason === statusReasons.WAITING_FOR_HOST) {
                setStatusText('⏳ 元のホストの復元を60秒待っています...');
                return;
            }
            if (disposition === statusDispositions.PROGRESS) {
                setStatusText(
                    `⏳ ${candidateCount || 0}人の候補が一致しました。ホスト承認を待っています...`
                );
                return;
            }
            if (disposition === statusDispositions.IGNORE) return;
            clearState();
            if (disposition === statusDispositions.RETRYABLE) {
                setReconnectFlag(true);
                setStatusText(
                    '⚠️ 復元要求が一時的に混み合っています。保存データは保持されています。' +
                    '時間をおいて再接続をやり直してください。'
                );
                return;
            }
            markAttemptExhausted();
            setReconnectFlag(true);
            observeRetryExhausted();
            setStatusText(
                '❌ ' + statusMessage(reason) +
                ' 再接続をやり直すか、タイトル画面から保存データを明示的に破棄できます。'
            );
        });

        socketEvents.on(keys.approved, ({ roomId, hostPlayerIndex }) => {
            const session = getSession();
            if (roomId !== session.myRoomId) return;
            clearState();
            if (hostPlayerIndex === session.myOriginalPlayerIndex) return;
            clearRetry();
            setReconnectFlag(true);
            setStatusText('♻️ 暫定復元したルームへ再接続しています...');
            emitRejoinRequest();
        });
    }

    function createController(initialPending = false) {
        let pending = initialPending === true;

        function isPending() {
            return pending;
        }

        function setPending(value) {
            pending = value === true;
            return pending;
        }

        function tryBegin(socketConnected) {
            if (socketConnected !== true || pending) return false;
            pending = true;
            return true;
        }

        function clear() {
            pending = false;
        }

        function snapshot() {
            return Object.freeze({ pending });
        }

        return Object.freeze({ isPending, setPending, tryBegin, clear, snapshot });
    }

    return Object.freeze({
        statusDispositions,
        statusReasons,
        statusDisposition,
        registerSocketEvents,
        createController,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineHostlessRestoreState;
