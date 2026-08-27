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

## 在线访问

在浏览器中直接打开（已合并到 `main`）：

| 链接 | 说明 |
|------|------|
| [cdn.jsdelivr.net 直链](https://cdn.jsdelivr.net/gh/enzoyoyo/ody@main/index.html) | 推荐，同源加载资源 |
| [htmlpreview 预览](https://htmlpreview.github.io/?https://raw.githubusercontent.com/enzoyoyo/ody/main/index.html) | 备用；自动走 jsDelivr 拉取数据 |

本地预览：

```bash
node scripts/build.mjs
python3 -m http.server 8080
# http://localhost:8080
```

## 部署

### GitHub Pages（推荐）

1. 打开 https://github.com/enzoyoyo/ody/settings/pages
2. **Build and deployment → Source** 选 **GitHub Actions**
3. 保存后，在 Actions 页重新运行 **Deploy GitHub Pages** 工作流

上线地址：`https://enzoyoyo.github.io/ody/`

### 其他

亦可部署至 Cloudflare Pages / Tunnel。目标子域：`ody.papertok.ai`。

构建后启用 gzip（`.json` / `.js`）以优化首屏加载。

