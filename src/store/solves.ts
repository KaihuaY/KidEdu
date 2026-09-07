// Shared "log a completed solve" logic, used by both HelpMyCube.tsx (a
// guided walkthrough finishing) and SolveLog.tsx (the manual stopwatch).
// Centralised here so "what counts as this profile's first-ever solve" and
// the token/celebration rule around it can't drift between the two screens.

import { update, type ProgressDoc } from './progress'

export interface LogSolveResult {
  firstEverForProfile: boolean
}

/**
 * Records a solve for `profileId` (seconds may be null - "logged without a
 * time"). The very first solve a profile ever logs is a guaranteed gold
 * token and a bigger celebration; every solve after that earns a silver
 * token, matching SolveLog's stopwatch flow.
 */
export function logSolve(profileId: 'kid' | 'parent', seconds: number | null): LogSolveResult {
  let firstEverForProfile = false

  update('solveLog', (solveLog: ProgressDoc['solveLog']) => {
    firstEverForProfile = !solveLog.solves.some((s) => s.profile === profileId)
    return {
      ...solveLog,
      solves: [...solveLog.solves, { at: Date.now(), seconds, profile: profileId }],
    }
  })

  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const tier = firstEverForProfile ? 'gold' : 'silver'
    return {
      ...profiles,
      [profileId]: {
        ...profile,
        tokens: { ...profile.tokens, [tier]: profile.tokens[tier] + 1 },
      },
    }
  })

  return { firstEverForProfile }
}
