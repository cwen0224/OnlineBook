# 電子童書注音繪本 JSON 系統 — 技術規格交辦文件

**目標平台：** 網頁瀏覽器  
**注音系統：** 注音符號（ㄅㄆㄇ）+ 漢語拼音（pīnyīn）雙軌  
**文字方向：** 橫排（ltr）為主，架構預留直排擴充  
**Schema 版本：** 1.0

---

## 一、設計原則

1. **JSON 純資料，不含排版邏輯。** 字級、顏色、間距全由 CSS 決定，JSON 只存結構語意。
2. **最小單位是字元組（token）。** 每個中文字獨立一筆，便於逐字高亮、TTS 朗讀跟讀、點字查詞。
3. **注音資料完整存雙份。** `zhuyin` 和 `pinyin` 都必填，前端 UI 狀態決定顯示哪個，不存入 JSON。
4. **所有排版意圖顯式宣告。** 換行、空格、標點佔位、詞語邊界都用 `type` 欄位明確標記，前端不做推測。

---

## 二、Token 型別定義

每個 token 必須有 `type` 欄位，共五種：

| type | 說明 | 必要欄位 |
|------|------|---------|
| `char` | 一般中文字 | `char`, `zhuyin`, `pinyin`, `zhuyin_parts` |
| `punctuation` | 標點符號 | `char`，`zhuyin` 和 `pinyin` 皆為 `""` |
| `space` | 空格 | 無其他欄位 |
| `line_break` | 強制換行（作者排版意圖） | 無其他欄位 |
| `word_boundary` | 詞語邊界（不顯示，給斷行邏輯使用） | 無其他欄位 |

### char token 完整欄位

```json
{
  "type": "char",
  "char": "跑",
  "zhuyin": "ㄆㄠˇ",
  "zhuyin_parts": {
    "initial": "ㄆ",
    "final": "ㄠ",
    "tone_mark": "ˇ",
    "tone_number": 3,
    "tone_position": "after"
  },
  "pinyin": "pǎo",
  "pinyin_parts": {
    "initial": "p",
    "final": "ǎo",
    "tone_number": 3
  },
  "emphasis": false,
  "width_units": 1,
  "polyphone": false
}
```

---

## 三、注音符號規則

### 3.1 聲調符號 Unicode

| 聲調 | 符號 | Unicode | tone_position |
|------|------|---------|---------------|
| 一聲（陰平） | （不標） | — | `tone_mark` 存 `""`，`tone_number` 存 `1` |
| 二聲（陽平） | ˊ | U+02CA | `"after"` |
| 三聲（上聲） | ˇ | U+02C7 | `"after"` |
| 四聲（去聲） | ˋ | U+02CB | `"after"` |
| 輕聲 | ˙ | U+02D9 | `"before"` |

- **一聲**：`tone_mark` 欄位存空字串 `""`，但 `tone_number` 必須存 `1`，TTS 需要此資訊。
- **輕聲**：`zhuyin` 欄位的字串順序為 `"˙ㄇㄚ"`（符號在前），`tone_position` 存 `"before"`。前端依此欄位決定渲染位置，不做字串解析。

### 3.2 無聲母的字

某些字只有韻母（例：「一」= `ㄧ`，「啊」= `ㄚ`），`initial` 欄位存空字串 `""`，**不得存 `null`**，避免前端取值時出現 `undefined`。

### 3.3 漢語拼音規則

- `pinyin` 欄位存合體聲調字母（`tù`），不存數字聲調（`tu4` 是輸入法格式，不適合顯示層）。
- `tone_number` 獨立欄位存整數，供 TTS 和程式邏輯使用。

---

## 四、視覺縮排（Visual Indent）

### 4.1 問題說明

童書每頁文字量少，但圖片構圖可能造成文字框左側或右側有不規則留白。為讓文字視覺上對齊圖片焦點，需要支援每行的視覺縮排，而非靠 CSS padding 一刀切。

### 4.2 JSON 欄位設計

在每個 `line` 物件加入 `indent` 欄位：

```json
{
  "line_id": "p1-l1",
  "role": "body",
  "indent": {
    "level": 1,
    "unit": "char"
  },
  "tokens": [ ... ]
}
```

| 欄位 | 說明 |
|------|------|
| `level` | 縮排層級，整數，`0` 為不縮排 |
| `unit` | `"char"` = 以字元寬為單位；`"px"` = 固定像素（特殊版面用） |

- `unit: "char"` 時，`level: 1` 表示縮排一個字寬（含注音高度的完整字元組寬）。
- 前端將 `level × 字元寬` 轉為 `padding-left`，確保注音符號也隨之對齊，不溢出。
- **禁止**在 JSON 存實際 px 值（字級可能因裝置調整，存 px 會造成不一致）。

---

## 五、注音縮小（Ruby Font Scaling）

### 5.1 問題說明

