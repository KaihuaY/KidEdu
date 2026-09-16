import { navigate } from '../router'
import { FamilyBoard } from '../components/FamilyBoard'

/** Full-screen family board at #/family - the tap target from the Home card. */
export function Family() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>👭 This week</h1>
      </div>

      <FamilyBoard />

      <button
        type="button"
        className="cc-btn cc-btn-surface"
        onClick={() => navigate('/home')}
        aria-label="Back to Home"
        style={{ alignSelf: 'flex-start' }}
      >
        Back to Home
      </button>
    </div>
  )
}
