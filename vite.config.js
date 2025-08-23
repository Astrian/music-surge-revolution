import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
	build: {
		lib: {
			entry: path.resolve(__dirname, 'src/index.ts'),
			name: 'music-surge-revolution',
			fileName: (format) => `index.${format}.js`,
		},
		sourcemap: true,
		preserveEntrySignatures: 'strict',
		outDir: 'dist',
	},
	plugins: [],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		open: true,
		port: 1926,
	},
	root: mode === 'development' ? path.resolve(__dirname, 'playground') : path.resolve(__dirname),
	logLevel: 'info',
}))
