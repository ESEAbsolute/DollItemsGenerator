import { describe, expect, it } from 'vitest'

import {
  buildGeneratedFiles,
  buildPlayerDollDeclaration,
  createDemoRow,
  type ModelPresetDefinition,
  mergeServerOverrideJson,
  parseItemId,
  prepareServerOverrideText
} from '../app/composables/usePackGenerator'

const holdingItemPreset: ModelPresetDefinition = {
  id: 'holding_item',
  previewImage: '/previews/holding_item.png',
  declaration: {
    model: {
      type: 'minecraft:model',
      model: 'playerdollitems:item/{{namespace}}/{{key}}'
    }
  },
  generation: [
    {
      path: 'assets/playerdollitems/models/item/{{namespace}}/{{key}}.json',
      content: {
        parent: 'playerdollitems:template/{{skinType}}/{{templateType}}',
        textures: {
          skin: 'playerdollitems:item/doll/{{skinType}}_{{assetStem}}',
          item: '{{namespace}}:item/{{key}}'
        }
      }
    }
  ]
}

const huggingToolPreset: ModelPresetDefinition = {
  id: 'hugging_tool',
  previewImage: '/previews/hugging_tool.png',
  declaration: {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:display_context',
      cases: [
        {
          when: ['firstperson_lefthand', 'thirdperson_lefthand'],
          model: {
            type: 'minecraft:model',
            model: 'playerdollitems:item/{{namespace}}/{{key}}/offhand'
          }
        }
      ],
      fallback: {
        type: 'minecraft:model',
        model: 'playerdollitems:item/{{namespace}}/{{key}}/mainhand'
      }
    }
  },
  generation: [
    {
      path: 'assets/playerdollitems/models/item/{{namespace}}/{{key}}/mainhand.json',
      content: {
        parent: 'playerdollitems:template/{{skinType}}/{{templateType}}/mainhand',
        textures: {
          skin: 'playerdollitems:item/doll/{{skinType}}_{{assetStem}}',
          tool: '{{namespace}}:item/{{key}}'
        }
      }
    },
    {
      path: 'assets/playerdollitems/models/item/{{namespace}}/{{key}}/offhand.json',
      content: {
        parent: 'playerdollitems:template/{{skinType}}/{{templateType}}/offhand',
        textures: {
          skin: 'playerdollitems:item/doll/{{skinType}}_{{assetStem}}',
          tool: '{{namespace}}:item/{{key}}'
        }
      }
    }
  ]
}

describe('usePackGenerator helpers', () => {
  it('parses namespaced keys and keeps mod namespace in asset stem', () => {
    expect(parseItemId('my_mod:ruby_sword')).toEqual({
      namespace: 'my_mod',
      key: 'ruby_sword',
      assetStem: 'my_mod__ruby_sword'
    })
  })

  it('defaults namespace to minecraft when only item key is provided', () => {
    expect(parseItemId('golden_apple')).toEqual({
      namespace: 'minecraft',
      key: 'golden_apple',
      assetStem: 'golden_apple'
    })
  })

  it('builds declaration using the selected preset instead of item name guessing', () => {
    const parsed = parseItemId('minecraft:wooden_pickaxe')

    expect(buildPlayerDollDeclaration(parsed, huggingToolPreset, 'alex')).toEqual({
      model: {
        type: 'minecraft:select',
        property: 'minecraft:display_context',
        cases: [
          {
            when: ['firstperson_lefthand', 'thirdperson_lefthand'],
            model: {
              type: 'minecraft:model',
              model: 'playerdollitems:item/minecraft/wooden_pickaxe/offhand'
            }
          }
        ],
        fallback: {
          type: 'minecraft:model',
          model: 'playerdollitems:item/minecraft/wooden_pickaxe/mainhand'
        }
      }
    })
  })

  it('replaces vanilla fallback model nodes inside server override json', () => {
    const parsed = parseItemId('minecraft:totem_of_undying')
    const declaration = buildPlayerDollDeclaration(parsed, holdingItemPreset, 'alex')
    const merged = mergeServerOverrideJson(
      JSON.stringify({
        model: {
          type: 'minecraft:condition',
          on_true: {
            type: 'minecraft:model',
            model: 'other_pack:item/void_totem'
          },
          on_false: {
            type: 'minecraft:model',
            model: 'minecraft:item/totem_of_undying'
          }
        }
      }),
      parsed,
      declaration
    ) as { model: { on_false: unknown } }

    expect(merged.model.on_false).toEqual(declaration.model)
  })

  it('builds tool item files for the default demo row after switching item id', () => {
    const row = createDemoRow('hugging_tool')
    row.itemId = 'minecraft:wooden_pickaxe'
    row.modelTypeId = 'hugging_tool'
    row.serverOverrideName = null
    row.serverOverrideText = ''
    const files = buildGeneratedFiles(row, huggingToolPreset)

    expect(Object.keys(files)).toContain('assets/minecraft/items/wooden_pickaxe.json')
    expect(Object.keys(files)).toContain('assets/playerdollitems/models/item/minecraft/wooden_pickaxe/mainhand.json')
    expect(Object.keys(files)).toContain('assets/playerdollitems/models/item/minecraft/wooden_pickaxe/offhand.json')
  })

  it('rejects server override json when the current item id is not referenced', () => {
    expect(() =>
      prepareServerOverrideText(
        JSON.stringify({
          model: {
            type: 'minecraft:model',
            model: 'minecraft:iron_sword'
          }
        }),
        'minecraft:totem_of_undying'
      )
    ).toThrow('该 Json 中需要包含导向原版模型的 fallback，即需要包含 "minecraft:item/totem_of_undying"。')
  })

  it('formats server override json when it references the current item id', () => {
    expect(
      prepareServerOverrideText(
        '{"model":{"type":"minecraft:model","model":"minecraft:item/totem_of_undying"}}',
        'minecraft:totem_of_undying'
      )
    ).toBe(
      '{\n' +
        '  "model": {\n' +
        '    "type": "minecraft:model",\n' +
        '    "model": "minecraft:item/totem_of_undying"\n' +
        '  }\n' +
        '}'
    )
  })

  it('does not block override json formatting when item id is still invalid', () => {
    expect(
      prepareServerOverrideText(
        '{"model":{"type":"minecraft:model","model":"minecraft:item/netherite_pickaxe"}}',
        ''
      )
    ).toBe(
      '{\n' +
        '  "model": {\n' +
        '    "type": "minecraft:model",\n' +
        '    "model": "minecraft:item/netherite_pickaxe"\n' +
        '  }\n' +
        '}'
    )
  })

  it('validates server override json against minecraft namespace when item id omits namespace', () => {
    expect(
      prepareServerOverrideText(
        '{"model":{"type":"minecraft:model","model":"minecraft:item/netherite_pickaxe"}}',
        'netherite_pickaxe'
      )
    ).toBe(
      '{\n' +
        '  "model": {\n' +
        '    "type": "minecraft:model",\n' +
        '    "model": "minecraft:item/netherite_pickaxe"\n' +
        '  }\n' +
        '}'
    )
  })
})
