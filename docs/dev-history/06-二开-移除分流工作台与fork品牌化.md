# 06 · 二开第二轮：官方图标 / 移除分流工作台 / fork 品牌化 / 上游 issue 盘点

日期：2026-11-26。基线：`D:\SoftwareDevelopCase\dige`，`main` = `c5e4d05`（工作区带未提交改动）。

## 一、这轮做了什么

| # | 事项 | 结果 |
| --- | --- | --- |
| 1 | 高容武陵电池官方图标 | 下载 `assets.fz.wiki/.../40c0270c6ce9c193.png`（实为 256×256 WEBP），LANCZOS 缩到 64×64 → `public/fuels/wulingHigh.webp`（2964 B），替换上一轮占位变体 |
| 2 | 移除分流工作台 | 删 `src/components/splitter/`（2 文件）、`src/utils/splitter/`（7 文件）、`src/components/modals/SplitterWorkbenchModal.tsx`、`scripts/_i18n_splitter_*.json`、`scripts/_selftest_splitter_evaluator.mjs`；`git checkout` 回退 `App.tsx` / `Header.tsx` / `HeaderMoreMenu.tsx` / `SidebarFooter.tsx` / `Sidebar/index.tsx` 与 8 个 `src/i18n/locales.*.json`（54 个 `splitter*` key 一并清掉） |
| 3 | GitHub 链接 | `Header` ×2、`HeaderMoreMenu`、`SidebarFooter`、`AnnouncementBody`（github/issues）全部指向 `VincentHDLee/D.I.G.E.`；QQ 群入口未动 |
| 4 | README 重写 | fork 定位、上游致谢与 AFK 说明、与上游的 14 项能力对比表、1.7 燃料表、命令、自测、结构、已知问题、部署、贡献规范 |
| 5 | 代码说明 | 新增 `docs/architecture.md`：数据流、求解内核（宽窗/双轨/常驻分层/震荡枚举/仿真空/分桶）、燃料与地区规则、分享码兼容约束、UI 结构、i18n、测试、已知坑 |
| 6 | 公告 | 8 语言各插一段"社区维护版，基于 djkcyl/D.I.G.E. 二次开发，原主创已停更，问题请到本仓库 Issues"，带两个链接 |
| 7 | 项目规范 | `CLAUDE.md` 语言数 7 → 8（补 `id`），同步命令示例、模板、文件结构 |
| 8 | 分支 | 删除本地 `feature/input-rate-limiter`（与 main 同一提交，纯冗余） |

## 二、Git tree 盘点结论

| 位置 | 内容 | 处置 |
| --- | --- | --- |
| 工作区 untracked | 分流工作台 10 个文件 | 已删（本轮） |
| 工作区 untracked | `scripts/_selftest_v1111_7665.mjs`（7665W 九宫格回归） | 保留，建议改名转正（交接文档也这么建议） |
| 本地分支 | `chore/dev-selftests-2026-08-17`（比 main 多 10 个提交、落后 1） | **保留**：里面是 M1/M2/M3/OOM/limiter 的 12 个归档自测脚本，main 上没有 |
| 远端 fork | `fork/feature/input-rate-limiter`（= main）、`fork/feat/add-wuling-mid-battery`（内容已并入） | 可删，但删远端要 push，等你点头 |
| 远端 origin | `origin/main`（2026-04-21，2b454a5）、`origin/planner` | 不动 |

## 三、上游 issue 盘点（全部仍 open，无人回复）

