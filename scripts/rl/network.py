# network.py - numpy のみで実装した方策＋価値ネットワーク（MLP）

import numpy as np


def relu(x):
    return np.maximum(0.0, x)

def relu_grad(x):
    return (x > 0).astype(np.float32)

def softmax(x):
    x = x - np.max(x)  # 数値安定化
    e = np.exp(x)
    return e / (e.sum() + 1e-9)


class Layer:
    """全結合層（ReLU 活性化）+ Adam 最適化"""

    def __init__(self, in_dim: int, out_dim: int, activation=True, lr=1e-3):
        # He 初期化
        scale = np.sqrt(2.0 / in_dim)
        self.W = (np.random.randn(in_dim, out_dim) * scale).astype(np.float32)
        self.b = np.zeros(out_dim, dtype=np.float32)
        self.activation = activation
        self.lr = lr

        # Adam 状態
        self.mW = np.zeros_like(self.W)
        self.vW = np.zeros_like(self.W)
        self.mb = np.zeros_like(self.b)
        self.vb = np.zeros_like(self.b)
        self.t = 0

        # キャッシュ（backward 用）
        self._x = None
        self._z = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        self._x = x
        self._z = x @ self.W + self.b
        return relu(self._z) if self.activation else self._z

    def backward(self, d_out: np.ndarray) -> np.ndarray:
        if self.activation:
            d_out = d_out * relu_grad(self._z)
        dW = self._x[:, None] * d_out[None, :]   # outer product
        db = d_out
        dx = d_out @ self.W.T
        self._update(dW, db)
        return dx

    def _update(self, dW, db, beta1=0.9, beta2=0.999, eps=1e-8):
        self.t += 1
        self.mW = beta1 * self.mW + (1 - beta1) * dW
        self.vW = beta2 * self.vW + (1 - beta2) * dW ** 2
        self.mb = beta1 * self.mb + (1 - beta1) * db
        self.vb = beta2 * self.vb + (1 - beta2) * db ** 2

        mW_hat = self.mW / (1 - beta1 ** self.t)
        vW_hat = self.vW / (1 - beta2 ** self.t)
        mb_hat = self.mb / (1 - beta1 ** self.t)
        vb_hat = self.vb / (1 - beta2 ** self.t)

        self.W -= self.lr * mW_hat / (np.sqrt(vW_hat) + eps)
        self.b -= self.lr * mb_hat / (np.sqrt(vb_hat) + eps)


class PolicyValueNet:
    """
    入力: 局面ベクトル (state_dim,)
    出力:
      policy: (num_actions,) の確率分布（softmax 後）
      value:  スカラー（-1〜1、勝率の推定）
    """

    def __init__(self, state_dim: int, num_actions: int,
                 hidden: int = 256, lr: float = 3e-4):
        self.shared = [
            Layer(state_dim, hidden, activation=True,  lr=lr),
            Layer(hidden,    hidden, activation=True,  lr=lr),
        ]
        # 方策ヘッド（活性化なし → softmax は外で）
        self.policy_head = Layer(hidden, num_actions, activation=False, lr=lr)
        # 価値ヘッド（活性化なし → tanh は外で）
        self.value_head  = Layer(hidden, 1,           activation=False, lr=lr)

        self._h = None      # 共有層の出力（backward 用）

    def forward(self, state: np.ndarray):
        """
        state: shape (state_dim,)
        returns: (policy_probs, value)
          policy_probs: (num_actions,) ndarray, 合計 1
          value: float
        """
        h = state
        for layer in self.shared:
            h = layer.forward(h)
        self._h = h

        logits = self.policy_head.forward(h)
        policy = softmax(logits)

        v_raw = self.value_head.forward(h)
        value = float(np.tanh(v_raw[0]))

        return policy, value

    def backward(self, d_policy: np.ndarray, d_value: float):
        """
        d_policy: (num_actions,) — 方策ヘッドへの勾配
        d_value:  スカラー       — 価値ヘッドへの勾配（tanh の外から）
        """
        # 価値ヘッド
        dh_v = self.value_head.backward(np.array([d_value], dtype=np.float32))

        # 方策ヘッド
        dh_p = self.policy_head.backward(d_policy)

        # 共有層（両ヘッドの勾配を合算）
        dh = dh_p + dh_v
        for layer in reversed(self.shared):
            dh = layer.backward(dh)

    def save(self, path: str):
        import os
        os.makedirs(os.path.dirname(path), exist_ok=True)
        params = {}
        for i, layer in enumerate(self.shared):
            params[f"shared_{i}_W"] = layer.W
            params[f"shared_{i}_b"] = layer.b
        params["policy_W"] = self.policy_head.W
        params["policy_b"] = self.policy_head.b
        params["value_W"]  = self.value_head.W
        params["value_b"]  = self.value_head.b
        np.savez(path, **params)

    def load(self, path: str):
        data = np.load(path + ".npz")
        for i, layer in enumerate(self.shared):
            layer.W = data[f"shared_{i}_W"]
            layer.b = data[f"shared_{i}_b"]
        self.policy_head.W = data["policy_W"]
        self.policy_head.b = data["policy_b"]
        self.value_head.W  = data["value_W"]
        self.value_head.b  = data["value_b"]
