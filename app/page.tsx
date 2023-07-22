import { entries } from '../blog/entries'
import { BlogEntryList } from '../ui/blog_entry_list'
import { Page } from '../ui/page'

const HomePage = () => {
  return (
    <Page>
      <h1 className="h-30 line leading-[60px] text-5xl font-medium italic text-white">
        "Oh, bass," <img className="max-h-full  m-4 inline h-16" src={'/ivy-smiling.png'} /> cool
      </h1>
      <h1 className="h-30 line leading-[60px] text-5xl font-medium italic text-white">
        You know how you
        <img className="max-h-full m-4 inline h-24" src={'/pesto-pasta.png'} />{' '}
        make the bass better?
      </h1>
      <h1 className="h-30 line leading-[60px] text-5xl font-medium italic text-white">
        Crank<img className="max-h-full m-4 inline h-20" src={'/featherston-numero-iv.png'} />{' '}
        the bass up
      </h1>
      <h1 className="h-30 line leading-[60px] text-5xl font-medium italic text-white">
        (Yeah) <img className="max-h-full m-4 inline h-20" src={'/polly.png'} />
      </h1>
    </Page>
  )
}

export default HomePage
