import { navigate } from '../router'
import { useProgress } from '../store/progress'
import { useActiveProfile } from '../store/activeProfile'
import { localDay } from '../store/sessions'
import { SayIt } from '../components/SayIt'
import { ActivityCard } from '../components/ActivityCard'
import { TokenPill } from '../components/TokenPill'

export function Home() {
  const progress = useProgress()
  const activeProfile = useActiveProfile()
  const profile = progress.profiles[activeProfile]
  const kidName = progress.settings.kidName
  const greeting = `Hi ${kidName}! What do you want to practice today?`
  const cubeDoneToday = profile.sessions.some((s) => s.day === localDay())

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
        status={cubeDoneToday ? 'Done today ✅' : `▶ ${progress.settings.goalMinutes.cube} minutes`}
        onClick={() => navigate('/cube')}
      />

      <ActivityCard
        emoji="🎹"
        title="Piano"
        ringProgress={0}
        streak={progress.piano.streak.current}
        status={`▶ ${progress.settings.goalMinutes.piano} minutes`}
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
