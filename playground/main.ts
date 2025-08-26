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
		url: '/sample1.wav',
		metadata: {
			title: 'Bad Mushroom',
			artist: 'FatGuy & DRobot',
			album: 'Bad Mushroom - Single',
			artwork: [
				{
					src: '/artwork1.jpg',
					sizes: '500x500',
					type: 'image/jpeg',
				},
			],
		},
	},
])

document.getElementById('toggleBtn')?.addEventListener('click', () => {
	playerInstance.togglePlaying()
})
