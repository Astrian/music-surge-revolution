import './reset.css'
import './style.css'

import { Player } from '../src'

const playerInstance = new Player()

playerInstance.replaceQueue([
	{
		url: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/858/outfoxing.mp3',
		metadata: {
			title: 'Outfoxing the Fox',
			artist: 'Kevin MacLeod',
			album: 'Miami Nights',
			artwork: '',
		},
	},
])
