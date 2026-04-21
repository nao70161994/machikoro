# network.py - numpy のみで実装した方策＋価値ネットワーク（MLP）

import numpy as np

from .cards import NUM_CARDS

CHECKPOINT_SCHEMA_VERSION = 3


class SchemaVersionError(ValueError):
    pass


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

    ビジネスセンターフェーズでは bc_give_head / bc_take_head による
    factored 表現を使う（汎化改善）。
    """

    def __init__(self, state_dim: int, num_actions: int,
                 hidden: int = 256, lr: float = 3e-4, target_slots: int = 0):
        self.shared = [
            Layer(state_dim, hidden, activation=True,  lr=lr),
            Layer(hidden,    hidden, activation=True,  lr=lr),
        ]
        # 方策ヘッド（活性化なし → softmax は外で）
        self.policy_head = Layer(hidden, num_actions, activation=False, lr=lr)
        # 価値ヘッド（活性化なし → tanh は外で）
        self.value_head  = Layer(hidden, 1,           activation=False, lr=lr)
        # ビジネスセンター専用 factored ヘッド
        # 渡すカード (38) と受け取るカード (38) を独立して選択
        self.bc_give_head = Layer(hidden, NUM_CARDS, activation=False, lr=lr)
        self.bc_take_head = Layer(hidden, NUM_CARDS, activation=False, lr=lr)
        self.target_slots = int(target_slots or 0)
        self.tv_target_head = None
        self.bc_target_head = None
        self.mover_target_head = None
        if self.target_slots > 0:
            self.tv_target_head = Layer(hidden, self.target_slots, activation=False, lr=lr)
            self.bc_target_head = Layer(hidden, self.target_slots, activation=False, lr=lr)
            self.mover_target_head = Layer(hidden, self.target_slots, activation=False, lr=lr)

        self._h = None      # 共有層の出力（backward 用）

    def forward_details(self, state: np.ndarray):
        """
        通常フェーズ用 forward。
        returns: (policy_probs, value, logits)
        """
        h = state
        for layer in self.shared:
            h = layer.forward(h)
        self._h = h

        logits = self.policy_head.forward(h)
        policy = softmax(logits)

        v_raw = self.value_head.forward(h)
        value = float(np.tanh(v_raw[0]))

        return policy, value, logits

    def forward(self, state: np.ndarray):
        policy, value, _ = self.forward_details(state)
        return policy, value

    def forward_bc_details(self, state: np.ndarray):
        """
        ビジネスセンターフェーズ用 forward。
        returns: (bc_give_probs, bc_take_probs, value, bc_give_logits, bc_take_logits)
          bc_give_probs: (NUM_CARDS,) — 渡すカードの確率分布
          bc_take_probs: (NUM_CARDS,) — 受け取るカードの確率分布
          value: float
        """
        h = state
        for layer in self.shared:
            h = layer.forward(h)
        self._h = h

        bc_give_logits = self.bc_give_head.forward(h)
        bc_take_logits = self.bc_take_head.forward(h)
        bc_give_p = softmax(bc_give_logits)
        bc_take_p = softmax(bc_take_logits)

        v_raw = self.value_head.forward(h)
        value = float(np.tanh(v_raw[0]))

        return bc_give_p, bc_take_p, value, bc_give_logits, bc_take_logits

    def forward_bc(self, state: np.ndarray):
        bc_give_p, bc_take_p, value, _, _ = self.forward_bc_details(state)
        return bc_give_p, bc_take_p, value

    def forward_target_details(self, state: np.ndarray, kind: str):
        """
        多人数戦 target head 用 forward。
        kind: "tv" | "bc" | "mover"
        returns: (target_probs, value, target_logits)
        """
        head = {
            "tv": self.tv_target_head,
            "bc": self.bc_target_head,
            "mover": self.mover_target_head,
        }.get(kind)
        if head is None:
            raise ValueError(f"target head unavailable: {kind}")

        h = state
        for layer in self.shared:
            h = layer.forward(h)
        self._h = h

        target_logits = head.forward(h)
        target_probs = softmax(target_logits)

        v_raw = self.value_head.forward(h)
        value = float(np.tanh(v_raw[0]))

        return target_probs, value, target_logits

    def backward(self, d_policy: np.ndarray, d_value: float):
        """通常フェーズ用 backward"""
        dh_v = self.value_head.backward(np.array([d_value], dtype=np.float32))
        dh_p = self.policy_head.backward(d_policy)
        dh = dh_p + dh_v
        for layer in reversed(self.shared):
            dh = layer.backward(dh)

    def backward_bc(self, d_give: np.ndarray, d_take: np.ndarray, d_value: float):
        """ビジネスセンターフェーズ用 backward"""
        dh_v    = self.value_head.backward(np.array([d_value], dtype=np.float32))
        dh_give = self.bc_give_head.backward(d_give)
        dh_take = self.bc_take_head.backward(d_take)
        dh = dh_give + dh_take + dh_v
        for layer in reversed(self.shared):
            dh = layer.backward(dh)

    def _layer_specs(self):
        """保存・読み込み対象レイヤーのリスト"""
        specs = []
        for i, layer in enumerate(self.shared):
            specs.append((f"shared_{i}", layer))
        specs.append(("policy", self.policy_head))
        specs.append(("value",  self.value_head))
        specs.append(("bc_give", self.bc_give_head))
        specs.append(("bc_take", self.bc_take_head))
        if self.tv_target_head is not None:
            specs.append(("tv_target", self.tv_target_head))
        if self.bc_target_head is not None:
            specs.append(("bc_target", self.bc_target_head))
        if self.mover_target_head is not None:
            specs.append(("mover_target", self.mover_target_head))
        return specs

    def save(self, path: str):
        import os
        os.makedirs(os.path.dirname(path), exist_ok=True)
        params = {"schema_version": np.array(CHECKPOINT_SCHEMA_VERSION, dtype=np.int64)}
        for prefix, layer in self._layer_specs():
            params[f"{prefix}_W"]  = layer.W
            params[f"{prefix}_b"]  = layer.b
            params[f"{prefix}_mW"] = layer.mW
            params[f"{prefix}_vW"] = layer.vW
            params[f"{prefix}_mb"] = layer.mb
            params[f"{prefix}_vb"] = layer.vb
            params[f"{prefix}_t"]  = np.array(layer.t, dtype=np.int64)
        checkpoint_path = path + ".npz"
        tmp_path = path + ".tmp.npz"
        np.savez(tmp_path, **params)
        os.replace(tmp_path, checkpoint_path)

    def load(self, path: str):
        checkpoint_path = path + ".npz"

        def validate_shape(key, actual, expected):
            if actual.shape != expected.shape:
                raise ValueError(
                    f"checkpoint shape mismatch for {key}: "
                    f"expected {expected.shape}, got {actual.shape}"
                )

        try:
            with np.load(checkpoint_path) as data:
                schema_version = data.get("schema_version")
                if schema_version is None or int(schema_version) != CHECKPOINT_SCHEMA_VERSION:
                    raise SchemaVersionError(
                        "非互換なチェックポイントです。models/rl_model/model.npz を削除して再実行してください。"
                    )
                self.target_slots = int(data["tv_target_b"].shape[0]) if "tv_target_b" in data.files else 0
                if self.target_slots <= 0:
                    self.tv_target_head = None
                    self.bc_target_head = None
                    self.mover_target_head = None
                if self.target_slots > 0 and self.tv_target_head is None:
                    hidden = self.shared[-1].W.shape[1]
                    lr = self.policy_head.lr
                    self.tv_target_head = Layer(hidden, self.target_slots, activation=False, lr=lr)
                    self.bc_target_head = Layer(hidden, self.target_slots, activation=False, lr=lr)
                    self.mover_target_head = Layer(hidden, self.target_slots, activation=False, lr=lr)
                specs = self._layer_specs()

                # shape チェック
                for prefix, layer in specs:
                    validate_shape(f"{prefix}_W", data[f"{prefix}_W"], layer.W)
                    validate_shape(f"{prefix}_b", data[f"{prefix}_b"], layer.b)

                # Adam 状態が揃っているか確認
                adam_keys = [
                    f"{p}_{k}" for p, _ in specs
                    for k in ("mW", "vW", "mb", "vb", "t")
                ]
                has_adam = all(k in data.files for k in adam_keys)

                for prefix, layer in specs:
                    layer.W = data[f"{prefix}_W"]
                    layer.b = data[f"{prefix}_b"]
                    if has_adam:
                        validate_shape(f"{prefix}_mW", data[f"{prefix}_mW"], layer.mW)
                        validate_shape(f"{prefix}_vW", data[f"{prefix}_vW"], layer.vW)
                        validate_shape(f"{prefix}_mb", data[f"{prefix}_mb"], layer.mb)
                        validate_shape(f"{prefix}_vb", data[f"{prefix}_vb"], layer.vb)
                        layer.mW = data[f"{prefix}_mW"]
                        layer.vW = data[f"{prefix}_vW"]
                        layer.mb = data[f"{prefix}_mb"]
                        layer.vb = data[f"{prefix}_vb"]
                        layer.t  = int(data[f"{prefix}_t"])
        except (SchemaVersionError, ValueError, KeyError, OSError):
            raise
