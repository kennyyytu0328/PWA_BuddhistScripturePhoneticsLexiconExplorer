# 讀音審閱報告（review.readings）

- 日期：2026-10-16
- 對照依據：萌典 API（moedict.tw，資料為教育部《重編國語辭典修訂本》）
- 檢查範圍：`data/heart-sutra.json` 全經 9 段——17 個 `py` 覆寫 ＋ 所有交給 `pinyin-pro`（v3.29.5）產生的 token
- 判定：`review.readings` 維持 `false`，待下列修正確認後再改為 `true`

## 1. `py` 覆寫：17/17 通過 ✅

般若 bō rě、波羅蜜 bō luó mì、舍利子 shè lì zǐ、菩提 pú tí、阿耨多羅 ā nòu duō luó、三藐三菩提 sān miǎo sān pú tí、揭諦 jiē dì、波羅 bō luó 皆以**整詞**在萌典查得一致讀音。
其餘逐字比對（行 xíng、識 shì、說 shuō、薩 sà、埵 duǒ、僧 sēng、婆 pó、訶 hē、咒 zhòu）亦一致，多音字已人工確認語境正確。

> 未逐詞收錄於萌典者：菩提薩埵、般若波羅蜜多、薩婆訶。皆由已收錄的組成詞／單字讀音組成，無衝突。

## 2. `pinyin-pro` 產出：發現 2 類問題

### 2.1 變調（系統性）⚠️

`pinyin-pro` 預設套用口語變調，教育部辭典與注音標示**本調**：

| 原文 | pinyin-pro 預設 | 教育部本調 |
|---|---|---|
| 一切 | yí qiè | yī qiè |
| 不垢不淨 | bú gòu bú jìng | bù gòu bù jìng |
| 色不異空 | sè bú yì kōng | sè bù yì kōng |
| 不生不滅 | bù shēng bú miè | bù shēng bù miè |

**修正**：建置腳本呼叫 `pinyin(text, { type: 'array', toneSandhi: false })`（已實測可得本調）。

### 2.2 大陸普通話讀音 ≠ 台灣國語讀音 ⚠️

`pinyin-pro` 依普通話審音，以下與教育部不同，且 `toneSandhi: false` 無法修正：

| 段 | Token | pinyin-pro | 教育部 | 依據 |
|---|---|---|---|---|
| s3 | 空相 | kōng xiāng | **kōng xiàng** | 萌典「空相」整詞；「相」作相狀解讀去聲 |
| s4 | 意識界 | yì shí jiè | **yì shì jiè** | 萌典「意識」yì shì；「識」無 shí 音 |
| s6 | 究竟涅槃 | jiū jìng niè pán | **jiù jìng niè pán** | 萌典「究竟」jiù jìng |

**修正**：三處加 `py` 覆寫：

```jsonc
{ "t": "空相", "lex": "空相", "py": "kōng xiàng" }
{ "t": "意識界", "lex": "十八界", "py": "yì shì jiè" }
{ "t": "究竟涅槃", "lex": "究竟涅槃", "py": "jiù jìng niè pán" }
```

## 3. 其餘多音字：人工確認無誤 ✅

見 jiàn、空 kōng、度 dù、色 sè、復 fù、法 fǎ、無 wú、身 shēn、得 dé、有 yǒu、倒 dǎo、佛 fó、大 dà、上 shàng、說 shuō——語境讀音皆正確。

## 4. 建議：建置期鎖定讀音

2.2 顯示 `pinyin-pro` 的讀音標準與本專案（台灣國語、注音）不同，未來升級版本也可能改變結果。建議：

1. `build-data.ts` 產生全經逐字讀音後，與已審閱的快照 `data/readings.lock.json` 比對；**任一字不同即中止建置**。
2. 快照只在人工審閱後更新。

這樣 `review.readings: true` 才代表「目前顯示的每一個讀音都審過」，而不只是覆寫表審過。

## 5. 待你決定

- [ X] 同意 2.1：建置改用 `toneSandhi: false`（本調）
- [ X] 同意 2.2：加入 3 個 `py` 覆寫
- [X ] 同意 4：加入 `readings.lock.json` 建置檢查
- [X ] 以上完成後，將 `review.readings` 設為 `true`
