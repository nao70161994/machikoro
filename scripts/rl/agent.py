# agent.py - GAE Actor-Critic エージェント

import numpy as np
from .network import PolicyValueNet
from .encode import encode_state, action_mask, STATE_DIM
from .game_env import NUM_ACTIONS, ACT_BC_BASE, ACT_BC_SIZE
from .cards import NUM_CARDS


class RLAgent:
    """
    GAE (Generalized Advantage Estimation) Actor-Critic エージェント。
    λ=0.95 で MC に近い形で全ステップにシグナルを伝播させる。
    TD(0) の「報酬が終端だけなので中間ステップの advantage ≈ 0」問題を解消。
    """

    def __init__(self, hidden: int = 256, lr: float = 3e-4,
                 entropy_coef: float = 0.05, gamma: float = 0.99,
                 lam: float = 0.95, state_dim: int = STATE_DIM,
                 target_slots: int = 0):
        self.state_dim = state_dim
        self.net = PolicyValueNet(state_dim, NUM_ACTIONS, hidden=hidden, lr=lr, target_slots=target_slots)
        self.gamma = gamma
        self.lam   = lam
        self.entropy_coef = entropy_coef
        self._reset_buf()

    def _reset_buf(self):
        self.states      = []
        self.actions     = []
        self.masks       = []
        self.target_kinds = []
        self.target_slots = []
        self.target_masks = []
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
        self.target_kinds.append(None)
        self.target_slots.append(None)
        self.target_masks.append(np.zeros(int(getattr(self.net, "target_slots", 0) or 0), dtype=np.float32))
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
        G = np.clip(G_mc, -1.0, 1.0)   # tanh 出力 [-1,1] に合わせてクリップ

        # advantage を正規化（分散低減）
        adv_mean = advantages.mean()
        adv_std  = advantages.std() + 1e-8
        adv_norm = (advantages - adv_mean) / adv_std

        total_pl = 0.0
        total_vl = 0.0

        def entropy_logit_grad(probs: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
            grad = np.zeros_like(probs)
            valid = valid_mask > 0
            if not np.any(valid):
                return grad
            p = probs[valid]
            log_p = np.log(p + 1e-9)
            mean_term = float(np.sum(p * (log_p + 1.0)))
            grad[valid] = p * ((log_p + 1.0) - mean_term)
            return grad

        for t in range(T):
            state  = self.states[t]
            action = self.actions[t]
            mask   = self.masks[t]
            target_kind = self.target_kinds[t] if t < len(self.target_kinds) else None
            target_slot = self.target_slots[t] if t < len(self.target_slots) else None
            target_mask = self.target_masks[t] if t < len(self.target_masks) else None
            adv    = float(adv_norm[t])
            g_t    = float(G[t])

            n_valid  = int(mask.sum())
            is_bc    = (ACT_BC_BASE <= action < ACT_BC_BASE + ACT_BC_SIZE)

            if is_bc and n_valid > 1:
                # ── ビジネスセンター: factored head で学習 ──
                bc_give_p, bc_take_p, value = self.net.forward_bc(state)

                # joint mask から per-axis mask を導出
                bc_joint  = mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].reshape(NUM_CARDS, NUM_CARDS)
                give_mask = (bc_joint.sum(axis=1) > 0).astype(np.float32)
                take_mask = (bc_joint.sum(axis=0) > 0).astype(np.float32)

                give_idx = (action - ACT_BC_BASE) // NUM_CARDS
                take_idx = (action - ACT_BC_BASE) % NUM_CARDS

                bc_give_m = bc_give_p * give_mask
                bc_give_m /= (bc_give_m.sum() + 1e-9)
                bc_take_m = bc_take_p * take_mask
                bc_take_m /= (bc_take_m.sum() + 1e-9)

                d_give = bc_give_m.copy()
                d_give[give_idx] -= 1.0
                d_give *= adv
                d_give *= give_mask
                d_give += self.entropy_coef * entropy_logit_grad(bc_give_m, give_mask)

                d_take = bc_take_m.copy()
                d_take[take_idx] -= 1.0
                d_take *= adv
                d_take *= take_mask
                d_take += self.entropy_coef * entropy_logit_grad(bc_take_m, take_mask)

                d_value = (value - g_t) * (1.0 - value ** 2)
                has_target = (
                    target_kind == "bc"
                    and target_slot is not None
                    and target_mask is not None
                    and len(target_mask) > 0
                    and getattr(self.net, "bc_target_head", None) is not None
                    and int(np.sum(target_mask)) > 0
                )
                if has_target:
                    target_probs, _, _ = self.net.forward_target_details(state, "bc")
                    masked_target = target_probs * target_mask
                    masked_target /= (masked_target.sum() + 1e-9)
                    d_target = masked_target.copy()
                    d_target[int(target_slot)] -= 1.0
                    d_target *= adv
                    d_target *= target_mask
                    d_target += self.entropy_coef * entropy_logit_grad(masked_target, target_mask)
                    self.net.backward_bc_target("bc", d_target, d_give, d_take, d_value)
                    total_pl += float(-np.log(masked_target[int(target_slot)] + 1e-9) * adv)
                else:
                    self.net.backward_bc(d_give, d_take, d_value)

                total_pl += float(
                    -np.log(bc_give_m[give_idx] + 1e-9) * adv
                    - np.log(bc_take_m[take_idx] + 1e-9) * adv
                )
                total_vl += float((value - g_t) ** 2)

            else:
                # ── 通常行動 ──
                policy, value = self.net.forward(state)
                masked = policy * mask
                s = masked.sum()
                masked = masked / (s + 1e-9)

                # 強制行動（有効手が1つだけ）は方策勾配から除外
                if n_valid > 1:
                    # 方策勾配: (masked_policy - one_hot) * advantage
                    d_logit = masked.copy()
                    d_logit[action] -= 1.0
                    d_logit *= adv
                    d_logit *= mask   # 無効行動には勾配を流さない
                    d_entropy = self.entropy_coef * entropy_logit_grad(masked, mask)
                    d_policy  = d_logit + d_entropy
                    total_pl += float(-np.log(masked[action] + 1e-9) * adv)
                else:
                    # 強制行動: 方策更新なし（価値関数の学習のみ）
                    d_policy = np.zeros_like(policy)

                # 価値損失 (MSE through tanh) は常に更新
                d_value = (value - g_t) * (1.0 - value ** 2)
                has_target = (
                    target_kind in ("tv", "mover")
                    and target_slot is not None
                    and target_mask is not None
                    and len(target_mask) > 0
                    and getattr(self.net, f"{target_kind}_target_head", None) is not None
                    and int(np.sum(target_mask)) > 0
                )
                if has_target:
                    target_probs, _, _ = self.net.forward_target_details(state, target_kind)
                    masked_target = target_probs * target_mask
                    masked_target /= (masked_target.sum() + 1e-9)
                    d_target = masked_target.copy()
                    d_target[int(target_slot)] -= 1.0
                    d_target *= adv
                    d_target *= target_mask
                    d_target += self.entropy_coef * entropy_logit_grad(masked_target, target_mask)
                    self.net.backward_with_target(target_kind, d_policy, d_target, d_value)
                    total_pl += float(-np.log(masked_target[int(target_slot)] + 1e-9) * adv)
                else:
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
