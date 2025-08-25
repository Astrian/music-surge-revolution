import debug from 'debug'

if (import.meta.env.DEV) {
	const originalDebug = localStorage.getItem('debug')
	if (originalDebug) {
		let flag = true
		for (const module of originalDebug.split(',')) {
			if (module === 'msrpkg:*') {
				flag = false
				break
			}
		}
		if (flag) {
			localStorage.setItem('debug', `${originalDebug},msrpkg:*`)
		}
	} else {
		localStorage.setItem('debug', 'msrpkg:*')
	}
} else {
	localStorage.removeItem('debug')
}

export default {
	player: debug('msrpkg:player'),
}
