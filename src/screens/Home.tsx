import { useEffect } from 'react'
import { navigate } from '../router'
import { useProgress } from '../store/progress'
import { localDay } from '../store/sessions'
import { goalProgress, practiceSecondsForDay } from '../store/pianoRewards'
import { cubeStatusText, ensureTodaysPlan, readTodaysPlan, tomorrowsMission } from '../store/dailyPlan'
import { LESSON_LIST } from '../content/lessons'
import { SayIt } from '../components/SayIt'
import { ActivityCard } from '../components/ActivityCard'
import { TokenPill } from '../components/TokenPill'
import { NoteCard } from '../components/NoteCard'
import { BadgeToast } from '../components/BadgeToast'

export function Home() {
  const progress = useProgress()
  const profile = progress.profiles.kid
  const kidName = progress.settings.kidName
  const greeting = `Hi ${kidName}! What do you want to practice today?`
  const today = localDay()
  const cubeDoneToday = profile.sessions.some((s) => s.day === today)
  // Persist today's plan once (a store write), but render from the read-only copy.
  useEffect(() => {
    ensureTodaysPlan(today)
  }, [today])
  const cubePlan = readTodaysPlan(today)
  const tomorrow = cubePlan.mission?.doneAt ? tomorrowsMission(cubePlan, LESSON_LIST) : undefined
  const cubeStatus = tomorrow
    ? `Done today ✅ · Tomorrow: ${tomorrow.title}`
    : cubeStatusText(cubePlan, kidName)
  const pianoGoal = progress.settings.goalMinutes.piano
  const pianoCountMode = progress.settings.pianoCountMode ?? 'recording'
  const pianoCountedSec = practiceSecondsForDay(progress.piano.takes, today, pianoCountMode)
  const pianoDoneToday = Boolean(progress.piano.days[today]?.goalReachedAt)
  const pianoProgress = pianoDoneToday ? 1 : goalProgress(pianoCountedSec, pianoGoal)
  const pianoMinutesLeft = Math.max(1, Math.ceil(pianoGoal - pianoCountedSec / 60))
  const pianoStatus = pianoDoneToday
    ? 'Done today ✅'
    : pianoCountedSec > 0
      ? `▶ ${pianoMinutesLeft} more min`
      : `▶ ${pianoGoal} min`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <BadgeToast />
      <NoteCard />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{greeting}</h1>
        <SayIt text={greeting} />
      </div>

      <ActivityCard
        emoji="🧊"
        title="Cube"
        ringProgress={cubeDoneToday ? 1 : 0}
        streak={profile.streak.current}
        status={cubeStatus}
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
