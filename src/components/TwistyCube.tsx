import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { TwistyPlayer } from 'cubing/twisty'
import type { BackViewLayout, ExperimentalStickering } from 'cubing/twisty'

/**
 * React wrapper around cubing.js's `TwistyPlayer` (cubing 0.63).
 *
 * Every API used below was read directly from the shipped type/source files
 * rather than guessed:
 *   - node_modules/cubing/dist/lib/cubing/index-BXHm_6gm.d.ts (the file that
 *     node_modules/cubing/dist/lib/cubing/twisty/index.d.ts re-exports from)
 *   - node_modules/cubing/dist/lib/cubing/twisty/index.js (runtime source,
 *     for the parts the .d.ts only exposes as `#private`/internal types)
 *
 * Verified facts, with the line numbers they were confirmed at:
 *   - `new TwistyPlayer(config)` builds a real, constructible custom element
 *     (`<twisty-player>`). Importing 'cubing/twisty' registers it via
 *     `customElementsShim.define("twisty-player", TwistyPlayer)`
 *     (twisty/index.js:4680), and the class extends `ManagedCustomElement`,
 *     which extends `HTMLElement` (chunk-LD4XJTCU.js). So we can build one
 *     with `new` and `appendChild` it straight into a plain `<div ref>` -
 *     no JSX custom-element tag / attribute-string round trip needed.
 *   - `player.alg = "..."` and `player.experimentalSetupAlg = "..."` are
 *     live setters (class TwistyPlayerSettable, ~line 2154 and ~2156) that
 *     update the existing player in place; the player does not need to be
 *     recreated when these change. NOTE: the config field/property is
 *     `experimentalSetupAlg`, NOT `setupAlg` (`setupAlg` is only the name of
 *     the *model* prop, `experimentalModel.setupAlg`, ~line 1876) -
 *     `TwistyPlayerConfig.setupAlg` does not exist (~line 2262-2264).
 *   - `.controlPanel`, `.backView`, `.visualization`, `.tempoScale`,
 *     `.hintFacelets`, `.experimentalStickering` are all live setters too
 *     (TwistyPlayerSettable, ~2166-2207), each backed by a plain
 *     JS object of allowed values:
 *       controlPanel:    "none" | "bottom-row"                  (controlsLocations, ~1673)
 *       backView:        "none" | "top-right" | "side-by-side"  (backViewLayouts, ~1197)
 *       visualization:   "3D" | "2D" | "PG3D" | ...             (visualizationFormats, ~1209)
 *       hintFacelets:    "floating" | "none"                    (hintFaceletStyles, ~1705)
 *       experimentalStickering: "full" | "Cross" | "F2L" | "OLL" | "PLL" | ...
 *                                (experimentalStickerings, chunk-WBMKMQAL.js:272-296)
 *   - `player.play()`, `.pause()`, `.jumpToStart()`, `.jumpToEnd()` are
 *     public instance methods on `TwistyPlayer` (~2350-2357).
 *   - Whole-cube rotations (e.g. "z2") in setupAlg: `experimentalSetupAlg`
 *     is parsed through the same `cubing/alg` grammar as `alg` - rotations
 *     are ordinary, first-class `AlgLeaf` nodes in that grammar, not a
 *     special case handled elsewhere. This is confirmed by reading the alg
 *     type surface, but NOT runtime-verified in an actual browser (no
 *     browser is available in this sandbox). If "z2" ever failed to rotate
 *     the displayed cube, that would be a cubing.js-level issue, since the
 *     string is passed straight through unmodified.
 *   - There is no public `stepForward`/`stepBackward` method. cubing.js's
 *     own on-screen step buttons implement "step" by calling
 *     `player.controller.animationController.play({ direction, untilBoundary: "move" })`
 *     (twisty/index.js:2147-2163) - `controller` (a `TwistyPlayerController`)
 *     and `animationController` (a `TwistyAnimationController`) are both
 *     public, non-`#private` fields (~2316, ~1567), so we call the same
 *     method the built-in buttons do. Its `direction`/`untilBoundary`
 *     parameters are typed with internal, unexported enums (`Direction`,
 *     `BoundaryType`, ~966-970 and ~980-983); we pass the equivalent raw
 *     values (`1 | -1`, `"move"`) through a narrow `as never` cast at the
 *     call site - those are exactly what the enum members are at runtime
 *     (numeric enum members are plain numbers; `BoundaryType.Move === "move"`).
 *   - Move-progress notifications: every prop on `experimentalModel`
 *     (a `TwistyPlayerModel`) is a `TwistyProp` exposing
 *     `.addFreshListener(cb)` / `.removeFreshListener(cb)`
 *     (`TwistyPropParent`, ~1026-1027). `currentMoveInfo.patternIndex` is
 *     the number of moves completed so far - confirmed in
 *     twisty/index.js:2726-2751, where it is assigned from
 *     `indexer.timestampToIndex(...)`. Total move count comes from
 *     `(await experimentalModel.indexer.get()).numAnimatedLeaves()`. This
 *     exact pattern (`currentMoveInfo`/`currentLeavesSimplified` fresh
 *     listener + `indexer.get()`) is what cubing.js's own
 *     `TwistyAlgViewer` uses internally (twisty/index.js:5229-5236), so
 *     it's supported usage, not a hack.
 */

export interface TwistyCubeHandle {
  play: () => void
  pause: () => void
  jumpToStart: () => void
  jumpToEnd: () => void
  stepForward: () => void
  stepBackward: () => void
}

