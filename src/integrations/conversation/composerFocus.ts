export const LEGACY_COMPOSER_OWNER = 'legacy-input-bar'
export const NEXT_COMPOSER_OWNER = 'conversation-composer'

let activeOwnerId: string | null = null

export function setActiveComposerOwner(ownerId: string) {
  activeOwnerId = ownerId
}

export function clearActiveComposerOwner(ownerId: string) {
  if (activeOwnerId === ownerId) activeOwnerId = null
}

export function isComposerFocused(ownerId: string) {
  const active = document.activeElement
  const focusedOwnerId = active instanceof HTMLElement
    ? active.closest<HTMLElement>('[data-composer-owner]')?.dataset.composerOwner
    : null
  return (focusedOwnerId ?? activeOwnerId) === ownerId
}

export function isComposerEventTarget(target: EventTarget | null, ownerId: string) {
  return target instanceof Element && target.closest<HTMLElement>('[data-composer-owner]')?.dataset.composerOwner === ownerId
}