| # | 标题 | 提出者 / 时间 | 诉求本质 |
| --- | --- | --- | --- |
| 16 | 希望增加一个主燃料多选功能 | jasonfall / 2026-05-19 | 4770W 目标下选中容武陵直接无解；改用高容谷地做震荡又给出 1/24+1/48 的低效解，要手动扣 1100W 才正常。希望满速常驻优先吃高功率燃料、余量再用别的燃料震荡 |
| 14 | Option for constraint to base power | fduser2 / 2026-03-24 | 希望能限制常驻/基础燃料台数（例：基础只放 1× 高容谷地），把余量留给指定燃料做震荡 |
| 13 | max Fuel/hr and third fuel option | keegang6705 / 2026-03-16 | metastorage/仓储转运限 30 高容谷地/小时，跨区供电跑不住；希望支持**第三种燃料**（低一档），降低高容谷地用量 |
| 9 | 想赞助，怎么支持 | Felipe-RA / 2026-02-22 | 要 `FUNDING.yml` |
| 2 | Suboptimal way of doing power | Starficz + Leander/asteraaster/gander03 / 2026-02-09，28 条评论 | 认为 `2^n·3^m` 分流 + 多分支求和存在能量泄漏风险；提出回灌（loopback）实现任意 1/x、并证明周期恒定；给出"二进制编码器 + 末级分流链"降泄漏方案。维护者当时回复"已在做组件化（IC）方案，几天内上线"，实际未落地 |

我们的现状对应：

- #16 部分满足：常驻分层支持手动多燃料行，震荡侧有 `mixed` 混编；但**自动常驻只按主燃料 floor**，且主燃料只有一个，正是他抱怨的点。
- #14 部分满足：手动常驻行 + 关闭自动补齐，但仍不能"限制上限后让求解器自己补"。
- #13 未满足：混编只做 2 种燃料。
- #9 未做。
- #2 未做：分流工作台曾是这条路线的研究件，现已按你要求删除。

## 四、待定（下一轮讨论）

1. 是否做 #16 的"自动常驻多燃料"（收益最高、成本中等）。
2. 是否做 #14 的常驻上限（成本最低，半天内可完成）。
3. 是否扩到 3 燃料（#13，组合爆炸需要剪枝策略）。
4. 是否重开回灌/1x 分流路线（#2，大工程，且要先定"做研究件还是做产品"）。
5. 是否挂 `FUNDING.yml`（你的钱袋子，你定）。

## 五、我发现的其它问题

1. `index.html` 的 canonical / og:url / hreflang / JSON-LD 全部指向上游域名 `dige.aunly.cn`，`shareParams.CANONICAL_WEB_ORIGIN`、`drawCompleteExport` 默认网址、Android App ID `cn.aunly.dige` 也是。fork 部署到 Pages 后，localhost/Capacitor 场景生成的分享链接会指到上游站。**建议换自己的域名**，但需要你定域名。
2. 公告里的 B 站教程链接是上游作者的视频，fork 版功能已经比视频新，是否保留要你定。
3. `docs/v1.11.1-handover.md` 里"当前分支 `feature/input-rate-limiter`""Push 目标是 fork"已经过时，需要改。
4. `pnpm lint` 全仓 114 条历史报错（双引号 vs Biome 单引号配置），CI 目前无法挂 lint gate；要么一次 `biome format --write` 全仓洗一遍，要么把配置的引号规则放宽。
5. `package.json` 仍是 `factory-designer@1.11.1`，品牌化后建议改名 + 走 1.12.0。
6. `scripts/_selftest_v1111_7665.mjs` 挂着 `_` 前缀未入库，README 已写上但文件还没进 git。
7. Cloudflare Pages 生产部署还停在 `c5e4d05`（3 个月前），本轮的改动一旦 commit 需要重新推。

## 六、验证

```
pnpm run i18n translate           → 8 语言 synced（270 keys，比改前少 54 个 splitter key）
pnpm run typecheck                → 0 错
pnpm build                        → exit 0，dist/fuels/wulingHigh.webp 2964 B
docker compose restart dige-dev   → localhost:3000 页面 200、图标 200、公告新段落已下发
```

## 七、回滚

- 图标：`git checkout -- public/fuels/wulingHigh.webp`（若未提交则从 `.snow/asset` 取上一版占位）
- 工作台：`git stash` 已无本地方案；如需恢复，用 `git show` 从会话记录重建（工作台本身从未入库，删掉即不可逆，确认过你没在用）
- 文档/公告：`git checkout -- README.md CLAUDE.md docs/ src/i18n/announcement/`
