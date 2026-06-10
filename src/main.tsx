import { render } from 'preact'
import './styles.css'
import { App } from './app'
import { init, initError, ready } from './lib/state'

render(<App />, document.getElementById('app')!)

init()
  .catch((e) => {
    console.error('init failed', e)
    initError.value = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  })
  .finally(() => {
    ready.value = true
  })

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js')
  })
}
