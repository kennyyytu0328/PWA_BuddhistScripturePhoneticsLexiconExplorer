# Third-party notices

The MIT License in `LICENSE` covers this project's own code and documentation only. The data and fonts below keep their own licenses.

## 丁福保《佛學大辭典》(Ding Fubao Dictionary of Buddhist Studies)

- Files: `data-sources/dfb/`; build output `public/data/lexicon.dfb.json` and `public/data/gaiji/`
- The text of the dictionary is in the public domain. The TEI P5 digital edition is licensed by DDBC/DILA (Dharma Drum Institute of Liberal Arts) under [CC BY-SA 2.5 Taiwan](http://creativecommons.org/licenses/by-sa/2.5/tw/).
- Source: https://glossaries.dila.edu.tw/glossaries/DFB
- Material derived from it, including `lexicon.dfb.json`, is distributed under the same license.
- In-app attribution: 「名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權」

## Noto Serif CJK TC / Noto Sans TC

- Files: `fonts/`; build output `public/fonts/` (subsets)
- Licensed under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
- Source: https://github.com/notofonts/noto-cjk

## CBETA T08n0251 (not included)

The build compares the sutra text against the CBETA edition of T08n0251. That file is CBETA material and is **not part of this repository**. It is used only at build time and is never shipped with the app.

To build from a fresh clone, put a local copy at `data-sources/cbeta/T08n0251.txt` (this path is gitignored):

1. Get the text from https://cbdata.dila.edu.tw/stable/juans?work=T0251&juan=1
2. Save the sutra body as UTF-8 plain text.

How the build reads the file:

- Lines that start with `#` are treated as notes and ignored.
- Punctuation is stripped before the comparison.

`pnpm build:data`, `pnpm build` and the data-unit tests all need this file.

## GRETIL (Vaidya 1961)

`data/iast.json` uses single-term IAST transliterations and mantra syllables based on the GRETIL edition. No full sentences are reproduced, because GRETIL is licensed CC BY-NC-SA 4.0.
