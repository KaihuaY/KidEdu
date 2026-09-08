// The app used to let a grown-up switch into a separate "parent" profile
// with its own progress/unlocks. That role is gone - everything is the
// kid's profile now. Every screen was simplified to use the 'kid' profile
// directly, but this hook is kept (returning the constant 'kid') for any
// code that still wants a ProfileId without a hard-coded literal.

export type ProfileId = 'kid' | 'parent'

export function useActiveProfile(): ProfileId {
  return 'kid'
}
