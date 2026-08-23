# 项目背景与进度 · dt-uni-app

> 这份文件是项目的**唯一背景记录**。Obsidian Vault 里没有这个项目的笔记（有意为之：
> Vault 在 Allianz OneDrive 上，私人项目不往里混）。README.md 只讲「怎么跑」，
> 背景、决策、坑都在这里。
>
> 最后核对：2026-08-21（对着 `data/dt-uni.db` 和文件系统查的，不是凭记忆写的）

## 为什么做这个

中国学生申请德国大学，中介收 5 位数人民币。中介真正做的事本质是两件：
**数据整合**（哪个学校哪个专业、什么要求、什么截止日期）+ **流程模板化**
（材料清单、动机信套路）。这两件都能自动化。

地图只是入口，核心价值是**面向申请流程倒推设计的数据库** —— schema 不是学校目录，
是「一个人要申请，需要知道什么」。多用户 schema 从第一天就在，为的是以后给朋友用、
做成产品。

## 现在到哪了

### 数据

| 表 | 行数 | 说明 |
|---|---|---|
| hochschule | 1521 | 来自 Wikidata SPARQL，含 subunit 污染（见下） |
| studiengang | 2436 | 极度不均：LMU 651、TUM 183，其余全部 ≤ 55 |
| zulassung | 2202 | 30 个字段，含语言成绩、APS、截止日期区间 |
| ranking | 44 | |
| nutzer / bewerbung / dokument_typ | 0 | 多用户层只有 schema，没数据 |

学位分布：Master 1519、Bachelor 368、Lehramt 303、PhD 210、Staatsexamen 13。

**1521 所学校里只有 128 所有专业数据，1393 所是空壳。**

### 代码

- `scripts/build-html.mjs`（57 KB）→ 生成 `viewer.html`（1.8 MB）
  单文件 Leaflet 地图，中文界面，深色主题，做过无障碍和 400% 缩放适配。
  **永远不要直接改 `viewer.html`，改生成器。**
- 爬虫：`scrape-daad-elite.mjs`（30 KB，主力）、`scrape-lmu-details.mjs`、
  `scrape-tum-details.mjs`、`scrape-lmu-studies.mjs`、`scrape-tum-studies.mjs`
- Migration 到 `sql/005_deadline_parsed.sql`（004 是 disambiguation，005 解析截止日期）

### 技术栈（已验证）

- Node.js + 内置 `node:sqlite`。**不用 `better-sqlite3`** —— 它要 Python 编译，
  Allianz 环境里过不去。
- 公司 SSL 拦截：`NODE_EXTRA_CA_CERTS=C:\Users\wfxndvg\OneDrive - Allianz\Dokumente\AI-Test\corporate-ca-bundle.pem`
  （Zscaler + Allianz，148 证书，从 Windows 证书库导出）
- `package.json` 的 scripts **只覆盖 3 个脚本**（init-db / ingest:wikidata / report）。
  5 个爬虫和 build-html 都得手敲 `node scripts/<x>.mjs`。

## 路线变更：HRK 计划没执行

2026-07-01 定的下一步是：爬 HRK Hochschulkompass（~423 所规范大学）→ 用
名字+城市模糊匹配 HRK ↔ Wikidata → 补 `wikidata_qid` → 加 `is_main_entity` 标记
过滤 subunit。

**实际 8 月走的是 DAAD 路线，HRK 一步没做。** 证据：`hochschule.hrk_id`
列建了，但 1521 行全是 NULL。

后果 —— **Wikidata subunit 污染至今没清**：
- SPARQL 用 `wdt:P31/wdt:P279* wd:Q38723` 范围太宽，把 TUM 各系、各 Fakultät、
  历史上不存在了的院校、军校都拉进来了
- 重名时 `LIKE` 会先匹配到错误的 subunit 而不是主实体
- 坐标覆盖 705/1521 = 46%，**和 7 月相比几乎没动**（缺坐标的基本都是 subunit）

`004_disambiguation.sql` 建了，但看起来没真正把 subunit 过滤掉。

## 2026-08-18 那轮 DAAD 导入

（这段原本只存在于 Obsidian 的 `Arbeitstagebuch/2026.08.BACKUP-2026-08-19.md` 里，
月记和日记搬运时都丢了 —— 搬到这里保命）

后台跑 1800 个详情页，并发 3 + 400 ms 节流。算清了下一轮手工映射的范围：

- 未覆盖 98 校 / 675 专业
- 减掉有专用爬虫的 TUM（76）和 LMU（47）
- 实际要手工映射：**96 校 / 552 专业**
- 大头是 FH/TH 和私立商学院

**顺手发现的漏网学校**：`Technische Hochschule Köln`（13 个专业）——
DAAD 对科隆用了两个名字变体，所以匹配漏了。

⚠️ **这条发现还没落地。** 2026-08-21 核对 `hochschule` 表，搜 `%Köln%` 只有
Universität zu Köln（25 专业）、Rheinische Hochschule Köln、Priesterseminar Köln、
Deutsche Sporthochschule Köln、Kölner Werkschulen、Institut für
Verkehrswissenschaft —— **TH Köln 根本不在库里**。名字变体的处理逻辑也没写进爬虫。

## 两个一直没解决的风险

**没有 git。** 目录里只有 `.gitignore`，没有 `.git`。版本控制全靠手工
`.BACKUP-<日期>` 文件名（db 有 6 个，viewer.html 有 2 个）。
`build-html.mjs` 已经 57 KB —— 这个体量没 git 迟早出事。

**还在 OneDrive Allianz 上。** 路径 `OneDrive - Allianz\Dokumente\AI-Test\`。
如果这东西以后要商业化，IP 归属会很难看。7 月就记下了，一直没迁。

## 下一步候选（按「解决什么问题」排，不是按好做排）

1. **清 subunit** —— 不清，1521 这个数字和地图上的点都是假的。要么做 HRK 交叉验证，
   要么收紧 SPARQL 再重灌
2. **迁出 OneDrive + `git init`** —— 两件事一起做，一次性把风险了掉
3. **TH Köln 那类名字变体** —— 爬虫里加变体表，不然每次都靠人肉发现
4. 96 校 / 552 专业的手工映射
5. `package.json` 把 5 个爬虫和 build-html 补进 scripts
6. 多用户层：`nutzer` / `bewerbung` 真填数据，才算「申请追踪」工具而不是查询站
