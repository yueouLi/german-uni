# Gerettet: Arbeitstagebuch-Abschnitt vom 2026-08-18

Dieser Abschnitt existiert nur noch in
`Obsidian Vault/Arbeitstagebuch/2026.08.BACKUP-2026-08-19.md`
(Zeilen 389-545).

Er fehlt sowohl in `Arbeitstagebuch/2026.08.md` als auch in der
Tagesnotiz `2026.08.18.md`. Beim Herausloesen in die Tagesnotiz sind
diese Unterabschnitte verloren gegangen:

- `07:19 - dt-uni-app DAAD-Import` (Kern dieses Pakets)
- `07:47 - Checkliste Serienmail`
- `09:16 - zwei Punkte deutsche Grammatik` (`weiterleiten` trennbar)
- `13:50 - Skill-Entwicklungshistorie` (`html-ppt` ist nur ein
  Symlink auf ein fremdes Skill, `allianz-ppt` ist das eigene)
- Pruefdetails der Vault-Aufraeumung (14990 = 14990 Zeichen,
  Wurzel von 20 auf 8 Dateien, 6 leere Ordner entfernt)
- Der Widerspruch in der UC3-README

Umgekehrt enthaelt die Tagesnotiz Inhalte, die hier fehlen
(Marwins neue Aufgabe). Keine der beiden Dateien ist vollstaendig.
Nichts im Vault wurde geaendert - das hier ist eine Kopie.

---

## 一天的流水 — auto 2026-08-19

从 08-18 的七个 session 日志里按时间顺序还原（1822 条记录）。当天最后一条是 14:44。

### 07:00 · Outlook 邮件同步（`/outlook-context`）

导出五个人的邮件（Marwin、Nicolai、Kevin、Eva、Saskia），不限时间范围，**77 封新邮件**。
清理签名/免责声明/Teams 推送后镜像到 `01 Capture/`，新建
[[2026-08-18 Rundmail Freigabe und Sektempfang]]，更新 Eva、Saskia、Thorsten 三份档案
和礼物筹备笔记，链接双向。

同步挖出三件 Vault 里原本没有的事：

| 发现 | 内容 |
|---|---|
| 群发邮件已获批 | Saskia 17.08. 17:59「Kannst du das dann morgen so rausschicken」，Eva 18:01 只改错别字 —— 没人在等回复，是等我发 |
| Eva 已订香槟酒会 | 10 瓶 Prosecco + 无酒精气泡酒 + 30 杯 + 冷藏车，01.09. 14:30。订购表格还没填回，服务推车餐饮部不保证 |
| 卡片时间线补齐 | Sandra 到 21.08.，Patricia 从 20.08. 起 —— 两人重叠，所以文里加了「bis 01.09. um 13 Uhr」 |

**时间冲突还在**：付款截止 26.08.，印字要两周。26.08. 之后下单，01.09. 拿不到球衣。

### 07:19 · dt-uni-app 后台跑 DAAD 导入

1800 个详情页，并发 3 + 400ms 节流。算清了下一轮手工映射范围：
未覆盖 98 校 / 675 专业，减掉有专用爬虫的 TUM（76）和 LMU（47），实际
**96 校 / 552 专业**。大头是 FH/TH 和私立商学院。
顺手发现漏网的 `Technische Hochschule Köln`（13 个专业）—— DAAD 对科隆用了两个名字变体。

### 07:47 · 群发邮件避坑清单

问了「群发邮件要注意什么」，重点不在内容而在收件人和权限：BCC vs To、
主题行要能脱离正文被读懂、一封只放一个 Ask、截止日期写具体时刻、
群发链接的权限要真的验证过。

### 09:16 · 两句德语语法

- `Ich leite dir die E-Mail gleich auch weiter.` —— `weiterleiten` 是可分动词，前缀漏了
- `Hast du die Einladung für den 01.09. schon bekommen? Ansonsten kann ich sie dir weiterleiten.`
  —— `Einladungstermin` 不是德语说法；`ansonst` 不存在；德语动词不能像中文省略宾语「它」

