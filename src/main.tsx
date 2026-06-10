import { render } from 'preact'
import './styles.css'
import { App } from './app'
import { init, ready, showToast } from './lib/state'

render(<App />, document.getElementById('app')!)

init()
  .catch((e) => {
    console.error('init failed', e)
    showToast('Startup problem — some features may not work')
  })
  .finally(() => {
    ready.value = true
  })

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js')
  })
}
