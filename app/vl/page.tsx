import { headers } from 'next/headers'
import Link from 'next/link'
import { LoopMark } from '../../ui/vl/loop_mark'
import { WaitlistForm } from '../../ui/vl/waitlist_form'

const VlHomePage = async () => {
  const host = (await headers()).get('host') ?? ''
  const homeHref = host.includes('verifiedloops.com') ? '/' : '/vl'

  return (
    <>
      <header className="vl-top">
        <Link href={homeHref} className="vl-wordmark">
          Verified Loops
        </Link>
        <span className="vl-top-meta">Cohort 01 · waitlist</span>
      </header>

      <section className="vl-hero" aria-label="Verified Loops">
        <div className="vl-hero-visual">
          <LoopMark />
        </div>
        <div className="vl-hero-copy">
          <h1 className="vl-brand">Verified Loops</h1>
          <p className="vl-headline">
            Design the system that prompts the agent — then prove it worked.
          </p>
          <p className="vl-support">
            A practical course on loop engineering with independent verification
            and hard stop conditions. Not vibes. Not another prompt pack.
          </p>
          <WaitlistForm />
        </div>
      </section>

      <section className="vl-section" aria-labelledby="vl-what">
        <div className="vl-section-inner">
          <p className="vl-kicker">What this is</p>
          <h2 id="vl-what" className="vl-h2">
            Loop engineering with a receipt.
          </h2>
          <p className="vl-lede">
            Prompting every turn does not scale. Verified Loops teaches you to
            build reusable loops — trigger, goal, check, stop — so agents ship
            work you can trust without you sitting in the middle of every cycle.
          </p>
        </div>
      </section>

      <section className="vl-section" aria-labelledby="vl-anatomy">
        <div className="vl-section-inner">
          <p className="vl-kicker">Anatomy</p>
          <h2 id="vl-anatomy" className="vl-h2">
            Four parts. One closed system.
          </h2>
          <p className="vl-lede">
            If any piece is missing, you still have a chat window with ambition.
          </p>
          <div className="vl-anatomy">
            <div className="vl-step">
              <p className="vl-step-n">01</p>
              <h3 className="vl-step-title">Trigger</h3>
              <p className="vl-step-body">
                Schedule, webhook, or human start. The loop begins without you
                re-prompting.
              </p>
            </div>
            <div className="vl-step">
              <p className="vl-step-n">02</p>
              <h3 className="vl-step-title">Goal</h3>
              <p className="vl-step-body">
                A written, testable outcome. Ambiguity here becomes thrash later.
              </p>
            </div>
            <div className="vl-step">
              <p className="vl-step-n">03</p>
              <h3 className="vl-step-title">Verify</h3>
              <p className="vl-step-body">
                An independent check — tests, lint, second model, human gate.
                Never self-grade alone.
              </p>
            </div>
            <div className="vl-step">
              <p className="vl-step-n">04</p>
              <h3 className="vl-step-title">Stop</h3>
              <p className="vl-step-body">
                Success, budget, iteration cap, or no-progress. Loops without
                brakes are cost centers.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="vl-section" aria-labelledby="vl-who">
        <div className="vl-section-inner">
          <p className="vl-kicker">Who it is for</p>
          <h2 id="vl-who" className="vl-h2">
            Engineers who still sign the diff.
          </h2>
          <ul className="vl-who-list">
            <li>Seniors moving from AI-assisted coding to supervised agent fleets</li>
            <li>Platform teams putting evals and budgets around coding agents</li>
            <li>Builders tired of demos that die the first time CI is honest</li>
          </ul>
        </div>
      </section>

      <section className="vl-section vl-closing" aria-labelledby="vl-join">
        <div className="vl-section-inner vl-closing-inner">
          <div>
            <p className="vl-kicker">Early access</p>
            <h2 id="vl-join" className="vl-h2">
              Get on the list for cohort one.
            </h2>
            <p className="vl-lede">
              Small group. Production-shaped exercises. No investment advice —
              just systems that leave a paper trail.
            </p>
          </div>
          <WaitlistForm compact id="vl-email-closing" />
        </div>
      </section>

      <footer className="vl-foot">
        <span>Verified Loops</span>
        <Link href="https://armancharan.com">armancharan.com</Link>
      </footer>
    </>
  )
}

export default VlHomePage
