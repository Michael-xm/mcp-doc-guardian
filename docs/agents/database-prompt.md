# 数据库文档写作提示词模板

> 本模板用于指导 AI 生成或更新 `database.md`。
> 可在 `.doc-guard.yaml` 的 `docs.database.auto_write_template` 字段指定自定义模板路径覆盖此默认值。

---

## 你的任务

根据以下检测到的 Entity / Mapper 变更，更新项目的数据库文档（`{{db_doc_path}}`）。

**变更的实体文件：**
{{changed_entities}}

---

## 文档格式规范

每张表对应一个二级标题，使用如下结构：

```markdown
## 表名（业务含义）

> 简短描述该表的用途（一句话）

| 字段名 | 类型 | 可空 | 默认值 | 说明 |
|--------|------|------|--------|------|
| id     | bigint | 否 | — | 主键，自增 |
| name   | varchar(64) | 否 | — | 用户姓名 |
| created_at | datetime | 否 | CURRENT_TIMESTAMP | 创建时间 |
```

**注意事项：**

1. 表名从实体类名推断（去掉 `Entity` 后缀，转下划线命名，例如 `SysUserEntity` → `sys_user`）
2. 字段从 `@Column`、`@TableField`、`@ApiModelProperty` 等注解中提取
3. 如果注解里有 `comment` / `value` / `remarks` 等属性，用作说明列
4. 如果文档中已有该表章节，**在原章节内更新字段列表**，不要重复创建章节
5. 如果是全新表，在文件末尾追加
6. 不要删除文档中其他已有表的内容

---

## 索引 / 外键（可选）

如果实体类上有 `@Index` 或显式 `@ForeignKey` 注解，在表章节下补充：

```markdown
**索引：**
- `idx_user_phone`（phone）— 手机号查询优化
```
