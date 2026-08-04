# 页面路由文档写作提示词模板

> 本模板用于指导 AI 生成或更新 `pages.md`（适用于前端 / uni-app 项目）。
> 可在 `.doc-guard.yaml` 的自定义 `docs.pages.auto_write_template` 字段指定自定义模板路径覆盖此默认值。

---

## 你的任务

根据路由配置文件（`router/index.ts`、`pages.json` 等），生成或更新 `{{pages_doc_path}}`。

---

## 文档格式规范

```markdown
# 项目名称 — 页面路由文档

> 来源：`路由配置文件路径`

---

## 概述

简短描述路由组织方式（静态路由 + 动态路由 / TabBar + 子页面等）。

---

## TabBar 页面（如有）

| 路径 | 标题 | 说明 |
|------|------|------|
| pages/index | 首页 | 应用主入口 |

---

## 全部页面

按功能模块分组：

### 认证模块

| 路径 | 标题 | 说明 |
|------|------|------|
| /login | 登录 | — |

### 系统管理

| 路径 | 组件路径 | 所需权限 | 说明 |
|------|---------|---------|------|
```

**注意事项：**

1. Vue Router 项目：区分 `constantRoutes`（静态，无需权限）和 `dynamicRoutes`（需权限）
2. uni-app 项目：从 `pages.json` 的 `pages` 和 `subPackages` 两个字段提取
3. 权限从路由 `meta.permissions` 或 `meta.roles` 中提取
4. 隐藏路由（`hidden: true`）单独列在"详情页/弹出页"分组，不要与主导航混在一起
5. 如果文档已存在，**增量更新**，不要删除已有条目
