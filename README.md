# Minecraft Item Doll Generator

基于 Nuxt 4、TypeScript、Tailwind CSS 与 JSZip 的纯前端静态工具，用于把 Minecraft 物品配置成“玩家皮肤玩偶物品”资源包并下载为 `.zip`。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run check
npm test
npm run generate
```

## 核心目录

- `public/pack_template/`
  打包时原样保留的基础资源包模板，至少包含 `pack.mcmeta`、`pack.png`、`README.md` 与模型模板。
- `public/model-presets.json`
  定义 model preset 的声明模板与生成规则。
- `public/previews/`
  预设预览图目录。文件名规则为 `{templateType}.png`，例如 `holding_item.png`。
- `public/locales/`
  i18n 语言文件目录，当前包含 `zh_cn.json`、`en_us.json`、`zh_hk.json`。

## model-presets.json 结构

顶层 key 必须是英文的 `templateType`，例如：

```json
{
  "holding_item": {
    "declaration": {
      "model": {
        "type": "minecraft:model",
        "model": "playerdollitems:item/{{namespace}}/{{key}}"
      }
    },
    "generation": [
      {
        "path": "assets/playerdollitems/models/item/{{namespace}}/{{key}}.json",
        "content": {
          "parent": "playerdollitems:template/{{skinType}}/{{templateType}}",
          "textures": {
            "skin": "playerdollitems:item/doll/{{skinType}}_{{assetStem}}",
            "item": "{{namespace}}:item/{{key}}"
          }
        }
      }
    ]
  }
}
```

## Supported Placeholders

以下占位符目前都可在 `declaration`、`generation[].path` 与 `generation[].content` 中使用：

- `{{namespace}}`
  物品命名空间，例如 `minecraft` 或 `my_mod`
- `{{key}}`
  物品 key，例如 `golden_apple`
- `{{skinType}}`
  皮肤类型，值为 `steve` 或 `alex`
- `{{templateType}}`
  当前 preset 的类型，也就是 `model-presets.json` 的顶层 key，例如 `holding_item`
- `{{id}}`
  当前 preset 的英文 id；当前实现与 `{{templateType}}` 等价
- `{{assetStem}}`
  经过命名空间安全处理后的资源名，例如 `minecraft:golden_apple -> golden_apple`，`my_mod:ruby_sword -> my_mod__ruby_sword`

## 模板命名规则

- 单物品模型路径：
  `assets/playerdollitems/models/item/{{namespace}}/{{key}}.json`
- 工具双模型路径：
  `assets/playerdollitems/models/item/{{namespace}}/{{key}}/mainhand.json`
  `assets/playerdollitems/models/item/{{namespace}}/{{key}}/offhand.json`
- 模板父模型路径：
  `assets/playerdollitems/models/template/{{skinType}}/{{templateType}}.json`
  `assets/playerdollitems/models/template/{{skinType}}/{{templateType}}/mainhand.json`
  `assets/playerdollitems/models/template/{{skinType}}/{{templateType}}/offhand.json`

## i18n 规则

- 语言文件位于 `public/locales/`
- 预设名称使用 `model.type.{templateType}`
- 皮肤类型名称使用 `skin.type.steve` 与 `skin.type.alex`
- 其它组件文案统一使用 `component.*` 与 `app.*` 前缀
