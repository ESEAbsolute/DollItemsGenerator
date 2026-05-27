Encoding: UTF-8

A series of squarelize Minecraft resourcepack  
作者：千虑智者  
原帖：https://www.bilibili.com/video/BV1Zw411S7DS  
本作品采用知识共享署名-非商业性使用-相同方式共享 4.0 国际许可协议进行许可。  
遵循以下协议： https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh  
转载务必附上作者及原贴，禁止商业用途的转载和发布

=======================================================================

二改：ESEAbsolute | Created by DollItemsGenerator. 
Source: https://github.com/ESEAbsolute/DollItemsGenerator

生成器的 preset 配置位于 `public/model-presets.json`，支持以下占位符：  
`{{namespace}}`、`{{key}}`、`{{skinType}}`、`{{templateType}}`、`{{id}}`、`{{assetStem}}`  

当前生成规则中：
- `{{templateType}}` 即 preset 类型，例如 `holding_item` 与 `hugging_tool`
- `{{id}}` 当前与 `{{templateType}}` 等价
- `public/previews/{templateType}.png` 会被自动识别为预设预览图

`assets/minecraft/items` 放想要的物品；  
`assets/playerdollitems/textures/item/doll` 放的是玩家皮肤；  
`assets/playerdollitems/models/item` 放具体的模型，抄就行了；  
物品可以抄 `assets/playerdollitems/models/item/minecraft/golden_carrot.json`；  
工具可以抄 `assets/playerdollitems/models/item/minecraft/wooden_pickaxe/`。

------------------------

## 具体修改指引

这个包的运作逻辑可以被感性理解成：
1. 把物品套上「该材质包中的模型」；
2. 「该材质包中的模型」调用「模型模板」；
3. 填入「模型模板」的参数包含玩家的皮肤和 Minecraft 的物品。

具体的，修改过程是：

### 于 `assets/minecraft/items/` 内

若是物品，则使用人偶手持：

```json
{
    "model": {
        "type": "minecraft:model",
        "model": "playerdollitems:item/minecraft/golden_apple"
    }
}
```

若是工具，则使用人偶抱住：

```json
{
    "model": {
        "type": "minecraft:select",
        "property": "minecraft:display_context",
        "cases": [
            {
                "when": [
                    "firstperson_lefthand",
                    "thirdperson_lefthand"
                ],
                "model": {
                    "type": "minecraft:model",
                    "model": "playerdollitems:item/minecraft/wooden_pickaxe/offhand"
                }
            }
        ],
        "fallback": {
            "type": "minecraft:model",
            "model": "playerdollitems:item/minecraft/wooden_pickaxe/mainhand"
        }
    }
}
```

### 于 `assets/playerdollitems/models/item/` 内

直接套用模板，填入参数即可。

```json
{
	"parent": "playerdollitems:template/steve/holding_item",
	"textures": {
		"skin": "playerdollitems:item/doll/steve_golden_apple",
		"item": "minecraft:item/golden_apple"
	}
}
```

如果是工具，则需要创建一个名为其 id 的文件夹（如 `wooden_pickaxe`），里面放入 `mainhand.json` 和 `offhand.json`，内容分别为：

```json
{
	"parent": "playerdollitems:template/alex/hugging_tool/mainhand",
	"textures": {
		"skin": "playerdollitems:item/doll/alex_wooden_pickaxe",
		"tool": "minecraft:item/wooden_pickaxe"
	}
}
```

与

```json
{
	"parent": "playerdollitems:template/alex/hugging_tool/offhand",
	"textures": {
		"skin": "playerdollitems:item/doll/alex_wooden_pickaxe",
		"tool": "minecraft:item/wooden_pickaxe"
	}
}
```

即可。两个文件只有 parent 是不同的。

### 于 `assets/playerdollitems/textures/item/doll/` 内

放入名为 模型 + 下划线 + 物品 id 的玩家皮肤。例如说 `steve_golden_apple.png` 和 `alex_wooden_pickaxe.png`。

------------------------

## 进阶修改指引

本指引旨在让这个材质包适配服务器的专属材质包。
考虑到专属材质包会设置一些规则提前拦截指定物品，使玩家的材质无法生效，所以这个指引提供了一个方法。使用该方法前建议咨询服务器方是否允许。

### 获取服务器资源

首先，在获得允许的情况下，你需要对服务器发放的材质包进行解包。此处恕不提供解包工具建议。

