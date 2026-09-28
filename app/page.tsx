import NextImage, { type StaticImageData } from 'next/image'
import { twMerge } from 'tailwind-merge'
import agenticEngineering101 from '../public/agentic-engineering-101.png'
import featherstonNumeroIv from '../public/featherston-numero-iv.png'
import ivySmiling from '../public/ivy-smiling.png'
import pestoPasta from '../public/pesto-pasta.png'
import polly from '../public/polly.png'
import tabawake from '../public/tabawake.jpg'
import time from '../public/time.jpg'
import { Bass, BassEngagedProvider } from '../ui/bass'
import { CloudPuzzleSignup } from '../ui/cloud_puzzle'
import { ListingCaption, ListingLinks } from '../ui/listing_caption'
import { Page } from '../ui/page'

const TIME_URL = 'https://time.armancharan.com'
const TIME_SOURCE_URL = 'https://github.com/armancharan/time'
const TABAWAKE_URL = 'https://tabawake.armancharan.com'
const TABAWAKE_SOURCE_URL = 'https://github.com/armancharan/tabawake'

const LINK_CLASS =
  'block cursor-pointer text-primary underline decoration-from-font underline-offset-2'

const UNHIGHLIGHTABLE_IMAGE =
  'pointer-events-none select-none [-webkit-user-drag:none] [-webkit-touch-callout:none]'

const HomePage = () => {
  return (
    <Page>
      <BassEngagedProvider>
        <h1 className="flex items-center flex-wrap justify-start min-h-30 leading-[60px] text-5xl font-medium italic text-white">
          "Oh, <Bass seed={1} />, cool"
          <Image className={'h-16'} src={ivySmiling} />
        </h1>
        <h1 className="flex items-center flex-wrap justify-start min-h-30 leading-[60px] text-5xl font-medium italic text-white">
          You know how you
          <Image src={pestoPasta} /> make the <Bass seed={2} /> better?
        </h1>
        <h1 className="flex items-center flex-wrap justify-start min-h-30 leading-[60px] text-5xl font-medium italic text-white">
          Crank <Image src={featherstonNumeroIv} /> the <Bass seed={3} /> up
        </h1>
        <h1 className="flex items-center flex-wrap justify-start min-h-30 leading-[60px] text-5xl font-medium italic text-white">
          (Yeah) <Image src={polly} />
        </h1>
      </BassEngagedProvider>

      <section className="mt-32">
        <ListingCaption
          name="Time"
          date="12 Sep 2026"
          dateTime="2026-09-12"
          description="An ode to time I made for my sister Mica."
          action={
            <ListingLinks
              className={LINK_CLASS}
              links={[
                { href: TIME_URL, label: 'open' },
                { href: TIME_SOURCE_URL, label: 'source' },
              ]}
            />
          }
        />
        <a
          href={TIME_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full max-w-4xl"
        >
          <NextImage
            src={time}
            alt="time — a monument, to the concept, that is"
            placeholder="blur"
            sizes="(max-width: 896px) 100vw, 896px"
            draggable={false}
            className={`border-2 border-[rgba(0,0,0,0.333)] w-full h-auto ${UNHIGHLIGHTABLE_IMAGE}`}
          />
        </a>
      </section>

      <section className="mt-32">
        <ListingCaption
          name="Tabawake"
          date="12 Aug 2026"
          dateTime="2026-08-12"
          description="A toy project, to demonstrate cross-platform fundamentals; keeps screens awake (for example, while agents churn)."
          action={
            <ListingLinks
              className={LINK_CLASS}
              links={[
                { href: TABAWAKE_URL, label: 'open' },
                { href: TABAWAKE_SOURCE_URL, label: 'source' },
              ]}
            />
          }
        />
        <a
          href={TABAWAKE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full max-w-4xl"
        >
          <NextImage
            src={tabawake}
            alt="tabawake — keeps this tab awake"
            placeholder="blur"
            sizes="(max-width: 896px) 100vw, 896px"
            draggable={false}
            className={`border-2 border-[rgba(0,0,0,0.333)] w-full h-auto ${UNHIGHLIGHTABLE_IMAGE}`}
          />
        </a>
      </section>

      <section className="mt-32">
        <CloudPuzzleSignup
          date="20 Jun 2026"
          dateTime="2026-06-20"
          description="A practical course on turning ideas into shippable software with agents."
          cover={
            <NextImage
              src={agenticEngineering101}
              alt="agentic engineering 101"
              placeholder="blur"
              sizes="(max-width: 896px) 100vw, 896px"
              draggable={false}
              className={`border-2 border-[rgba(0,0,0,0.333)] w-full max-w-4xl h-auto ${UNHIGHLIGHTABLE_IMAGE}`}
            />
          }
        />
      </section>
    </Page>
  )
}

export default HomePage

const Image: React.ComponentType<{
  className?: string
  src: StaticImageData
}> = ({ className, src }) => {
  return (
    <NextImage
      src={src}
      alt=""
      sizes="320px"
      draggable={false}
      className={twMerge(
        'pointer-events-none max-h-full m-4 inline h-20 w-auto select-none [-webkit-user-drag:none] [-webkit-touch-callout:none]',
        className,
      )}
    />
  )
}

