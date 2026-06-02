import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress warnings about /*#__PURE__*/ comments in ox library dependencies
        if (warning.code === 'INVALID_ANNOTATION' && 
            warning.message.includes('/*#__PURE__*/') && 
            warning.id?.includes('ox/_esm/')) {
          return
        }
        // Use default for other warnings
        warn(warning)
      }
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5 internals use legacy Sass APIs (darken/lighten, @import, abs()).
        // Our own SCSS already uses modern @use/color.scale() syntax.
        // Remove these once Bootstrap 6 ships with modern Sass.
        silenceDeprecations: ['color-functions', 'global-builtin', 'import', 'abs-percent'],
      }
    }
  }
})
