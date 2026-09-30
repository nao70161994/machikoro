'use strict';

const OnlineLobbySelectionRuntime = (() => {
    /** @typedef {{ enabledCards: string[], enabledLandmarks: string[], marketRule?: string }} Selection */
    /** @typedef {{ isOnlineGame: boolean, isRoomHost: boolean, myRoomId: string | null, socket: { connected?: boolean } | null }} Session */
    /**
     * @typedef {{
     *   getSession: () => Session,
     *   getSelection: () => Selection,
     *   setReady: (ready: boolean) => boolean,
     *   showNotice: (message: string) => void,
     *   replaceCards: (cards: string[]) => void,
     *   replaceLandmarks: (landmarks: string[]) => void,
     *   replaceMarketRule: (rule: string | undefined) => void,
     *   updateSummary: () => void,
     *   manageWaitingRoom: (payload: Record<string, unknown>, socket: Session['socket']) => boolean,
     *   setStatus: (message: string) => void,
     * }} Dependencies
     */

    /** @param {Dependencies} dependencies */
    function createRuntime(dependencies) {
        const required = [
            'getSession', 'getSelection', 'setReady', 'showNotice', 'replaceCards',
            'replaceLandmarks', 'replaceMarketRule', 'updateSummary', 'manageWaitingRoom',
            'setStatus',
        ];
        if (!dependencies || required.some(name => typeof dependencies[name] !== 'function')) {
            throw new TypeError('online lobby selection dependencies are required');
        }

        let selectionBeforeEdit = null;

        function begin() {
            selectionBeforeEdit = null;
            const session = dependencies.getSession();
            if (!session.myRoomId) return true;
            if (session.isOnlineGame || !session.isRoomHost) {
                dependencies.showNotice('使用カードは対戦開始前にホストが設定します。待機室の設定を確認してください。');
                return false;
            }
            if (!session.socket || session.socket.connected === false) {
                dependencies.showNotice('再接続してから使用カードを変更してください。');
                return false;
            }
            selectionBeforeEdit = { roomId: session.myRoomId, selection: dependencies.getSelection() };
            dependencies.setReady(false);
            return true;
        }

        function save() {
            if (!selectionBeforeEdit) return true;
            const session = dependencies.getSession();
            if (session.myRoomId !== selectionBeforeEdit.roomId || session.isOnlineGame ||
                    !session.isRoomHost || !session.socket || session.socket.connected === false) {
                if (!session.isOnlineGame && session.myRoomId === selectionBeforeEdit.roomId) {
                    dependencies.replaceCards(selectionBeforeEdit.selection.enabledCards);
                    dependencies.replaceLandmarks(selectionBeforeEdit.selection.enabledLandmarks);
                }
                selectionBeforeEdit = null;
                dependencies.showNotice('使用カードを反映できなかったため変更を戻しました。待機室への接続を確認してください。');
                return true;
            }

            const selection = dependencies.getSelection();
            const sent = dependencies.manageWaitingRoom({
                roomId: session.myRoomId,
                action: 'selection',
                enabledCards: [...selection.enabledCards],
                enabledLandmarks: [...selection.enabledLandmarks],
            }, session.socket);
            if (sent) {
                selectionBeforeEdit = null;
                dependencies.setStatus('使用カードを反映しています。設定を確認して、全員がもう一度「準備完了」を押してください。');
            }
            return sent;
        }

        function sync(lobbyState) {
            const session = dependencies.getSession();
            const selection = lobbyState && lobbyState.setupSummary;
            if (session.isOnlineGame || !selection || selectionBeforeEdit) return;
            if (Array.isArray(selection.enabledCards)) dependencies.replaceCards(selection.enabledCards);
            if (Array.isArray(selection.enabledLandmarks)) dependencies.replaceLandmarks(selection.enabledLandmarks);
            dependencies.replaceMarketRule(selection.marketRule);
            dependencies.updateSummary();
        }

        function reset() {
            selectionBeforeEdit = null;
        }

        return Object.freeze({ begin, save, sync, reset });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineLobbySelectionRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineLobbySelectionRuntime });
if (typeof globalThis !== 'undefined') globalThis.OnlineLobbySelectionRuntime = OnlineLobbySelectionRuntime;
