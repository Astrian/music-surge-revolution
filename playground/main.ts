import './style.css'
import framework from '../src'
import { setupCounter } from './counter.ts'
import typescriptLogo from './typescript.svg'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the TypeScript logo to learn more ${framework.hello}
    </p>
  </div>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)
