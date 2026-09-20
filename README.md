# 墨与大理石 · Ink & Marble

一条**按问题展开**的中西思想人物长廊：孔子与苏格拉底、墨翟与密尔、孟子与卢梭、
庄周与赫拉克利特、老子与维特根斯坦、韩非与霍布斯、龙树与康德、慧能与萨特、
朱熹与阿奎那、王阳明与杜威。

> 关联不靠容貌或名言的表面相似，而靠**一个共同问题 + 双方原文 + 真实的引用关系**。
> 档案不完整处不补全、不虚构，只标注。

## 运行

```bash
npm install     # 零运行时依赖；postinstall 会生成 18 张抽象档案图
npm start       # http://localhost:4173
npm test        # API 端到端测试（26）+ 虚拟列表算法测试（9）
```

可选的浏览器级 DOM 冒烟测试（需要 jsdom 与运行中的服务器）：

```bash
npm start &
JSDOM_PATH=/path/to/jsdom BASE=http://localhost:4173 node test/dom.smoke.test.mjs
```

降级与异常场景可以直接模拟：

```bash
LATENCY=500 npm start          # 每个接口延迟 500ms
FAIL_RATE=0.3 npm start        # 30% 接口随机 503
# 浏览器 DevTools：Offline（离线）、CPU 4×/6× 节流、移动端模拟
# 霍布斯的石像路径存在但文件 404；墨翟在数据中就是 portrait:null
```

## 后端（只读接口）

零依赖 Node http 服务（`server/index.mjs`），所有数据在 `server/data.json`。

| 接口 | 说明 |
| --- | --- |
| `GET /api/figures` | 人物摘要目录（列表刻意不解析关系，不完整数据不阻塞列表） |
| `GET /api/figures/:id` | 人物详情：原文、关键词（含下一跳解析状态）、引用关系 |
| `GET /api/traditions[ /:id]` | 思想传统（含成员） |
| `GET /api/questions[ /:id]` | 共同问题；详情含东西两侧人物全文与「汇合 / 分歧」对读 |
| `GET /api/keywords` | 关键词目录（带 `hasHop`） |
| `GET /api/keywords/:id/hop` | 关键词的下一跳：人物 / 问题 / `null`（尽头）/ 指向未收录条目 |
| `GET /api/relations` | 原始引用关系（含悬挂目标，如阿奎那→未收录的亚里士多德） |
| `GET /api/visits` · `POST` | 按 httpOnly 匿名访客 cookie 读取/记录**最近两位**人物 |

关系的真实类型：文本注释（韩非《解老》→《老子》）、他者观察（密尔在《论自由》中
谈论孔子）、论辩对象（卢梭点名霍布斯）、道统承接（朱熹升格《孟子》）、权威援引
（阿奎那称引亚里士多德）……每一条都附原文与出处，而非标签相似。

## 前端（原生 ESM，无框架）

- **`public/js/virtual-list.js`**：绝对定位虚拟列表，rAF 节流滚动、视口外回收 DOM、
  `ResizeObserver` 实测高度校正，并以锚定补偿移动端图片/字体到达后的滚动跳动；
  回收后按索引重插，保证 DOM/读屏顺序与视觉顺序一致。
- **`public/js/portraits.js`**：图片懒加载（进入视口前 200px 才设 `src`）。
  `portrait:null` 不创建 `<img>`；404/解码失败/离线 → 纯文字印章占位，文字始终先行。
- **`public/js/api.js`**：内存 + localStorage 缓存、超时、5xx 重试一次、离线读缓存、
  访问记录离线排队、恢复后自动重放。
- **`public/js/app.js`**：hash 路由、逐层显影（肖像→年代→关键词→导览）、
  关键词确认式跳转、档案/问题弹层、总目、传统、最近访问、离线横幅、阅读进度。

**文本优先降级**：首屏与所有卡片先渲染文字；`<noscript>` 直接列出可阅读的 JSON 接口；
图像只是抽象的「墨像 / 石像」档案图（脚本生成，不模拟任何人物容貌）。

## 已刻意内置的不完整/故障样本

| 情况 | 样本 | 表现 |
| --- | --- | --- |
| 档案无图 | 墨翟 `portrait:null` | 不发图像请求，显示「档案无图」 |
| 图像 404 | 霍布斯石像文件缺失 | `<img>` error → 移除图像，文字完好 |
| 关系目标未收录 | 阿奎那→亚里士多德、杜威→胡适、慧能→《楞伽经》 | 虚线卡片，跳转按钮禁用并说明 |
| 关系原文缺失 | 杜威在华关系 `quote:null` | 「原文暂缺，不代拟」 |
| 关键词无下一跳 | 苏格拉底「困境 aporia」、庄周「逍遥游」等 | 弹层明确告知这是长廊尽头 |
| 关键词悬挂 | 孔子「礼乐教化」→ 未收录的荀子 | 保留指向、说明等待编目 |
| 导览缺失 | 数据层面支持（`guide` 可空） | 斜体占位，不虚构导览文字 |
| 网络中断 | — | 横幅 + 缓存可读 + 访问排队重放 |
| 长列表 | 虚拟列表；`low-end` 设备自动关闭阴影/模糊合成 |

## 目录

```
server/            零依赖 HTTP 服务 + data.json 数据档案
public/            原生 ESM 前端（index.html / styles.css / js/*）
scripts/           墨像/石像 SVG 生成器
test/              api.test.mjs · virtual-list.test.mjs · dom.smoke.test.mjs
_legacy/           旧的 React/Vite 脚手架（保留备查，未接入运行）
```