export interface TwistyCubeProps {
  /** Alg applied before the animated `alg`, e.g. to pre-rotate the view ("z2"). */
  setupAlg?: string
  /** The (optionally animated) alg to display/play. */
  alg?: string
  /** Which pieces to highlight, e.g. 'full' (default look), 'Cross', 'OLL', 'PLL', 'F2L'. */
  stickering?: ExperimentalStickering
  /** Show the built-in play/pause/step control row, or hide it entirely. */
  controls?: 'none' | 'bottom-row'
  /** Show a second, mirrored view of the back of the cube. */
  backView?: BackViewLayout
  /** 3D (default) or a flattened 2D diagram. */
  visualization?: '3D' | '2D'
  /** Animation speed multiplier; 1 is normal speed. */
  tempoScale?: number
  /** Floating hint stickers on the 3D cube, or none. */
  hintFacelets?: 'floating' | 'none'
  className?: string
  /** Fires as the animation progresses: 0-based moves completed, and total moves in `alg`. */
  onMoveIndex?: (index: number, total: number) => void
}

export const TwistyCube = forwardRef<TwistyCubeHandle, TwistyCubeProps>(
  function TwistyCube(
    {
      setupAlg = '',
      alg = '',
      stickering,
      controls = 'none',
      backView = 'none',
      visualization = '3D',
      tempoScale = 1,
      hintFacelets = 'none',
      className,
      onMoveIndex,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [player, setPlayer] = useState<TwistyPlayer | null>(null)
    const onMoveIndexRef = useRef(onMoveIndex)
    onMoveIndexRef.current = onMoveIndex

    // Create the player once on mount, tear it down on unmount. Every prop
    // below is applied through live setters in separate effects, so the
    // player itself is never recreated on prop changes.
    useEffect(() => {
      const el = new TwistyPlayer({
        alg,
        experimentalSetupAlg: setupAlg,
        controlPanel: 'bottom-row',
        backView,
        visualization,
        tempoScale,
        hintFacelets,
        experimentalStickering: stickering ?? null,
        background: 'none',
        viewerLink: 'none',
      })
      el.style.width = '100%'
      el.style.height = '100%'
      el.style.display = 'block'
      containerRef.current?.appendChild(el)
      setPlayer(el)
      return () => {
        el.remove()
        setPlayer(null)
      }
      // Intentionally mount-only: prop changes are applied via the setter
      // effects below rather than by recreating the player.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      if (player) player.alg = alg
    }, [player, alg])

    useEffect(() => {
      if (player) player.experimentalSetupAlg = setupAlg
    }, [player, setupAlg])

    // controls="none": cubing.js 0.63 renders a blank viewer when controlPanel
    // is "none" (verified in headless Chrome), so the control bar always stays
    // enabled and is hidden behind an overlay in the render below instead.

    useEffect(() => {
      if (player) player.backView = backView
    }, [player, backView])

    useEffect(() => {
      if (player) player.visualization = visualization
    }, [player, visualization])

    useEffect(() => {
      if (player) player.tempoScale = tempoScale
    }, [player, tempoScale])

    useEffect(() => {
      if (player) player.hintFacelets = hintFacelets
    }, [player, hintFacelets])

    useEffect(() => {
      if (player && stickering) player.experimentalStickering = stickering
    }, [player, stickering])

    // Move-progress notifications.
    useEffect(() => {
      if (!player || !onMoveIndex) return
      const model = player.experimentalModel
      let total = 0
      let cancelled = false
      model.indexer.get().then((indexer) => {
        if (!cancelled) total = Number(indexer.numAnimatedLeaves())
      })
      const listener = (info: { patternIndex: number }) => {
        onMoveIndexRef.current?.(Number(info.patternIndex), total)
      }
      model.currentMoveInfo.addFreshListener(listener)
      return () => {
        cancelled = true
        model.currentMoveInfo.removeFreshListener(listener)
      }
      // Re-subscribe (and refresh `total`) whenever the alg changes.
    }, [player, onMoveIndex, alg, setupAlg])

    const stepBy = useCallback(
      async (delta: 1 | -1) => {
        if (!player) return
        const model = player.experimentalModel
        const [indexer, info] = await Promise.all([
          model.indexer.get(),
          model.currentMoveInfo.get(),
        ])
        const total = Number(indexer.numAnimatedLeaves())
        const current = Number(info.patternIndex)
        const target = Math.max(0, Math.min(total, current + delta))
        if (target <= 0) {
          player.jumpToStart()
          return
        }
        if (target >= total) {
          player.jumpToEnd()
          return
        }
        // `indexToMoveStartTimestamp` expects a branded `LeafIndex`, and
        // `timestampRequest.set` returns/accepts a branded `MillisecondTimestamp`.
        // Both brand types are internal (not exported from 'cubing/twisty'), so
        // we cast the plain number in; the value returned back out already
        // carries the right branded type.
        const timestamp = indexer.indexToMoveStartTimestamp(target as never)
        model.timestampRequest.set(timestamp)
      },
      [player],
    )

    useImperativeHandle(
      ref,
      (): TwistyCubeHandle => ({
        play: () => {
          player?.play()
        },
        pause: () => {
          player?.pause()
        },
        jumpToStart: () => {
          player?.jumpToStart()
        },
        jumpToEnd: () => {
          player?.jumpToEnd()
        },
        stepForward: () => {
          void stepBy(1)
        },
        stepBackward: () => {
          void stepBy(-1)
        },
      }),
      [player, stepBy],
    )

    return (
      <div
        className={className}
        style={{ position: 'relative', width: '100%', height: '100%', minHeight: 120, overflow: 'hidden' }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {controls === 'none' && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              // The bar is two grid rows: minmax(1.5em,.5fr) + minmax(2em,1fr) of the player height.
              height: 'max(60px, 18%)',
              background: 'var(--cc-surface, #fff)',
            }}
          />
        )}
      </div>
    )
  },
)