注音符號的字級必須隨主字縮放，但在某些版面（例如字數多的頁面、小螢幕）需要整體降低注音的相對比例，以免注音擠壓行距。

### 5.2 JSON 欄位設計

在 `page` 層級加入 `ruby_scale`，在 `line` 層級可覆寫：

```json
{
  "page": 3,
  "ruby_scale": 0.5,
  "lines": [
    {
      "line_id": "p3-l1",
      "ruby_scale": 0.4,
      "tokens": [ ... ]
    }
  ]
}
```

| 值 | 說明 |
|----|------|
| `0.5` | 預設值，注音為主字的 50%（符合教育部注音標準） |
| `0.4` | 密集版面用，注音稍小 |
| `0.6` | 學齡前版本，注音較大 |
| `null` | 未設定，繼承上層或使用 CSS 預設 |

- `line` 層的 `ruby_scale` 優先於 `page` 層，用於同一頁中標題和內文注音大小不同的情況。
- 前端將此值轉為 `font-size` 比例，**不**直接用於 CSS `transform: scale()`（後者會影響佔位空間）。

---

## 六、連帶注音的換行機制

### 6.1 問題說明

這是網頁注音渲染最容易出錯的地方。瀏覽器預設允許在任意兩個中文字之間換行，但以下三種情況**不允許**在字與字之間斷行：

1. **詞語中間**：「蝴蝶」不能拆成「蝴」在上行、「蝶」在下行。
2. **注音溢出**：若某字的注音較長（例如四聲 + 複韻母），換行點剛好在這個字之前，注音可能溢出到前一行的字元區域。
3. **標點前禁斷**：行末不能出現開括號「（」「「」「『」；行首不能出現句號、逗號、關閉括號。

### 6.2 JSON 欄位設計

**詞語邊界（word_boundary token）：**

```json
{ "type": "char", "char": "蝴", ... },
{ "type": "word_boundary" },
{ "type": "char", "char": "蝶", ... }
```

前端遇到 `word_boundary` 時，將前後兩字包入 `<span style="white-space: nowrap">` 或使用 CSS `display: inline-flex`，確保視為一個不可分割的換行單位。

**注意：** `word_boundary` 不顯示任何內容，純粹是前端換行邏輯的提示。

**標點換行屬性（line_break_rule）：**

在 `punctuation` token 加入 `line_break_rule` 欄位：

```json
{ "type": "punctuation", "char": "，", "zhuyin": "", "line_break_rule": "no_start" },
{ "type": "punctuation", "char": "（", "zhuyin": "", "line_break_rule": "no_end" },
{ "type": "punctuation", "char": "。", "zhuyin": "", "line_break_rule": "no_start" }
```

| 值 | 說明 |
|----|------|
| `"no_start"` | 此標點不可出現在行首（句號、逗號、頓號、關閉括號） |
| `"no_end"` | 此標點不可出現在行末（開括號） |
| `null` | 無限制 |

前端根據此欄位實作 CSS `line-break` 或手動計算換行點，不依賴瀏覽器預設的 CJK 換行規則（各瀏覽器實作不一致）。

**省略號佔位（width_units）：**

```json
{ "type": "punctuation", "char": "⋯⋯", "zhuyin": "", "width_units": 2, "line_break_rule": null }
```

`width_units: 2` 告知前端此標點佔兩個字元寬，計算換行點時需計入。

---

## 七、完整 JSON 結構

```json
{
  "schema_version": "1.0",
  "generated_by": "ai",
  "reviewed": false,

  "book": {
    "id": "little-rabbit-001",
    "title": "小兔子找朋友",
    "author": "王小明",
    "target_age": "3-6",
    "language": "zh-TW",
    "phonetic_systems": ["zhuyin", "pinyin"]
  },

  "pages": [
    {
      "page": 1,
      "layout": "text_bottom",
      "text_direction": "ltr",
      "ruby_scale": 0.5,

      "image": {
        "src": "page-01.webp",
        "alt_text": "小兔子在草地上奔跑",
        "scene_prompt": "白色小兔子在綠色草地奔跑，晴天，水彩風格，兒童繪本"
      },

      "lines": [
        {
          "line_id": "p1-l1",
          "role": "body",
          "indent": { "level": 0, "unit": "char" },
          "ruby_scale": null,
          "tokens": [
            {
              "type": "char",
              "char": "小",
              "zhuyin": "ㄒㄧㄠˇ",
              "zhuyin_parts": { "initial": "ㄒ", "final": "ㄧㄠ", "tone_mark": "ˇ", "tone_number": 3, "tone_position": "after" },
              "pinyin": "xiǎo",
              "pinyin_parts": { "initial": "x", "final": "iǎo", "tone_number": 3 },
              "emphasis": false, "width_units": 1, "polyphone": false
            },
            { "type": "word_boundary" },
            {
              "type": "char",
              "char": "兔",
              "zhuyin": "ㄊㄨˋ",
              "zhuyin_parts": { "initial": "ㄊ", "final": "ㄨ", "tone_mark": "ˋ", "tone_number": 4, "tone_position": "after" },
              "pinyin": "tù",
              "pinyin_parts": { "initial": "t", "final": "ù", "tone_number": 4 },
              "emphasis": false, "width_units": 1, "polyphone": false
            },
            {
              "type": "char",
              "char": "子",
              "zhuyin": "ㄗˇ",
              "zhuyin_parts": { "initial": "ㄗ", "final": "", "tone_mark": "ˇ", "tone_number": 3, "tone_position": "after" },
              "pinyin": "zǐ",
              "pinyin_parts": { "initial": "z", "final": "ǐ", "tone_number": 3 },
              "emphasis": false, "width_units": 1, "polyphone": false
            },
            { "type": "punctuation", "char": "，", "zhuyin": "", "line_break_rule": "no_start" },
            { "type": "space" },
            {
              "type": "char",
              "char": "跑",
              "zhuyin": "ㄆㄠˇ",
              "zhuyin_parts": { "initial": "ㄆ", "final": "ㄠ", "tone_mark": "ˇ", "tone_number": 3, "tone_position": "after" },
              "pinyin": "pǎo",
              "pinyin_parts": { "initial": "p", "final": "ǎo", "tone_number": 3 },
              "emphasis": true, "width_units": 1, "polyphone": false
            },
            { "type": "punctuation", "char": "！", "zhuyin": "", "line_break_rule": "no_start" }
          ]
        }
      ]
    }
  ]
}
```