接下来，你需要查看服务器资源包于 `assets/minecraft/items/` 路径下的同名文件。

此处以 `totem_of_undying.json` 和 `netherite_pickaxe.json` 为例：
```json
{
    "model": {
        "type": "minecraft:condition",
        "property": "minecraft:component",
        "predicate": "minecraft:enchantments",
        "value": [{"enchantments": "tcc:attribute/void_totem"}],
        "on_true": {
            "type": "minecraft:model",
            "model": "neotcc:item/void_totem"
        },
        "on_false": {
            "type": "minecraft:model",
            "model": "minecraft:totem_of_undying"
        }
    }
}
```

与

```json
{
    "model": {
        "type": "minecraft:select",
        "property": "minecraft:custom_model_data",
        "cases": [
            {
                "when": ["hefty"],
                "model": {
                    "type": "minecraft:model",
                    "model": "incendium:item/hefty"
                }
            },
            {
                "when": ["emerald_pickaxe"],
                "model": {
                    "type": "minecraft:model",
                    "model": "neotcc:item/craftsy/emerald_pickaxe"
                }
            }
        ],
        "fallback": {
            "type": "minecraft:model",
            "model": "minecraft:item/netherite_pickaxe"
        }
    }
}
```

在这里，你可以看到逻辑分别是：

- 检测不死图腾的附魔
1. 若存在：使用模型 `neotcc:item/void_totem`
2. 若不存在：使用模型 `minecraft:totem_of_undying`（回退到 Minecraft 原版模型）

- 检测下界合金镐的 custom_model_data
1. 如果是 `"hefty"`：使用模型 `incendium:item/hefty`
2. 如果是 `"emerald_pickaxe"`：使用模型 `neotcc:item/craftsy/emerald_pickaxe`
3. 否则：使用模型 `minecraft:item/netherite_pickaxe`（回退到 Minecraft 原版模型）

于是当这个服务器材质包在该材质包上面时，该材质包不会生效。

### 修改

我们只需要把上述服务器材质包中「回退到原版模型」的部分改成「回退到本材质包的模型」即可。

在上面的例子中，我们需要把服务器提供的 `totem_of_undying.json` 中的 `on_false` 与该材质包中的 `totem_of_undying.json` 合并，于是我们获得了

```json
{
    "model": {
        "type": "minecraft:condition",
        "property": "minecraft:component",
        "predicate": "minecraft:enchantments",
        "value": [{"enchantments": "tcc:attribute/void_totem"}],
        "on_true": {
            "type": "minecraft:model",
            "model": "neotcc:item/void_totem"
        },
        "on_false": {
            "type": "minecraft:model",
            "model": "playerdollitems:item/minecraft/golden_apple"
        }
    }
}
```

我们考虑相对更复杂的工具模型。对于 `netherite_pickaxe.json`，同样是合并：

```json
{
    "model": {
        "type": "minecraft:select",
        "property": "minecraft:custom_model_data",
        "cases": [
            {
                "when": ["hefty"],
                "model": {
                    "type": "minecraft:model",
                    "model": "incendium:item/hefty"
                }
            },
            {
                "when": ["emerald_pickaxe"],
                "model": {
                    "type": "minecraft:model",
                    "model": "neotcc:item/craftsy/emerald_pickaxe"
                }
            }
        ],
        "fallback": {
            "type": "minecraft:select",
            "property": "minecraft:display_context",
            "cases": [
                {
                    "when": [
                        "firstperson_lefthand",
                        "thirdperson_lefthand"
                    ],
                    "model": {
                        "type": "minecraft:model",
                    "model": "playerdollitems:item/minecraft/wooden_pickaxe/offhand"
                    }
                }
            ],
            "fallback": {
                "type": "minecraft:model",
                "model": "playerdollitems:item/minecraft/wooden_pickaxe/mainhand"
            }
        }
    }
}
```

注意到上面把 `fallback` 中的 `type` 直接改了。

也就是说，把回退的模型（Json 节点）赋值为 `r.model` 即可，此处材质包提供的模型声明为 `r`。

理论上可以从 `"model": "minecraft:item/xxxxxxx"` 向上找一层 node，然后替换成 `r.model` 即可。

### 使用

把该资源包放到服务器资源包上面即可。修改贴图（而非模型）的资源包需要放到该资源包上方。

如果服务器的资源包是置顶的，你需要使用一些模组取消服务器资源包的置顶。
