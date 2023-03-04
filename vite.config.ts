import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/// ref: https://stackoverflow.com/questions/69286329/polyfill-node-os-module-with-vite-rollup-js/70666018#70666018
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill'
import rollupNodePolyFill from 'rollup-plugin-node-polyfills'
import topLevelAwait from "vite-plugin-top-level-await";

console.log("require.resolve()?? %O", require)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    process.env.MODE !== 'production'
    ? react({
        jsxRuntime: 'classic',
      })
    : react()
  ],

  /// ref: https://stackoverflow.com/questions/69286329/polyfill-node-os-module-with-vite-rollup-js/70666018#70666018
  resolve: {
    alias: {
        // This Rollup aliases are extracted from @esbuild-plugins/node-modules-polyfill,
        // see https://github.com/remorses/esbuild-plugins/blob/master/node-modules-polyfill/src/polyfills.ts
        // process and buffer are excluded because already managed
        // by node-globals-polyfill
        bn: '@types/bn',
        util: 'rollup-plugin-node-polyfills/polyfills/util',
        sys: 'util',
        // events: 'rollup-plugin-node-polyfills/polyfills/events',
        stream: 'rollup-plugin-node-polyfills/polyfills/stream',
        path: 'rollup-plugin-node-polyfills/polyfills/path',
        querystring: 'rollup-plugin-node-polyfills/polyfills/qs',
        punycode: 'rollup-plugin-node-polyfills/polyfills/punycode',
        url: 'rollup-plugin-node-polyfills/polyfills/url',
        // string_decoder: 'rollup-plugin-node-polyfills/polyfills/string-decoder',
        http: 'rollup-plugin-node-polyfills/polyfills/http',
        https: 'rollup-plugin-node-polyfills/polyfills/http',
        os: 'rollup-plugin-node-polyfills/polyfills/os',
        assert: 'rollup-plugin-node-polyfills/polyfills/assert',
        constants: 'rollup-plugin-node-polyfills/polyfills/constants',
        _stream_duplex: 'rollup-plugin-node-polyfills/polyfills/readable-stream/duplex',
        _stream_passthrough: 'rollup-plugin-node-polyfills/polyfills/readable-stream/passthrough',
        _stream_readable: 'rollup-plugin-node-polyfills/polyfills/readable-stream/readable',
        _stream_writable: 'rollup-plugin-node-polyfills/polyfills/readable-stream/writable',
        _stream_transform: 'rollup-plugin-node-polyfills/polyfills/readable-stream/transform',
        timers: 'rollup-plugin-node-polyfills/polyfills/timers',
        console: 'rollup-plugin-node-polyfills/polyfills/console',
        vm: 'rollup-plugin-node-polyfills/polyfills/vm',
        zlib: 'rollup-plugin-node-polyfills/polyfills/zlib',
        tty: 'rollup-plugin-node-polyfills/polyfills/tty',
        domain: 'rollup-plugin-node-polyfills/polyfills/domain'
    }
  },
  optimizeDeps: {
    esbuildOptions: {
        // Node.js global to browser globalThis
        define: {
            global: 'globalThis'
        },
        // Enable esbuild polyfill plugins
        plugins: [
            NodeGlobalsPolyfillPlugin({
                process: true,
                buffer: true
            }),
            NodeModulesPolyfillPlugin()
        ]
    }
  },
  build: {
    rollupOptions: {
        plugins: [
            // Enable rollup polyfills plugin
            // used during production bundling
            rollupNodePolyFill(),
            topLevelAwait({ // @ref https://github.com/Menci/vite-plugin-top-level-await
              // The export name of top-level await promise for each chunk module
              promiseExportName: "__tla",
              // The function to generate import names of top-level await promise in each chunk module
              promiseImportName: i => `__tla_${i}`
            })
        ],
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
  }
})