---

## 八、多音字處理

```json
{
  "type": "char",
  "char": "長",
  "zhuyin": "ㄓㄤˇ",
  "pinyin": "zhǎng",
  "polyphone": true,
  "alt_pronunciations": [
    { "zhuyin": "ㄔㄤˊ", "pinyin": "cháng", "meaning_hint": "長度、長短" },
    { "zhuyin": "ㄓㄤˇ", "pinyin": "zhǎng", "meaning_hint": "生長、成長" }
  ]
}
```

- `polyphone: true` 是校對警示旗標，編輯介面看到此旗標需人工確認 AI 所選讀音是否符合語境。
- `alt_pronunciations` 陣列依使用頻率排序，第一筆非必然是本字的正確讀音。

---

## 九、Line Role 型別

| role | 說明 | 前端對應 |
|------|------|---------|
| `body` | 主文 | 標準字級 |
| `title` | 頁面標題 | 較大字級 |
| `caption` | 圖說 | 較小字級，注音可省略 |
| `sound_effect` | 擬聲詞（碰！嘩！） | 特大字級，強調樣式 |

---

## 十、Page Layout 型別

| layout | 說明 |
|--------|------|
| `text_bottom` | 圖上文下（最常見） |
| `text_top` | 文上圖下 |
| `text_overlay` | 文字疊圖 |
| `text_left` | 文左圖右 |
| `text_right` | 文右圖左 |
| `full_text` | 純文字頁，無圖 |

---

## 十一、已知陷阱與注意事項

### 前端實作注意

1. **不得用 CSS `ruby-position` 做雙軌注音**：原生 `<ruby>` 只支援單側，雙軌（上注音下拼音）需自訂 flex 結構。
2. **`white-space: nowrap` 的作用範圍**：只包 `word_boundary` 前後的兩字，不包整行，否則會阻止所有換行。
3. **注音行高問題**：注音存在時，行高 (`line-height`) 需顯式設定（建議 `2.5em` 以上），否則注音會與上方圖片或上一行文字重疊。
4. **聲調一聲的空位佔位**：即使 `tone_mark` 為空字串，前端仍需保留聲調符號的佔位空間，確保所有字的注音區塊高度一致。

### JSON 生成（AI 標注）注意

1. **輕聲字串順序**：`zhuyin` 欄位的輕聲符號必須在前（`"˙ㄇㄚ"`），生成 prompt 需明確指定。
2. **一聲 tone_mark**：`tone_mark` 存 `""`，但 `tone_number` 必須存 `1`，兩者不能矛盾。
3. **多音字自動標記**：常見多音字列表需納入生成 prompt，讓 AI 輸出時自動設 `polyphone: true`。
4. **`reviewed` 欄位**：AI 生成後預設為 `false`，人工校對後改為 `true`，建立校對工作流程。

---

## 十二、建議開發順序

1. **寫 JSON Schema（Draft 7）驗證檔** — 先有驗證，後有生成器，確保每份 JSON 格式正確
2. **實作前端 Ruby 渲染元件** — 先靜態假資料，驗證排版行為正確
3. **實作換行邏輯** — `word_boundary` + `line_break_rule` 的組合測試
4. **接上 AI 注音生成 API** — 生成後立即過 JSON Schema 驗證
5. **實作雙注音切換 UI** — 純前端狀態，不動 JSON
6. **建立人工校對介面** — `polyphone: true` 的字高亮顯示，一鍵切換讀音