# agent.py - GAE Actor-Critic エージェント

import numpy as np
from .network import PolicyValueNet
from .encode import encode_state, action_mask, STATE_DIM
from .game_env import NUM_ACTIONS


class RLAgent:
    """
    GAE (Generalized Advantage Estimation) Actor-Critic エージェント。
    λ=0.95 で MC に近い形で全ステップにシグナルを伝播させる。
    TD(0) の「報酬が終端だけなので中間ステップの advantage ≈ 0」問題を解消。
    """

    def __init__(self, hidden: int = 256, lr: float = 3e-4,
                 entropy_coef: float = 0.05, gamma: float = 0.99,
                 lam: float = 0.95):
        self.net = PolicyValueNet(STATE_DIM, NUM_ACTIONS, hidden=hidden, lr=lr)
        self.gamma = gamma
        self.lam   = lam
        self.entropy_coef = entropy_coef
        self._reset_buf()

    def _reset_buf(self):
        self.states      = []
        self.actions     = []
        self.masks       = []
        self.log_probs   = []
        self.values      = []   # V(s_t)
        self.rewards     = []
        self.next_values = []   # V(s_{t+1})  ← TD 用
        self.dones       = []   # ゲーム終了フラグ

    def select_action(self, env, epsilon: float = 0.0) -> int:
        state = encode_state(env)
        mask  = action_mask(env)
        valid = np.where(mask > 0)[0]

        policy, value = self.net.forward(state)

        if epsilon > 0 and np.random.rand() < epsilon:
            action = int(np.random.choice(valid))
        else:
            masked = policy * mask
            s = masked.sum()
            if s < 1e-9:
                action = int(np.random.choice(valid))
                masked = np.zeros(NUM_ACTIONS, dtype=np.float32)
                masked[action] = 1.0
            else:
                masked = masked / s
                action = int(np.random.choice(NUM_ACTIONS, p=masked))

        masked_p = policy * mask
        s = masked_p.sum()
        masked_p = masked_p / (s + 1e-9)
        log_prob = float(np.log(masked_p[action] + 1e-9))

        self.states.append(state)
        self.actions.append(action)
        self.masks.append(mask)
        self.log_probs.append(log_prob)
        self.values.append(float(value))

        return action

    def store_transition(self, reward: float, next_env, done: bool):
        """
        select_action 後に呼ぶ。
        next_env: 行動後の環境（next_state の価値計算に使う）
        """
        self.rewards.append(reward)
        self.dones.append(done)

        if done:
            self.next_values.append(0.0)
        else:
            next_state = encode_state(next_env)
            _, v_next  = self.net.forward(next_state)
            self.next_values.append(float(v_next))

    def train(self) -> dict:
        T = len(self.rewards)
        if T == 0:
            self._reset_buf()
            return {}

        rewards = np.array(self.rewards,      dtype=np.float32)
        values  = np.array(self.values[:T],   dtype=np.float32)
        v_next  = np.array(self.next_values,  dtype=np.float32)
        dones   = np.array(self.dones,        dtype=np.float32)

        # TD 残差
        delta = rewards + self.gamma * v_next * (1 - dones) - values

        # GAE（後ろから累積）
        # λ=0.95 で MC に近い形で全ステップに信号を伝播させる
        advantages = np.zeros(T, dtype=np.float32)
        gae = 0.0
        for t in reversed(range(T)):
            gae = delta[t] + self.gamma * self.lam * (1 - dones[t]) * gae
            advantages[t] = gae

        # 価値ターゲット = 純 MC リターン（バイアスなし）
        # ブートストラップ依存の G = advantages + values はターゲットが動き続ける問題がある
        G_mc = np.zeros(T, dtype=np.float32)
        g = 0.0
        for t in reversed(range(T)):
            if dones[t]:
                g = rewards[t]
            else:
                g = rewards[t] + self.gamma * g
            G_mc[t] = g
        G = np.clip(G_mc, -1.5, 1.5)

        # advantage を正規化（分散低減）
        adv_mean = advantages.mean()
        adv_std  = advantages.std() + 1e-8
        adv_norm = (advantages - adv_mean) / adv_std

        total_pl = 0.0
        total_vl = 0.0

        for t in range(T):
            state  = self.states[t]
            action = self.actions[t]
            mask   = self.masks[t]
            adv    = float(adv_norm[t])
            g_t    = float(G[t])

            n_valid = int(mask.sum())

            policy, value = self.net.forward(state)
            masked = policy * mask
            s = masked.sum()
            masked = masked / (s + 1e-9)

            # 強制行動（有効手が1つだけ）は方策勾配から除外
            # 例: PHASE_ROLL は常に ACT_ROLL1 の一択でノイズになる
            if n_valid > 1:
                # 方策勾配: (masked_policy - one_hot) * advantage
                d_logit = masked.copy()
                d_logit[action] -= 1.0
                d_logit *= adv
                # 無効行動には勾配を流さない
                d_logit *= mask
                # エントロピー正則化
                d_entropy = (np.log(masked + 1e-9) + 1.0) * self.entropy_coef * mask
                d_policy  = d_logit + d_entropy
                total_pl += float(-np.log(masked[action] + 1e-9) * adv)
            else:
                # 強制行動: 方策更新なし（価値関数の学習のみ）
                d_policy = np.zeros_like(policy)

            # 価値損失 (MSE through tanh) は常に更新
            d_value = (value - g_t) * (1.0 - value ** 2)

            self.net.backward(d_policy, d_value)
            total_vl += float((value - g_t) ** 2)

        stats = {
            "policy_loss": total_pl / T,
            "value_loss":  total_vl / T,
            "mean_G":      float(G.mean()),
            "mean_adv":    float(adv_mean),   # 正規化前の平均優位性
        }
        self._reset_buf()
        return stats

    def save(self, path: str):
        self.net.save(path)

    def load(self, path: str):
        self.net.load(path)
