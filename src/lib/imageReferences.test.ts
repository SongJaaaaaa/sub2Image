import { describe, expect, it } from 'vitest'

import type { PromptProject } from '../features/promptStudio'
import type { AgentConversation, TaskRecord } from '../types'
import { collectReferencedImageIds } from './imageReferences'

describe('imageReferences', () => {
  it('collects every persisted and draft image source including prompt projects', async () => {
    const task = {
      inputImageIds: ['task-input'],
      maskTargetImageId: 'task-mask-target',
      maskImageId: 'task-mask',
      outputImages: ['task-output'],
      transparentOriginalImages: ['task-original'],
      streamPartialImageIds: ['task-partial'],
    } as TaskRecord
    const conversation = {
      rounds: [{
        inputImageIds: ['round-input'],
        maskTargetImageId: 'round-mask-target',
        maskImageId: 'round-mask',
      }],
      messages: [{
        inputImageIds: ['message-input'],
        maskTargetImageId: 'message-mask-target',
        maskImageId: 'message-mask',
      }],
    } as AgentConversation
    const project = {
      source: {
        assets: [{ id: 'project-asset', type: 'image', label: '项目素材' }],
      },
    } as PromptProject

    const ids = await collectReferencedImageIds({
      tasks: [task],
      agentConversations: [conversation],
      agentInputDrafts: {
        conversation: {
          inputImages: [{ id: 'agent-draft' }],
          maskDraft: { targetImageId: 'agent-mask-target' },
          maskEditorImageId: 'agent-mask-editor',
        },
      },
      galleryInputDraft: {
        inputImages: [{ id: 'gallery-draft' }],
        maskDraft: { targetImageId: 'gallery-mask-target' },
        maskEditorImageId: 'gallery-mask-editor',
      },
      inputImages: [{ id: 'current-input' }],
      maskDraft: { targetImageId: 'current-mask-target' },
      maskEditorImageId: 'current-mask-editor',
    }, [project])

    expect([...ids].sort()).toEqual([
      'agent-draft',
      'agent-mask-editor',
      'agent-mask-target',
      'current-input',
      'current-mask-editor',
      'current-mask-target',
      'gallery-draft',
      'gallery-mask-editor',
      'gallery-mask-target',
      'message-input',
      'message-mask',
      'message-mask-target',
      'project-asset',
      'round-input',
      'round-mask',
      'round-mask-target',
      'task-input',
      'task-mask',
      'task-mask-target',
      'task-original',
      'task-output',
      'task-partial',
    ])
  })
})
