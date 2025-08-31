import path from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

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
		copyPublicDir: false, // 禁止复制 public 文件夹到 dist
		rollupOptions: {
			// 不设置 external，让 Vite 打包所有依赖
		},
	},
	plugins:
		mode === 'production'
			? [
					dts({
						include: ['src/**/*.ts'],
						outDir: 'dist',
						rollupTypes: true,
						insertTypesEntry: true,
						copyDtsFiles: false,
						staticImport: true,
					}),
				]
			: [],
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
	publicDir: mode === 'development' ? path.resolve(__dirname, 'public') : false, // 生产构建时禁用 public 目录
}))
