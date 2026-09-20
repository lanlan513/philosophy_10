# 墨与大理石 · Ink & Marble

在「思想档案馆」中新增的东西人物长廊：六位东方思想者与六位西方哲学家，沿一条缓慢展开的中轴对读。
他们不因相貌或名言相似而并列——每一组都锚定一个**共同问题**，并用**原文与出处**说明关联。

```
孔子 × 苏格拉底    问一 · 德性可以教吗？
老子 × 巴门尼德    问二 · 「无」可以被思考吗？
庄子 × 赫拉克利特  问三 · 万物恒变，「我」何以自处？
龙树 × 康德        问四 · 理性越界时，矛盾在说什么？
慧能 × 萨特        问五 · 意义崩塌之后，「无」是深渊还是出口？
王阳明 × 笛卡尔    问六 · 把一切都怀疑之后，还剩下什么？
```

## 运行

```bash
npm install
npm run server   # 后端 API → http://localhost:8321（只读接口 + 最近访问）
npm run dev      # 前端 → http://localhost:5173/gallery（/api 由 vite 代理到 8321）
npm run smoke    # 端到端冒烟测试（jsdom 驱动构建产物，需先 build 且后端在线）
```

## 结构

```
server/index.js        零依赖 Node 后端
server/data/*.json     人物 / 共同问题 / 关键词 / 传统 / 引用关系
src/gallery/
  Gallery.jsx          长廊主页：虚拟列表 + 分层显现 + 中轴进度
  FigurePage.jsx       人物页（记录"最近访问的两位"）
  QuestionPage.jsx     共同问题页（对读 + 分歧 + 引用关系）
  GalleryContext.jsx   基础数据、关键词跳转（死端/选择器）、toast、离线条
  api.js               超时/重试/缓存回退的 fetch 封装
  hooks.js             分层显现、滚动记忆（含移动端锚点修正）
  components.jsx       肖像（懒加载+降级）、关键词印、引文、关系卡、最近驻足
```

## 后端接口

| 接口 | 说明 |
| --- | --- |
| `GET /api/gallery/figures` · `/:id` | 人物列表 / 详情（含引文、解析后的引用关系） |
| `GET /api/gallery/questions` · `/:id` | 共同问题（entries 已解析引文原文） |
| `GET /api/gallery/keywords` | 关键词及其跳转目标 |
| `GET /api/gallery/traditions` | 思想传统 |
| `GET /api/gallery/relations` | 引用关系（原始数据） |
| `GET/POST /api/gallery/me/recent` | 最近访问的两位人物（匿名 cookie 会话，落盘 `sessions.json`） |
| `GET /api/gallery/portrait/:id.svg` | 生成式肖像：东方=墨（圆相/笔触/朱印），西方=大理石（石纹/拱/几何） |

## 边界情况的处理

- **关系数据不完整**：`r13`（庄子 × 赫拉克利特）故意保留一条缺引文的关系，服务端解析为 `null`，前端渲染「引文散佚 · 资料待补」占位，而不是隐藏或报错。
- **图片加载失败**：肖像 `onError`/`naturalWidth===0` 时降级为朱印单字 + 姓名的文字卡；`aspect-ratio` 占位避免布局跳动。
- **关键词没有下一跳**：如「学」「活火」，点击后 toast 提示「暂无下一跳 · 资料待补」，关键词变为虚线死端态；多目标关键词（如「无」）弹出选择器。
- **长列表卡顿**：长廊行做窗口化虚拟渲染（离屏行退化为实测等高位占位），滚动回调走 rAF，图片懒加载。
- **网络中断**：请求带超时与一次重试；GET 失败回退 localStorage 缓存并标注「当前为缓存内容」；无缓存时显示带「重试」的错误页；`offline` 事件触发顶部提示条；写操作（最近访问）失败时镜像到本地。
- **移动端滚动位置**：`scrollRestoration=manual` + 每路由独立保存/恢复滚动；视口尺寸变化（地址栏伸缩、旋转）时按锚点行重新定位；虚拟行挂载后再做两次迟滞校正。
- **文本优先降级**：加载与错误态均为文字说明，绝不白屏；`<noscript>` 提供纯文本指引与可直接访问的 JSON 接口；`prefers-reduced-motion` 下关闭全部动效。
