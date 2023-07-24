import { Merriweather, Roboto } from 'next/font/google'
import localFont from 'next/font/local'
import { twMerge } from 'tailwind-merge'
import { entries } from '../blog/entries'
import { BlogEntryList } from '../ui/blog_entry_list'
import { Page } from '../ui/page'

const caprasimo = localFont({
  src: '../public/fonts/Caprasimo-Regular.ttf',
  // style: 'normal',
})

const merriweather = Merriweather({
  weight: '700',
  subsets: ['latin'],
  style: 'italic',
})

const HomePage = () => {
  return (
    <Page>
      <h1 className="h-30 line leading-[60px] text-5xl font-medium italic text-white">
        <em className={merriweather.className}>"Oh, bass, cool"</em>{' '}
        <Image className={'h-16'} src={'/ivy-smiling.png'} />
      </h1>
      <h1 className="h-30 line leading-[60px] text-5xl font-medium italic text-white">
        You know how you
        <Image src={'/pesto-pasta.png'} />{' '}
        <em className={caprasimo.className} style={{ letterSpacing: '0.5px' }}>make</em> the{' '}
        <em className={caprasimo.className} style={{ letterSpacing: '0.5px' }}>bass</em>{' '}
        <b>better</b>?
      </h1>
      <h1 className="h-30 line leading-[60px] text-5xl font-medium italic text-white">
        <u>Crank</u> <Image src={'/featherston-numero-iv.png'} /> the <u>bass</u> <b>up</b>
      </h1>
      <h1 className="h-30 line leading-[60px] text-5xl font-medium italic text-white">
        <em className={merriweather.className}>(Yeah)</em> <Image src={'/polly.png'} />
      </h1>
    </Page>
  )
}

export default HomePage

const Image: React.ComponentType<{
  className?: string
  src: string
}> = ({
  className,
  src,
}) => {
  return <img className={twMerge('max-h-full m-4 inline h-20', className)} src={src} />
}