### 09:30–11:45 · Outlook Verteiler，从手工到工具

问 Outlook 的 Verteiler 怎么做 → 澄清三种东西不一样（个人 Kontaktgruppe / 全公司
Verteilerliste 走 IT 申请 / M365-Gruppe），然后我说清真实需求：**要一个能复用的工作流，
说「发给我们 team」就够，不要每次挨个搜人**。

- 建了 Kontaktgruppe，8 人全部从公司地址簿反查出真实 SMTP —— 不猜地址
- 名字后来改成 **`PII Team`**（重命名而非新建，没产生重复组）
- **抓到一个大坑**：Thorsten 本人就在这个组里（`t.mueller@`，第 7 位）。惊喜礼物的集资邮件
  绝对不能用这个组发。而且正文有我的私人 PayPal 地址，必须走 BCC
- 测试草稿建了但没发。An 栏只显示一个条目是正常的，组要到发送瞬间才展开

**Betreff 乱码那个问题查清了**：我这台机器 PowerShell 5.1 + 控制台代码页 850，
`Get-Content` 不加 `-Encoding UTF8` 就把 UTF-8 当 Latin-1 读，`Grüße` → `GrÃ¼ÃŸe`。
更狠的是脚本文件自己没 BOM 时，`ü` 裂开的字节正好是引号，字符串提前闭合直接 ParserError ——
不是显示乱码，是根本跑不起来。

产出：`outlook-context` skill 里的 `tools/verteiler.py`，十个命令，Python + pywin32
（不用 PowerShell，Python 3 全程 UTF-8 绕开编码坑）。全部在一次性测试组上真机跑过，
没拿 `PII Team` 做实验。

### 11:32–13:00 · Vault 大扫除（`/obsidian`）

任务给得很宽，所以先体检，只做规则里写死的清理，结构一律没动
（引用了我自己 08-11 那句「Erst denken, dann verschieben」）。

- **八月日记归位**：根目录 7 个散日记合成 `Arbeitstagebuch/2026.08.md`，
  逐字节搬运，校验 14990 = 14990 字符，零丢失。原文件进 `Archiv/Rohnotizen/`，没删
- 根目录从 20 个文件降到 8 个；删了 6 个空文件夹
- **`/obsidian` skill 文档修好了**：原本写着有 `🏠 Home.md`、`Kontakte/`、`Ideas/`、`Inbox/`
  —— 一个都不存在。skill 拿旧结构做决策早晚出错
- **编号漂移链接修完**：23 个文件、**78 处**。剩下 87 条真死链（目标笔记根本没建过），
  得一条条定，不能批量
- **AI Learning 序号补齐**：`03 Vertiefung` 删了留下的缺口往上收

### 13:47 · 七个 Use Case 建链接

**64 个文件**挂上了 `use_case:` frontmatter，双向：正向靠 frontmatter wikilink
（Obsidian 算真链接，UC README 的 Backlinks 自动出现），反向在每个 README 加
`## Was dazu schon existiert` + Dataview 兜底。

| UC | 文件数 | 状况 |
|---|---|---|
| UC1 Glossar | 3 | 最薄，要质检的术语表本身还不存在 |
| UC2 Persönliches MD File | 14 | 最完整，Saskia 那个「200 个问题」已经做完 |
| UC3 Präsentation | 16 | 材料多且能跑 |
| UC4 Outlook | 5 | 邮件做完，日历一条笔记都没有 |
| UC5 Jira & Confluence | 22 | 最大，一半是 MCP 稳定性 |
| UC6 Celonis Auswertungen | 11 | 唯一有已验证成品 |
| UC7 Celonis Direkt | 5 | 全是背景，skill 在 Kevin 那 |

顺手发现：UC3 的 README 自我评价「kein zuverlässiger Skill」是 06-30 写的，
底下 16 个文件说明 HTML 路线已经能用 —— 标了矛盾但没改我的判断句。
UC5 下面**四份独立的 MCP 修复笔记**（Saskia、Eva、Allianz-Version、Archiv），
同一个问题四个人各修一遍，该合成一份说明书。

