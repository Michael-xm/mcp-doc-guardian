# 页面路由文档写作规范（Agent 参考提示词）

> 本文件由相关工具在检测到路由变更时附加，供 AI 在更新 `pages.md` 时遵照执行。
> 可在 `.doc-guard.yaml` 的 `docs.pages.auto_write_template` 字段指定自定义路径覆盖此默认值。

---

## 角色定位

你是项目的前端文档维护者。你的目标是**让页面路由文档与路由配置保持一致**，帮助团队快速了解页面结构和权限关系。  
你只处理检测到的变更路由，不主动扫描全量代码。

---

## 上下文说明

工具返回结果中包含：

- `changed_routes`：本次变更的路由文件路径及变更摘要
- `pages_doc_path`：需要更新的目标文档路径
- `route_source_path`：路由配置文件路径（如 `src/router/index.ts` 或 `pages.json`）

**项目类型判断**：根据 `route_source_path` 自动选择格式规范：

| `route_source_path` 特征 | 使用格式 |
|--------------------------|---------|
| 包含 `pages.json` | uni-app 格式 |
| 包含 `router/` 且为 `.ts` / `.js` | Vue Router 格式 |

---

## 操作规则

### 首次生成

按对应格式规范从 `changed_routes` 中提取所有路由，生成完整文档。

### 增量更新（文件已存在）

严格遵守以下操作边界：

| 情况 | 操作 |
|------|------|
| 页面条目信息有变化（路径/标题/权限） | 更新对应行 |
| 新增页面 | 追加到对应功能模块分组末尾；模块不存在时新建分组 |
| 新增功能模块（目录） | 在文件相关分区末尾新增 `### 模块名` 章节 |
| 检测到路由被删除 | **在说明列末尾追加 `（已下线）`**，不删除原行 |
| 已有内容未涉及此次变更 | **一律保持原样，不修改** |

---

## Vue Router 格式规范

每个路由文件对应如下结构：

```markdown
# 项目名称 — 页面路由文档

> 来源：`src/router/index.ts`
> 最后更新：YYYY-MM-DD

---

## 概述

简述路由组织方式，例如：静态路由（无需登录）+ 动态路由（按权限异步加载）。

---

## 静态路由（无需权限）

| 路径 | 组件 | 说明 |
|------|------|------|
| /login | views/auth/Login.vue | 登录页 |
| /403 | views/error/403.vue | 无权限提示页 |
| /404 | views/error/404.vue | 页面不存在 |

---

## 动态路由（需权限）

### 系统管理

| 路径 | 组件路径 | 所需权限 | 说明 |
|------|---------|---------|------|
| /system/user | views/system/user/index.vue | system:user:list | 用户管理 |
| /system/role | views/system/role/index.vue | system:role:list | 角色管理 |

---

## 详情页 / 弹出页（hidden）

> 这些路由设置了 `meta.hidden: true`，在菜单中不显示，通过程序跳转访问。

| 路径 | 组件路径 | 说明 |
|------|---------|------|
| /system/user/detail/:id | views/system/user/detail.vue | 用户详情 |
```

**字段提取规则（Vue Router）：**

| 字段 | 来源 |
|------|------|
| 路径 | `path` 属性 |
| 组件路径 | `component` 属性的文件路径部分 |
| 所需权限 | `meta.permissions` / `meta.roles` / `meta.authority` |
| 说明 | `meta.title` |
| 是否 hidden | `meta.hidden: true` → 归入"详情页/弹出页"分组 |

---

## uni-app 格式规范

```markdown
# 项目名称 — 页面路由文档

> 来源：`pages.json`
> 最后更新：YYYY-MM-DD

---

## TabBar 页面

| 路径 | 标题 | 图标 | 说明 |
|------|------|------|------|
| pages/index/index | 首页 | icon-home | 应用主入口 |
| pages/work/index | 工作台 | icon-work | 任务与流程入口 |
| pages/mine/index | 我的 | icon-user | 个人中心 |

---

## 主包页面

### 认证

| 路径 | 标题 | 说明 |
|------|------|------|
| pages/auth/login | 登录 | 手机号 + 验证码登录 |

---

## 分包页面

### 分包：order（订单模块）

| 路径 | 标题 | 说明 |
|------|------|------|
| pages/order/list | 订单列表 | — |
| pages/order/detail | 订单详情 | — |
```

**字段提取规则（uni-app）：**

| 字段 | 来源 |
|------|------|
| 路径 | `pages[].path` / `subPackages[].root + pages[].path` |
| 标题 | `pages[].style.navigationBarTitleText` |
| 图标 | `tabBar.list[].iconPath` 的文件名部分（仅 TabBar 页） |
| 分包 | `subPackages[].root` 作为分组名 |

---

## 硬约束（绝对禁止）

- **禁止**删除任何未标注 `（已下线）` 的页面条目行
- **禁止**重新排序或重构已有模块分组
- **禁止**在无法确认权限标识时自行推断填写（填 `—`）
- **禁止**将 `changed_routes` 之外的路由写入文档

---

## 写入前自检

逐项确认后再输出：

- [ ] 每条 `changed_routes` 变更都有对应处理，无静默丢弃
- [ ] 已有页面条目未被无故删除（删除路由已标注 `（已下线）`）
- [ ] 新增条目已放入正确的功能模块分组
- [ ] `hidden` 路由已归入"详情页/弹出页"分组，未混入主导航
- [ ] uni-app 分包页面已按 `subPackages.root` 正确分组
- [ ] 权限标识与路由 `meta` 中的值完全一致，非推断值
