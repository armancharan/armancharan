import NextApp from 'next/app'
import { NavigationBar } from '../components/navigation_bar'

import './app.css'

class App extends NextApp {
  render() {
    return (
      <>
        <NavigationBar/>
        <this.props.Component {...this.props.pageProps}/>
      </>
    )
  }
}

export default App
