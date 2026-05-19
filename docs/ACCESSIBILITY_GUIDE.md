# Accessibility Guide

作成日: 2026-05-19

## 現在の方針

Vanilla JS / browser-global 構成は維持しつつ、既存 UI を小さく安全に改善します。新しい画面や modal を追加するときは、見た目だけでなくキーボード操作、支援技術への状態通知、モバイルでのタップしやすさを同時に確認します。

## 実装済み基盤

- `rulesModal`, `cardSelectModal`, `cardDetailModal`, `confirmModal` は `role="dialog"`, `aria-modal="true"`, `aria-labelledby` を持つ。
- `showRules()`, `showCardSelect()`, `showCardDetail()`, `showConfirm()` は共通 modal helper で開き、初期フォーカス、Tab trap、Esc close、閉じた後のフォーカス復帰を扱う。
- `showNotice()` は `#noticeToast` に表示する non-blocking toast を優先し、DOM が無いテスト/旧環境だけ `alert()` fallback を使う。
- `:focus-visible` と `prefers-reduced-motion: reduce` を CSS に追加済み。

## 追加 UI のルール

- 確認や警告は native `confirm()` / `alert()` を直接呼ばず、`showConfirm()` / `showNotice()` を使う。
- 閉じられる modal は共通 helper で開閉する。
- ゲーム進行上閉じてはいけない pending modal は Esc close 対象にしない。
- 状態を持つ button は、可能な範囲で `aria-pressed` や `aria-selected` を更新する。
- クリック専用の `<div onclick>` を増やさない。操作要素は `button` か keyboard handler 付きにする。

## 手動確認

- キーボードだけで、ルール、カード選択、カード詳細、確認 modal を開閉できる。
- modal 内で Tab / Shift+Tab が modal 外へ抜けない。
- Esc で閉じられる modal が閉じ、pending modal は意図せず閉じない。
- focus ring がボタンや入力欄で見える。
- OS の「視差効果を減らす / reduced motion」相当を有効にした時、アニメーションが実質停止する。
- notice toast がゲーム操作を長時間ブロックしない。
