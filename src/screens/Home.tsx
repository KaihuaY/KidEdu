import { navigate } from '../router'
import { useProgress } from '../store/progress'
import { useActiveProfile } from '../store/activeProfile'
import { localDay } from '../store/sessions'
import { activeSecondsForDay, goalProgress } from '../store/pianoRewards'
import { SayIt } from '../components/SayIt'
import { ActivityCard } from '../components/ActivityCard'
import { TokenPill } from '../components/TokenPill'

export function Home() {
  const progress = useProgress()
  const activeProfile = useActiveProfile()
  const profile = progress.profiles[activeProfile]
  const kidName = progress.settings.kidName
  const greeting = `Hi ${kidName}! What do you want to practice today?`
  const today = localDay()
  const cubeDoneToday = profile.sessions.some((s) => s.day === today)
  const pianoGoal = progress.settings.goalMinutes.piano
  const pianoActiveSec = activeSecondsForDay(progress.piano.takes, today)
  const pianoDoneToday = Boolean(progress.piano.days[today]?.goalReachedAt)
  const pianoProgress = pianoDoneToday ? 1 : goalProgress(pianoActiveSec, pianoGoal)
  const pianoMinutesLeft = Math.max(1, Math.ceil(pianoGoal - pianoActiveSec / 60))
  const pianoStatus = pianoDoneToday
    ? 'Done today ✅'
    : pianoActiveSec > 0
      ? `▶ ${pianoMinutesLeft} more min`
      : `▶ ${pianoGoal} min`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{greeting}</h1>
        <SayIt text={greeting} />
      </div>

      <ActivityCard
        emoji="🧊"
        title="Cube"
        ringProgress={cubeDoneToday ? 1 : 0}
        streak={profile.streak.current}
        status={cubeDoneToday ? 'Done today ✅' : `▶ ${progress.settings.goalMinutes.cube} min`}
        onClick={() => navigate('/cube')}
      />

      <ActivityCard
        emoji="🎹"
        title="Piano"
        ringProgress={pianoProgress}
        streak={progress.piano.streak.current}
        status={pianoStatus}
        onClick={() => navigate('/piano')}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <TokenPill tokens={profile.tokens} />
        <button type="button" className="cc-btn cc-btn-primary" onClick={() => navigate('/box')} style={{ flex: 1 }}>
          🎁 Open a box
        </button>
      </div>
    </div>
  )
}
