import { Page } from '../ui/page'

const HomePage = () => {
  return (
    <Page>
      <ArticleList
        articles={[]}
      />
    </Page>
  )
}

export default HomePage

const ArticleList = ({ articles }: { articles: [] }) => {
  return (
    <div>
      {articles.map(article => {
        return <ArticlePreview article={article} />
      })}
    </div>
  )
}

const ArticlePreview = ({ article }: { article: {} }) => {
  return <div>Article</div>
}
