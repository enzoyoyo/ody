# ody — 奥德赛神话舆图

荷马史诗《奥德赛》交互导读站点，逆向 [history.papertok.ai](https://history.papertok.ai) 的静态 JSON + Canvas 架构，聚焦地中海归乡航程、24 卷史诗结构与希腊神话谱系。

> **用词说明**：本站内容中的「荷马史诗」指 Homer 的《伊利亚特》与《奥德赛》，非「荷兰史诗」。

## 特性

- **归乡航程**：地图航线 + 章节时间轴 scrubber
- **史诗卷章**：24 卷结构化导读（情节、人物、史料注）
- **神话谱系**：神谱与《伊利亚特》衔接
- **电影导读**：克里斯托弗·诺兰 2026《The Odyssey》公开制作信息（不含未公开剧情）

## 史料原则

- 每条 `books` / `beats` 须带 `sources` 字段
- `confidence` 标注：`consensus`（学界主流）、`disputed`（争议）、`legendary`（传说层）
- 来源清单见 [`data/SOURCES.md`](data/SOURCES.md)

## 开发

```bash
node scripts/validate-content.mjs   # 校验内容
node scripts/build.mjs              # 合并数据、hash 资源、更新 index.html
python3 -m http.server 8080         # 本地预览
```

## 目录

```
data/src/     # 可编辑内容源
assets/       # 构建产物（hash 文件名）
scripts/      # build + validate
index.html    # 单页 shell
```

## 部署

静态站点，可部署至 Cloudflare Pages / Tunnel。目标子域：`ody.papertok.ai`。

构建后启用 gzip（`.json` / `.js`）以优化首屏加载。
