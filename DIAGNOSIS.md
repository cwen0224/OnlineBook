# 循環 Bug 根本原因診斷報告

---

## 問題一：注音聲調符號位置錯誤（一直改一直回來）

### 根本原因
`writing-mode: vertical-rl` 這個 CSS 屬性讓瀏覽器把文字方向改成「直排」。
在直排模式下，瀏覽器會對不同 Unicode 類型的字元做不同處理：
- **CJK 字符（ㄅ-ㄩ）**：保持直立 → 正確 ✅
- **修飾字母（ˊˇˋ˙）**：視為「橫排標點」→ 自動旋轉 90 度放到奇怪位置 ❌

### 為何一直改一直回來？
每次修改都是在「怎麼放聲調」上做變化，但從未改到核心：
- 試過 `text-orientation: mixed` → 聲調旋轉 ❌
- 試過 `text-orientation: upright` → 位置變了但仍不對 ❌
- 試過把聲調分離成 `.zhuyin-tone` div → 改善但位置感仍然很弱 ⚠️

### 真正的解法
完全不使用 `writing-mode: vertical-rl`。
改用 **Flexbox 模擬直排**：每個注音字元都是一個獨立的 `<span>`，
用 `display: flex; flex-direction: column` 堆疊，聲調符號永遠單獨放在右欄最頂部。

---

## 問題二：黑色半透明蒙層（翻頁後畫面變暗）

### 根本原因
`updateLeafTransform()` 函式中的原始公式：
```js
backShadow.style.opacity = (1 - progress).toFixed(2);
// progress=0 (頁面平放) → opacity = 1.0 (全黑！)
```

### 已修復（V.202603311850）✅
```js
const midShadow = Math.sin(Math.abs(angle) * Math.PI / 180);
backShadow.style.opacity = (midShadow * 0.4).toFixed(2);
// angle=0 (平放) → sin(0)=0 → opacity = 0 (完全透明)
```
**此 Bug 已根本修復，不會再回來。**

---

## 問題三：字高高低低（baseline 不對齊）

### 根本原因
不同的 `char-block` 元素有不同的高度（有注音的比無注音的高），
如果 `text-line` 用 `align-items: center`，高矮不同的字塊會垂直置中而非對底部基線。

### 已修復（V.202603311910）✅
`.text-line { align-items: flex-end; }`

---

## 現在需要做的事（根治注音問題）

完全改寫注音的 DOM 結構，不依賴 `writing-mode`：

```html
<!-- 新架構 -->
<div class="char-rt zhuyin">
  <div class="zh-col-main">    <!-- flex-column 堆疊 -->
    <span class="zh-c">ㄒ</span>   <!-- 聲母 -->
    <span class="zh-c">ㄧ</span>   <!-- 介音 -->
    <span class="zh-c">ㄠ</span>   <!-- 韻母 -->
  </div>
  <div class="zh-col-tone">    <!-- 右欄，頂部對齊 -->
    <span class="zh-c">ˇ</span>   <!-- 聲調 -->
  </div>
</div>
```

JS 負責把注音字串（如 `ㄒㄧㄠˇ`）拆成每個字元，
CSS 負責把聲母+韻母垂直堆疊在左欄，聲調符號置頂在右欄。

---

## 待辦清單

- [x] 黑色蒙層 Bug 已修復
- [x] 字基線對齊已修復  
- [ ] **注音聲調位置** — 需要改寫 DOM 架構（不用 writing-mode）
- [ ] **左側黑色空白** — 封面/封底底板實作（已記錄在 BUG.md）
