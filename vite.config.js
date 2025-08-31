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
		copyPublicDir: false, // 禁止复制 public 文件夹到 dist
		rollupOptions: {
			external: (id) => {
				// 排除 node_modules 和非 src 目录的文件
				if (id.includes('node_modules')) return true
				const resolved = path.resolve(id)
				const srcPath = path.resolve(__dirname, 'src')
				// 只包含 src 目录下的文件
				return !resolved.startsWith(srcPath) && !id.startsWith('./src') && !id.startsWith('src/')
			},
		},
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
	publicDir: mode === 'development' ? path.resolve(__dirname, 'public') : false, // 生产构建时禁用 public 目录
}))
