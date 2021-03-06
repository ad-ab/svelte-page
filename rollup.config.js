/* eslint-disable */
import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy'
import json from '@rollup/plugin-json';
import livereload from 'rollup-plugin-livereload';
import postcss from 'rollup-plugin-postcss';
import resolve from '@rollup/plugin-node-resolve';
import svelte from 'rollup-plugin-svelte';
import { terser } from 'rollup-plugin-terser';

import del from 'del'
import path from 'path'

const { imageOptimizer } = require( './src/services/imageOptimizer')

const staticDir = 'static'
const distDir = 'dist'
const buildDir = `${distDir}/build`
const production = !process.env.ROLLUP_WATCH;
const bundling = process.env.BUNDLING || production ? 'dynamic' : 'bundle'
const shouldPrerender = (typeof process.env.PRERENDER !== 'undefined') ? process.env.PRERENDER : !!production

del.sync(distDir + '/**')

function createConfig({ output, inlineDynamicImports, plugins = [] }) {
  const transform = inlineDynamicImports ? bundledTransform : dynamicTransform

  return {
    inlineDynamicImports,
    input: `src/main.js`,
    output: {
      name: 'app',
      sourcemap: true,
      ...output
    },
    plugins: [
      copy({
        targets: [
          { src: staticDir + '/**/!(__index.html)', dest: distDir },
          { src: `${staticDir}/__index.html`, dest: distDir, rename: '__app.html', transform },
        ], copyOnce: true
      }),

      svelte({
        // enable run-time checks when not in production
        dev: !production,
        hydratable: true,
        // we'll extract any component CSS out into
        // a separate file — better for performance
        css: css => {
          css.write(`${buildDir}/bundle.css`);
        }
      }),

      alias({
        entries: [
          {
            find: '@',
            replacement: path.resolve(__dirname, 'src')
          }
        ],

      }),
      // If you have external dependencies installed from
      // npm, you'll most likely need these plugins. In
      // some cases you'll need additional configuration —
      // consult the documentation for details:
      // https://github.com/rollup/rollup-plugin-commonjs
      resolve({
        browser: true,
        dedupe: importee => importee === 'svelte' || importee.startsWith('svelte/')
      }),
      json(),
      postcss({
        plugins: []
      }),

      commonjs(),

      // If we're building for production (npm run build
      // instead of npm run dev), minify
      production && terser(),

      ...plugins,
      imageOptimizer(),
    ],

    // The following lines were added to remove warnings in the console
    // for svelte-18n - according to the creator its fine and we should ignore them
    moduleContext: {
      './node_modules/intl-format-cache/lib/index.js': 'window',
      './node_modules/intl-messageformat-parser/lib/skeleton.js': 'window',
      './node_modules/intl-messageformat-parser/lib/parser.js': 'window',
      './node_modules/intl-messageformat/lib/formatters.js': 'window',
      './node_modules/intl-messageformat/lib/core.js': 'window',
      './node_modules/intl-messageformat-parser/lib/normalize.js': 'window'
    },
    watch: {
      clearScreen: false
    }
  }
}


const bundledConfig = {
  inlineDynamicImports: true,
  output: {
    format: 'iife',
    file: `${buildDir}/bundle.js`
  },
  plugins: [
    !production && serve(),
    !production && livereload(distDir)
  ]
}

const dynamicConfig = {
  inlineDynamicImports: false,
  output: {
    format: 'esm',
    dir: buildDir
  },
  plugins: [
    !production && livereload(distDir),
  ]
}


const configs = [createConfig(bundledConfig)]
if (bundling === 'dynamic')
  configs.push(createConfig(dynamicConfig))
if (shouldPrerender) [...configs].pop().plugins.push(prerender())
export default configs


function serve() {
  let started = false;
  return {
    writeBundle() {
      if (!started) {
        started = true;
        require('child_process').spawn('npm', ['run', 'serve'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          shell: true
        });
      }
    }
  };
}

function prerender() {
  return {
    writeBundle() {
      if (shouldPrerender) {
        require('child_process').spawn('npm', ['run', 'export'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          shell: true
        });
      }
    }
  }
}

function bundledTransform(contents) {
  return contents.toString().replace('__SCRIPT__', `
		<script defer src="/build/bundle.js" ></script>
	`)
}

function dynamicTransform(contents) {
  return contents.toString().replace('__SCRIPT__', `
		<script type="module" defer src="https://unpkg.com/dimport@1.0.0/dist/index.mjs?module" data-main="/build/main.js"></script>
		<script nomodule defer src="https://unpkg.com/dimport/nomodule" data-main="/build/main.js"></script>
	`)
}