28 个文件没归 UC（索引 5 / 基础环境 13 / 学习材料 10）—— 是本来就不属于，不是遗漏。

### 13:50 · 查 skill 开发历史

`html-ppt` 没有开发历史，它只是个符号链接指向从 GitHub 装的第三方 skill
（`lewislulu/html-ppt-skill`，MIT），目录里没有 `.git`。
`allianz-ppt` 才是我自己的，有 10 个提交，06-02 到 06-16。

### 12:15–14:06 · Verteiler 德语 HTML

给同事的介绍页做成单文件 HTML（无 CDN、无外部依赖），Allianz 蓝 `#003781` + 真 Logo SVG，
1280 px 和 390 px 都测过。放进 `Claude Code\Tools\`，和中文教程 11 成对。

**中间出了个事故**：我为了看 frontmatter 只读了前 10 行就整体 `Write` 覆盖，
把我在 Obsidian 里的编辑压掉了。三处改动恢复了，规则也进 memory ——
以后改现成文件先整篇读完，或者用 Edit 分段改。

### 14:13–14:42 · 两个 Confluence 页面重排（`confluence-design`）

**Claude Code 导航页（v30 → v35）**

- 标题 Panel、自动目录、三张 Kontext-Karten，五张表统一 Allianz 蓝表头 + 斑马纹
- 花哨 emoji 全删：🔵🟡🟢🟣 换成 `status` 宏，📖🚀💬🛠️🤖📋🐞 从链接表清掉
- **查了所有链接，问题不少**：

| 问题 | 处理 |
|---|---|
| `00_Wiki`、`Workshop-Inhalt & Sessions` 页面已不存在 | 删掉 |
| `forum.anthropic.com` 域名根本不存在（NXDOMAIN） | 删掉 |
| 5 个链接标题和真实页面名不符 | 按真名改 |
| `.claude` 在我个人 Space，链接却写 `/spaces/AIPC/` | 改成 `pageId=` 形式 |
| 4 个子页面漏了没列 | 补上 |
| `docs.anthropic.com` 全部 301 到新域名 | 直接指向最终地址 |

内部链接统一改成 `cmp.allianz.net/pages/viewpage.action?pageId=NNN`，跨 Space 也不会断。

**03_Nützlich Links&Extensions（v6 → v7）**

2 张大表拆成 5 个主题块：Claude 文档 / 工具与扩展 / AllianzGPT / 学习路径 / EU AI Act。

- 「Allianz ClaudeCode」在同一张表里重复两遍 —— 删掉一条
- 末尾三个光秃秃的词（`Github CLI`、`MarkItDown`、caveman 裸链）补了链接和用途，
  MarkItDown 反向链到转换教程页
- 表头原来用 `var(--ds-text-inverse)`，换主题就看不见 —— 改成固定蓝底白字

### 当天留下的待办

- [ ] **球衣今天必须下单** —— 付款截止 26.08.，印字两周，再拖 01.09. 就来不及
- [ ] 香槟酒会订购表格填好寄回；服务推车自己在部门里找（Eva 说和 Thorsten Meier 一起去取，他刷卡）
- [ ] 集资邮件真要发时**不能用 `PII Team` 组**（Thorsten 在里面），要 `copy --without` 排除他，并走 BCC
- [ ] `cloudlaunch.azt-dev.cloud` 域名不存在，页面上标了黄色「Zugang prüfen」没删 —— 问下 App 是否搬家
- [ ] `Gut zu wissen`（3006632415）在子页面列表里但 API 报权限错 —— 浏览器里确认同事能否打开
- [ ] `01_Prompt-Techniken` 只有截图 + 一个 `file:///C:/Users/wfxndvg/...` 本地链接，别人打不开
- [ ] 87 条真死链要一条条定
- [ ] 七个 UC 的 README 都叫 `README.md`，`[[README]]` 七重歧义 —— 要不要改名成 `UC1 Glossar.md` 这种
- [ ] 28 个未归 UC 的文件：要不要引入 `use_case: [Basis]` 第八类标记
- [ ] 学习 Nico 说的模块化 skill 设计

---

