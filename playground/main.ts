import './reset.css'
import './style.css'

import { Player } from '../src'

const playerInstance = new Player()

const queueListener = playerInstance.onQueueChange((queue) => {
	console.log('queue changes')
	console.log(queue)
})

const playingStateListener = playerInstance.onPlayStateChange((state) => {
	if (state) console.log('start playing')
	else console.log('stop playing')
})

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

document.getElementById('toggleBtn')?.addEventListener('click', () => {
	playerInstance.togglePlaying()
})
