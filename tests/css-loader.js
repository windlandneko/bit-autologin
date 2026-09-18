import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'

// Match Vite's raw CSS imports when running tests directly in Node.
registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith('.css?raw')) return nextLoad(url, context)
    return {
      format: 'module',
      source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))}`,
      shortCircuit: true,
    }
  },
})
