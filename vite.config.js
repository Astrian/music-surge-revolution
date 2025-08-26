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
			'/node_modules': path.resolve(__dirname, 'node_modules'),
		},
	},
	server: {
		open: true,
		port: 1926,
		fs: {
			allow: [path.resolve(__dirname), path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, 'playground')],
		},
	},
	optimizeDeps: {
		entries: mode === 'development' ? ['playground/**/*.{html,ts,js}'] : [],
		include: mode === 'development' ? ['*'] : [],
	},
	root: mode === 'development' ? path.resolve(__dirname, 'playground') : path.resolve(__dirname),
	logLevel: 'info',
	publicDir: mode === 'development' ? path.resolve(__dirname, 'public') : 'public',
}))
