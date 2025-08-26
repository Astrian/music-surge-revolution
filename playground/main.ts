import './reset.css'
import './style.css'

import { Player } from '../src'

const playerInstance = new Player()

playerInstance.onQueueChange((queue) => {
	console.log('queue changes')
	console.log(queue)
})

playerInstance.onPlayStateChange((state) => {
	if (state) document.getElementById('toggleBtn')!.innerHTML = `<i class="ri-pause-fill"></i>`
	else document.getElementById('toggleBtn')!.innerHTML = `<i class="ri-play-fill"></i>`
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
	{
		url: '/sample2.wav',
		metadata: {
			title: 'Oops! (HEM Selection 2024)',
			artist: 'CapG',
			album: 'HEM Selection 2024',
			artwork: [
				{
					src: '/artwork2.png',
					sizes: '500x500',
					type: 'image/png',
				},
			],
		},
	},
])

document.getElementById('toggleBtn')?.addEventListener('click', () => {
	playerInstance.togglePlaying()
})

playerInstance.onCurrentPlayingChange((track: QueueItem) => {
	console.log(track)

	// Attach artwork
	let artwork_url = ''
	const size = 0
	for (const artwork of track.metadata?.artwork ?? []) {
		if (artwork.sizes && !isNaN(parseInt(artwork.sizes.split('x')[0]))) {
			if (parseInt(artwork.sizes.split('x')[0]) > size) {
				artwork_url = artwork.src
			}
		} else if (artwork_url !== '') {
			artwork_url = artwork.src
		}
	}
	if (artwork_url !== '') document.getElementById('artwork')!.innerHTML = `<img src="${artwork_url}" alt="Artwork" />`
	else document.getElementById('artwork')!.innerHTML = ``
})
